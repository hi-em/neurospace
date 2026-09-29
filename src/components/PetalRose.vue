<template>
  <figure class="rose" @mouseleave="tip = null; hover = null">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="ariaLabel">
      <defs>
        <radialGradient v-for="p in petals" :id="`${uid}-${p.i}`" :key="p.key" gradientUnits="userSpaceOnUse" :cx="cx" :cy="cy" :r="R">
          <stop offset="0" :stop-color="p.hex" stop-opacity=".28" />
          <stop offset=".55" :stop-color="p.hex" stop-opacity=".7" />
          <stop offset="1" :stop-color="p.hex" stop-opacity=".95" />
        </radialGradient>
      </defs>

      <!-- grid: area-true quarter rings, dotted, and the full-score ring -->
      <circle v-for="q in [0.25, 0.5, 0.75]" :key="q" :cx="cx" :cy="cy" :r="rad(q)" class="grid" />
      <circle :cx="cx" :cy="cy" :r="R" class="grid outer" />

      <g v-for="p in petals" :key="p.key" class="petal-g" :class="{ dim: hover && hover !== p.key }"
        @mouseenter="hover = p.key" @mousemove="move($event, p.tip)">
        <path :d="p.hit" class="hit" />
        <path :d="p.v" :fill="`url(#${uid}-${p.i})`" :stroke="p.hex" class="petal" />
        <!-- the control: the same leaf at the control's size, dashed -->
        <path v-if="p.c" :d="p.c" class="ctrl" />
        <g v-if="labels" :transform="`translate(${p.lx},${p.ly})`">
          <g :transform="`translate(-7,${-20})`" :style="{ color: p.hex }" v-html="p.icon"></g>
          <text y="4" text-anchor="middle" class="lab">{{ p.label }}</text>
          <text y="16" text-anchor="middle" class="val"><tspan class="vv">{{ p.pts }}</tspan>/{{ p.max }}</text>
        </g>
      </g>

      <circle :cx="cx" :cy="cy" :r="r0" class="hub" />
      <text :x="cx" :y="cy + 5.5" text-anchor="middle" class="mid">{{ center }}</text>
    </svg>
    <figcaption v-if="legend && showControl" class="legend"><i class="lv"></i>variant <i class="lc"></i>control</figcaption>
    <Teleport to="body">
      <div v-if="tip" class="ns-tip" :class="{ flip: tip.flip }" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
    </Teleport>
  </figure>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getParameterContributions, contributionMaxima as MAX } from '../utils/neuroScore.js'
import { DIMS } from '../utils/lab.js'
import { svg } from '../utils/icons.js'

// Area-true rose of leaves: a petal's area, not its length, is proportional to
// the points earned (length ∝ √share). The control is the same leaf, dashed.
const props = defineProps({
  variant: { type: Object, required: true },
  control: { type: Object, default: null },
  center: { type: [String, Number], default: '' },
  labels: { type: Boolean, default: true },
  legend: { type: Boolean, default: true },
  size: { type: Number, default: 280 },
})
const uid = 'rose' + Math.random().toString(36).slice(2, 8)
const W = computed(() => props.size), H = computed(() => props.size * (props.labels ? 1.06 : 1))
const cx = computed(() => W.value / 2), cy = computed(() => H.value / 2 + (props.labels ? 2 : 0))
const R = computed(() => W.value * (props.labels ? 0.31 : 0.46)), r0 = computed(() => W.value * 0.065)
const rad = s => r0.value + (R.value - r0.value) * Math.sqrt(Math.max(0, s))
const showControl = computed(() => !!props.control)
const tip = ref(null)
const hover = ref(null)
const n = DIMS.length
const pt = (a, r) => [cx.value + r * Math.sin(a), cy.value - r * Math.cos(a)]

// Colours as literal hex, read once from the tokens, so the PDF export (which
// rasterises the SVG on its own) draws them too.
const hexes = ref({})
onMounted(() => {
  const cs = getComputedStyle(document.documentElement)
  hexes.value = Object.fromEntries(DIMS.map(d => [d.key, cs.getPropertyValue(d.token).trim() || '#888']))
})

// A leaf from the hub out to radius r along angle a: two cubic curves, widest
// at about 45% of its length, with a rounded tip.
function leaf(a, r, half) {
  const len = r - r0.value, b = r0.value + 2
  const f = (k, w) => pt(a + w, b + len * k)
  const [x0, y0] = pt(a, b), [tx, ty] = pt(a, r)
  const [c1x, c1y] = f(0.3, -half), [c2x, c2y] = f(0.95, -half * 0.62)
  const [d1x, d1y] = f(0.95, half * 0.62), [d2x, d2y] = f(0.3, half)
  return `M${x0},${y0}C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}C${d1x},${d1y} ${d2x},${d2y} ${x0},${y0}Z`
}
function wedge(a0, a1, r) {
  const [x0, y0] = pt(a0, r0.value), [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r), [x3, y3] = pt(a1, r0.value)
  return `M${x0},${y0}L${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}L${x3},${y3}Z`
}

const petals = computed(() => {
  const v = getParameterContributions(props.variant), c = props.control ? getParameterContributions(props.control) : null
  const half = Math.PI / n * 1.12
  return DIMS.map((d, i) => {
    const a = (i + 0.5) / n * 2 * Math.PI
    const [lx, ly] = pt(a, R.value + W.value * 0.1)
    return {
      i, key: d.key, label: d.label, hex: hexes.value[d.key] || '#888', pts: v[d.key], max: MAX[d.key],
      v: leaf(a, rad(v[d.key] / MAX[d.key]), half),
      hit: wedge(a - Math.PI / n, a + Math.PI / n, R.value),
      c: c ? leaf(a, rad(c[d.key] / MAX[d.key]), half) : '',
      lx, ly, icon: svg(d.icon, 14),
      tip: `${d.label}: variant ${v[d.key]}/${MAX[d.key]}` + (c ? ` · control ${c[d.key]}/${MAX[d.key]}` : ''),
    }
  })
})
const ariaLabel = computed(() => 'Score by dimension: ' + petals.value.map(p => `${p.label} ${p.pts} of ${p.max}`).join(', '))

// The tip lives on the page, not in the card, so no scroll box can cut it; near
// the right edge it opens to the left of the pointer.
function move(e, text) {
  const flip = e.clientX > window.innerWidth - 260
  tip.value = { x: e.clientX + (flip ? -14 : 14), y: e.clientY + 14, text, flip }
}
</script>

<style scoped>
.rose { position: relative; margin: 0; }
svg { width: 100%; height: auto; display: block; overflow: visible; }
.grid { fill: none; stroke: var(--ns-line-strong); stroke-width: 1; stroke-dasharray: 1 3; stroke-linecap: round; }
.grid.outer { stroke: var(--ns-line); stroke-dasharray: none; }
.hit { fill: transparent; }
.petal { stroke-width: 1.25; stroke-opacity: .9; transition: opacity var(--ns-fast), transform var(--ns-slow) var(--ns-ease); }
.petal-g.dim .petal { opacity: .3; }
.ctrl { fill: none; stroke: var(--ns-ink); stroke-width: 1.25; stroke-dasharray: 3 3; stroke-linecap: round; opacity: .75; pointer-events: none; }
.hub { fill: var(--ns-surface); stroke: var(--ns-line-strong); }
.mid { font: 700 16px var(--ns-sans); fill: var(--ns-ink); letter-spacing: -.02em; }
.lab { font: 500 9px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; fill: var(--ns-ink-2); }
.val { font: 10px var(--ns-mono); fill: var(--ns-mute); }
.vv { font-weight: 700; fill: var(--ns-ink); }
.legend { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 2px; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ns-mute); }
.legend i { display: inline-block; }
.lv { width: 8px; height: 12px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: linear-gradient(var(--ns-d-ceiling), var(--ns-d-form)); }
.lc { width: 16px; height: 0; border-top: 1.5px dashed var(--ns-ink); margin-left: 8px; }
</style>

<style>
/* page-level tooltip shared by the charts */
.ns-tip { position: fixed; z-index: 100; pointer-events: none; max-width: 240px; background: var(--ns-ink); color: #fff; font: 10.5px/1.4 var(--ns-mono); padding: 6px 9px; border-radius: 6px; box-shadow: var(--ns-e2); }
.ns-tip.flip { transform: translateX(-100%); }
</style>
