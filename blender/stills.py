"""Room stills + hotspots for the 2D fallback (docs/3D.md section 9).

    blender -b --factory-startup --python blender/stills.py -- <id...> [--glb <path>] [--out <dir>]
                                                             [--hotspots <json>] [--png]

For each id: imports public/assets/3d/<id>.glb (or --glb, single id only), renders it from the fixed high south-east
camera (FOV 28 deg, 40 deg elevation, walls facing the camera cut to 0.3 m stubs like the runtime) at 1600x900 over
the room's backdrop colour, saves <out>/<id>.webp (title_city -> title.webp) and rewrites <out>/hotspots.json's entry
for that room: one {x, y, w, h} rect (percent of the image, x/y = top-left) per interactive key = the projected
bounding box of every group with that `interact` extra. Other rooms' entries are kept. --out defaults to
public/assets/rooms. --png keeps the intermediate PNG next to the webp.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))

import bpy                 # noqa: E402
from mathutils import Vector   # noqa: E402
from bpy_extras.object_utils import world_to_camera_view   # noqa: E402

import build as B          # noqa: E402

# keep in sync with src/ui/shell/hotspots.ts ROOM_BACKDROP
BACKDROP = {'tier0': '#fbf3e7', 'tier1': '#fdf6e8', 'tier2': '#fdf4e3', 'tier3': '#fcf6e7', 'tier4': '#fbf4e5',
            'tier5': '#08143a', 'mcdoodles': '#fffcec', 'title_city': '#f6e7d8'}
RES = (1600, 900)
KEY_ORDER = ['bed', 'computer', 'fridge', 'door', 'garage', 'couch', 'tv', 'counter', 'fryer', 'exit']


def parse():
    a = B.cli_args()
    rest = a['rest']
    opts = {'ids': [], 'glb': None, 'out': a['out'], 'hotspots': None, 'png': False}
    i = 0
    while i < len(rest):
        t = rest[i]
        if t == '--glb':
            opts['glb'] = rest[i + 1]
            i += 1
        elif t == '--hotspots':
            opts['hotspots'] = rest[i + 1]
            i += 1
        elif t == '--png':
            opts['png'] = True
        elif not t.startswith('--'):
            opts['ids'].append(t)
        i += 1
    opts['out'] = os.path.abspath(opts['out'] or os.path.join(B.REPO, 'public', 'assets', 'rooms'))
    opts['hotspots'] = os.path.abspath(opts['hotspots'] or os.path.join(opts['out'], 'hotspots.json'))
    if opts['glb'] and len(opts['ids']) != 1:
        raise SystemExit('--glb needs exactly one room id')
    return opts


def import_room(path):
    """Clean the scene and import a GLB; returns the `room` root object (or None for non-room files)."""
    B.clean_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    root = bpy.data.objects.get('room')
    B.set_root(root)
    return root


def mesh_corners(objs):
    """World-space bounding-box corners of all evaluated meshes under objs."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        for m in [o] + B.descendants(o):
            if m.type != 'MESH' or m.hide_render:
                continue
            ev = m.evaluated_get(dg)
            mw = ev.matrix_world
            pts += [mw @ Vector(c) for c in ev.bound_box]
    return pts


def project_rect(cam, pts):
    """Percent rect {x, y, w, h} (top-left origin) of the projected points, clamped to the image."""
    sc = bpy.context.scene
    xs, ys = [], []
    for p in pts:
        v = world_to_camera_view(sc, cam, p)
        xs.append(min(1.0, max(0.0, v.x)))
        ys.append(min(1.0, max(0.0, v.y)))
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    r = lambda v: round(v * 100, 1)
    return {'x': r(x0), 'y': r(1 - y1), 'w': r(x1 - x0), 'h': r(y1 - y0)}


def fmt_hotspots(data):
    """Same layout as the hand-written file: one line per key, aligned."""
    lines = ['{']
    rooms = list(data.items())
    for ri, (room, spots) in enumerate(rooms):
        lines.append(f'  "{room}": {{')
        items = list(spots.items())
        for ki, (k, r) in enumerate(items):
            key = f'"{k}":'.ljust(10)
            vals = ', '.join(f'"{c}": {json.dumps(r[c])}' for c in ('x', 'y', 'w', 'h'))
            lines.append(f'    {key} {{ {vals} }}' + (',' if ki < len(items) - 1 else ''))
        lines.append('  }' + (',' if ri < len(rooms) - 1 else ''))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def still(room_id, glb, out_dir, hotspots_path, keep_png):
    root = import_room(glb)
    backdrop = BACKDROP.get(room_id, '#fbf3e7')
    B.clear_preview()
    B.setup_render(RES, 64, backdrop)
    info = B._room_info(root) if root else None
    cam = B._camera('still', fov=28.0)
    a_cam = bpy.data.objects.get('a_cam')
    restore = lambda: None
    if a_cam is not None:
        mw = a_cam.matrix_world
        fwd = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
        cam.location = mw.translation
        cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
        if 'fov' in a_cam:
            import math
            cam.data.angle = math.radians(float(a_cam['fov']))
    else:
        pts = B.room_points(root) if root else [tuple(p) for p in mesh_corners(list(bpy.data.objects))]
        B.fit_camera(cam, pts, 45.0, 40.0, RES, margin=0.1)
        if root:
            restore = B._stub_walls(root, cam.location)
    span = max(info[0], info[1]) if info else 12.0
    B._lights((0, 0, 0), span)
    bpy.context.view_layer.update()
    os.makedirs(out_dir, exist_ok=True)
    name = 'title' if room_id == 'title_city' else room_id
    png = os.path.join(out_dir, f'{name}.png')
    B.render_to(png, backdrop)
    webp = os.path.join(out_dir, f'{name}.webp')
    img = bpy.data.images.load(png, check_existing=False)
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 88
    sc.render.image_settings.color_mode = 'RGB'
    img.save_render(webp, scene=sc)
    bpy.data.images.remove(img)
    if not keep_png:
        os.remove(png)
    print(f'[stills] {webp}')
    # hotspots
    if room_id != 'title_city' and root is not None:
        groups = {}
        for o in B.descendants(root):
            k = o.get('interact')
            if k:
                groups.setdefault(k, []).append(o)
        spots = {}
        for k in sorted(groups, key=lambda k: KEY_ORDER.index(k) if k in KEY_ORDER else 99):
            pts = mesh_corners(groups[k])
            if pts:
                spots[k] = project_rect(cam, pts)
        data = {}
        if os.path.exists(hotspots_path):
            with open(hotspots_path, encoding='utf-8') as f:
                data = json.load(f)
        data[room_id] = spots
        with open(hotspots_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(fmt_hotspots(data))
        print(f'[stills] {hotspots_path}: {room_id} -> {json.dumps(spots)}')
    restore()


def main():
    o = parse()
    if not o['ids']:
        raise SystemExit('usage: stills.py -- <id...> [--glb path] [--out dir] [--hotspots json] [--png]')
    for rid in o['ids']:
        glb = o['glb'] or os.path.join(B.ASSETS_3D, f'{rid}.glb')
        if not os.path.exists(glb):
            raise SystemExit(f'missing {glb}')
        still(rid, glb, o['out'], o['hotspots'], o['png'])


main()
