#!/usr/bin/env node
// 3D room QA: starts its own Vite dev server on a free port + headless Chromium with GPU WebGL (SwiftShader
// fallback, see scripts/snap3d.mjs), drives the game through the dev scenarios and window.__dt, and saves
// screenshots to scripts/e2e/out/scene3d/. Fails (exit 1) on page errors or console errors.
//
//   node scripts/e2e/scene3d.mjs            every shot
//   node scripts/e2e/scene3d.mjs title tier3 mcd   only shots whose name contains one of the words
//
// Shots: title, look editor (new game), home tiers 0-5, sleep, eat_home (cook + eat), a computer activity,
// film_creative, leaving for a shift, McDoodle's at the lunch rush, night lighting, a phone-size viewport,
// the 2D fallback (3D room off) and a failed model load (quietly 2D).
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launch, startServer } from '../snap3d.mjs'
import { collectErrors } from './helpers.mjs'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'scene3d')
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
const want = name => !only.length || only.some(w => name.includes(w))
const sleep = ms => new Promise(r => setTimeout(r, ms))

const { server, base } = await startServer()
const { browser, renderer } = await launch()
console.log(`webgl: ${renderer}\nserver: ${base}`)
const problems = []
const shots = []

async function newPage(viewport = { width: 1440, height: 900 }, opts = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile })
  // first visit hint off unless asked; 3D prefs default (on, auto)
  await context.addInitScript(hint => {
    try {
      if (!hint) localStorage.setItem('dropship-tycoon:hint-hotspots', '1')
    } catch { /* ignore */ }
  }, !!opts.hint)
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  const errors = collectErrors(page)
  return { page, errors, close: () => context.close() }
}

async function openGame(page, scenario = 'fresh', { speed = 0 } = {}) {
  await page.goto(`${base}/?scenario=${scenario}&speed=${speed}&slot=9`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__dt && (window.__dt.scenario || window.__dt.scenarioError), null, { polling: 100 })
  await page.waitForSelector('.sh-game')
}

async function wait3d(page) {
  await page.waitForSelector('.sh-3d.is-ready', { timeout: 60_000 })
  await sleep(900)
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  console.log(`  shot ${path.relative(process.cwd(), file)}`)
}

function check(errors, label) {
  const e = errors.take()
  if (e.length) {
    problems.push(`${label}: ${e.map(x => x.text).join(' | ')}`)
    console.error(`  ERR ${label}:`, e.map(x => x.text).join(' | '))
  }
}

const dt = (page, fn, arg) => page.evaluate(fn, arg)
/** set the clock to `h` o'clock on the current day (keeps the day) */
const setHour = (page, h) => dt(page, h => window.__dt.act(s => { s.time.hour = Math.floor(s.time.hour / 24) * 24 + h }), h)
const setSpeed = (page, v) => dt(page, v => window.__dt.setSpeed(v), v)
const debug = page => dt(page, () => window.__dt.scene3d())
/** wait until the director's beat is `kind` (and optionally the room) */
async function waitBeat(page, kind, room, ms = 20_000) {
  await page.waitForFunction(([k, r]) => {
    const d = window.__dt.scene3d()
    return d && d.beat && d.beat.kind === k && (!r || d.room === r) && !d.transition
  }, [kind, room], { timeout: ms, polling: 100 })
}

try {
  // ---------------------------------------------------------------- title + look editor
  if (want('title') || want('look')) {
    const { page, errors, close } = await newPage()
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.sh-title')
    await page.waitForSelector('.sh-title-bg.is-hidden', { timeout: 60_000 })
    await sleep(2500)
    if (want('title')) await shot(page, '01_title')
    if (want('look')) {
      await page.getByRole('button', { name: /New game/ }).click()
      await page.fill('.sh-newgame input', 'Jordan')
      await page.getByRole('button', { name: /Next: your look/ }).click()
      await page.waitForSelector('.sh-look-stage canvas')
      await sleep(3500)
      await shot(page, '02_look_editor')
      await page.getByRole('tab', { name: 'Hair' }).click()
      await page.getByRole('radio', { name: 'Curly' }).click()
      await page.getByRole('radio', { name: '#b8532e' }).click()
      await page.getByRole('tab', { name: 'Extras' }).click()
      await page.getByRole('button', { name: /Glasses/ }).click()
      await page.getByRole('tab', { name: 'Outfit' }).click()
      await sleep(1500)
      await shot(page, '03_look_editor_edited')
      await page.getByRole('button', { name: /Start your first shift/ }).click()
      await page.waitForSelector('.sh-game')
      await wait3d(page)
      const look = await dt(page, () => window.__dt.state().player.look)
      if (!look || look.hairStyle !== 'curly' || !look.acc?.includes('glasses')) problems.push(`look not saved: ${JSON.stringify(look)}`)
      await sleep(1500)
      await shot(page, '04_new_game_room')
    }
    check(errors, 'title')
    await close()
  }

  // ---------------------------------------------------------------- homes, activities
  // The sim clock stays paused (so the hour and the activity hold still) while the room animates at 1×.
  if (['tier', 'sleep', 'eat', 'computer', 'film', 'shift', 'mcd', 'night', 'staff', 'hint', 'card', 'walk', 'thought', 'settings'].some(want)) {
    const { page, errors, close } = await newPage(undefined, { hint: want('hint') })
    await openGame(page, 'scaled', { speed: 0 })
    await wait3d(page)
    await dt(page, () => {
      window.__dt.act(s => { s.flags.autopilot = false; s.player.energy = 80; s.player.hunger = 80; s.player.mood = 72; s.player.activity = null; s.player.queue = [] })
      window.__dt.roomSpeed(1)
    })
    await setHour(page, 11)
    if (want('hint')) {
      await sleep(1500)
      await shot(page, '05_hint_labels')
    }
    const waitRoom = room => page.waitForFunction(r => { const d = window.__dt.scene3d(); return d && d.room === r && !d.transition }, room, { timeout: 30_000, polling: 100 })
    if (want('tier')) {
      for (let t = 0; t <= 5; t++) {
        await dt(page, t => window.__dt.act(s => { s.home.tier = t }), t)
        await waitRoom(`tier${t}`)
        await sleep(3500)
        await shot(page, `1${t}_home_tier${t}`)
        check(errors, `tier${t}`)
      }
    }
    // activities happen in tier 3 (the loft has every spot)
    await dt(page, () => window.__dt.act(s => { s.home.tier = 3 }))
    await waitRoom('tier3')
    const start = async (kind, { durationMin = 600, hour = 13, progress = 0 } = {}) => {
      await setHour(page, hour)
      await dt(page, ([k, d, p]) => {
        window.__dt.startActivity(k, { durationMin: d })
        window.__dt.act(s => { if (s.player.activity) s.player.activity.remainingMin = s.player.activity.durationMin * (1 - p) })
      }, [kind, durationMin, progress])
    }
    const snap = async name => {
      await shot(page, name)
      const d = await debug(page)
      console.log(`    ${name}: ${d?.beat?.kind} -> ${d?.player} (${d?.hold ?? 'empty hands'})`)
      check(errors, name)
    }
    if (want('walk')) {
      // click the floor: the player walks there
      await sleep(1000)
      const box = await page.locator('.sh-3d-canvas').boundingBox()
      if (process.env.QA_DEBUG) {
        page.on('console', m => { if (m.text().startsWith('[qa]')) console.log(m.text()) })
        await dt(page, () => { const d = window.__scene3d; const w = d.walkTo.bind(d); d.walkTo = p => { const r = w(p); console.log('[qa] walkTo', JSON.stringify(p), r, JSON.stringify(window.__dt.state().player.activity), JSON.stringify(d.debug().beat), JSON.stringify(d.debug().transition)); return r } })
      }
      await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.6)
      await sleep(300)
      if ((await debug(page))?.override !== 'goto') problems.push('click on the floor did not walk')
      await sleep(2200)
      await snap('19_click_to_walk')
    }
    if (want('sleep')) {
      await start('sleep', { hour: 23 })
      await sleep(8000)
      await snap('20_sleep')
    }
    if (want('eat')) {
      await start('eat_home', { hour: 19 })
      await sleep(7000)
      await snap('21_eat_home_cook')
      await dt(page, () => window.__dt.act(s => { const a = s.player.activity; if (a) a.remainingMin = a.durationMin * 0.2 }))
      await sleep(6000)
      await snap('22_eat_home_eat')
    }
    if (want('computer')) {
      await start('customer_support', { hour: 15 })
      await sleep(7000)
      await snap('23_computer_support')
    }
    if (want('film')) {
      await start('film_creative', { hour: 16 })
      await sleep(7000)
      await snap('24_film_creative')
    }
    if (want('card')) {
      await start('relax', { hour: 17 })
      await sleep(7000)
      const pt = await dt(page, () => { const p = window.__stage.screenPoint('player', 'head'); const r = document.querySelector('.sh-3d-canvas').getBoundingClientRect(); return p && { x: p.x + r.left, y: p.y + r.top + 30 } })
      if (pt) await page.mouse.click(pt.x, pt.y)
      await sleep(600)
      await snap('25_relax_needs_card')
      await page.keyboard.press('Escape')
    }
    if (want('night')) {
      await start('study', { hour: 22 })
      await sleep(7000)
      await snap('26_night_study')
    }
    if (want('thought')) {
      // idle and starving: a thought bubble over the head, clicking it opens the kitchen menu
      await dt(page, () => window.__dt.act(s => { s.player.activity = null; s.player.queue = []; s.player.hunger = 12 }))
      await setHour(page, 14)
      await sleep(4000)
      await page.waitForSelector('.sh-3d-thought', { timeout: 20_000 })
      await snap('31_thought_hungry')
      await page.locator('.sh-3d-thought').click({ force: true })
      await sleep(500)
      if (!(await page.$('.sh-menu'))) problems.push('thought bubble did not open a menu')
      await snap('32_thought_opens_kitchen')
      await page.keyboard.press('Escape')
      await dt(page, () => window.__dt.act(s => { s.player.hunger = 80 }))
    }
    if (want('settings')) {
      await dt(page, () => window.__dt.useUI.getState().set({ overlay: 'settings' }))
      await sleep(600)
      await snap('33_settings')
      await page.getByRole('button', { name: /Edit look/ }).click()
      await page.waitForSelector('.sh-look-stage canvas')
      await sleep(3000)
      await snap('34_edit_look_in_game')
      await page.keyboard.press('Escape')
      await sleep(400)
    }
    if (want('shift') || want('mcd')) {
      await setHour(page, 12)
      await dt(page, () => window.__dt.act(s => {
        s.player.queue = []
        s.player.activity = { id: 'qa_shift', kind: 'work_shift', label: "Shift at McDoodle's", durationMin: 480, remainingMin: 480, startedHour: s.time.hour }
        s.player.location = 'work'
      }))
      await sleep(2200)
      await snap('27_leaving_for_shift')
      await waitRoom('mcdoodles')
      await sleep(14000)
      await snap('28_mcdoodles_lunch_rush')
      console.log(`    crowd: ${JSON.stringify((await debug(page))?.mcd?.customers)}`)
      // "Drop a basket"
      const fryer = await dt(page, () => { const r = window.__stage.screenRect('fryer'); const c = document.querySelector('.sh-3d-canvas').getBoundingClientRect(); return r && { x: c.left + r.x + r.w / 2, y: c.top + r.y + r.h / 2 } })
      if (fryer) {
        await page.mouse.click(fryer.x, fryer.y)
        await sleep(400)
        await page.getByRole('menuitem', { name: /Drop a basket/ }).click()
        await sleep(2600)
        await snap('29_mcdoodles_fryer')
      } else problems.push('fryer not on screen')
    }
    check(errors, 'homes')
    await close()
  }

  // ---------------------------------------------------------------- phone
  if (want('phone')) {
    const { page, errors, close } = await newPage({ width: 390, height: 844 }, { mobile: true })
    await openGame(page, 'store', { speed: 1 })
    await wait3d(page)
    await sleep(2500)
    await shot(page, '30_phone')
    check(errors, 'phone')
    await close()
  }

  // ---------------------------------------------------------------- a room model fails to load: quietly 2D
  if (want('fail')) {
    const { page, errors, close } = await newPage()
    await page.route('**/3d/tier0.glb', r => r.fulfill({ status: 404, body: 'missing' }))
    await openGame(page, 'fresh', { speed: 0 })
    await page.waitForSelector('.sh-stage-img.is-loaded')
    await page.waitForFunction(() => !document.querySelector('.sh-3d'), null, { timeout: 30_000 })
    await sleep(600)
    await shot(page, '41_load_failure_fallback')
    check(errors, 'fail')
    await close()
  }

  // ---------------------------------------------------------------- 2D fallback (3D room off)
  if (want('2d')) {
    const { page, errors, close } = await newPage()
    await page.addInitScript(() => { try { localStorage.setItem('dropship-tycoon:shell', JSON.stringify({ room3d: false })) } catch { /* ignore */ } })
    await openGame(page, 'fresh', { speed: 0 })
    await page.waitForSelector('.sh-stage-img.is-loaded')
    await sleep(800)
    if (await page.$('.sh-3d')) problems.push('3D room rendered with the setting off')
    await shot(page, '40_2d_fallback')
    check(errors, '2d')
    await close()
  }
} catch (e) {
  problems.push(`script: ${e?.stack ?? e}`)
  console.error(e)
} finally {
  await browser.close().catch(() => {})
  await server.close().catch(() => {})
}

console.log(`\n${shots.length} screenshots in ${path.relative(process.cwd(), OUT)}`)
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('OK: no console or page errors')
process.exit(0)
