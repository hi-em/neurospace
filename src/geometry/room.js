/**
 * NeuroSpace room geometry: the six sliders in, three.js BufferGeometry out.
 *
 * Rebuilt in code from the rules in utils/neuroScore.js, not ported from the
 * Grasshopper definition (assets/neuro-space.gh is binary; nothing here claims
 * to reproduce it). Each slider drives one legible operation:
 *
 *   Height          wall height; biomorphic form may vault the ceiling up, never down
 *   Wall Count      facets of the plan polygon, at constant floor area
 *   Wall Curvature  corner fillet radius: sharp polygon at 0.70, soft lobes at 0.95
 *   Biomorphic      low harmonics grow toward the ~40% optimum; above ~55% a
 *                   high-frequency ripple comes in, the "coherence loss" rule
 *   Opening Count   openings spaced evenly, the first one facing the sun
 *   Opening Size    window-to-wall ratio: glazed area is Size % of the wall
 *
 * The mesh is a fixed grid, so every slider state has the same topology and a
 * morph between two states is a position update, never a rebuild.
 */
import * as THREE from 'three'

// World units per metre. The scene furniture (plants, walk eye height, the
// city context) was sized in these units for the v1 room, so the new room
// uses the same scale rather than resizing everything around it.
export const UNITS_PER_M = 3

const AREA_R = 6     // every plan has the floor area of a 6 m radius circle
const NS = 240       // columns around the plan
const NY = 36        // rows up the wall
const NR = 14        // rings across floor and ceiling
const TAU = Math.PI * 2

const clamp01 = x => Math.min(1, Math.max(0, x))
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const wrap = a => ((a % TAU) + TAU) % TAU

// Same normalisation as neuroScore.js:_normParams, so the room and the score
// read the same number off each slider.
export function roomParams(sliders) {
  return {
    walls:    sliders['Wall Count'] ?? 4,
    curve:    clamp01(((sliders['Wall Curvature'] ?? 0.8) - 0.7) / 0.25),
    height:   sliders['Height'] ?? 5,
    bio:      clamp01((sliders['Biophilic Organic Form'] ?? 0) / 100),
    openings: sliders['Opening Count'] ?? 3,
    size:     sliders['Opening Size'] ?? 15,
  }
}

// Signed distance to a regular n-gon of circumradius r (after Inigo Quilez).
function sdPolygon(x, z, r, n) {
  const an = Math.PI / n
  const bn = wrap(Math.atan2(x, z)) % (2 * an) - an
  const len = Math.hypot(x, z)
  const px = len * Math.cos(bn) - r * Math.cos(an)
  let py = len * Math.abs(Math.sin(bn)) - r * Math.sin(an)
  py += Math.min(Math.max(-py, 0), r * Math.sin(an))
  return Math.hypot(px, py) * Math.sign(px)
}

// Distance from the centre to the wall along angle theta, for an integer wall
// count: an n-gon with equal floor area whose corners are filleted by `curve`.
function filletedRadius(theta, n, curve) {
  const an = Math.PI / n
  const inR = AREA_R * Math.sqrt(Math.PI / (n * Math.tan(an)))
  const rho = curve * 0.8 * inR
  const circR = (inR - rho) / Math.cos(an)
  const dx = Math.cos(theta), dz = Math.sin(theta)
  let lo = 0, hi = 2 * AREA_R + inR
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (sdPolygon(dx * mid, dz * mid, circR, n) - rho > 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

// Plan radius in metres. A fractional wall count (mid-morph) blends the two
// neighbouring polygons; faces are turned so one of them faces the sun.
export function planRadius(theta, p, sunAngle = 0) {
  const t = theta - sunAngle + Math.PI / 2
  const n0 = Math.floor(p.walls), f = p.walls - n0
  const r0 = filletedRadius(t, n0, p.curve)
  return f < 1e-4 ? r0 : r0 + (filletedRadius(t, n0 + 1, p.curve) - r0) * f
}

// Biomorphic offset as a fraction of the radius, at angle theta and height v (0..1).
export function bioOffset(theta, v, bio) {
  const lo = smooth(0, 0.4, bio)    // grows to the optimum, then holds
  const hi = smooth(0.55, 1, bio)   // past it, detail the eye cannot resolve as one form
  return lo * (0.09 * Math.cos(2 * theta + 0.6 + 1.4 * v)
             + 0.06 * Math.cos(3 * theta - 1.1 - 0.9 * v)
             + 0.07 * Math.sin(Math.PI * v))
       + hi * (0.035 * Math.cos(7 * theta + 9 * v)
             + 0.025 * Math.cos(11 * theta - 14 * v)
             + 0.018 * Math.cos(17 * theta + 2 + 21 * v))
}

// Openings as angular intervals plus a shared sill and head, in metres.
export function openingLayout(p, sunAngle = 0) {
  const H = p.height
  const sill = Math.min(0.9, 0.2 * H)
  const head = H - Math.max(0.3, 0.15 * H)
  const fv = (head - sill) / H
  const k = Math.max(1, p.openings)
  const count = Math.ceil(k - 1e-6)
  const part = k - Math.floor(k)
  // Glazed area / wall area = Size %, split across the openings.
  const per = Math.min((p.size / 100) / (fv * k), 0.8 / k) * TAU
  const list = []
  for (let i = 0; i < count; i++) {
    const w = per * (i === count - 1 && part > 1e-4 ? part : 1)
    const c = sunAngle + (i * TAU) / k
    list.push({ from: c - w / 2, width: w })
  }
  return { sill, head, list }
}

function inOpening(theta, list) {
  for (const o of list) if (wrap(theta - o.from) < o.width) return true
  return false
}

// ── Buffers ──────────────────────────────────────────────────────────────────

// Wall faces point into the room and the floor faces up; `flip` turns the
// ceiling to face down, so from above it is culled and the room stays open.
function gridIndex(cols, rows, flip = false) {
  const idx = new Uint32Array(cols * rows * 6)
  let k = 0
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1
      if (flip) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d }
      else      { idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c }
    }
  }
  return idx
}

function gridGeometry(cols, rows, flip = false) {
  const g = new THREE.BufferGeometry()
  const n = (cols + 1) * (rows + 1)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  g.setIndex(new THREE.BufferAttribute(gridIndex(cols, rows, flip), 1).setUsage(THREE.DynamicDrawUsage))
  return g
}

/** Allocates the room's geometries once; writeRoom fills them. */
export function createRoom() {
  return {
    walls:   gridGeometry(NS, NY),
    floor:   gridGeometry(NS, NR),
    ceiling: gridGeometry(NS, NR, true),
    fullIndex: gridIndex(NS, NY),
    theta: new Float32Array(NS + 1),
    rows:  new Float32Array(NY + 1),
    wallR: new Float32Array(NS + 1),
    bounds: { radius: AREA_R, height: 5 },
  }
}

/** Writes parameter state `p` (from roomParams, possibly mid-morph) into the room. */
export function writeRoom(room, p, sunAngle = 0) {
  const U = UNITS_PER_M
  const H = p.height
  const layout = openingLayout(p, sunAngle)
  const { theta, rows, wallR } = room

  // Columns: uniform around the plan, then the nearest column snaps onto
  // each opening edge so the openings come out as clean rectangles.
  const step = TAU / NS
  for (let j = 0; j <= NS; j++) theta[j] = sunAngle + Math.PI + j * step
  for (const o of layout.list) {
    for (const e of [o.from, o.from + o.width]) {
      const d = wrap(e - theta[0])
      const j = Math.round(d / step)
      if (j > 0 && j < NS) theta[j] = theta[0] + d
    }
  }
  // Rows: uniform up the wall, with sill and head snapped the same way.
  for (let i = 0; i <= NY; i++) rows[i] = (i / NY) * H
  let iS = Math.min(NY - 2, Math.max(1, Math.round((layout.sill / H) * NY)))
  let iH = Math.min(NY - 1, Math.max(iS + 1, Math.round((layout.head / H) * NY)))
  rows[iS] = layout.sill
  rows[iH] = layout.head

  for (let j = 0; j <= NS; j++) wallR[j] = planRadius(theta[j], p, sunAngle)

  // Walls
  const wp = room.walls.attributes.position.array
  const wuv = room.walls.attributes.uv.array
  let maxR = 0
  for (let i = 0; i <= NY; i++) {
    const v = rows[i] / H
    for (let j = 0; j <= NS; j++) {
      const r = wallR[j] * (1 + bioOffset(theta[j], v, p.bio))
      if (r > maxR) maxR = r
      const k = i * (NS + 1) + j
      wp[k * 3]     = r * Math.cos(theta[j]) * U
      wp[k * 3 + 1] = rows[i] * U
      wp[k * 3 + 2] = r * Math.sin(theta[j]) * U
      wuv[k * 2] = j / NS
      wuv[k * 2 + 1] = v
    }
  }
  const idx = room.walls.index.array
  idx.set(room.fullIndex)
  for (let i = iS; i < iH; i++) {
    for (let j = 0; j < NS; j++) {
      if (!inOpening((theta[j] + theta[j + 1]) / 2, layout.list)) continue
      const q = (i * NS + j) * 6
      idx.fill(0, q, q + 6)
    }
  }

  // Floor (flat) and ceiling (vaulted by biomorphic form, never below Height).
  const lo = smooth(0, 0.4, p.bio), hi = smooth(0.55, 1, p.bio)
  const fp = room.floor.attributes.position.array
  const cp = room.ceiling.attributes.position.array
  const fuv = room.floor.attributes.uv.array
  let maxY = H
  for (let i = 0; i <= NR; i++) {
    const q = i / NR
    for (let j = 0; j <= NS; j++) {
      const k = i * (NS + 1) + j
      const c = Math.cos(theta[j]), s = Math.sin(theta[j])
      const rb = wallR[j] * (1 + bioOffset(theta[j], 0, p.bio)) * q
      fp[k * 3] = rb * c * U; fp[k * 3 + 1] = 0; fp[k * 3 + 2] = rb * s * U
      fuv[k * 2] = rb * c / 4; fuv[k * 2 + 1] = rb * s / 4
      const rt = wallR[j] * (1 + bioOffset(theta[j], 1, p.bio)) * q
      const dome = (1 - q * q) * (lo * 0.22 + hi * 0.05 * Math.sin(5 * theta[j] + 7 * q))
      const y = H * (1 + dome)
      if (y > maxY) maxY = y
      cp[k * 3] = rt * c * U; cp[k * 3 + 1] = y * U; cp[k * 3 + 2] = rt * s * U
    }
  }

  for (const g of [room.walls, room.floor, room.ceiling]) {
    g.attributes.position.needsUpdate = true
    g.computeVertexNormals()
    g.computeBoundingBox()
    g.computeBoundingSphere()
  }
  room.walls.attributes.uv.needsUpdate = true
  room.floor.attributes.uv.needsUpdate = true
  room.walls.index.needsUpdate = true
  room.bounds.radius = maxR * U
  room.bounds.height = maxY * U
  return room
}

/** One call, parameters to geometry: a fresh room for a slider state. */
export function buildRoom(sliders, sunAngle = 0) {
  return writeRoom(createRoom(), roomParams(sliders), sunAngle)
}
