# Art & audio assets

Everything under `public/assets/` was generated with kie.ai on 2026-09-23 and then sliced, trimmed and
compressed locally with `sharp`. The full file list, with sizes and dimensions, is in `public/assets/manifest.json`.

| Folder | Files | Format |
|---|---|---|
| `rooms/` | `tier0`–`tier5`, `mcdoodles`, `title` (8) + `hotspots.json` | WebP 1600×900, q80 |
| `products/` | 63, one per `id` in `src/data/productList.ts` | WebP 512×512, q82, white background |
| `people/` | `p01`–`p18` | WebP 256×256 |
| `player/` | `neutral`, `happy`, `tired`, `stressed` | WebP 256×256 |
| `gear/` | 9 item icons (ids below) | WebP 256×256, white background |
| `audio/` | `lofi1.mp3` (2:20, 2.9 MB), `lofi2.mp3` (2:53, 3.7 MB) | MP3 ~168 kbps |

## Models and cost

| Model | Used for | Cost per generation |
|---|---|---|
| `seedream/5-lite-text-to-image` (quality `basic`, 2K output) | product grids 2–7, all 8 rooms | 5.5 credits |
| `google/nano-banana` (1024×1024) | player 2×2, people 3×3 ×2, gear 3×3 (+1 test grid) | 4 credits |
| `nano-banana-2` (resolution `2K`) | product grid 1 (test that was kept) | 12 credits |
| Suno `V4_5`, custom mode, instrumental | 2 lo-fi tracks (one request returns 2) | 12 credits |

Credits: **533.06 before, 406.56 after = 126.5 spent** (114.5 images + 12 music).
Test spend: 21.5 credits on the grid-1/grid-2 comparison (nano-banana 4, nano-banana-2 2K 12, seedream 5.5). The
nano-banana-2 and seedream tests were good enough to keep as grids 1 and 2. The 1K nano-banana test grid was dropped.

Why seedream: for 1.5 credits more than nano-banana you get a 2048px grid instead of 1024px, so product
tiles come out at about 600px before the resize to 512. The 2K room renders (2560×1440) also downscale cleanly to 1600.
Nano-banana was kept for the cartoon portraits and icons, where 256px outputs don't need 2K and it keeps
characters consistent.

## Pipeline

- `scripts/slice-grid.mjs` is the grid slicer. Its CLI options: `--rows/--cols`, even split, `--detect` (snap to white
  gutters), `--boxes` (manual per-cell rects in %), `--inset`, `--mode product|cover`, `--whiten`, `--pad`, `--size`.
  - `product` mode trims near-white borders, pads to a square on white (6% margin) and resizes.
    If a cell has a non-white backdrop, it is kept full-bleed.
  - `cover` mode center-crops (used for portraits).
- Originals and helper scripts are in `scripts/.cache/` (gitignored): `g1_nb2.png`, `g2_sd.png` … `g7_sd.png`,
  `tier*.{png,jpg}`, `mcdoodles.jpg`, `title.png`, `player_nb.png`, `people{1,2}_nb.*`, `gear_nb.png`, and the raw mp3s.
- Crop details:
  - Grid 1 (nano-banana-2) draws grey cell outlines. It was sliced with exact measured boxes, cells at x/y = 22, 697, 1372 px, 653 px wide.
  - The player grid has white frame lines inside each cell, so each cell was cropped to the 426px area inside its frame.
  - The gear grid has rounded grey cell borders. It was cropped 10px inside them.
  - Rooms are not cropped. Each diorama floats on a plain backdrop with empty margins.

## Prompts

### Product grids (seedream 5 lite, 1:1, `basic`)
Template (grid 1 used the same text on nano-banana-2 at 2K):

> A 3x3 grid of 9 separate product photos, equal square cells separated by thin white gutters, each cell a different
> product on pure white background. Professional e-commerce product photography, each single product centered in its
> cell with generous white margin so it is fully visible and not cut off, soft studio lighting, subtle shadow,
> realistic, no text, no watermark, no packaging text, no labels[, no brand logos]. Cells in reading order (left to
> right, top to bottom): 1) … 9) …

Cells 1–9 are the `visual` strings from `productList.ts`, in list order for each `// ---- grid N ----` block.
Grid 7 was generated as a **3 columns × 4 rows grid at 3:4**. Its 3 extra cells re-did three weak products from earlier grids:
- 10) *a pink satin heatless curling rod: one long soft padded satin rod bent into a U shape like a headband, with two pink satin scrunchies and a claw clip beside it* (replaced the grid-2 `heatless-curler` tile, which showed a scrunchie headband)
- 11) *a compact cordless handheld car vacuum cleaner, cylindrical black and silver body with a clear dust cup and a narrow crevice nozzle attachment beside it* (the grid-5 `car-vacuum` tile looked like a glue gun)
- 12) *a pair of open-ear clip-on earbuds that hook around the outside of the ear like ear cuffs, matte white, next to their small open charging case* (the grid-6 `open-ear-buds` tile showed normal in-ear buds)

### Rooms (seedream 5 lite, 16:9, `basic`)
Shared prefix: *Cozy isometric 3D cartoon diorama, cutaway room with two walls and floor visible, soft pastel palette,
warm lighting, clean stylized Sims-like look, high detail, no text, no people, no logos. The diorama fills most of the
frame and floats on a plain soft cream background.* Each room prompt then places the furniture by position
("on the LEFT a …; in the BACK CENTER a desk with …; on the RIGHT a … fridge; on the RIGHT WALL the … door"):
- tier0: parents' basement with wood paneling, twin bed, old desk with a clunky laptop and a lamp, mini fridge, wooden stairs up to a door, saggy couch, washing machine, laundry basket, boxes.
- tier1: shared-apartment bedroom with a mattress on a low platform, abstract posters and string lights, a cheap white desk with a laptop, a kitchenette with a fridge/sink/microwave, and a hallway door.
- tier2: tidy studio with a queen bed, a desk with a monitor and a ring light, a kitchenette with a tall fridge and a stove, and a front door.
- tier3: industrial loft with a brick wall, factory windows and plants, a standing desk with dual monitors, a camera on a tripod with a softbox, an open kitchen with a fridge and an island, and a metal door.
- tier4: two-storey suburban house as a dollhouse cutaway. Bedroom (upper left), office with 3 monitors (upper right), kitchen with fridge (lower left), and a garage with shelves of boxes (lower right). The front door with steps is between the kitchen and the garage.
- tier5: night penthouse with floor-to-ceiling windows onto a skyline, king bed, executive desk with 2 ultrawide monitors, designer kitchen with a built-in fridge, and a brushed-metal elevator door. The backdrop is dark navy.
- mcdoodles: generic red/yellow burger restaurant. It has a counter with 2 registers, fryers with fries, a grill with patties, menu boards with only abstract burger/fries/drink pictures, a glass exit door, booths and a checkered floor. The prompt said no readable letters and no logos.
- title: isometric city block at dusk. It has one glowing apartment window, delivery boxes on the sidewalk, a corner burger restaurant with a red/yellow awning, a rooftop billboard with an abstract shopping-bag icon, a delivery van and street lamps. The prompt asked for empty sky at the top for the game title.

### Characters, people, gear (nano-banana, 1:1)
- Player: *A 2x2 grid of 4 square portrait images of the SAME cartoon character … friendly gender-ambiguous
  22-year-old with messy medium-length dark brown hair, plain grey hoodie … 1) neutral slight smile; 2) happy, big
  grin; 3) exhausted, droopy eyelids, dark eye bags; 4) stressed, wide worried eyes, sweat drop, hands grabbing hair.*
  The background is plain mint.
- People: two prompts, each *A 3x3 grid of 9 separate square portrait avatars of 9 DIFFERENT people … cozy stylized 3D
  cartoon style like The Sims … plain soft pastel background*, with one described person per cell:
  - p01–p09: young Black woman with braids; young East Asian man with bleached hair and headphones; middle-aged Latina woman with glasses; older white man with a grey beard and flat cap; young South Asian woman in a lavender hijab; middle-aged Black man in a polo; young white woman with red curls; older East Asian woman with grey hair; young Middle Eastern man with curly hair.
  - p10–p18: young nonbinary person with a pink buzzcut; middle-aged blonde woman in a blazer; young Latino man in a backwards cap; older Black woman with a grey afro and scarf; middle-aged South Asian man in a sweater vest; young Southeast Asian woman in a beanie; older white woman with a silver bun; young Indigenous man with a ponytail; middle-aged East Asian man in glasses and a hoodie.
- Gear: *A 3x3 grid of 9 separate game item icons … cute isometric 3D cartoon icon style, soft pastel shading …*.
  Cell order: `phone-cracked`, `phone-pro`, `ring-light`, `softbox-kit`, `mirrorless-camera`, `laptop-old`, `laptop-pro`,
  `workstation`, `lav-mic`.

### Music (Suno V4_5, custom mode, instrumental)
- Title: "Late Night Grind"
- Style: *lo-fi hip hop, chillhop, instrumental, mellow jazzy Rhodes piano chords, dusty boom-bap drums, warm vinyl crackle, soft bass, late night study beat, 80 bpm, loopable, calm and focused*
- Negative tags: *vocals, singing, rap, lyrics, EDM, heavy metal, aggressive*
- The API requires a callback URL. A placeholder (`https://example.com/kie-callback`) was passed and results were polled instead.

## Hotspots

`public/assets/rooms/hotspots.json` holds one rect per clickable object, as a percent (0–100) of the image's width and height,
measured from the top-left corner. Each rect was measured on the final 1600×900 WebP using a 5% grid overlay, then checked by drawing all rects back
onto the images. `tier4` has one extra key, `garage` (the inventory shelves), in addition to bed/computer/fridge/door.
`mcdoodles` has `counter`, `fryer` (the fryer and grill line) and `exit`. The rects are axis-aligned boxes around isometric objects, so a
few of them include some floor. For example, the mcdoodles counter box also covers the empty corner below the diagonal counter.

## Known flaws

- Products:
  - `window-robot` has a few illegible micro-glyphs on the device.
  - `thermal-printer` has scribble "text" on the printed receipt.
  - `moon-lamp` sits on its base instead of visibly levitating.
  - `mirrorless-camera` (gear) looks more like a DSLR.
  - `claw-clip-set` shows 7 small clips in a thin row, so the tile has a lot of white space.
  - `sunset-lamp` keeps its grey backdrop (the projected light needs it) inside a white margin.
- Grid 1 came from nano-banana-2 and grids 2–7 from seedream. Both are photoreal on white, but lighting differs slightly between them.
- Player portraits:
  - Eye color drifts between the four expressions (brown vs grey-green).
  - The "tired" eye bags look a bit like bruises.
  - Tiles are cropped inside the model's frame lines, so the hoodie is cut at the chest.
- Rooms:
  - The dioramas fill about 55–65% of the frame, with a plain margin around them.
  - The tier5 bed is large but not dramatically "huge".
  - The title art has two lit windows instead of exactly one.
- Music: both tracks fade out over the last ~6 s, so they are not sample-accurate seamless loops. Crossfade or play them as a
  playlist. The model was asked for no vocals and returned the instrumental variant, but nobody has listened to the tracks yet.
