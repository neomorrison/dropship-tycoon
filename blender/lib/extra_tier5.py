"""Room-specific helpers for tier5 (penthouse HQ): the low-poly night skyline and a few luxe props.
Owned by the tier4/tier5 room builder, not the shared lib."""
import math
import random

import build as B
import furniture as F
from build import box, cyl, sphere, blob, tube, torus, panel, lathe


def _n(g, part):
    return f'{g.name}_{part}'


BODY_MATS = ('fabric_navy', 'tile_check_dark', 'plastic_black', 'fabric_navy', 'tile_check_dark')


def _building(g, rng, cx, cy, w, d, top, bottom, face, lit=0.45, step=None, floor_h=2.1):
    """One tower: a body box (+ an optional set-back crown with a spire and a red beacon) and night-lit window
    bands on the face(s) that look toward the room: per floor, a few lit strips of random length.
    face: list of '+x' / '-x' / '+y' / '-y'."""
    mat = rng.choice(BODY_MATS)
    h = top - bottom
    box(_n(g, 'b'), (w, d, h), (cx, cy, bottom + h / 2), mat, g, bevel=0.0, segments=1)
    tops = [(w, d, top)]
    if step:
        sw, sd, sh = w * step, d * step, rng.uniform(2.0, 5.0)
        box(_n(g, 'crown'), (sw, sd, sh), (cx, cy, top + sh / 2), mat, g, bevel=0.0, segments=1)
        tops.append((sw, sd, top + sh))
        if rng.random() < 0.7:
            sp = rng.uniform(3, 6)
            tube(_n(g, 'spire'), [(cx, cy, top + sh), (cx, cy, top + sh + sp)], 0.12, 'metal', g, res=5)
            sphere(_n(g, 'beacon'), 0.35, (cx, cy, top + sh + sp + 0.2), 'neon_red', g, segs=8, rings=5)
    for (tw, td, tz) in tops:
        box(_n(g, 'rim'), (tw + 0.3, td + 0.3, 0.35), (cx, cy, tz + 0.1), 'plastic_black', g, bevel=0.0, segments=1)
    for f in face:
        horiz = w if f in ('+y', '-y') else d
        z = top - 1.6
        zmin = max(bottom + 2.0, top - 30.0)
        while z > zmin:
            u = -horiz / 2 + 0.5
            while u < horiz / 2 - 0.8:
                ln = rng.uniform(0.5, 1.4)
                ln = min(ln, horiz / 2 - 0.5 - u)
                if ln > 0.5 and rng.random() < lit:
                    m = 'lampshade' if rng.random() > 0.07 else rng.choice(('neon_cyan', 'neon_yellow'))
                    c = u + ln / 2
                    hh = 0.7
                    if f == '-y':
                        panel(_n(g, 'w'), (ln, hh), (cx + c, cy - d / 2 - 0.03, z), m, g)
                    elif f == '+y':
                        panel(_n(g, 'w'), (ln, hh), (cx - c, cy + d / 2 + 0.03, z), m, g, (0, 0, 180))
                    elif f == '+x':
                        panel(_n(g, 'w'), (ln, hh), (cx + w / 2 + 0.03, cy + c, z), m, g, (0, 0, 90))
                    else:
                        panel(_n(g, 'w'), (ln, hh), (cx - w / 2 - 0.03, cy - c, z), m, g, (0, 0, -90))
                u += ln + rng.uniform(0.2, 0.5)
            z -= floor_h


def _default_view(root, res=(1280, 720)):
    """Projection of the default preview camera (south-east, 40 deg, FOV 28, framing the room like
    build.render_preview 'default'): returns (project(p) -> (x, y) in 0..1 with y up, hull of the room's
    screen silhouette as a CCW list of (x, y)). The temporary camera is removed again."""
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    sc = bpy.context.scene
    old = (sc.render.resolution_x, sc.render.resolution_y, sc.camera)
    sc.render.resolution_x, sc.render.resolution_y = res
    cd = bpy.data.cameras.new('_sky_cam')
    cd.lens_unit = 'FOV'
    cd.angle = math.radians(28.0)
    cd.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('_sky_cam', cd)
    sc.collection.objects.link(cam)
    B.fit_camera(cam, B.room_points(root), 45.0, 40.0, res, margin=0.05)
    bpy.context.view_layer.update()
    mw = cam.matrix_world.copy()
    frame = [v.copy() for v in cd.view_frame(scene=sc)]
    inv = mw.inverted()
    fz = -frame[0].z
    fx0, fx1 = min(v.x for v in frame), max(v.x for v in frame)
    fy0, fy1 = min(v.y for v in frame), max(v.y for v in frame)

    def project(pt):
        co = inv @ Vector(pt)
        z = -co.z
        if z <= 1e-6:
            return (0.5, -1.0)
        k = fz / z
        return ((co.x * k - fx0) / (fx1 - fx0), (co.y * k - fy0) / (fy1 - fy0))
    pts = sorted(set((round(x, 6), round(y, 6)) for x, y in (project(p_) for p_ in B.room_points(root))))

    def cross(o, a_, b_):
        return (a_[0] - o[0]) * (b_[1] - o[1]) - (a_[1] - o[1]) * (b_[0] - o[0])
    lower, upper = [], []
    for p_ in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p_) <= 0:
            lower.pop()
        lower.append(p_)
    for p_ in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p_) <= 0:
            upper.pop()
        upper.append(p_)
    hull = lower[:-1] + upper[:-1]
    # sanity: the live camera agrees with the frozen projection
    c = world_to_camera_view(sc, cam, Vector((0.0, 0.0, 0.0)))
    q = project((0.0, 0.0, 0.0))
    assert abs(c.x - q[0]) < 1e-3 and abs(c.y - q[1]) < 1e-3, (c, q)
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cd)
    sc.render.resolution_x, sc.render.resolution_y, sc.camera = old
    return project, hull


def _hull_span(hull, x):
    """(ymin, ymax) of the convex hull at screen x, or None outside it."""
    ys = []
    n = len(hull)
    for i in range(n):
        (x0, y0), (x1, y1) = hull[i], hull[(i + 1) % n]
        if (x0 - x) * (x1 - x) <= 0 and x0 != x1:
            t = (x - x0) / (x1 - x0)
            ys.append(y0 + t * (y1 - y0))
    return (min(ys), max(ys)) if ys else None


def _solve_z(project, x, y, target, lo=-200.0, hi=200.0):
    """z at which (x, y, z) projects to screen-y `target` (monotonic in z)."""
    for _ in range(50):
        mid = (lo + hi) / 2
        if project((x, y, mid))[1] < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def skyline(W, D, H=3.4, name='outside', seed=11, root=None):
    """Low-poly night skyline in group `outside` {outside:true}, composed through the default south-east
    camera (azimuth 45, elevation 40, FOV 28; the same fit as the previews and close to the runtime's): every
    tower stands behind the room with its base hidden behind the room's screen silhouette (the diorama still
    floats in the navy backdrop), so it shows only (a) through the north / west glass: a band of rooftops well
    below the floor (the penthouse is on the top floor), and (b) over the back walls: towers whose crowns,
    spires and red beacons rise above the wall tops into the empty upper corners of the frame. Lit window bands
    use m_lampshade (the runtime makes them glow at night) with a few neon accents; a neon billboard
    (shopping-bag pictogram, no letters) stands on one roof. Other camera angles show a plausible city too."""
    import room as R
    rng = random.Random(seed)
    root = root or R.ROOM['root']
    project, hull = _default_view(root)
    g = B.group(name, (0, 0, 0), outside=True)
    X, Y = W / 2, D / 2
    r2 = math.sqrt(2.0)
    placed = []

    def free(cx, cy, w, d):
        if cx > -X - w / 2 - 1.5 and cy < Y + d / 2 + 1.5:
            return False
        for (px, py, pw, pd) in placed:
            if abs(cx - px) < (w + pw) / 2 + 0.6 and abs(cy - py) < (d + pd) / 2 + 0.6:
                return False
        return True

    def base_z(cx, cy, w, d):
        """Deepest-needed bottom: highest z at which every bottom corner is still inside the silhouette."""
        zs = []
        for sx_ in (-1, 1):
            for sy_ in (-1, 1):
                x, y = cx + sx_ * w / 2, cy + sy_ * d / 2
                sx = project((x, y, 0.0))[0]
                span = _hull_span(hull, sx)
                if span is None:
                    return None
                zs.append(_solve_z(project, x, y, span[0] + 0.02))
        return max(zs)

    def top_z(cx, cy, w, d, off):
        sx = project((cx, cy, 0.0))[0]
        span = _hull_span(hull, sx)
        if span is None:
            return None
        # the wall-top line under the whole footprint (take the highest point of the upper edge it spans)
        xs = [project((cx + a_ * w / 2, cy + b_ * d / 2, 0.0))[0] for a_ in (-1, 1) for b_ in (-1, 1)]
        tops = [(_hull_span(hull, x_) or span)[1] for x_ in xs]
        return _solve_z(project, cx, cy, max(tops) + off)

    def ring(v0, v1, count, off, size=(3.0, 5.0), landmark=0.0):
        tries = n = 0
        while n < count and tries < count * 150:
            tries += 1
            w, d = rng.uniform(*size), rng.uniform(*size)
            u, v = rng.uniform(-(X + Y) / r2, (X + Y) / r2), rng.uniform(v0, v1)
            cx, cy = (u - v) / r2, (u + v) / r2
            if not free(cx, cy, w, d):
                continue
            bottom = base_z(cx, cy, w, d)
            top = top_z(cx, cy, w, d, rng.uniform(*off))
            if bottom is None or top is None or top - bottom < 3.0:
                continue
            big = landmark and rng.random() < landmark
            _building(g, rng, cx, cy, w, d, top, bottom - 0.5, ['+x', '-y', '-x', '+y'], lit=rng.uniform(0.45, 0.75),
                      step=rng.uniform(0.55, 0.75) if (big or rng.random() < 0.25) else None)
            placed.append((cx, cy, w, d))
            n += 1
        print(f'[skyline] ring v{v0}-{v1}: {n}/{count} towers')

    # billboard roof, seen through the west glass
    bu, bv = -3.6, 14.0
    bx, by = (bu - bv) / r2, (bu + bv) / r2
    bw = 5.5
    bb0 = base_z(bx, by, bw, bw)
    bz = top_z(bx, by, bw, bw, -0.16)
    if bb0 is not None and bz is not None and bz - bb0 > 3.0:
        box(_n(g, 'bbroof'), (bw, bw, bz - bb0 + 0.5), (bx, by, (bz + bb0 - 0.5) / 2), 'tile_check_dark', g,
            bevel=0.0, segments=1)
        box(_n(g, 'bbrim'), (bw + 0.3, bw + 0.3, 0.35), (bx, by, bz + 0.1), 'fabric_blue', g, bevel=0.0, segments=1)
        placed.append((bx, by, bw, bw))
        bb = B.group(name + '_billboard', (bx, by, bz), -45, parent=g)
        box(_n(bb, 'frame'), (4.6, 0.25, 2.4), (0, 0, 2.2), 'plastic_black', bb, bevel=0.0, segments=1)
        for k in (-1.5, 1.5):
            box(_n(bb, 'post'), (0.18, 0.18, 1.2), (k, 0, 0.5), 'plastic_black', bb, bevel=0.0, segments=1)
        y = -0.15
        tube(_n(bb, 'bag'), [(-0.7, y, 1.35), (-0.85, y, 2.65), (0.85, y, 2.65), (0.7, y, 1.35), (-0.7, y, 1.35)],
             0.07, 'neon_pink', bb, res=6)
        tube(_n(bb, 'handle'), [(-0.38, y, 2.65), (-0.3, y, 3.1), (0.3, y, 3.1), (0.38, y, 2.65)], 0.06,
             'neon_pink', bb, res=6)
        tube(_n(bb, 'spark'), [(1.4, y, 2.9), (1.65, y, 2.25), (1.35, y, 2.25), (1.6, y, 1.55)], 0.06, 'neon_cyan',
             bb, res=6)

    ring(9.0, 18.0, 10, (-0.20, -0.05), size=(2.4, 3.8))                  # rooftops through the glass
    ring(16.0, 30.0, 22, (0.01, 0.07), size=(2.2, 3.6), landmark=0.3)     # slim towers over the back walls
    ring(30.0, 46.0, 12, (0.05, 0.14), size=(3.0, 4.6), landmark=0.5)     # far landmarks (cropped tops)
    return g


def plinth(name='plinth', location=(0, 0, 0), rotation=0, w=0.9, d=0.6, h=0.12, mat='wood_dark'):
    """Low display plinth / package platform (a_boxes_* region sits on top)."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'top'), (w, d, h), (0, 0, h / 2), mat, g, bevel=0.015)
    box(_n(g, 'shadow'), (w - 0.06, d - 0.06, 0.02), (0, 0, 0.01), 'plastic_black', g, bevel=0.004, segments=1)
    return g


def bar_cart(name='bar_cart', location=(0, 0, 0), rotation=0):
    """Brass-look two-tier bar cart with bottles, glasses and a little plant."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    W, Dd = 0.75, 0.42
    for z in (0.18, 0.72):
        box(_n(g, 'tray'), (W, Dd, 0.02), (0, 0, z), 'wood_dark', g, bevel=0.006)
        box(_n(g, 'lip'), (W, 0.015, 0.05), (0, -Dd / 2, z + 0.03), 'fabric_mustard', g, bevel=0.004, segments=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(_n(g, 'post'), [(sx * (W / 2 - 0.02), sy * (Dd / 2 - 0.02), 0.08),
                                 (sx * (W / 2 - 0.02), sy * (Dd / 2 - 0.02), 0.8)], 0.012, 'fabric_mustard', g, res=6)
    for sx in (-1, 1):
        torus(_n(g, 'wheel'), 0.05, 0.015, (sx * (W / 2 - 0.02), -Dd / 2 + 0.02, 0.06), 'plastic_black', g,
              (0, 90, 0), major=12, minor=5)
    tube(_n(g, 'handle'), [(W / 2 - 0.02, -Dd / 2 + 0.02, 0.8), (W / 2 + 0.08, 0, 0.85),
                           (W / 2 - 0.02, Dd / 2 - 0.02, 0.8)], 0.012, 'fabric_mustard', g, res=6)
    for i, (m, h) in enumerate((('plant_dark', 0.3), ('fabric_coral', 0.26), ('window_glass', 0.28),
                                ('wood_dark', 0.24))):
        x = -0.26 + i * 0.13
        lathe(_n(g, 'bottle'), [(0.035, 0), (0.038, h * 0.65), (0.014, h * 0.8), (0.012, h)], (x, 0.06, 0.73), m, g,
              verts=10, cap_top=True)
    for i in range(3):
        lathe(_n(g, 'glass'), [(0.02, 0), (0.035, 0.07), (0.037, 0.09)], (-0.2 + i * 0.1, -0.1, 0.19),
              'window_glass', g, verts=10)
    F.small_plant(parent=g, location=(0.24, -0.05, 0.73), style='succulent', obstacle=False)
    return g


def linear_pendant(name='linear_pendant', location=(0, 0, 3.4), rotation=0, length=4.2, drop=1.2,
                   light_anchor=None):
    """Long architectural linear pendant (slim bar with a glowing underside) hung on two cables."""
    g = B.group(name, location, rotation)
    z = -drop
    box(_n(g, 'bar'), (length, 0.08, 0.06), (0, 0, z), 'plastic_black', g, bevel=0.01)
    box(_n(g, 'glow'), (length - 0.06, 0.05, 0.012), (0, 0, z - 0.032), 'lampshade', g, bevel=0, segments=1)
    for sx in (-1, 1):
        tube(_n(g, 'cable'), [(sx * (length / 2 - 0.3), 0, z + 0.03), (sx * (length / 2 - 0.3), 0, 0)], 0.004,
             'plastic_black', g, res=4)
        cyl(_n(g, 'rose'), 0.05, 0.02, (sx * (length / 2 - 0.3), 0, -0.01), 'plastic_black', g, verts=10, bevel=0.003)
    if light_anchor:
        B.light(light_anchor, (location[0], location[1], location[2] - drop - 0.1), 'ceiling', '#fff1d6', 1.6, 6.0)
    return g


def sculpture(name='sculpture', location=(0, 0, 0), rotation=0):
    """Plinth with a stacked-ring abstract sculpture (gallery touch)."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'plinth'), (0.45, 0.45, 0.9), (0, 0, 0.45), 'plastic_white', g, bevel=0.02)
    torus(_n(g, 'ring'), 0.16, 0.045, (0, 0, 1.08), 'fabric_mustard', g, (90, 0, 20), major=20, minor=8)
    sphere(_n(g, 'ball'), 0.09, (0.02, 0, 1.3), 'fabric_coral', g, segs=12, rings=6)
    box(_n(g, 'block'), (0.14, 0.14, 0.14), (-0.05, 0.03, 0.97), 'fabric_teal', g, rot=(0, 0, 30), bevel=0.02)
    return g


def planter_box(name='planter', location=(0, 0, 0), rotation=0, w=1.2, d=0.4, seed=3):
    """Long low planter with snake-plant blades and a trailing edge (office bench end / divider)."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.obstacle(g)
    box(_n(g, 'box'), (w, d, 0.42), (0, 0, 0.21), 'plastic_white', g, bevel=0.02)
    box(_n(g, 'soil'), (w - 0.06, d - 0.06, 0.02), (0, 0, 0.41), 'wood_dark', g, bevel=0.004, segments=1)
    for i in range(16):
        x = -w / 2 + 0.1 + (i + rng.uniform(-0.3, 0.3)) * (w - 0.2) / 15
        h = rng.uniform(0.3, 0.75)
        box(_n(g, 'blade'), (0.09, 0.02, h), (x, rng.uniform(-0.1, 0.1), 0.4 + h / 2),
            'plant' if i % 3 else 'plant_dark', g, rot=(rng.uniform(-14, 14), rng.uniform(-10, 10), rng.uniform(0, 180)),
            bevel=0.008, segments=1)
    return g


def pool_table(name='pool_table', location=(0, 0, 0), rotation=0, seed=4):
    """Billiards table (2.3 x 1.3, felt top at 0.8) on chunky legs, balls racked + a few scattered, two cues."""
    rng = random.Random(seed)
    g = B.group(name, location, rotation)
    B.obstacle(g)
    L, Wd, Ht = 2.3, 1.3, 0.8
    box(_n(g, 'body'), (L, Wd, 0.22), (0, 0, Ht - 0.13), 'wood_dark', g, bevel=0.03)
    box(_n(g, 'felt'), (L - 0.22, Wd - 0.22, 0.03), (0, 0, Ht - 0.01), 'fabric_teal', g, bevel=0.01)
    for sx in (-1, 1):
        box(_n(g, 'rail'), (L - 0.1, 0.1, 0.06), (0, sx * (Wd / 2 - 0.05), Ht + 0.02), 'wood_dark', g, bevel=0.02)
        box(_n(g, 'rail'), (0.1, Wd - 0.1, 0.06), (sx * (L / 2 - 0.05), 0, Ht + 0.02), 'wood_dark', g, bevel=0.02)
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            cyl(_n(g, 'pocket'), 0.055, 0.02, (sx * (L / 2 - 0.09), sy * (Wd / 2 - 0.09), Ht + 0.006),
                'plastic_black', g, verts=12, bevel=0.0, segments=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(_n(g, 'leg'), (0.16, 0.16, Ht - 0.22), (sx * (L / 2 - 0.2), sy * (Wd / 2 - 0.2), (Ht - 0.22) / 2),
                'wood_dark', g, bevel=0.02)
    cols = ['mcd_yellow', 'fabric_blue', 'mcd_red', 'fabric_navy', 'fabric_coral', 'plant', 'wood_mid',
            'plastic_black', 'mcd_yellow', 'fabric_blue']
    r = 0.028
    k = 0
    for row in range(4):
        for i in range(row + 1):
            x = 0.45 + row * r * 1.75
            y = (i - row / 2) * r * 2.02
            sphere(_n(g, 'ball'), r, (x, y, Ht + 0.005 + r), cols[k % len(cols)], g, segs=10, rings=6)
            k += 1
    sphere(_n(g, 'cue_ball'), r, (-0.55, 0.05, Ht + 0.005 + r), 'plastic_white', g, segs=10, rings=6)
    for i in range(3):
        sphere(_n(g, 'ball'), r, (rng.uniform(-0.8, 0.2), rng.uniform(-0.4, 0.4), Ht + 0.005 + r),
               cols[(k + i) % len(cols)], g, segs=10, rings=6)
    tube(_n(g, 'cue'), [(-1.05, -0.2, Ht + 0.06), (0.25, 0.35, Ht + 0.06)], 0.011, 'wood_light', g, res=6,
         radii=[0.014, 0.008])
    tube(_n(g, 'cue2'), [(-L / 2 - 0.02, Wd / 2 - 0.15, 0.1), (-L / 2 + 0.05, Wd / 2 - 0.1, 1.45)], 0.012,
         'wood_light', g, res=6, radii=[0.015, 0.008])
    return g


def bed_bench(name='bed_bench', location=(0, 0, 0), rotation=0, w=1.5, mat='fabric_mustard'):
    """Upholstered bench at the foot of a bed (0.45 high) on slim dark legs, with a folded throw."""
    g = B.group(name, location, rotation)
    B.obstacle(g)
    blob(_n(g, 'seat'), (w, 0.42, 0.16), (0, 0, 0.38), mat, g, round_xy=0.3, round_z=0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(_n(g, 'leg'), 0.02, 0.3, (sx * (w / 2 - 0.08), sy * 0.14, 0.15), 'plastic_black', g, verts=8,
                r2=0.014, bevel=0.0, segments=1)
    blob(_n(g, 'throw'), (0.5, 0.44, 0.05), (w / 2 - 0.35, 0, 0.475), 'fabric_cream', g, round_xy=0.4, round_z=0.8)
    box(_n(g, 'book'), (0.2, 0.15, 0.03), (-w / 2 + 0.3, 0.02, 0.475), 'fabric_teal', g, rot=(0, 0, 12), bevel=0.004)
    return g
