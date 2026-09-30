// THE MARK: one leaf grown past its control.
//
// Drawn from the Observe rose (src/components/PetalRose.vue): five leaves for
// the five score dimensions, each leaf's AREA proportional to its share, the
// control dashed behind it. The mark is that rose for one experiment in the
// app's own grammar: every leaf at the same share, one leaf (the ceiling, the
// first dimension) grown to full past its dashed control. Change one thing.
//
// One source drawing, three outputs, so they match by construction:
//   public/favicon.svg + the PNG icon set    (this app)
//   the portfolio plate                       (printed below, 160 x 90, for
//                                              eec-portfolio's artifacts.tsx)
//
//   node scripts/mark.mjs            writes public/, prints the plate
import fs from 'node:fs'
import { createRequire } from 'node:module'

const INK = '#111111', RED = '#C50000', FABRIC = '#F4F0E8'
const N = 5, CONTROL_SHARE = 0.34, GROWN = 0
const f = (n) => +n.toFixed(2)

// PetalRose.vue's leaf: two cubics from the hub out to radius r, widest at
// about 45% of its length, a rounded tip. Same control points.
function rose(cx, cy, R, r0Frac = 0.14) {
  const r0 = R * r0Frac, half = (Math.PI / N) * 1.12
  const pt = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const rad = (s) => r0 + (R - r0) * Math.sqrt(s)
  const leaf = (a, r) => {
    const len = r - r0, b = r0 + 0.6, g = (k, w) => pt(a + w, b + len * k)
    const [x0, y0] = pt(a, b), [tx, ty] = pt(a, r)
    const [c1x, c1y] = g(0.3, -half), [c2x, c2y] = g(0.95, -half * 0.62)
    const [d1x, d1y] = g(0.95, half * 0.62), [d2x, d2y] = g(0.3, half)
    return `M${f(x0)} ${f(y0)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(tx)} ${f(ty)}C${f(d1x)} ${f(d1y)} ${f(d2x)} ${f(d2y)} ${f(x0)} ${f(y0)}Z`
  }
  return Array.from({ length: N }, (_, i) => {
    const a = ((i + 0.5) / N) * 2 * Math.PI
    return { grown: i === GROWN, v: leaf(a, rad(i === GROWN ? 1 : CONTROL_SHARE)), c: leaf(a, rad(CONTROL_SHARE)) }
  }).concat([{ hub: { cx: f(cx), cy: f(cy), r: f(r0) } }])
}

// ---- the app icon: the rose on a fabric disc (holds on light and dark tabs)
function iconSVG({ disc = true } = {}) {
  // centred on its visual weight: the grown leaf pulls the rose up and right,
  // so the hub sits down and left of the disc's centre
  const L = rose(14.4, 17.6, 15.6), hub = L.pop().hub
  const body = L.map((l) => (l.grown
    ? `<path d="${l.v}" fill="${RED}"/><path d="${l.c}" fill="none" stroke="${FABRIC}" stroke-width="1.1" stroke-dasharray="1.8 1.4"/>`
    : `<path d="${l.v}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`)).join('')
  const ground = disc ? `<circle cx="16" cy="16" r="15.6" fill="${FABRIC}"/>` : `<rect width="32" height="32" fill="${FABRIC}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${ground}${body}<circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" fill="${INK}"/></svg>`
}

// ---- the portfolio plate: the same rose in the plate grammar (.ln ink,
// .th thin, .dt dot, .acs the one accent), on the 160 x 90 plate
function plateSVG() {
  const L = rose(80, 46, 40), hub = L.pop().hub
  const body = L.map((l) => (l.grown
    ? `<path className="th" strokeDasharray="2 2.5" d="${l.c}" /><path className="acs" d="${l.v}" />`
    : `<path className="ln" d="${l.v}" />`)).join('\n      ')
  return `<svg {...VB}>\n      ${body}\n      <circle className="dt" cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" />\n    </svg>`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const pub = new URL('../public/', import.meta.url)
  fs.mkdirSync(pub, { recursive: true })
  fs.writeFileSync(new URL('favicon.svg', pub), iconSVG())
  // PNGs through sharp when it is around (it is not an app dependency)
  try {
    const require = createRequire(import.meta.url)
    const sharp = require(process.env.SHARP || 'sharp')
    for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
      // the rose at 84% of a full-bleed fabric square: platforms round the corners themselves
      const inner = Math.round(size * 0.84)
      const rose = await sharp(Buffer.from(iconSVG({ disc: false }).replace(`<rect width="32" height="32" fill="${FABRIC}"/>`, '')), { density: 72 * size / 32 }).resize(inner, inner).png().toBuffer()
      await sharp({ create: { width: size, height: size, channels: 4, background: FABRIC } }).composite([{ input: rose, gravity: 'center' }]).png().toFile(new URL(name, pub).pathname.replace(/^\/(\w:)/, '$1'))
    }
    await sharp(Buffer.from(iconSVG()), { density: 72 }).resize(32, 32).png().toFile(new URL('favicon-32.png', pub).pathname.replace(/^\/(\w:)/, '$1'))
  } catch (e) { console.warn('PNG icons skipped (no sharp):', e.message) }
  console.log(plateSVG())
}

export { rose, iconSVG, plateSVG }
