// The pictures a browser without WebGL sees (src/components/NoGL.vue,
// src/utils/webgl.js): the opening room as a still, and each built-in
// question's 3D icon, taken from the app itself with graphics on.
//
//   PUPPETEER=<path to puppeteer> SHARP=<path to sharp> node scripts/bake-fallback.mjs [url]
//
// Neither is an app dependency; point the env vars at any install.
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer')
const sharp = require(process.env.SHARP || 'sharp')
const url = process.argv[2] || 'https://hi-em.github.io/neurospace/'
const out = new URL('../public/fallback/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
fs.mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 })
await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => document.querySelectorAll('.q img').length >= 7, { timeout: 30000 })
await new Promise(r => setTimeout(r, 1500))

// the question icons: the app's own renders, saved as they are
const icons = await page.evaluate(() => [...document.querySelectorAll('.q')].map(q => {
  const img = q.querySelector('img'); return img ? img.src : null
}))
const ids = ['height', 'curve', 'count', 'openings', 'size', 'bio', 'plants']   // QUESTIONS order, utils/lab.js
ids.forEach((id, i) => { if (icons[i]) fs.writeFileSync(`${out}q-${id}.png`, Buffer.from(icons[i].split(',')[1], 'base64')) })

// the room: the opening view, framed on the membrane, the bands and cards out of shot
const shot = await page.screenshot({ clip: { x: 560, y: 215, width: 810, height: 540 } })
await sharp(shot).webp({ quality: 86 }).toFile(`${out}room.webp`)
await browser.close()
console.log('baked', fs.readdirSync(out).join(' '))
