#!/usr/bin/env node
// Slice an AI-generated grid image (e.g. 3x3 product sheet) into separate optimized WebP tiles.
//
// Usage:
//   node scripts/slice-grid.mjs --in grid.png --rows 3 --cols 3 \
//     --out a.webp,b.webp,... [--size 512] [--inset 3] [--mode product|cover] \
//     [--quality 82] [--detect] [--pad 6] [--boxes '[[x,y,w,h],...]']
//
//   --out      comma-separated output paths in reading order (left->right, top->bottom).
//              Use "-" to skip a cell.
//   --size     output edge length in px (square). Default 512.
//   --inset    percent of each cell trimmed from every side before processing (drops gutters). Default 3.
//   --mode     product: trim near-white borders, pad to square on white, resize (default).
//              cover:   center-crop the cell to square and resize (portraits / non-white backgrounds).
//   --detect   locate the white gutters automatically instead of splitting evenly.
//   --pad      percent of white margin added around a trimmed product. Default 6.
//   --boxes    manual override: JSON array of [x,y,w,h] per cell, in percent (0-100) of the image.
//   --threshold  trim tolerance for "white" (0-255 distance). Default 18.
//   --whiten   level (e.g. 246) that gets mapped to pure white before trimming, for models whose
//              "white" backgrounds come out slightly grey. Off by default.
//   --crop     manual override for ONE cell: "index:x,y,w,h" in percent of the image, may repeat via ';'.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const a = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const key = k.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) a[key] = true
    else { a[key] = next; i++ }
  }
  return a
}

const args = parseArgs(process.argv)
if (!args.in || !args.out) {
  console.error('usage: slice-grid.mjs --in <img> --rows 3 --cols 3 --out a.webp,b.webp,... [--size 512] [--inset 3] [--mode product|cover] [--detect] [--boxes json]')
  process.exit(1)
}
const rows = Number(args.rows ?? 3)
const cols = Number(args.cols ?? 3)
const size = Number(args.size ?? 512)
const inset = Number(args.inset ?? 3) / 100
const mode = args.mode ?? 'product'
const quality = Number(args.quality ?? 82)
const padPct = Number(args.pad ?? 6) / 100
const threshold = Number(args.threshold ?? 18)
const outs = String(args.out).split(',').map((s) => s.trim())
const whiten = args.whiten ? Number(args.whiten) : 0

const src = sharp(args.in)
const meta = await src.metadata()
const W = meta.width, H = meta.height

// Find divider positions. Even split by default; with --detect, snap each divider to the
// centre of the whitest band near the expected position.
async function detectDividers() {
  const { data, info } = await sharp(args.in).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
  const colWhite = new Float64Array(info.width)
  const rowWhite = new Float64Array(info.height)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x] >= 238 ? 1 : 0
      colWhite[x] += v
      rowWhite[y] += v
    }
  }
  for (let x = 0; x < info.width; x++) colWhite[x] /= info.height
  for (let y = 0; y < info.height; y++) rowWhite[y] /= info.width
  const snap = (profile, n, len) => {
    const cuts = [0]
    for (let i = 1; i < n; i++) {
      const expected = (len * i) / n
      const win = Math.round(len / n * 0.2)
      let best = expected, bestScore = -1
      // score = whiteness, prefer centre of runs of max whiteness
      for (let p = Math.max(1, Math.round(expected - win)); p < Math.min(len - 1, Math.round(expected + win)); p++) {
        const s = profile[p] - Math.abs(p - expected) / (win * 50)
        if (s > bestScore) { bestScore = s; best = p }
      }
      // expand to the white run around best and take its centre
      let lo = best, hi = best
      while (lo > 0 && profile[lo - 1] >= bestScore - 0.02) lo--
      while (hi < len - 1 && profile[hi + 1] >= bestScore - 0.02) hi++
      cuts.push(Math.round((lo + hi) / 2))
    }
    cuts.push(len)
    return cuts
  }
  return { xs: snap(colWhite, cols, info.width), ys: snap(rowWhite, rows, info.height) }
}

let boxes = []
if (args.boxes) {
  const b = JSON.parse(args.boxes)
  boxes = b.map(([x, y, w, h]) => ({ left: x / 100 * W, top: y / 100 * H, width: w / 100 * W, height: h / 100 * H }))
} else {
  let xs, ys
  if (args.detect) ({ xs, ys } = await detectDividers())
  else {
    xs = Array.from({ length: cols + 1 }, (_, i) => (W * i) / cols)
    ys = Array.from({ length: rows + 1 }, (_, i) => (H * i) / rows)
  }
  if (args.detect) console.log('dividers x:', xs.join(','), ' y:', ys.join(','))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({ left: xs[c], top: ys[r], width: xs[c + 1] - xs[c], height: ys[r + 1] - ys[r] })
    }
  }
}
if (args.crop) {
  for (const spec of String(args.crop).split(';')) {
    const [idx, rest] = spec.split(':')
    const [x, y, w, h] = rest.split(',').map(Number)
    boxes[Number(idx)] = { left: x / 100 * W, top: y / 100 * H, width: w / 100 * W, height: h / 100 * H, manual: true }
  }
}

for (let i = 0; i < boxes.length; i++) {
  const out = outs[i]
  if (!out || out === '-') continue
  const b = boxes[i]
  const ix = b.manual ? 0 : b.width * inset, iy = b.manual ? 0 : b.height * inset
  const region = {
    left: Math.max(0, Math.round(b.left + ix)),
    top: Math.max(0, Math.round(b.top + iy)),
    width: Math.round(b.width - 2 * ix),
    height: Math.round(b.height - 2 * iy),
  }
  region.width = Math.min(region.width, W - region.left)
  region.height = Math.min(region.height, H - region.top)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  let cell = sharp(args.in).extract(region).flatten({ background: '#ffffff' })
  if (whiten) cell = cell.linear(255 / whiten, 0)
  if (mode === 'cover') {
    const s = Math.min(region.width, region.height)
    const buf = await cell.toBuffer()
    await sharp(buf)
      .extract({ left: Math.round((region.width - s) / 2), top: Math.round((region.height - s) / 2), width: s, height: s })
      .resize(size, size)
      .webp({ quality })
      .toFile(out)
  } else {
    const cellBuf = await cell.png().toBuffer()
    let trimmed
    try {
      trimmed = await sharp(cellBuf).trim({ background: '#ffffff', threshold }).png().toBuffer({ resolveWithObject: true })
    } catch {
      trimmed = await sharp(cellBuf).png().toBuffer({ resolveWithObject: true })
    }
    const tw = trimmed.info.width, th = trimmed.info.height
    // If trimming removed (almost) nothing, the cell has a non-white backdrop: keep it full-bleed.
    const fullBleed = tw >= region.width * 0.97 && th >= region.height * 0.97
    const side = Math.round(Math.max(tw, th) * (fullBleed ? 1 : 1 + 2 * padPct))
    if (fullBleed) console.log('  (cell', i, 'has non-white background, kept full-bleed)')
    await sharp({ create: { width: side, height: side, channels: 3, background: '#ffffff' } })
      .composite([{ input: trimmed.data, left: Math.round((side - tw) / 2), top: Math.round((side - th) / 2) }])
      .png()
      .toBuffer()
      .then((b2) => sharp(b2).resize(size, size).webp({ quality }).toFile(out))
  }
  console.log('wrote', out)
}
