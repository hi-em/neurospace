<template>
  <div class="rp">
    <div class="tools">
      <p>{{ pages }} pages · A4 · the renders are made by the same solver as the room</p>
      <button class="pdf" @click="exportPDF" :disabled="busy || !ready"><NsIcon name="export" :size="14" />{{ busy ? 'Preparing…' : 'Download PDF' }}</button>
    </div>

    <!-- 1 · The experiment -->
    <article ref="p1" class="page">
      <header class="ph">
        <span class="mark">Neuro<b>Space</b></span>
        <span>Experiment report · {{ date }}</span>
        <span>1 / {{ pages }}</span>
      </header>
      <p class="eyebrow">{{ question ? 'Question' : 'Free play' }}</p>
      <h1>{{ question?.text ?? 'One room against the control, every parameter free.' }}</h1>
      <div class="result">
        <div class="score">
          <span class="c">{{ controlScore }}</span><span class="arr">→</span><span class="v">{{ variantScore }}</span>
          <span class="d" :class="tone">{{ signed }}</span>
        </div>
        <div class="what">
          <p class="lbl">{{ label }}</p>
          <p class="chg">{{ change }}</p>
        </div>
      </div>
      <figure class="hero">
        <img v-if="img.vIso" :src="img.vIso" alt="The variant room from outside" />
        <span v-else class="ph-img"></span>
        <figcaption>Variant · outside, from the south-south-east · {{ hourLabel }} equinox sun</figcaption>
      </figure>
      <div class="trio">
        <figure><img v-if="img.vIn" :src="img.vIn" alt="Inside the variant" /><span v-else class="ph-img"></span><figcaption>Variant · inside, eye at 1.6 m</figcaption></figure>
        <figure><img v-if="img.vPlan" :src="img.vPlan" alt="The variant from above" /><span v-else class="ph-img"></span><figcaption>Variant · roof plan, north up</figcaption></figure>
        <figure><img v-if="img.cIso" :src="img.cIso" alt="The control room from outside" /><span v-else class="ph-img"></span><figcaption>Control · outside</figcaption></figure>
      </div>
      <p class="note">An estimate, not a measurement: a transparent weighted sum informed by published research, with public weights. No clinical claim.</p>
    </article>

    <!-- 2 · Score and geometry -->
    <article ref="p2" class="page">
      <header class="ph">
        <span class="mark">Neuro<b>Space</b></span>
        <span>Score and geometry</span>
        <span>2 / {{ pages }}</span>
      </header>
      <section class="two">
        <PetalRose :variant="variant" :control="control" :center="variantScore" :size="300" />
        <ul class="dims">
          <li v-for="d in dims" :key="d.key">
            <span class="dn-name"><NsIcon :name="d.icon" :size="14" :color="d.color" />{{ d.label }}
              <b>{{ d.v }}<small>/{{ d.max }}</small></b><em :class="d.v - d.c > 0 ? 'up' : d.v - d.c < 0 ? 'dn' : ''">{{ d.v - d.c > 0 ? '+' : '' }}{{ d.v - d.c || '' }}</em></span>
            <span class="bar"><i :style="{ width: (d.v / d.max) * 100 + '%', background: d.color }"></i><s :style="{ left: (d.c / d.max) * 100 + '%' }"></s></span>
            <span class="hyp">{{ d.hypothesis }}</span>
          </li>
        </ul>
      </section>

      <h2>Geometry</h2>
      <table class="specs">
        <thead><tr><th></th><th>Control</th><th>Variant</th><th>Δ</th></tr></thead>
        <tbody>
          <tr v-for="r in specRows" :key="r.k"><td>{{ r.k }}</td><td>{{ r.c }}</td><td><b>{{ r.v }}</b></td><td :class="r.tone">{{ r.d }}</td></tr>
        </tbody>
      </table>
      <p class="fine">Measured on the solved film: volume by the divergence theorem, headroom as the share of floor with at least 2.1 m of film above it. Floor area is held equal for every plan. Solver: {{ sv.nodes?.toLocaleString() }} nodes, force density, κ {{ sv.kappa }}, ridge prestress ×{{ sv.ridge?.toFixed(1) }}, inflation {{ Math.round((sv.lift ?? 0) * 100) }}% of its pressure before the crown meets the ring.</p>

      <h2>Parameters</h2>
      <table class="specs params">
        <thead><tr><th></th><th>Control</th><th>Variant</th></tr></thead>
        <tbody>
          <tr v-for="k in PARAM_KEYS" :key="k" :class="{ moved: variant[k] !== control[k] }">
            <td><span class="pn"><NsIcon :name="PARAMS[k].icon" :size="14" :color="dimOf(PARAMS[k].dim).color" />{{ PARAMS[k].label }}</span></td>
            <td>{{ fmt(k, control[k]) }}</td><td><b>{{ fmt(k, variant[k]) }}</b></td>
          </tr>
        </tbody>
      </table>
    </article>

    <!-- 3 · Method -->
    <article ref="p3" class="page">
      <header class="ph">
        <span class="mark">Neuro<b>Space</b></span>
        <span>Method</span>
        <span>3 / {{ pages }}</span>
      </header>
      <section class="method">
        <div>
          <h2>How the score is made</h2>
          <p>Seven sliders feed five dimensions; each dimension has a public ceiling of points, and the score is their sum out of 100. Band width is the most a slider can add; each bar fills with what the variant earns.</p>
          <p>It estimates, it never measures a body, and it makes no clinical claim. The weights are in the repository so they can be argued with.</p>
          <h2>How the room is made</h2>
          <p>One tensioned membrane, form-found with the force density method (Schek, 1974, written for Frei Otto's Munich Olympic roof). Every node of the cable net sits where its neighbours' pulls balance. Without pressure the film is a soap film; with it, a bubble, inflated only until its crown meets the ring.</p>
          <p>The ground edge is a control polygon blended into its cubic B-spline. The arches are superellipses, one per hour on the equinox sun path over Barcelona, their area solved with the gamma function.</p>
        </div>
        <ScoreFlow :params="variant" />
      </section>
      <h2>Sources</h2>
      <p class="fine">Informed by the work of Dr. Cleo Valentine and the studies her review draws on: Valentine (2024, Frontiers review); Valentine et al. (2024, Buildings pilot); Vartanian et al. (2013, 2015); Meyers-Levy &amp; Zhu (2007); Fich et al. (2014); Kim et al. (2021). Plants: Han, Ruan &amp; Liao (2022). v1 ran as a Grasshopper definition on Rhino Compute; this version was rebuilt in code from the rules. github.com/hi-em/neurospace</p>
    </article>

    <!-- 4 · Ledger -->
    <article v-if="log.length" ref="p4" class="page">
      <header class="ph">
        <span class="mark">Neuro<b>Space</b></span>
        <span>Ledger · {{ log.length }} logged</span>
        <span>4 / {{ pages }}</span>
      </header>
      <table class="ledger">
        <thead><tr><th>#</th><th>Room</th><th>Change</th><th>Score</th><th>Δ</th><th>Moved</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in log" :key="i">
            <td class="n">{{ String(i + 1).padStart(2, '0') }}</td>
            <td><img :src="e.dataUrl" alt="" /></td>
            <td class="chg">{{ e.change }}</td>
            <td class="n">{{ e.from }} → <b>{{ e.score }}</b></td>
            <td><svg width="96" height="12" aria-hidden="true"><line x1="48" y1="0" x2="48" y2="12" class="axis" />
              <rect :x="e.delta >= 0 ? 48 : 48 + e.delta * 1.9" y="2" :width="Math.abs(e.delta) * 1.9" height="8" rx="2" :class="e.delta >= 0 ? 'barup' : 'bardn'" /></svg>
              <span class="n" :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</span></td>
            <td><span v-for="d in e.moved" :key="d.key" class="moved"><i :style="{ background: d.color }"></i>{{ d.label }}</span></td>
          </tr>
        </tbody>
      </table>
    </article>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import NsIcon from './NsIcon.vue'
import PetalRose from './PetalRose.vue'
import ScoreFlow from './ScoreFlow.vue'
import { dimensionMeta, getParameterContributions, contributionMaxima, getScoreLabel } from '../utils/neuroScore.js'
import { DIMS, PARAMS, PARAM_KEYS, dimOf, fmt, describeChange } from '../utils/lab.js'
import { renderThumb, specsFor } from '../geometry/thumbs.js'

const props = defineProps({
  control: { type: Object, required: true },
  variant: { type: Object, required: true },
  controlScore: Number,
  variantScore: Number,
  log: { type: Array, default: () => [] },
  question: { type: Object, default: null },
  hour: { type: Number, default: 15 },
  color: { type: String, default: '#f4f0e8' },
})
const date = new Date().toISOString().slice(0, 10)
const pages = computed(() => props.log.length ? 4 : 3)
const delta = computed(() => props.variantScore - props.controlScore)
const signed = computed(() => (delta.value > 0 ? '+' : '') + delta.value)
const tone = computed(() => delta.value > 0 ? 'up' : delta.value < 0 ? 'dn' : '')
const label = computed(() => getScoreLabel(props.variantScore).label)
const change = computed(() => describeChange(props.control, props.variant))
const hourLabel = computed(() => `${Math.floor(props.hour)}:${String(Math.round((props.hour % 1) * 60) % 60).padStart(2, '0')}`)
const dims = computed(() => {
  const v = getParameterContributions(props.variant), c = getParameterContributions(props.control)
  return DIMS.map(d => ({ ...d, v: v[d.key], c: c[d.key], max: contributionMaxima[d.key], hypothesis: dimensionMeta[d.key]?.hypothesis(props.variant) ?? '' }))
})

// ── Renders and numbers: made after the drawer opens, one view per idle slot ──
const img = reactive({ vIso: '', vIn: '', vPlan: '', cIso: '' })
const specs = reactive({ c: null, v: null })
const ready = computed(() => !!(img.vIso && img.vIn && img.vPlan && img.cIso && specs.v))
let job = 0, timer = 0
function build() {
  const my = ++job
  const v = { ...props.variant }, c = { ...props.control }, o = { color: props.color, hour: props.hour }
  const steps = [
    () => { img.vIso = renderThumb(v, { ...o, w: 720, h: 430, view: 'iso' }) },
    () => { specs.v = specsFor(v) },
    () => { img.vIn = renderThumb(v, { ...o, w: 400, h: 320, view: 'inside' }) },
    () => { img.vPlan = renderThumb(v, { ...o, w: 400, h: 320, view: 'plan' }) },
    () => { img.cIso = renderThumb(c, { ...o, w: 400, h: 320, view: 'iso' }) },
    () => { specs.c = specsFor(c) },
  ]
  const next = () => { if (my !== job) return; const s = steps.shift(); if (!s) return; s(); (window.requestIdleCallback || setTimeout)(next) }
  next()
}
onMounted(build)
watch(() => [JSON.stringify(props.variant), JSON.stringify(props.control), props.color, Math.round(props.hour * 2)], () => { clearTimeout(timer); timer = setTimeout(build, 350) })
onBeforeUnmount(() => { job++; clearTimeout(timer) })

const sv = computed(() => specs.v ?? {})
const f = (x, dp = 1) => x == null ? '…' : Number(x).toFixed(dp)
const specRows = computed(() => {
  const c = specs.c, v = specs.v
  if (!v) return []
  const row = (k, key, dp, unit, pct = false) => {
    const cv = c?.[key], vv = v[key], m = pct ? 100 : 1
    const d = cv == null ? null : (vv - cv) * m
    return { k, c: cv == null ? '…' : f(cv * m, dp) + unit, v: f(vv * m, dp) + unit,
      d: d == null || Math.abs(d) < Math.pow(10, -dp) / 2 ? '' : (d > 0 ? '+' : '') + f(d, dp), tone: '' }
  }
  return [
    row('Crown (the ring)', 'crown', 1, ' m'),
    row('Mean ceiling height', 'meanHeight', 2, ' m'),
    row('Standing headroom, ≥ 2.1 m', 'headroom', 0, ' % of floor', true),
    row('Floor area', 'floor', 0, ' m²'),
    row('Volume', 'volume', 0, ' m³'),
    row('Envelope (membrane)', 'envelope', 0, ' m²'),
    row('Widest span', 'span', 1, ' m'),
    row('Perimeter', 'perimeter', 1, ' m'),
    { k: 'Openings', c: c ? `${c.arches} × ${f(c.archWidth)} × ${f(c.archHeight)} m` : '…', v: `${v.arches} × ${f(v.archWidth)} × ${f(v.archHeight)} m`, d: '' },
    row('Glazed area', 'glazed', 1, ' m²'),
    row('Oculus diameter', 'oculus', 2, ' m'),
  ]
})

// ── PDF: one A4 page per sheet ────────────────────────────────────────────────
const p1 = ref(null), p2 = ref(null), p3 = ref(null), p4 = ref(null)
const busy = ref(false)
async function exportPDF() {
  busy.value = true
  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const sheets = [p1.value, p2.value, p3.value, p4.value].filter(Boolean)
    for (let i = 0; i < sheets.length; i++) {
      const canvas = await html2canvas(sheets[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const w = 210, h = canvas.height * w / canvas.width
      const s = Math.min(1, 297 / h)
      if (i > 0) pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (210 - w * s) / 2, 0, w * s, h * s)
    }
    pdf.save(`neurospace-report-${props.controlScore}-to-${props.variantScore}.pdf`)
  } finally { busy.value = false }
}
</script>

<style scoped>
.rp { padding: var(--ns-s5); display: flex; flex-direction: column; align-items: center; gap: var(--ns-s5); }
.tools { width: 794px; max-width: 100%; display: flex; justify-content: space-between; align-items: center; gap: var(--ns-s3); }
.tools p { margin: 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); }
.pdf { display: inline-flex; gap: 6px; align-items: center; height: 34px; border: 0; background: var(--ns-ink); color: #fff; border-radius: var(--ns-r-pill); padding: 0 18px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; flex: none; }
.pdf:disabled { opacity: .5; cursor: default; }
.pdf:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }

/* A4 at 96 dpi: 794 × 1123 */
.page { width: 794px; max-width: 100%; min-height: 1123px; box-sizing: border-box; background: #fff; padding: 40px 48px; box-shadow: var(--ns-e2); display: flex; flex-direction: column; color: var(--ns-ink); }
.ph { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 10px; border-bottom: 1px solid var(--ns-ink); margin-bottom: 28px; font: var(--ns-t-ui) var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ns-ink-2); }
.mark { font: 700 14px var(--ns-sans); letter-spacing: -.01em; text-transform: none; color: var(--ns-ink); }
.mark b { color: var(--ns-red); }
.eyebrow { margin: 0 0 6px; font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ns-red); }
h1 { margin: 0 0 18px; font: 700 28px/1.2 var(--ns-sans); letter-spacing: -.02em; max-width: 620px; }
h2 { margin: 26px 0 10px; font: 700 var(--ns-t-title) var(--ns-sans); }
.result { display: flex; align-items: flex-end; gap: 28px; padding: 14px 0 18px; border-top: 1px solid var(--ns-line); }
.score { display: flex; align-items: baseline; gap: 10px; }
.c { font-size: 30px; color: var(--ns-mute); }
.arr { color: var(--ns-mute); font-size: 20px; }
.v { font: 700 var(--ns-t-hero) var(--ns-sans); letter-spacing: -.04em; line-height: .9; }
.d { font: 700 18px var(--ns-mono); }
.up { color: var(--ns-green); } .dn { color: var(--ns-red); }
.what { padding-bottom: 6px; }
.lbl { margin: 0; font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ns-ink); }
.chg { margin: 4px 0 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-ink-2); }
figure { margin: 0; }
figcaption { margin-top: 6px; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .06em; color: var(--ns-mute); }
.hero img, .hero .ph-img { width: 100%; aspect-ratio: 720 / 430; display: block; border-radius: 6px; background: var(--ns-paper); object-fit: cover; }
.trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
.trio img, .trio .ph-img { width: 100%; aspect-ratio: 400 / 320; display: block; border-radius: 6px; background: var(--ns-paper); object-fit: cover; }
.ph-img { background: linear-gradient(90deg, var(--ns-paper), var(--ns-sunk), var(--ns-paper)) !important; background-size: 200% 100% !important; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
.note { margin: auto 0 0; padding-top: 18px; border-top: 1px solid var(--ns-line); font-size: 11px; color: var(--ns-mute); line-height: 1.5; }

.two { display: grid; grid-template-columns: 300px 1fr; gap: 28px; align-items: center; }
.dims { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.dn-name { display: flex; align-items: center; gap: 6px; font-size: var(--ns-t-body); font-weight: 600; }
.dn-name b { margin-left: auto; font: 700 12px var(--ns-mono); }
.dn-name small { font-weight: 400; color: var(--ns-mute); }
.dn-name em { font: normal 700 11px var(--ns-mono); min-width: 26px; text-align: right; }
.bar { position: relative; display: block; height: 4px; background: var(--ns-line); border-radius: 2px; margin: 6px 0 4px; }
.bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
.bar s { position: absolute; top: -3px; width: 2px; height: 10px; background: var(--ns-ink); transform: translateX(-1px); }
.hyp { display: block; font-size: 12px; color: var(--ns-ink-2); line-height: 1.45; }

.specs { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.specs th { text-align: right; font: 500 9.5px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-mute); padding: 4px 0 6px 10px; border-bottom: 1px solid var(--ns-ink); }
.specs th:first-child { text-align: left; padding-left: 0; }
.specs td { padding: 6px 0 6px 10px; border-bottom: 1px solid var(--ns-line); text-align: right; font-family: var(--ns-mono); font-size: 12px; white-space: nowrap; }
.specs td:first-child { text-align: left; padding-left: 0; font-family: var(--ns-sans); font-size: 12.5px; }
.specs tr.moved td { background: #fbf8f2; }
.pn { display: inline-flex; gap: 6px; align-items: center; }
.fine { margin: 10px 0 0; font-size: 11px; line-height: 1.55; color: var(--ns-mute); }

.method { display: grid; grid-template-columns: 1fr 300px; gap: 28px; align-items: start; }
.method h2:first-child { margin-top: 0; }
.method p { font-size: 13px; line-height: 1.6; color: var(--ns-ink-2); margin: 0 0 10px; }

.ledger { width: 100%; border-collapse: collapse; font-size: 12px; }
.ledger th { text-align: left; font: 500 9.5px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-mute); padding: 4px 8px 6px 0; border-bottom: 1px solid var(--ns-ink); }
.ledger td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--ns-line); vertical-align: middle; }
.ledger img { width: 72px; height: 54px; object-fit: cover; border-radius: 6px; background: var(--ns-paper); display: block; }
.ledger .n { font-family: var(--ns-mono); white-space: nowrap; }
.ledger .chg { font: 11px var(--ns-mono); color: var(--ns-ink-2); }
.axis { stroke: var(--ns-line-strong); }
.barup { fill: var(--ns-green); } .bardn { fill: var(--ns-red); }
.moved { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; font-size: 11.5px; white-space: nowrap; }
.moved i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
@media (prefers-reduced-motion: reduce) { .ph-img { animation: none; } }
</style>
