<template>
  <figure class="rose" @mouseleave="tip = null">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="ariaLabel">
      <!-- grid: area-true quarter rings and the five spokes, hairlines -->
      <circle v-for="q in [0.25, 0.5, 0.75]" :key="q" :cx="cx" :cy="cy" :r="rad(q)" class="grid" />
      <circle :cx="cx" :cy="cy" :r="R" class="grid outer" />
      <line v-for="(s, i) in spokes" :key="'s' + i" :x1="s[0]" :y1="s[1]" :x2="s[2]" :y2="s[3]" class="grid" />

      <g v-for="p in petals" :key="p.key" class="petal-g" :class="{ dim: hover && hover !== p.key }"
        @mouseenter="hover = p.key" @mouseleave="hover = null"
        @mousemove="tip = { x: $event.offsetX, y: $event.offsetY, text: p.tip }">
        <path :d="p.hit" class="hit" />
        <path :d="p.v" :style="{ fill: p.color }" class="petal" />
        <!-- the control: where this dimension stood, a dashed level -->
        <path v-if="p.c" :d="p.c" class="ctrl" />
        <g v-if="labels" :transform="`translate(${p.lx},${p.ly})`">
          <g :transform="`translate(-7,${-20})`" :style="{ color: p.color }" v-html="p.icon"></g>
          <text y="4" text-anchor="middle" class="lab">{{ p.label }}</text>
          <text y="16" text-anchor="middle" class="val"><tspan class="vv">{{ p.pts }}</tspan>/{{ p.max }}</text>
        </g>
      </g>

      <circle :cx="cx" :cy="cy" :r="r0" class="hub" />
      <text :x="cx" :y="cy + 5.5" text-anchor="middle" class="mid">{{ center }}</text>
    </svg>
    <figcaption v-if="legend && showControl" class="legend"><i class="lv"></i>variant <i class="lc"></i>control</figcaption>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 12 + 'px', top: tip.y + 12 + 'px' }">{{ tip.text }}</div>
  </figure>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getParameterContributions, contributionMaxima as MAX } from '../utils/neuroScore.js'
import { DIMS } from '../utils/lab.js'
import { svg } from '../utils/icons.js'

// Area-true petal rose: a petal's area, not its radius, is proportional to the
// points earned (radius ∝ √share). The control is a dashed level on each petal.
const props = defineProps({
  variant: { type: Object, required: true },
  control: { type: Object, default: null },
  center: { type: [String, Number], default: '' },
  labels: { type: Boolean, default: true },
  legend: { type: Boolean, default: true },
  size: { type: Number, default: 280 },
})
const W = computed(() => props.size), H = computed(() => props.size * (props.labels ? 1.06 : 1))
const cx = computed(() => W.value / 2), cy = computed(() => H.value / 2 + (props.labels ? 2 : 0))
const R = computed(() => W.value * (props.labels ? 0.31 : 0.46)), r0 = computed(() => W.value * 0.065)
const rad = s => r0.value + (R.value - r0.value) * Math.sqrt(Math.max(0, s))
const showControl = computed(() => !!props.control)
const tip = ref(null)
const hover = ref(null)
const n = DIMS.length
const pt = (a, r) => [cx.value + r * Math.sin(a), cy.value - r * Math.cos(a)]

function wedge(a0, a1, r) {
  const [x0, y0] = pt(a0, r0.value + 1), [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r), [x3, y3] = pt(a1, r0.value + 1)
  return `M${x0},${y0}L${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}L${x3},${y3}A${r0.value},${r0.value} 0 0 0 ${x0},${y0}Z`
}
function level(a0, a1, r) {
  const [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r)
  return `M${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}`
}

const spokes = computed(() => DIMS.map((_, i) => { const a = (i / n) * 2 * Math.PI, [x1, y1] = pt(a, r0.value), [x2, y2] = pt(a, R.value); return [x1, y1, x2, y2] }))
const petals = computed(() => {
  const v = getParameterContributions(props.variant), c = props.control ? getParameterContributions(props.control) : null
  const gap = 0.035
  return DIMS.map((d, i) => {
    const a0 = (i / n) * 2 * Math.PI + gap, a1 = ((i + 1) / n) * 2 * Math.PI - gap, am = (a0 + a1) / 2
    const [lx, ly] = pt(am, R.value + W.value * 0.1)
    return {
      key: d.key, label: d.label, color: d.color, pts: v[d.key], max: MAX[d.key],
      v: wedge(a0, a1, rad(v[d.key] / MAX[d.key])),
      hit: wedge(a0, a1, R.value),
      c: c ? level(a0 + 0.02, a1 - 0.02, rad(c[d.key] / MAX[d.key])) : '',
      lx, ly, icon: svg(d.icon, 14),
      tip: `${d.label}: variant ${v[d.key]}/${MAX[d.key]}` + (c ? ` · control ${c[d.key]}/${MAX[d.key]}` : ''),
    }
  })
})
const ariaLabel = computed(() => 'Score by dimension: ' + petals.value.map(p => `${p.label} ${p.pts} of ${p.max}`).join(', '))
</script>

<style scoped>
.rose { position: relative; margin: 0; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.grid { fill: none; stroke: var(--ns-line); stroke-width: 1; }
.grid.outer { stroke: var(--ns-line-strong); }
.hit { fill: transparent; }
.petal { stroke: var(--ns-surface); stroke-width: 2; stroke-linejoin: round; transition: opacity var(--ns-fast); }
.petal-g.dim .petal { opacity: .35; }
.ctrl { fill: none; stroke: var(--ns-ink); stroke-width: 1.5; stroke-dasharray: 4 3; stroke-linecap: round; pointer-events: none; }
.hub { fill: var(--ns-surface); stroke: var(--ns-line-strong); }
.mid { font: 700 16px var(--ns-sans); fill: var(--ns-ink); letter-spacing: -.02em; }
.lab { font: 500 9px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; fill: var(--ns-ink-2); }
.val { font: 10px var(--ns-mono); fill: var(--ns-mute); }
.vv { font-weight: 700; fill: var(--ns-ink); }
.legend { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 2px; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ns-mute); }
.legend i { display: inline-block; }
.lv { width: 10px; height: 10px; border-radius: 2px; background: linear-gradient(135deg, var(--ns-d-ceiling), var(--ns-d-form)); }
.lc { width: 16px; height: 0; border-top: 1.5px dashed var(--ns-ink); margin-left: 8px; }
.tip { position: absolute; pointer-events: none; background: var(--ns-ink); color: #fff; font: 10.5px var(--ns-mono); padding: 5px 8px; border-radius: 6px; white-space: nowrap; z-index: 3; }
</style>
