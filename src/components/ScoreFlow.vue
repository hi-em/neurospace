<template>
  <div class="flow" @mouseleave="tip = null">
    <svg viewBox="0 0 320 330" role="img" aria-label="How the score is made: seven sliders flow into five dimensions and one score">
      <path v-for="b in bands" :key="b.key" :d="b.d" :style="{ fill: b.color }" fill-opacity=".3"
        @mousemove="tip = { x: $event.offsetX, y: $event.offsetY, text: b.tip }" />
      <g v-for="b in bands" :key="'i' + b.key" :transform="`translate(20,${b.iy})`" :style="{ color: 'var(--ns-ink)' }" v-html="b.icon"></g>
      <g v-for="d in dims" :key="d.key">
        <rect x="186" :y="d.y" width="10" :height="d.h" class="track" />
        <rect x="186" :y="d.y + d.h * (1 - d.earned)" width="10" :height="d.h * d.earned" :style="{ fill: d.color }"
          @mousemove="tip = { x: $event.offsetX, y: $event.offsetY, text: d.tip }" />
        <path :d="d.out" :style="{ fill: d.color }" fill-opacity=".16" />
        <text x="202" :y="d.y + d.h / 2 + 3">{{ d.label }}</text>
      </g>
      <rect x="284" y="90" width="14" height="110" rx="3" class="score" />
      <text x="291" y="216" text-anchor="middle" class="num">{{ total }}</text>
    </svg>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 12 + 'px', top: tip.y + 12 + 'px' }">{{ tip.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { calculateNeuroScore, getParameterContributions, contributionMaxima as MAX } from '../utils/neuroScore.js'
import { DIMS, PARAMS } from '../utils/lab.js'
import { svg } from '../utils/icons.js'

// Band width = the most a slider can add (its share of its dimension's
// weight); the dimension bar fills with what the room has earned.
const props = defineProps({ params: { type: Object, required: true } })
const SHARE = { 'Height': 22, 'Wall Curvature': 15, 'Wall Count': 10, 'Potted Plants': 13, 'Opening Count': 8.8, 'Opening Size': 13.2, 'Biophilic Organic Form': 18 }
const tip = ref(null)
const k = 1.9
const total = computed(() => calculateNeuroScore(props.params))

const layout = computed(() => {
  const earned = getParameterContributions(props.params)
  let yd = 14
  const dims = DIMS.map(d => { const h = MAX[d.key] * k, o = { ...d, y: yd, h, fill: yd, earned: earned[d.key] / MAX[d.key], tip: `${d.label}: ${earned[d.key]}/${MAX[d.key]} earned` }; yd += h + 9; return o })
  const byKey = Object.fromEntries(dims.map(d => [d.key, d]))
  let y = 8
  const order = DIMS.flatMap(d => Object.keys(PARAMS).filter(p => PARAMS[p].dim === d.key))
  const bands = order.map(p => {
    const w = SHARE[p] * k, d = byKey[PARAMS[p].dim], y1 = d.fill
    d.fill += w
    const band = {
      key: p, color: d.color, iy: y + w / 2 - 8, icon: svg(PARAMS[p].icon, 16),
      d: `M46 ${y} C 116 ${y}, 116 ${y1}, 186 ${y1} L 186 ${y1 + w} C 116 ${y1 + w}, 116 ${y + w}, 46 ${y + w} Z`,
      tip: `${PARAMS[p].label} → ${d.label}: up to ${SHARE[p]} points`,
    }
    y += w + 5
    return band
  })
  dims.forEach(d => {
    const t0 = 90 + (d.y / yd) * 110, t1 = 90 + ((d.y + d.h) / yd) * 110
    d.out = `M196 ${d.y} C 244 ${d.y}, 244 ${t0}, 284 ${t0} L 284 ${t1} C 244 ${t1}, 244 ${d.y + d.h}, 196 ${d.y + d.h} Z`
  })
  return { dims, bands }
})
const dims = computed(() => layout.value.dims)
const bands = computed(() => layout.value.bands)
</script>

<style scoped>
.flow { position: relative; }
svg { width: 100%; height: auto; display: block; }
svg text { font: 10px var(--ns-mono); fill: var(--ns-ink-2); }
.track { fill: var(--ns-line); }
.score { fill: var(--ns-ink); }
.num { font: 700 13px var(--ns-sans) !important; fill: var(--ns-ink) !important; }
.tip { position: absolute; pointer-events: none; background: var(--ns-ink); color: #fff; font: 10.5px var(--ns-mono); padding: 5px 8px; border-radius: 6px; white-space: nowrap; z-index: 3; }
</style>
