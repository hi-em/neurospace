<template>
  <div class="rose" @mouseleave="tip = null">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="ariaLabel">
      <circle :cx="cx" :cy="cy" :r="R" class="ring" />
      <circle :cx="cx" :cy="cy" :r="rad(0.5)" class="ring half" />
      <g v-for="(p, i) in petals" :key="p.key">
        <path :d="p.v" :style="{ fill: p.color }" fill-opacity=".86" class="petal"
          @mousemove="tip = { x: $event.offsetX, y: $event.offsetY, text: p.tip }" />
        <path v-if="showControl" :d="p.c" class="ctrl" />
        <g v-if="labels" :transform="`translate(${p.lx - 7},${p.ly - 15})`" :style="{ color: 'var(--ns-ink)' }" v-html="p.icon"></g>
        <text v-if="labels" :x="p.lx" :y="p.ly + 9" text-anchor="middle">{{ p.label }} {{ p.pts }}</text>
      </g>
      <text :x="cx" :y="cy + 5" text-anchor="middle" class="mid">{{ center }}</text>
    </svg>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 12 + 'px', top: tip.y + 12 + 'px' }">{{ tip.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getParameterContributions, contributionMaxima as MAX } from '../utils/neuroScore.js'
import { DIMS } from '../utils/lab.js'
import { svg } from '../utils/icons.js'

// Area-true petal rose: a petal's area, not its radius, is proportional to the
// points earned (radius ∝ √share). The control is the dashed outline.
const props = defineProps({
  variant: { type: Object, required: true },
  control: { type: Object, default: null },
  center: { type: [String, Number], default: '' },
  labels: { type: Boolean, default: true },
  size: { type: Number, default: 280 },
})
const W = computed(() => props.size), H = computed(() => props.size)
const cx = computed(() => W.value / 2), cy = computed(() => H.value / 2 + 4)
const R = computed(() => W.value * (props.labels ? 0.33 : 0.46)), r0 = computed(() => W.value * 0.05)
const rad = s => r0.value + (R.value - r0.value) * Math.sqrt(s)
const showControl = computed(() => !!props.control)
const tip = ref(null)

function wedge(a0, a1, r) {
  const p = (a, rr) => [cx.value + rr * Math.sin(a), cy.value - rr * Math.cos(a)]
  const [x0, y0] = p(a0, r0.value), [x1, y1] = p(a0, r), [x2, y2] = p(a1, r), [x3, y3] = p(a1, r0.value)
  return `M${x0},${y0}L${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}L${x3},${y3}A${r0.value},${r0.value} 0 0 0 ${x0},${y0}Z`
}

const petals = computed(() => {
  const v = getParameterContributions(props.variant), c = props.control ? getParameterContributions(props.control) : null
  const n = DIMS.length, gap = 0.05
  return DIMS.map((d, i) => {
    const a0 = (i / n) * 2 * Math.PI + gap, a1 = ((i + 1) / n) * 2 * Math.PI - gap, am = (a0 + a1) / 2
    const lr = R.value + W.value * 0.08
    return {
      key: d.key, label: d.label, color: d.color, pts: v[d.key],
      v: wedge(a0, a1, rad(v[d.key] / MAX[d.key])),
      c: c ? wedge(a0, a1, rad(c[d.key] / MAX[d.key])) : '',
      lx: cx.value + lr * Math.sin(am), ly: cy.value - lr * Math.cos(am),
      icon: svg(d.icon, 14),
      tip: `${d.label}: variant ${v[d.key]}/${MAX[d.key]}` + (c ? ` · control ${c[d.key]}/${MAX[d.key]}` : ''),
    }
  })
})
const ariaLabel = computed(() => 'Score by dimension: ' + petals.value.map(p => `${p.label} ${p.pts}`).join(', '))
</script>

<style scoped>
.rose { position: relative; }
svg { width: 100%; height: auto; display: block; }
svg text { font: 9.5px var(--ns-mono); fill: var(--ns-ink-2); }
.ring { fill: none; stroke: var(--ns-line); }
.half { stroke-dasharray: 2 3; }
.petal { stroke: var(--ns-surface); stroke-width: 2; cursor: default; }
.ctrl { fill: none; stroke: var(--ns-ink); stroke-opacity: .55; stroke-dasharray: 3 2; pointer-events: none; }
.mid { font: 700 15px var(--ns-sans) !important; fill: var(--ns-ink) !important; }
.tip { position: absolute; pointer-events: none; background: var(--ns-ink); color: #fff; font: 10.5px var(--ns-mono); padding: 5px 8px; border-radius: 6px; white-space: nowrap; z-index: 3; }
</style>
