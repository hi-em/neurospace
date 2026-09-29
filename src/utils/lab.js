/**
 * The lab's vocabulary, in one place: parameters, score dimensions (in the
 * palette's validated order), the built-in questions, and the share link.
 */

// Keys are the v1 Grasshopper input names; the score reads the same keys.
export const PARAMS = {
  'Height':                 { label: 'Ceiling height',  short: 'ceiling',    icon: 'ceiling',   min: 2,    max: 15,  step: 0.1,  unit: ' m', dp: 1, dim: 'Ceiling Height' },
  'Wall Curvature':         { label: 'Wall curvature',  short: 'curvature',  icon: 'curvature', min: 0.70, max: 0.95, step: 0.01, unit: '',  dp: 2, dim: 'Wall Quality' },
  'Wall Count':             { label: 'Wall count',      short: 'walls',      icon: 'walls',     min: 3,    max: 8,   step: 1,    unit: '',   dp: 0, dim: 'Wall Quality' },
  'Potted Plants':          { label: 'Plants',          short: 'plants',     icon: 'plants',    min: 0,    max: 5,   step: 1,    unit: '',   dp: 0, dim: 'Potted Plants' },
  'Opening Count':          { label: 'Openings',        short: 'openings',   icon: 'openings',  min: 1,    max: 10,  step: 1,    unit: '',   dp: 0, dim: 'Natural Light' },
  'Opening Size':           { label: 'Window-to-wall',  short: 'window',     icon: 'window',    min: 5,    max: 30,  step: 1,    unit: ' %', dp: 0, dim: 'Natural Light' },
  'Biophilic Organic Form': { label: 'Biomorphic form', short: 'biomorphic', icon: 'form',      min: 0,    max: 100, step: 1,    unit: ' %', dp: 0, dim: 'Biophilic Form' },
}
export const PARAM_KEYS = Object.keys(PARAMS)

// The most each slider can add to the score, in points (its share of its
// dimension's weight). Read by the flow diagram and the weight matrix.
export const PARAM_SHARE = { 'Height': 22, 'Wall Curvature': 15, 'Wall Count': 10, 'Potted Plants': 13, 'Opening Count': 8.8, 'Opening Size': 13.2, 'Biophilic Organic Form': 18 }

// Presentation order is the palette's validated order (see tokens.css).
export const DIMS = [
  { key: 'Ceiling Height', label: 'Ceiling',  color: 'var(--ns-d-ceiling)', token: '--ns-d-ceiling', icon: 'ceiling', region: 'Prefrontal cortex' },
  { key: 'Potted Plants',  label: 'Plants',   color: 'var(--ns-d-plants)',  token: '--ns-d-plants',  icon: 'plants',  region: 'Limbic system' },
  { key: 'Biophilic Form', label: 'Form',     color: 'var(--ns-d-form)',    token: '--ns-d-form',    icon: 'form',    region: 'Temporal lobe' },
  { key: 'Natural Light',  label: 'Daylight', color: 'var(--ns-d-light)',   token: '--ns-d-light',   icon: 'window',  region: 'Visual cortex' },
  { key: 'Wall Quality',   label: 'Walls',    color: 'var(--ns-d-walls)',   token: '--ns-d-walls',   icon: 'walls',   region: 'Parietal lobe' },
]
export const dimOf = key => DIMS.find(d => d.key === key)

// The control: an ordinary room. 2.4 m, four walls, three modest openings.
export const CONTROL = {
  'Height': 2.4, 'Wall Curvature': 0.8, 'Wall Count': 4, 'Potted Plants': 0,
  'Opening Count': 3, 'Opening Size': 15, 'Biophilic Organic Form': 0,
}

// Each question opens on the change its 3D icon shows; you move it from there.
export const QUESTIONS = [
  { id: 'height',   text: 'Does a higher ceiling lower stress potential?', keys: ['Height'],                 start: { 'Height': 6 } },
  { id: 'curve',    text: 'Do curved walls read calmer than corners?',     keys: ['Wall Curvature'],         start: { 'Wall Curvature': 0.95 } },
  { id: 'count',    text: 'How many walls before a room reads as curved?', keys: ['Wall Count'],             start: { 'Wall Count': 8 } },
  { id: 'openings', text: 'Do more openings help?',                        keys: ['Opening Count'],          start: { 'Opening Count': 8 } },
  { id: 'size',     text: 'How much window is enough?',                    keys: ['Opening Size'],           start: { 'Opening Size': 30 } },
  { id: 'bio',      text: 'Is more organic form always better?',           keys: ['Biophilic Organic Form'], start: { 'Biophilic Organic Form': 40 } },
  { id: 'plants',   text: 'What does greenery add?',                       keys: ['Potted Plants'],          start: { 'Potted Plants': 3 } },
]

export function fmt(key, v) {
  const p = PARAMS[key]
  return Number(v).toFixed(p.dp) + p.unit
}

export function describeChange(control, variant) {
  const changed = PARAM_KEYS.filter(k => variant[k] !== control[k])
  return changed.length
    ? changed.map(k => `${PARAMS[k].short} ${fmt(k, control[k]).trim()} → ${fmt(k, variant[k]).trim()}`).join(', ')
    : 'no change'
}

// Share link: the experiment lives in the URL hash, so a link opens it exactly.
export function encodeState(state) {
  const json = JSON.stringify(state)
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function decodeState(hash) {
  try {
    const b = hash.replace(/^#?s=/, '').replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b))))
  } catch { return null }
}

// A question you write has no start of its own; its 3D icon shows the change
// it asks about, each of its parameters pushed three quarters of the way.
export function iconState(q) {
  if (q.start && Object.keys(q.start).length) return q.start
  return Object.fromEntries(q.keys.map(k => {
    const p = PARAMS[k], v = p.min + 0.75 * (p.max - p.min)
    return [k, Math.round(v / p.step) * p.step]
  }))
}
