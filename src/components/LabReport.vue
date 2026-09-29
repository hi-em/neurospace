<template>
  <div class="rp">
    <div ref="sheet" class="rp-sheet">
      <header class="rp-head">
        <p class="rp-eyebrow">NeuroSpace · experiment report · {{ date }}</p>
        <div class="rp-score">
          <span class="rp-c">{{ controlScore }}</span>
          <span aria-hidden="true">→</span>
          <span class="rp-v">{{ variantScore }}</span>
          <span class="rp-d" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''">{{ delta > 0 ? '+' : '' }}{{ delta }}</span>
        </div>
        <p class="rp-label">{{ label }} · control → variant</p>
      </header>

      <table class="rp-table">
        <thead><tr><th>Dimension</th><th>Control</th><th>Variant</th><th>What the model reads</th></tr></thead>
        <tbody>
          <tr v-for="d in dims" :key="d.name">
            <td><i :style="{ background: d.color }"></i>{{ d.name }}</td>
            <td class="n">{{ d.c }}/{{ d.max }}</td>
            <td class="n"><b>{{ d.v }}</b>/{{ d.max }}</td>
            <td class="h">{{ d.hypothesis }}</td>
          </tr>
        </tbody>
      </table>

      <section v-if="log.length" class="rp-log">
        <h3>Experiment log</h3>
        <ol>
          <li v-for="(e, i) in log" :key="i">
            <img :src="e.dataUrl" alt="" />
            <div>
              <p class="k">EXP {{ String(i + 1).padStart(2, '0') }} · {{ e.change }}</p>
              <p class="s">{{ e.from }} → {{ e.score }} <em :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</em></p>
            </div>
          </li>
        </ol>
      </section>
      <p v-else class="rp-empty">No experiments logged yet: use Log result in the notebook.</p>

      <section class="rp-params">
        <h3>Variant parameters</h3>
        <p>{{ paramLine }}</p>
      </section>

      <p class="rp-note">An estimate, not a measurement: a transparent weighted sum informed by published research, with public weights (github.com/hi-em/neurospace). No clinical claim.</p>
    </div>
    <button class="rp-pdf" @click="exportPDF" :disabled="busy">{{ busy ? 'Preparing…' : 'Download PDF' }}</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { dimensionMeta, getParameterContributions, contributionMaxima, getScoreLabel } from '../utils/neuroScore.js'

const props = defineProps({
  control: { type: Object, required: true },
  variant: { type: Object, required: true },
  controlScore: { type: Number, required: true },
  variantScore: { type: Number, required: true },
  log: { type: Array, default: () => [] },
})

const COLORS = { 'Ceiling Height': '#3b6fb6', 'Wall Quality': '#d9651f', 'Natural Light': '#7a6bb5', 'Biophilic Form': '#3f8a55', 'Potted Plants': '#8a9a2e' }
const date = new Date().toISOString().slice(0, 10)
const delta = computed(() => props.variantScore - props.controlScore)
const label = computed(() => getScoreLabel(props.variantScore).label)
const dims = computed(() => {
  const c = getParameterContributions(props.control), v = getParameterContributions(props.variant)
  return Object.keys(v).map(name => ({
    name, c: c[name], v: v[name], max: contributionMaxima[name], color: COLORS[name],
    hypothesis: dimensionMeta[name]?.hypothesis(props.variant) ?? '',
  }))
})
const paramLine = computed(() => {
  const v = props.variant
  return `ceiling ${v['Height']} m · curvature ${Number(v['Wall Curvature']).toFixed(2)} · ${v['Wall Count']} walls · `
    + `${v['Opening Count']} openings at ${v['Opening Size']} % window-to-wall · biomorphic ${v['Biophilic Organic Form']} % · ${v['Potted Plants']} plants`
})

const sheet = ref(null)
const busy = ref(false)
async function exportPDF() {
  if (!sheet.value) return
  busy.value = true
  try {
    const canvas = await html2canvas(sheet.value, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const w = 190, h = canvas.height * w / canvas.width, pageH = 277
    const img = canvas.toDataURL('image/jpeg', 0.92)
    let y = 0
    while (y < h) {
      if (y > 0) pdf.addPage()
      pdf.addImage(img, 'JPEG', 10, 10 - y, w, h)
      y += pageH
    }
    pdf.save(`neurospace-report-${props.controlScore}-to-${props.variantScore}.pdf`)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.rp { padding: 20px 26px 30px; }
.rp-sheet { background: #fff; padding: 22px 24px; border: 1px solid #e3ded6; border-radius: 12px; color: #111; font-family: Inter, system-ui, sans-serif; }
.rp-eyebrow { margin: 0; font: 500 10.5px 'Roboto Mono', monospace; letter-spacing: .12em; text-transform: uppercase; color: #C50000; }
.rp-score { display: flex; align-items: baseline; gap: 12px; margin-top: 10px; }
.rp-c { font-size: 28px; color: #8a847c; }
.rp-v { font: 700 52px Inter, system-ui, sans-serif; letter-spacing: -.03em; }
.rp-d { font: 700 16px 'Roboto Mono', monospace; }
.up { color: #2d6a4f; } .dn { color: #C50000; }
.rp-label { margin: 2px 0 18px; font: 11px 'Roboto Mono', monospace; text-transform: uppercase; letter-spacing: .1em; color: #6f6a63; }
.rp-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rp-table th { text-align: left; font: 500 10px 'Roboto Mono', monospace; letter-spacing: .1em; text-transform: uppercase; color: #6f6a63; padding: 6px 8px 6px 0; border-bottom: 1px solid #e3ded6; }
.rp-table td { padding: 9px 8px 9px 0; border-bottom: 1px solid #f0ece6; vertical-align: top; }
.rp-table td i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
.rp-table .n { font-family: 'Roboto Mono', monospace; white-space: nowrap; color: #6f6a63; }
.rp-table .n b { color: #111; }
.rp-table .h { color: #3a3632; line-height: 1.45; }
.rp-log h3, .rp-params h3 { font: 700 13px Inter, system-ui, sans-serif; margin: 22px 0 8px; }
.rp-log ol { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.rp-log li { display: flex; gap: 10px; align-items: center; }
.rp-log img { width: 84px; height: 60px; object-fit: cover; border-radius: 6px; background: #ece7df; }
.rp-log .k { margin: 0; font: 10.5px 'Roboto Mono', monospace; color: #6f6a63; }
.rp-log .s { margin: 2px 0 0; font-weight: 700; }
.rp-log em { font-style: normal; font-family: 'Roboto Mono', monospace; font-size: 12px; }
.rp-empty { margin: 20px 0 0; font-size: 12.5px; color: #6f6a63; }
.rp-params p { margin: 0; font: 12px 'Roboto Mono', monospace; color: #3a3632; line-height: 1.6; }
.rp-note { margin: 22px 0 0; font-size: 11.5px; color: #6f6a63; line-height: 1.5; }
.rp-pdf { margin-top: 14px; border: 0; background: #111; color: #fff; border-radius: 999px; padding: 10px 18px; font: 11px 'Roboto Mono', monospace; cursor: pointer; }
.rp-pdf:focus-visible { outline: 2px solid #C50000; outline-offset: 2px; }
</style>
