<template>
  <div class="mx" :class="mode" @mouseleave="tip = null">
    <!-- weights: the score as one layer, inputs × weights → dimensions → score -->
    <table v-if="mode === 'weights'">
      <thead>
        <tr>
          <th></th><th class="hd">input</th>
          <th v-for="d in dims" :key="d.key" class="hd ic" :title="d.label"><span :style="{ color: d.hex }" v-html="d.icon"></span><em>{{ d.label }}</em></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in paramRows" :key="p.k">
          <th class="rh"><span :style="{ color: p.hex }" v-html="p.icon"></span>{{ p.label }}</th>
          <td><span class="cell in" :style="cell('#111111', p.x)" @mousemove="move($event, `${p.label}: ${p.value}, ${Math.round(p.x * 100)}% of its range`)">{{ p.x.toFixed(2) }}</span></td>
          <td v-for="d in dims" :key="d.key">
            <span v-if="p.dim === d.key" class="cell" :style="cell(d.hex, p.w)" @mousemove="move($event, `${p.label} → ${d.label}: up to ${p.share} of 100 points`)">{{ p.w.toFixed(2) }}</span>
            <span v-else class="cell nil">·</span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th class="rh">earned</th><td class="sc"><b :style="{ color: tone(total) }">{{ total }}</b><small>/100</small></td>
          <td v-for="d in dims" :key="d.key"><span class="cell" :style="cell(d.hex, d.earned)" @mousemove="move($event, `${d.label}: ${d.pts} of ${d.max} points`)">{{ d.earned.toFixed(2) }}</span></td>
        </tr>
      </tfoot>
    </table>

    <!-- experiments: one row per room, each dimension as the share of its points earned -->
    <table v-else>
      <thead>
        <tr>
          <th></th>
          <th v-for="d in dims" :key="d.key" class="hd ic" :title="d.label"><span :style="{ color: d.hex }" v-html="d.icon"></span><em>{{ d.label }}</em></th>
          <th class="hd">score</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.name">
          <th class="rh"><img v-if="r.img" :src="r.img" alt="" /><span v-else class="noimg"></span><span class="nm">{{ r.name }}<small v-if="r.note">{{ r.note }}</small></span></th>
          <td v-for="d in dims" :key="d.key">
            <span class="cell" :style="cell(d.hex, r.v[d.key])" @mousemove="move($event, `${r.name} · ${d.label}: ${r.pts[d.key]} of ${d.max} points`)">
              <i v-if="r.cmp && r.v[d.key] !== r.cmp[d.key]" class="dot" :class="r.v[d.key] > r.cmp[d.key] ? 'up' : 'dn'"></i>{{ r.v[d.key].toFixed(2) }}
            </span>
          </td>
          <td class="sc"><b :style="{ color: tone(r.score) }">{{ r.score }}</b></td>
        </tr>
      </tbody>
    </table>
    <p class="key">{{ mode === 'weights'
      ? 'Each row is a slider, normalised to 0–1; each weight is the most it can add, over the largest weight (22 points). Each slider feeds one dimension: the model is transparent, not learned.'
      : 'Each cell is the share of that dimension’s points the room earns. A dot marks a change from the control: green up, red down.' }}</p>
    <Teleport to="body">
      <div v-if="tip" class="ns-tip" :class="{ flip: tip.flip }" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { calculateNeuroScore, getParameterContributions, contributionMaxima as MAX } from '../utils/neuroScore.js'
import { DIMS, PARAMS, PARAM_KEYS, PARAM_SHARE, fmt } from '../utils/lab.js'
import { svg } from '../utils/icons.js'

const props = defineProps({
  mode: { type: String, default: 'experiments' },   // 'experiments' | 'weights'
  params: { type: Object, default: null },           // weights: the room the inputs are read from
  rooms: { type: Array, default: () => [] },         // experiments: [{ name, note, img, params }], the first is the reference
})

// literal colours from the tokens, so the PDF export draws them
const hexes = ref({})
onMounted(() => {
  const cs = getComputedStyle(document.documentElement)
  hexes.value = Object.fromEntries(DIMS.map(d => [d.key, cs.getPropertyValue(d.token).trim() || '#888']))
})
const dims = computed(() => {
  const earned = props.params ? getParameterContributions(props.params) : {}
  return DIMS.map(d => ({ ...d, hex: hexes.value[d.key] || '#888', icon: svg(d.icon, 16), max: MAX[d.key], pts: earned[d.key] ?? 0, earned: (earned[d.key] ?? 0) / MAX[d.key] }))
})
const hexOf = k => hexes.value[k] || '#888'
const total = computed(() => props.params ? calculateNeuroScore(props.params) : 0)
const maxShare = Math.max(...Object.values(PARAM_SHARE))
const paramRows = computed(() => PARAM_KEYS.map(k => {
  const p = PARAMS[k], v = props.params?.[k] ?? p.min
  return { k, label: p.label, icon: svg(p.icon, 14), hex: hexOf(p.dim), dim: p.dim, value: fmt(k, v).trim(),
    x: (v - p.min) / (p.max - p.min), w: PARAM_SHARE[k] / maxShare, share: PARAM_SHARE[k] }
}))
const rows = computed(() => {
  const ref0 = props.rooms[0] ? norm(props.rooms[0].params) : null
  return props.rooms.map((r, i) => {
    const pts = getParameterContributions(r.params)
    return { ...r, pts, v: norm(r.params), score: calculateNeuroScore(r.params), cmp: i > 0 ? ref0 : null }
  })
})
function norm(params) { const c = getParameterContributions(params); return Object.fromEntries(DIMS.map(d => [d.key, c[d.key] / MAX[d.key]])) }

// A cell is its colour at a strength set by the value; strong cells take white text.
function cell(hex, v) {
  const a = Math.round((0.08 + 0.84 * Math.max(0, Math.min(1, v))) * 255).toString(16).padStart(2, '0')
  return { background: hex + a, color: v > 0.55 ? '#fff' : 'var(--ns-ink-2)' }
}
const tone = s => s <= 30 ? 'var(--ns-red)' : s <= 55 ? 'var(--ns-d-light)' : 'var(--ns-green)'

const tip = ref(null)
function move(e, text) { const flip = e.clientX > window.innerWidth - 260; tip.value = { x: e.clientX + (flip ? -14 : 14), y: e.clientY + 14, text, flip } }
</script>

<style scoped>
.mx { width: 100%; }
table { width: 100%; border-collapse: separate; border-spacing: 4px; font: 11px var(--ns-mono); }
th { font-weight: 400; }
.hd { font: 500 9px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-mute); text-align: center; padding-bottom: 2px; vertical-align: bottom; }
.ic span { display: block; line-height: 0; }
.ic em { display: block; font-style: normal; margin-top: 3px; }
.rh { text-align: left; white-space: nowrap; font: 12px var(--ns-sans); color: var(--ns-ink); padding-right: 6px; }
.rh > span:first-child:not(.nm):not(.noimg) { display: inline-block; vertical-align: -3px; margin-right: 6px; line-height: 0; }
.rh img, .noimg { width: 44px; height: 33px; border-radius: 7px; object-fit: cover; background: var(--ns-paper); vertical-align: middle; margin-right: 8px; display: inline-block; }
.nm { display: inline-flex; flex-direction: column; vertical-align: middle; }
.nm small { font: 10px var(--ns-mono); color: var(--ns-mute); max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
td { padding: 0; }
.cell { position: relative; display: grid; place-items: center; height: 34px; min-width: 46px; border-radius: 8px; font-weight: 600; transition: transform var(--ns-fast) var(--ns-ease); }
.cell:hover { transform: scale(1.06); }
.cell.nil { background: transparent; color: var(--ns-line-strong); font-weight: 400; }
.cell.in { font-weight: 500; }
.dot { position: absolute; top: 5px; left: 6px; width: 5px; height: 5px; border-radius: 50%; }
.dot.up { background: var(--ns-green); } .dot.dn { background: var(--ns-red); }
.sc { text-align: right; padding-left: 6px; white-space: nowrap; }
.sc b { font: 700 14px var(--ns-mono); }
.sc small { color: var(--ns-mute); }
tfoot .rh { font: 500 9px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-mute); }
tfoot td { border-top: 0; }
.key { margin: 8px 4px 0; font-size: 11px; line-height: 1.5; color: var(--ns-mute); }
</style>
