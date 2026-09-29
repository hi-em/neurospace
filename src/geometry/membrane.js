/**
 * NeuroSpace room: one tensioned membrane, form-found in the browser.
 *
 * Rebuilt in code from the rules in utils/neuroScore.js, not ported from the
 * v1 Grasshopper definition. The method is the force density method (Schek
 * 1974, written for Frei Otto's Munich Olympic roof): every free node of a
 * cable net sits where the pulls of its neighbours balance,
 *     Σ q_ij (x_j − x_i) + p·n_i = 0,
 * solved here by Gauss–Seidel. With no pressure the net is a discrete minimal
 * surface (a soap film, mean curvature 0, saddle-shaped); with hoop and radial
 * prestress in the ratio κ² an axisymmetric film is a catenoid,
 * r(t) = A·cosh(κt) + B·sinh(κt). A follower pressure p along the normal
 * inflates it toward a bubble (constant mean curvature).
 *
 *   Height                  height of the compression ring the film hangs from
 *   Wall Count + Curvature  the ground edge is a control polygon blended into its
 *                           cubic B-spline; a ridge cable runs up from each
 *                           corner. Low curvature: taut ridges, no pressure, a
 *                           faceted saddle tent. High curvature: even prestress
 *                           and pressure, a soft bubble, inflated only until its
 *                           crown meets the ring: the ring is always the top
 *   Opening Count + Size    Lamé (superellipse) arches where the edge lifts off
 *                           the ground, placed on the sun's azimuth for one hour
 *                           each (equinox, Barcelona); arch area, solved with the
 *                           gamma function, is Size % of the perimeter's 2.4 m band
 *   Biomorphic              up to ~40%: the edge warps, the ring leans and tilts;
 *                           past ~55%: regular pleats, 34 around, the high-
 *                           contrast repetition the visual-stress research flags
 *
 * The net is a fixed grid, so every slider state has the same topology: a morph
 * is a warm-started re-solve, never a rebuild.
 */
import * as THREE from 'three'

export const UNITS_PER_M = 3             // the scene furniture (plants, walk eye, context) is in these units
export const LATITUDE = 41.39            // Barcelona, IAAC
const TAU = Math.PI * 2
const AREA_R = 6                         // every plan has the floor area of a 6 m radius circle
const NS = 256, NT = 48, NSAMP = 720
export const NET_EVERY = 8               // draw every 8th cable of the solver's net

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const clamp01 = x => clamp(x, 0, 1)
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

// Same normalisation as neuroScore.js:_normParams: the room and the score read one number.
export function roomParams(s) {
  return {
    walls: s['Wall Count'] ?? 4,
    curve: clamp01(((s['Wall Curvature'] ?? 0.8) - 0.7) / 0.25),
    height: s['Height'] ?? 5,
    bio: clamp01((s['Biophilic Organic Form'] ?? 0) / 100),
    openings: s['Opening Count'] ?? 3,
    size: s['Opening Size'] ?? 15,
  }
}

// ── The sun at the equinox (declination 0) ───────────────────────────────────
export function sunAt(hour, lat = LATITUDE) {
  const phi = lat * Math.PI / 180, h = (hour - 12) * 15 * Math.PI / 180
  return {
    alt: Math.asin(Math.cos(phi) * Math.cos(h)),
    az: Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi)) + Math.PI,   // from north, clockwise
  }
}
/** Unit vector toward the sun in scene space (north = −z, east = +x). */
export function sunVector(hour, lat = LATITUDE, out = new THREE.Vector3()) {
  const { az, alt } = sunAt(hour, lat)
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt))
}
const azToTheta = az => Math.atan2(-Math.cos(az), Math.sin(az))
const SOUTH = azToTheta(Math.PI)

// ── Plan: control polygon ↔ cubic B-spline limit curve ─────────────────────
function newSamples() { return { xs: new Float64Array(NSAMP), zs: new Float64Array(NSAMP), th: new Float64Array(NSAMP), r: new Float64Array(NSAMP) } }
function planSamples(n, t, out) {
  const V = []
  for (let i = 0; i < n; i++) { const a = SOUTH + Math.PI / n + (i * TAU) / n; V.push([Math.cos(a), Math.sin(a)]) }
  const { xs, zs } = out
  for (let k = 0; k < NSAMP; k++) {
    const u = (k / NSAMP) * n, i = Math.floor(u), f = u - i
    const P0 = V[(i - 1 + n) % n], P1 = V[i % n], P2 = V[(i + 1) % n], P3 = V[(i + 2) % n]
    const b0 = (1 - f) ** 3 / 6, b1 = (3 * f ** 3 - 6 * f * f + 4) / 6, b2 = (-3 * f ** 3 + 3 * f * f + 3 * f + 1) / 6, b3 = f ** 3 / 6
    const sx = b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * P3[0], sz = b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * P3[1]
    const lx = P1[0] + (P2[0] - P1[0]) * f, lz = P1[1] + (P2[1] - P1[1]) * f
    xs[k] = lx + (sx - lx) * t; zs[k] = lz + (sz - lz) * t
  }
  let A = 0
  for (let k = 0; k < NSAMP; k++) { const m = (k + 1) % NSAMP; A += xs[k] * zs[m] - xs[m] * zs[k] }
  const s = AREA_R * Math.sqrt(Math.PI / Math.abs(A / 2))
  for (let k = 0; k < NSAMP; k++) { xs[k] *= s; zs[k] *= s; out.th[k] = Math.atan2(zs[k], xs[k]) }
  return out
}
// Columns sit at fixed angles, so each chord of the sampled curve fills the
// columns its angle spans: one sweep, ray ∩ chord, no search.
const COL_COS = new Float64Array(NS), COL_SIN = new Float64Array(NS)
const THETA0 = SOUTH + Math.PI, DTH = TAU / NS
for (let j = 0; j < NS; j++) { COL_COS[j] = Math.cos(THETA0 + j * DTH); COL_SIN[j] = Math.sin(THETA0 + j * DTH) }
const wrap = a => ((a % TAU) + TAU) % TAU
function radiiFromSamples(S, out) {
  for (let k = 0; k < NSAMP; k++) {
    const a = k, b = (k + 1) % NSAMP
    const ta = wrap(S.th[a] - THETA0)
    let tb = wrap(S.th[b] - THETA0)
    if (tb < ta) tb += TAU
    const ax = S.xs[a], az = S.zs[a], ex = S.xs[b] - ax, ez = S.zs[b] - az
    for (let j = Math.ceil(ta / DTH); j * DTH <= tb; j++) {
      const jj = j % NS, dx = COL_COS[jj], dz = COL_SIN[jj]
      out[jj] = (ax * ez - az * ex) / (dx * ez - dz * ex)
    }
  }
  return out
}

// ── Superellipse area 4ab·Γ(1+1/n)²/Γ(1+2/n) (Lanczos gamma) ─────────────────
function gamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  z -= 1
  let x = c[0]
  for (let i = 1; i < 9; i++) x += c[i] / (z + i)
  const t = z + 7.5
  return Math.sqrt(TAU) * t ** (z + 0.5) * Math.exp(-t) * x
}
const lameFactor = n => gamma(1 + 1 / n) ** 2 / gamma(1 + 2 / n)

// ── Buffers ──────────────────────────────────────────────────────────────────
function gridGeometry(cols, rows) {
  const g = new THREE.BufferGeometry(), n = (cols + 1) * (rows + 1)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  const normals = new Float32Array(n * 3)
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1          // floor: up; the membrane is recomputed
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage))
  // ambient occlusion baked from the geometry each write (vertex colour, multiplies the material)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage))
  const idx = new Uint32Array(cols * rows * 6)
  let k = 0
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1
    idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  return g
}

// Normals by central differences on the grid (u around, v up): n = ∂u × ∂v,
// the same orientation as the triangle winding, at a fraction of the cost.
function gridNormals(g, cols, rows) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, W = cols + 1
  for (let i = 0; i <= rows; i++) {
    const iu = Math.min(rows, i + 1), id = Math.max(0, i - 1)
    for (let j = 0; j <= cols; j++) {
      const jr = j === cols ? 1 : j + 1, jl = j === 0 ? cols - 1 : j - 1
      const r = 3 * (i * W + jr), l = 3 * (i * W + jl), u = 3 * (iu * W + j), d = 3 * (id * W + j)
      const ux = P[r] - P[l], uy = P[r + 1] - P[l + 1], uz = P[r + 2] - P[l + 2]
      const vx = P[u] - P[d], vy = P[u + 1] - P[d + 1], vz = P[u + 2] - P[d + 2]
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz) || 1, k = 3 * (i * W + j)
      N[k] = nx / len; N[k + 1] = ny / len; N[k + 2] = nz / len
    }
  }
  g.attributes.normal.needsUpdate = true
}

function netGeometry() {
  // radial cables (every NET_EVERY-th column) and hoop cables (every 4th row), as line segments
  const radial = NS / NET_EVERY, hoops = Math.floor(NT / 4)
  const segs = radial * NT + hoops * NS
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 6), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segs * 6), 3).setUsage(THREE.DynamicDrawUsage))
  return g
}

/** Allocates the room once; writeRoom fills it in place. */
export function createRoom() {
  const N = (NT + 1) * NS
  return {
    membrane: gridGeometry(NS, NT),
    floor: gridGeometry(NS, 10),
    net: netGeometry(),
    edge: new Float32Array((NS + 1) * 3),              // the edge cable, for a tube or a line
    ring: { x: 0, y: 5, z: 0, r: 0.6, tiltX: 0, tiltZ: 0 },
    theta: new Float64Array(NS), R: new Float64Array(NS), R1: new Float64Array(NS), qr: new Float64Array(NS),
    X: new Float64Array(N), Y: new Float64Array(N), Z: new Float64Array(N), Y0: new Float64Array(N), Yp: new Float64Array(N), lift: 1,
    solved: false,
    S0: newSamples(), S1: newSamples(),
    stats: {},
    bounds: { radius: AREA_R * UNITS_PER_M, height: 5 * UNITS_PER_M },
  }
}

/**
 * Writes parameter state `p` (from roomParams, possibly mid-morph) into the room.
 * opts.iters: Gauss–Seidel sweeps when warm (default 30); the first solve runs 300.
 */
export function writeRoom(room, p, opts = {}) {
  const U = UNITS_PER_M, H = Math.max(2, p.height)
  const lo = smooth(0, 0.4, p.bio), hi = smooth(0.55, 1, p.bio)
  const { theta, R, X, Y, Z, qr } = room

  // Plan radius per column, blending neighbouring wall counts mid-morph
  for (let j = 0; j < NS; j++) theta[j] = THETA0 + j * DTH
  const n0 = Math.floor(p.walls), fw = p.walls - n0
  radiiFromSamples(planSamples(n0, p.curve, room.S0), R)
  if (fw > 1e-4) radiiFromSamples(planSamples(n0 + 1, p.curve, room.S1), room.R1)
  for (let j = 0; j < NS; j++) {
    if (fw > 1e-4) R[j] += (room.R1[j] - R[j]) * fw
    R[j] *= 1 + lo * (0.07 * Math.cos(2 * theta[j] + 0.6) + 0.05 * Math.cos(3 * theta[j] - 1.1))
  }

  // Perimeter arc length, so arches are drawn in true metres
  const sCol = new Float64Array(NS + 1)
  for (let j = 1; j <= NS; j++) {
    const a = j - 1, b = j % NS
    sCol[j] = sCol[j - 1] + Math.hypot(R[b] * Math.cos(theta[b]) - R[a] * Math.cos(theta[a]), R[b] * Math.sin(theta[b]) - R[a] * Math.sin(theta[a]))
  }
  const P = sCol[NS]

  // Openings: Lamé arches on the sun path, spread off south only when they cannot fit
  const k = Math.max(1, Math.round(p.openings))
  const nExp = 12 - 9.8 * p.curve, G = lameFactor(nExp)
  const target = (p.size / 100) * P * 2.4
  // Each arch's area A = 2·a·h·G(n); solve a and h together at a portal proportion
  // h ≈ 1.2 × width, capped by the room's height.
  const A1 = target / k
  let aHalf = Math.sqrt(A1 / (4.8 * G))
  const hA = clamp(2.4 * aHalf, 0.9, Math.min(3.6, 0.6 * H))
  aHalf = A1 / (2 * hA * G)
  const hours = Array.from({ length: k }, (_, i) => 8 + 9 * (i + 0.5) / k)
  const sOf = th => { const u = ((((th - theta[0]) % TAU) + TAU) % TAU) / TAU * NS, j = Math.floor(u); return sCol[j] + (sCol[j + 1] - sCol[j]) * (u - j) }
  let spread = 1, cs = []
  for (let pass = 0; pass < 8; pass++) {
    cs = hours.map(t => { const d = azToTheta(sunAt(t).az) - SOUTH; return sOf(SOUTH + spread * Math.atan2(Math.sin(d), Math.cos(d))) })
    const gaps = cs.length > 1 ? cs.slice(1).map((c, i) => Math.abs(c - cs[i])) : [P]
    const minGap = Math.min(...gaps, P - Math.abs(cs[cs.length - 1] - cs[0]))
    if (2.5 * aHalf <= minGap || spread >= 2.6) { aHalf = Math.min(aHalf, minGap / 2.5); break }
    spread = Math.min(2.6, spread * 1.2)
  }
  const edgeY = new Float64Array(NS)
  for (let j = 0; j < NS; j++) {
    let y = 0
    for (const c of cs) {
      const ds = Math.abs(((((sCol[j] - c + P / 2) % P) + P) % P) - P / 2)
      if (ds < aHalf) y = Math.max(y, hA * Math.pow(1 - Math.pow(ds / aHalf, nExp), 1 / nExp))
    }
    edgeY[j] = y
  }
  room.edgeY = edgeY
  const glazed = k * 2 * aHalf * hA * G

  // Prestress: a ridge cable from each plan corner; hoop/radial ratio κ²; pressure
  const n = Math.round(p.walls)
  const K = 1 + 11 * (1 - p.curve), sigma = (TAU / NS) * (1.2 + 4 * p.curve)
  for (let j = 0; j < NS; j++) {
    let d = 1e9
    for (let i = 0; i < n; i++) { const c = SOUTH + Math.PI / n + (i * TAU) / n; d = Math.min(d, Math.abs(Math.atan2(Math.sin(theta[j] - c), Math.cos(theta[j] - c)))) }
    qr[j] = 1 + (K - 1) * Math.exp(-((d / sigma) ** 2))
  }
  const kappa = 0.9
  const dt = 1 / NT, dth = TAU / NS
  const qh = kappa * kappa * (dt / dth) ** 2
  const pressure = 0.013 * smooth(0.15, 1, p.curve) * (44 / NT) ** 2   // sag ∝ p·NT², so p scales with the grid

  // Boundaries: the ground edge with its arches, and the compression ring
  const r0 = 0.45 + 0.035 * H
  const ring = room.ring
  ring.x = -lo * 0.9; ring.z = lo * 0.6; ring.y = H; ring.r = r0
  ring.tiltX = lo * 0.16; ring.tiltZ = -lo * 0.1           // the oculus leans as the form turns organic
  const ringY = th => H + r0 * (Math.cos(th) * ring.tiltZ + Math.sin(th) * ring.tiltX)
  const idx = (i, j) => i * NS + j
  if (!room.solved) {
    for (let i = 0; i <= NT; i++) {
      const t = i * dt
      for (let j = 0; j < NS; j++) {
        const rr = (R[j] * Math.sinh(kappa * (1 - t)) + r0 * Math.sinh(kappa * t)) / Math.sinh(kappa)
        X[idx(i, j)] = rr * Math.cos(theta[j]) + ring.x * t
        Z[idx(i, j)] = rr * Math.sin(theta[j]) + ring.z * t
        Y[idx(i, j)] = edgeY[j] * (1 - t) + H * t
      }
    }
  }
  for (let j = 0; j < NS; j++) {
    X[idx(0, j)] = R[j] * Math.cos(theta[j]); Z[idx(0, j)] = R[j] * Math.sin(theta[j]); Y[idx(0, j)] = edgeY[j]
    X[idx(NT, j)] = r0 * Math.cos(theta[j]) + ring.x; Z[idx(NT, j)] = r0 * Math.sin(theta[j]) + ring.z; Y[idx(NT, j)] = ringY(theta[j])
  }

  // Over-relaxed Gauss–Seidel on Σ q_ij (x_j − x_i) + p·n̂_i = 0.
  // The force densities are fixed, so height is linear in its loads: it is
  // solved as two fields, Y0 (the boundaries, no pressure: a soap film) and Yp
  // (the pressure's lift, zero boundaries). The film is then Y = Y0 + s·Yp with
  // the largest s ≤ 1 that keeps every node at or below the ring: the bubble
  // inflates until its crown meets the ring, never past it into a crater.
  const { Y0, Yp } = room
  if (!room.solved) for (let c = 0; c < Y.length; c++) { Y0[c] = Y[c]; Yp[c] = 0 }
  for (let j = 0; j < NS; j++) { Y0[idx(0, j)] = Y[idx(0, j)]; Y0[idx(NT, j)] = Y[idx(NT, j)]; Yp[idx(0, j)] = Yp[idx(NT, j)] = 0 }
  const iters = room.solved ? (opts.iters ?? 10) : 260
  const omega = 1.4
  // one pressure for the whole film: the walls bow out by the same share of it
  // that lifts the crown to the ring, so the film never mushrooms past its hem
  if (!room.solved) room.lift = 0.5
  for (let it = 0; it < iters; it++) {
    const sp = room.lift
    for (let i = 1; i < NT; i++) for (let j = 0; j < NS; j++) {
      const a = idx(i - 1, j), b = idx(i + 1, j), l = idx(i, (j - 1 + NS) % NS), r = idx(i, (j + 1) % NS), c = idx(i, j)
      const w = qr[j], den = 2 * w + 2 * qh
      let nx = 0, ny = 0, nz = 0
      if (pressure > 0) {
        const ux = X[b] - X[a], uy = Y[b] - Y[a], uz = Z[b] - Z[a], vx = X[r] - X[l], vy = Y[r] - Y[l], vz = Z[r] - Z[l]
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx
        const nl = Math.hypot(nx, ny, nz) || 1
        nx *= pressure / nl; ny *= pressure / nl; nz *= pressure / nl   // fixed-magnitude follower load: stable
      }
      X[c] += omega * ((w * (X[a] + X[b]) + qh * (X[l] + X[r]) + sp * nx) / den - X[c])
      Z[c] += omega * ((w * (Z[a] + Z[b]) + qh * (Z[l] + Z[r]) + sp * nz) / den - Z[c])
      Y0[c] += omega * ((w * (Y0[a] + Y0[b]) + qh * (Y0[l] + Y0[r])) / den - Y0[c])
      Yp[c] += omega * ((w * (Yp[a] + Yp[b]) + qh * (Yp[l] + Yp[r]) + ny) / den - Yp[c])
    }
    if (it === iters - 1 || (!room.solved && it % 20 === 19)) liftToRing()
  }
  function liftToRing() {
    // max_c(Y0 + s·Yp) is convex in s: bisect for the largest s that keeps it ≤ H
    const f = s => { let m = -1e9; for (let i = 1; i < NT; i++) for (let j = 0; j < NS; j++) { const c = idx(i, j); m = Math.max(m, Y0[c] + s * Yp[c]) } return m }
    let s = 1
    if (f(1) > H) { let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (f(mid) > H) hi = mid; else lo = mid } s = lo }
    room.lift = s
    for (let i = 1; i < NT; i++) for (let j = 0; j < NS; j++) { const c = idx(i, j); Y[c] = Y0[c] + s * Yp[c] }
  }
  room.solved = true

  // Membrane vertices (pleats along the normal past ~55% biomorphic)
  const mp = room.membrane.attributes.position.array, muv = room.membrane.attributes.uv.array, mc = room.membrane.attributes.color.array
  let maxR = 0, maxY = H
  for (let i = 0; i <= NT; i++) {
    const t = i * dt, pleat = hi * 0.2 * Math.sin(Math.PI * t)
    for (let jj = 0; jj <= NS; jj++) {
      const j = jj % NS, c = idx(i, j)
      let x = X[c], y = Y[c], z = Z[c]
      if (pleat > 0) {
        const a = idx(Math.max(0, i - 1), j), b = idx(Math.min(NT, i + 1), j), l = idx(i, (j - 1 + NS) % NS), r = idx(i, (j + 1) % NS)
        const ux = X[b] - X[a], uy = Y[b] - Y[a], uz = Z[b] - Z[a], vx = X[r] - X[l], vy = Y[r] - Y[l], vz = Z[r] - Z[l]
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        const d = pleat * Math.cos(34 * theta[j]) / (Math.hypot(nx, ny, nz) || 1)
        x += nx * d; y += ny * d; z += nz * d
      }
      if (i > 0) y = Math.max(y, 0.03)                          // the film never dips through the floor
      maxR = Math.max(maxR, Math.hypot(x, z)); maxY = Math.max(maxY, y)
      const v = i * (NS + 1) + jj
      mp[3 * v] = x * U; mp[3 * v + 1] = y * U; mp[3 * v + 2] = z * U
      const ao = 0.72 + 0.28 * smooth(0, 1.4, y)            // contact shadow where the film meets the ground
      mc[3 * v] = mc[3 * v + 1] = mc[3 * v + 2] = ao
      muv[2 * v] = (jj / NS) * (P / 2); muv[2 * v + 1] = t * (H / 2)
    }
  }
  // Edge cable
  for (let jj = 0; jj <= NS; jj++) {
    const v = jj
    room.edge[3 * jj] = mp[3 * v]; room.edge[3 * jj + 1] = mp[3 * v + 1]; room.edge[3 * jj + 2] = mp[3 * v + 2]
  }
  // Floor, with uvs in metres for a timber texture
  const fp = room.floor.attributes.position.array, fuv = room.floor.attributes.uv.array, fc = room.floor.attributes.color.array
  for (let i = 0; i <= 10; i++) for (let jj = 0; jj <= NS; jj++) {
    const j = jj % NS, q = i / 10, v = i * (NS + 1) + jj
    const x = R[j] * Math.cos(theta[j]) * q, z = R[j] * Math.sin(theta[j]) * q
    fp[3 * v] = x * U; fp[3 * v + 1] = 0; fp[3 * v + 2] = z * U
    fuv[2 * v] = x; fuv[2 * v + 1] = z
    const ao = 1 - 0.34 * smooth(0.72, 1, q) * (1 - smooth(0.15, 1.2, edgeY[j]))   // open under the arches
    fc[3 * v] = fc[3 * v + 1] = fc[3 * v + 2] = ao
  }
  // The net the solver works on: radial cables shaded by their force density
  const np = room.net.attributes.position.array, nc = room.net.attributes.color.array
  let s = 0
  const put = (va, vb, shade) => {
    for (const v of [va, vb]) { np[s] = mp[3 * v]; np[s + 1] = mp[3 * v + 1]; np[s + 2] = mp[3 * v + 2]; nc[s] = nc[s + 1] = nc[s + 2] = shade; s += 3 }
  }
  for (let jj = 0; jj < NS; jj += NET_EVERY) {
    const shade = clamp01((qr[jj] - 1) / 11)
    for (let i = 0; i < NT; i++) put(i * (NS + 1) + jj, (i + 1) * (NS + 1) + jj, shade)
  }
  for (let i = 4; i <= NT; i += 4) for (let jj = 0; jj < NS; jj++) put(i * (NS + 1) + jj, i * (NS + 1) + jj + 1, 0)

  gridNormals(room.membrane, NS, NT)
  for (const g of [room.membrane, room.floor]) {
    g.attributes.position.needsUpdate = true
    g.attributes.uv.needsUpdate = true
    g.attributes.color.needsUpdate = true
    g.computeBoundingBox(); g.computeBoundingSphere()
  }
  room.net.attributes.position.needsUpdate = true
  room.net.attributes.color.needsUpdate = true
  room.net.computeBoundingSphere()
  room.bounds.radius = maxR * U
  room.bounds.height = maxY * U
  // arch centres as columns, for the plan's labels
  const archCols = cs.map(c => { const cc = ((c % P) + P) % P; let j = 0; while (j < NS - 1 && sCol[j + 1] <= cc) j++; return j })
  room.stats = { wwr: glazed / (P * 2.4), targetWwr: p.size / 100, kappa, pressure, lift: room.lift, ridge: K, hours, archHeight: hA, arches: k,
    archWidth: 2 * aHalf, glazed, perimeter: P, archCols, nExp }
  return room
}

/**
 * The numbers an architect would ask for, measured on the solved film (metres).
 * Volume by the divergence theorem over the film's triangles, plus the column
 * under the oculus; headroom as the share of the floor with 2.1 m above it.
 */
export function roomSpecs(room) {
  const U = UNITS_PER_M, P = room.membrane.attributes.position.array, I = room.membrane.index.array
  let area = 0, vol = 0
  for (let k = 0; k < I.length; k += 3) {
    const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2]
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    area += Math.hypot(nx, ny, nz) / 2
    vol += (ny / 2) * (P[a + 1] + P[b + 1] + P[c + 1]) / 3            // plan area × mean height, signed
  }
  area /= U * U
  const r = room.ring
  vol = Math.abs(vol) / (U * U * U) + Math.PI * r.r * r.r * r.y
  const F = room.floor.attributes.position.array, W = NS + 1, o = 10 * W
  let floor = 0, span = 0
  for (let j = 0; j < NS; j++) {
    const a = 3 * (o + j), b = 3 * (o + j + 1)
    floor += (F[a] * F[b + 2] - F[b] * F[a + 2]) / 2
    span = Math.max(span, Math.hypot(F[a], F[a + 2]))
  }
  floor = Math.abs(floor) / (U * U)
  // headroom: highest film over each 0.25 m plan cell
  const cell = new Map(), B = 0.25
  for (let v = 0; v < P.length / 3; v++) {
    const k = Math.round(P[3 * v] / U / B) * 4096 + Math.round(P[3 * v + 2] / U / B)
    const y = P[3 * v + 1] / U
    if (!(cell.get(k) >= y)) cell.set(k, y)
  }
  let ok = 0
  for (const y of cell.values()) if (y >= 2.1) ok++
  const st = room.stats
  return {
    crown: r.y, oculus: 2 * r.r, floor, envelope: area, volume: vol, meanHeight: vol / floor,
    span: 2 * span / U, perimeter: st.perimeter, headroom: ok / cell.size,
    arches: st.arches, archHeight: st.archHeight, archWidth: st.archWidth, glazed: st.glazed, wwr: st.wwr,
    nodes: NS * (NT + 1), ridge: st.ridge, kappa: st.kappa, lift: st.lift, pressure: st.pressure,
  }
}

/** Plan radius of the ground edge (metres) at an angle in the xz plane. */
export function planRadiusAt(room, angle) {
  const u = wrap(angle - THETA0) / DTH, j = Math.floor(u) % NS, f = u - Math.floor(u)
  return room.R[j] + (room.R[(j + 1) % NS] - room.R[j]) * f
}

/**
 * The plan section: where the film crosses a horizontal cut, column by column,
 * in scene units. A column whose hem is above the cut is an opening: null.
 */
export function sectionAt(room, cutM, out = []) {
  const U = UNITS_PER_M, P = room.membrane.attributes.position.array, W = NS + 1, cut = cutM * U
  out.length = 0
  for (let jj = 0; jj <= NS; jj++) {
    let pt = null
    if (P[3 * jj + 1] <= cut) {
      for (let i = 0; i < NT; i++) {
        const a = 3 * (i * W + jj), b = 3 * ((i + 1) * W + jj), ya = P[a + 1], yb = P[b + 1]
        if (ya <= cut && yb > cut) { const f = (cut - ya) / (yb - ya); pt = [P[a] + (P[b] - P[a]) * f, P[a + 2] + (P[b + 2] - P[a + 2]) * f]; break }
      }
    }
    out.push(pt)
  }
  return out
}
