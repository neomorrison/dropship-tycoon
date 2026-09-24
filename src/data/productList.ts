// Master list of catalog products. Economics live in products.ts (keyed by id).
// `visual` is the art-direction line used to generate the product photo.
// `archetype` is HIDDEN design intent used to tune economics — never shown to players.

export type Niche =
  | 'pet' | 'beauty' | 'home' | 'kitchen' | 'fitness' | 'wellness'
  | 'car' | 'gadgets' | 'baby' | 'kids' | 'fashion' | 'outdoor'

export type Archetype =
  | 'winner'      // strong product-market fit, profitable with good execution
  | 'highticket'  // big perceived-value gap, needs trust + good page, lower CVR
  | 'seasonal'    // winner only in its season
  | 'emerging'    // trend rising after it appears; early movers win
  | 'solid'       // modest, profitable only with great execution
  | 'saturated'   // was a winner; many competitors, CPMs/CVR punished
  | 'dud'         // low perceived value / commodity; can't clear ad costs
  | 'trap'        // looks great but high defects -> refunds/chargebacks, or claim bans

export interface ProductListing {
  id: string
  name: string
  niche: Niche
  archetype: Archetype
  visual: string
}

export const PRODUCT_LIST: ProductListing[] = [
  // ---- grid 1 ----
  { id: 'pet-hair-roller', name: 'Reusable Pet Hair Remover Roller', niche: 'pet', archetype: 'winner', visual: 'a reusable pet hair remover roller, grey plastic with a red fabric roller drum and handle' },
  { id: 'cat-water-fountain', name: 'Flower Cat Water Fountain', niche: 'pet', archetype: 'solid', visual: 'a white plastic cat water fountain with a flower-shaped top spout, water flowing' },
  { id: 'dog-paw-cleaner', name: 'Portable Dog Paw Cleaner Cup', niche: 'pet', archetype: 'winner', visual: 'a portable dog paw cleaner cup, blue plastic cup with soft silicone bristles inside, lid off' },
  { id: 'self-cleaning-brush', name: 'Self-Cleaning Slicker Brush', niche: 'pet', archetype: 'saturated', visual: 'a self-cleaning slicker pet brush with retractable pins and a button, teal and white' },
  { id: 'cat-laser-toy', name: 'Automatic Cat Laser Toy', niche: 'pet', archetype: 'solid', visual: 'an automatic cat laser toy, small white dome device with a red laser dot' },
  { id: 'dog-car-hammock', name: 'Dog Car Seat Hammock Cover', niche: 'pet', archetype: 'solid', visual: 'a black quilted waterproof dog car seat hammock cover folded neatly' },
  { id: 'pet-grooming-vacuum', name: 'Pet Grooming Vacuum Kit', niche: 'pet', archetype: 'highticket', visual: 'a pet grooming vacuum kit, white canister vacuum with hose and 5 grooming attachments laid out' },
  { id: 'dog-lick-mat', name: 'Dog Lick Mat', niche: 'pet', archetype: 'dud', visual: 'a round pink silicone dog lick mat with textured patterns and suction cups' },
  { id: 'ice-face-roller', name: 'Ice Face Roller', niche: 'beauty', archetype: 'solid', visual: 'an ice face roller with a frosted mint green roller head and chrome handle' },
  // ---- grid 2 ----
  { id: 'blackhead-vacuum', name: 'Blackhead Remover Pore Vacuum', niche: 'beauty', archetype: 'trap', visual: 'a white handheld blackhead pore vacuum with a small LCD screen and 4 suction heads' },
  { id: 'led-face-mask', name: 'LED Light Therapy Face Mask', niche: 'beauty', archetype: 'highticket', visual: 'a white LED light therapy face mask glowing soft red light, front view' },
  { id: 'heatless-curler', name: 'Heatless Curling Rod Headband', niche: 'beauty', archetype: 'emerging', visual: 'a pink satin heatless curling rod headband with two scrunchies and a claw clip' },
  { id: 'scalp-massager', name: 'Scalp Massager Shampoo Brush', niche: 'beauty', archetype: 'dud', visual: 'a lavender silicone scalp massager shampoo brush with soft bristles' },
  { id: 'teeth-whitening-kit', name: 'LED Teeth Whitening Kit', niche: 'beauty', archetype: 'saturated', visual: 'an LED teeth whitening kit: blue-light mouthpiece device with two gel pens in a box' },
  { id: 'scalp-oil-applicator', name: 'Scalp Oil Applicator Bottle', niche: 'beauty', archetype: 'dud', visual: 'a small amber plastic scalp oil applicator bottle with comb-tip nozzle' },
  { id: 'nail-drill-kit', name: 'Electric Nail Drill Kit', niche: 'beauty', archetype: 'solid', visual: 'a rose gold electric nail drill pen with a set of drill bits in a case' },
  { id: 'galaxy-projector', name: 'Galaxy Star Projector', niche: 'home', archetype: 'seasonal', visual: 'an astronaut-shaped galaxy star projector, white astronaut figure with a dome visor emitting purple nebula light' },
  { id: 'sunset-lamp', name: 'Sunset Projection Lamp', niche: 'home', archetype: 'saturated', visual: 'a black sunset projection lamp on a stand casting an orange-red circle of light' },
  // ---- grid 3 ----
  { id: 'motion-cabinet-lights', name: 'Motion Sensor Cabinet Lights', niche: 'home', archetype: 'solid', visual: 'three slim rechargeable motion sensor LED light bars, silver, one glowing warm white' },
  { id: 'spin-scrubber', name: 'Electric Spin Scrubber', niche: 'home', archetype: 'winner', visual: 'a cordless electric spin scrubber with a long extendable handle and round brush heads' },
  { id: 'window-robot', name: 'Window Cleaning Robot', niche: 'home', archetype: 'highticket', visual: 'a square white window cleaning robot with a safety rope and remote control' },
  { id: 'garment-steamer', name: 'Portable Garment Steamer', niche: 'home', archetype: 'solid', visual: 'a compact handheld garment steamer, white with a sage green water tank' },
  { id: 'magnetic-screen-door', name: 'Magnetic Screen Door', niche: 'home', archetype: 'seasonal', visual: 'a folded black mesh magnetic screen door with magnets along the center seam, packaged' },
  { id: 'moon-lamp', name: 'Levitating Moon Lamp', niche: 'home', archetype: 'trap', visual: 'a levitating 3D moon lamp floating above a wooden magnetic base, glowing warm' },
  { id: 'oil-sprayer', name: 'Olive Oil Sprayer Bottle', niche: 'kitchen', archetype: 'dud', visual: 'a clear glass olive oil sprayer bottle with a black pump top, half filled with oil' },
  { id: 'veggie-chopper', name: 'Multi Vegetable Chopper', niche: 'kitchen', archetype: 'saturated', visual: 'a multi-blade vegetable chopper with a green lid and clear container, diced onions inside' },
  { id: 'portable-blender', name: 'Portable Blender Bottle', niche: 'kitchen', archetype: 'saturated', visual: 'a portable USB-C blender bottle, pastel blue, filled with a pink smoothie' },
  // ---- grid 4 ----
  { id: 'milk-frother', name: 'Handheld Milk Frother', niche: 'kitchen', archetype: 'dud', visual: 'a black handheld milk frother wand next to a latte with foam' },
  { id: 'ice-ball-maker', name: 'Crystal Clear Ice Ball Maker', niche: 'kitchen', archetype: 'solid', visual: 'a clear ice ball maker mold with a perfect crystal-clear ice sphere in a whiskey glass' },
  { id: 'gravity-grinder', name: 'Gravity Electric Salt & Pepper Grinder', niche: 'kitchen', archetype: 'winner', visual: 'a pair of matte black gravity electric salt and pepper grinders with blue LED light at the bottom' },
  { id: 'herb-keeper', name: 'Fresh Herb Keeper', niche: 'kitchen', archetype: 'dud', visual: 'a clear plastic fresh herb keeper container with cilantro inside' },
  { id: 'posture-corrector', name: 'Adjustable Posture Corrector', niche: 'wellness', archetype: 'winner', visual: 'a black adjustable posture corrector back brace with shoulder straps, laid flat' },
  { id: 'neck-massager', name: 'Cordless Shiatsu Neck Massager', niche: 'wellness', archetype: 'highticket', visual: 'a U-shaped cordless shiatsu neck and shoulder massager, grey fabric with heat nodes' },
  { id: 'mini-massage-gun', name: 'Mini Massage Gun', niche: 'fitness', archetype: 'saturated', visual: 'a matte black mini percussion massage gun with 4 interchangeable heads' },
  { id: 'smart-jump-rope', name: 'Smart Counting Jump Rope', niche: 'fitness', archetype: 'solid', visual: 'a smart jump rope with digital counter display in the handle, black and orange' },
  { id: 'ab-roller', name: 'Auto-Rebound Ab Roller', niche: 'fitness', archetype: 'seasonal', visual: 'an auto-rebound ab roller wheel with elbow support pads and a built-in timer' },
  // ---- grid 5 ----
  { id: 'resistance-bands', name: 'Resistance Bands Set', niche: 'fitness', archetype: 'dud', visual: 'a set of 5 colorful fabric resistance bands fanned out with a mesh carry bag' },
  { id: 'acupressure-mat', name: 'Acupressure Mat & Pillow Set', niche: 'wellness', archetype: 'solid', visual: 'a teal acupressure mat and pillow set covered in white lotus spike discs' },
  { id: 'mouth-tape', name: 'Sleep Mouth Tape (90 strips)', niche: 'wellness', archetype: 'emerging', visual: 'a minimalist box of sleep mouth tape strips with a few X-shaped white strips displayed' },
  { id: 'sunrise-alarm', name: 'Sunrise Alarm Clock', niche: 'wellness', archetype: 'seasonal', visual: 'a round sunrise alarm clock glowing warm orange with a digital time display' },
  { id: 'weighted-eye-mask', name: 'Weighted Sleep Eye Mask', niche: 'wellness', archetype: 'solid', visual: 'a dusty pink weighted contoured sleep eye mask with adjustable strap' },
  { id: 'red-light-wand', name: 'Red Light Therapy Wand', niche: 'wellness', archetype: 'emerging', visual: 'a sleek white red light therapy face wand with a glowing red LED head' },
  { id: 'magnetic-phone-mount', name: 'Magnetic Car Phone Mount', niche: 'car', archetype: 'dud', visual: 'a small black magnetic car phone mount for an air vent with a metal plate' },
  { id: 'seat-gap-filler', name: 'Car Seat Gap Filler (2-pack)', niche: 'car', archetype: 'solid', visual: 'two black leather car seat gap filler organizers with small pockets' },
  { id: 'car-vacuum', name: 'Cordless Handheld Car Vacuum', niche: 'car', archetype: 'solid', visual: 'a compact cordless handheld car vacuum, black and silver, with crevice attachments' },
  // ---- grid 6 ----
  { id: 'jump-starter', name: 'Portable Car Jump Starter', niche: 'car', archetype: 'seasonal', visual: 'a portable car jump starter power bank with red and black jumper clamps' },
  { id: 'magsafe-charger-stand', name: '3-in-1 Foldable Magnetic Charger', niche: 'gadgets', archetype: 'saturated', visual: 'a white foldable 3-in-1 magnetic wireless charging stand for phone, watch, and earbuds' },
  { id: 'thermal-printer', name: 'Mini Pocket Thermal Printer', niche: 'gadgets', archetype: 'winner', visual: 'a cute mini pocket thermal printer, pastel pink, printing a small sticker receipt' },
  { id: 'ring-light', name: 'Selfie Ring Light with Tripod', niche: 'gadgets', archetype: 'saturated', visual: 'a 10-inch selfie ring light on a tall tripod with a phone holder' },
  { id: 'open-ear-buds', name: 'Open-Ear Clip Earbuds', niche: 'gadgets', archetype: 'solid', visual: 'a pair of open-ear clip-on earbuds in a charging case, matte white' },
  { id: 'retro-earbuds', name: 'Transparent Retro Earbuds', niche: 'gadgets', archetype: 'trap', visual: 'transparent clear retro wireless earbuds in a see-through charging case showing the circuits' },
  { id: 'baby-nail-trimmer', name: 'Electric Baby Nail Trimmer', niche: 'baby', archetype: 'winner', visual: 'a white electric baby nail trimmer with soft LED light and 6 colorful grinding pads' },
  { id: 'white-noise-machine', name: 'Portable White Noise Machine', niche: 'baby', archetype: 'solid', visual: 'a small round portable white noise machine, sage green with a strap for strollers' },
  { id: 'busy-board', name: 'Montessori Busy Board', niche: 'kids', archetype: 'seasonal', visual: 'a wooden Montessori busy board for toddlers with latches, switches, zipper, and gears' },
  // ---- grid 7 ----
  { id: 'drawing-projector', name: 'Kids Drawing Projector', niche: 'kids', archetype: 'solid', visual: 'a kids drawing projector toy shaped like a cartoon dinosaur projecting an outline onto paper' },
  { id: 'magnetic-tiles', name: 'Magnetic Building Tiles (60pc)', niche: 'kids', archetype: 'saturated', visual: 'a pile of translucent rainbow magnetic building tiles with a small tower built' },
  { id: 'anti-theft-backpack', name: 'Anti-Theft Travel Backpack', niche: 'fashion', archetype: 'solid', visual: 'a charcoal grey anti-theft travel backpack with hidden zipper and USB charging port' },
  { id: 'minimalist-wallet', name: 'Slim RFID Minimalist Wallet', niche: 'fashion', archetype: 'saturated', visual: 'a slim black aluminum RFID minimalist card wallet with cards fanned out' },
  { id: 'claw-clip-set', name: 'Claw Clip Set (6pc)', niche: 'fashion', archetype: 'dud', visual: 'six matte neutral-tone claw hair clips arranged in a row' },
  { id: 'heated-vest', name: 'USB Heated Vest', niche: 'outdoor', archetype: 'seasonal', visual: 'a black puffer heated vest with a glowing heat zone and a small power bank' },
  { id: 'solar-firefly-lights', name: 'Solar Firefly Garden Lights', niche: 'outdoor', archetype: 'seasonal', visual: 'a set of solar firefly garden lights with swaying warm LED tips on thin wire stems' },
  { id: 'bug-zapper-lamp', name: 'Rechargeable Bug Zapper Lamp', niche: 'outdoor', archetype: 'seasonal', visual: 'a rechargeable bug zapper lantern lamp glowing purple-blue with a hanging hook' },
  { id: 'heated-throw', name: 'Heated Throw Blanket', niche: 'home', archetype: 'seasonal', visual: 'a cozy cream sherpa heated throw blanket folded with a small controller' },
]
