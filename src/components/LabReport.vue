<template>
  <div class="rp">
    <div ref="sheet" class="sheet">
      <header>
        <p class="eyebrow">NeuroSpace · experiment report · {{ date }}</p>
        <div class="score">
          <span class="c">{{ controlScore }}</span><span aria-hidden="true">→</span><span class="v">{{ variantScore }}</span>
          <span class="d" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''">{{ delta > 0 ? '+' : '' }}{{ delta }}</span>
        </div>
        <p class="lbl">{{ label }} · the variant against the control</p>
      </header>

      <div class="two">
        <PetalRose :variant="variant" :control="control" :center="variantScore" :size="300" />
        <ul class="dims">
          <li v-for="d in dims" :key="d.key">
            <span class="dn-name"><NsIcon :name="d.icon" :size="14" :color="d.color" />{{ d.label }} <b>{{ d.v }}/{{ d.max }}</b></span>
            <span class="hyp">{{ d.hypothesis }}</span>
          </li>
        </ul>
      </div>

      <section>
        <h3>Ledger</h3>
        <table v-if="log.length" class="ledger">
          <thead><tr><th>#</th><th>Change</th><th>Score</th><th>Δ</th><th></th><th>Moved</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in log" :key="i">
              <td class="n">{{ String(i + 1).padStart(2, '0') }}</td>
              <td><span class="chg"><img :src="e.dataUrl" alt="" />{{ e.change }}</span></td>
              <td class="n">{{ e.from }} → <b>{{ e.score }}</b></td>
              <td class="n" :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</td>
              <td><svg width="110" height="12" aria-hidden="true"><line x1="55" y1="0" x2="55" y2="12" class="axis" />
                <rect :x="e.delta >= 0 ? 55 : 55 + e.delta * 2.2" y="2" :width="Math.abs(e.delta) * 2.2" height="8" rx="2" :class="e.delta >= 0 ? 'barup' : 'bardn'" /></svg></td>
              <td><span v-for="d in e.moved" :key="d.key" class="moved"><i :style="{ background: d.color }"></i>{{ d.label }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No experiments logged yet: use Log result on the card.</p>
      </section>

      <p class="note">An estimate, not a measurement: a transparent weighted sum informed by published research, with public weights (github.com/hi-em/neurospace). No clinical claim.</p>
    </div>
    <button class="pdf" @click="exportPDF" :disabled="busy"><NsIcon name="export" :size="14" />{{ busy ? 'Preparing…' : 'Download PDF' }}</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import NsIcon from './NsIcon.vue'
import PetalRose from './PetalRose.vue'
import { dimensionMeta, getParameterContributions, contributionMaxima, getScoreLabel } from '../utils/neuroScore.js'
import { DIMS } from '../utils/lab.js'

const props = defineProps({
  control: { type: Object, required: true },
  variant: { type: Object, required: true },
  controlScore: Number,
  variantScore: Number,
  log: { type: Array, default: () => [] },
})
const date = new Date().toISOString().slice(0, 10)
const delta = computed(() => props.variantScore - props.controlScore)
const label = computed(() => getScoreLabel(props.variantScore).label)
const dims = computed(() => {
  const v = getParameterContributions(props.variant)
  return DIMS.map(d => ({ ...d, v: v[d.key], max: contributionMaxima[d.key], hypothesis: dimensionMeta[d.key]?.hypothesis(props.variant) ?? '' }))
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
    for (let y = 0; y < h; y += pageH) { if (y > 0) pdf.addPage(); pdf.addImage(img, 'JPEG', 10, 10 - y, w, h) }
    pdf.save(`neurospace-report-${props.controlScore}-to-${props.variantScore}.pdf`)
  } finally { busy.value = false }
}
</script>

<style scoped>
.rp { padding: var(--ns-s5); }
.sheet { background: #fff; padding: var(--ns-s5); border: 1px solid var(--ns-line); border-radius: var(--ns-r-card); }
.eyebrow { margin: 0; font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-red); }
.score { display: flex; align-items: baseline; gap: 12px; margin-top: 10px; }
.c { font-size: 28px; color: var(--ns-mute); }
.v { font: 700 52px var(--ns-sans); letter-spacing: -.03em; }
.d { font: 700 16px var(--ns-mono); }
.up { color: var(--ns-green); } .dn { color: var(--ns-red); }
.lbl { margin: 2px 0 var(--ns-s4); font: var(--ns-t-ui) var(--ns-mono); text-transform: uppercase; letter-spacing: .1em; color: var(--ns-mute); }
.two { display: grid; grid-template-columns: 300px 1fr; gap: var(--ns-s5); align-items: center; }
.dims { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ns-s3); }
.dn-name { display: flex; align-items: center; gap: 6px; font-size: var(--ns-t-body); font-weight: 600; }
.dn-name b { margin-left: auto; font: 500 12px var(--ns-mono); color: var(--ns-ink-2); }
.hyp { display: block; font-size: 12.5px; color: var(--ns-ink-2); line-height: var(--ns-lh); margin-top: 2px; }
h3 { font: 700 var(--ns-t-title) var(--ns-sans); margin: var(--ns-s5) 0 var(--ns-s2); }
.ledger { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ledger th { text-align: left; font: 500 9.5px var(--ns-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ns-mute); padding: 4px 8px 6px 0; border-bottom: 1px solid var(--ns-line); }
.ledger td { padding: 7px 8px 7px 0; border-bottom: 1px solid #f0ece6; vertical-align: middle; }
.ledger .n { font-family: var(--ns-mono); white-space: nowrap; }
.chg { display: flex; align-items: center; gap: 8px; }
.chg img { width: 48px; height: 36px; object-fit: cover; border-radius: 6px; background: var(--ns-paper); }
.axis { stroke: var(--ns-line-strong); }
.barup { fill: var(--ns-green); } .bardn { fill: var(--ns-red); }
.moved { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; font-size: 12px; }
.moved i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.empty { color: var(--ns-mute); font-size: 12.5px; }
.note { margin: var(--ns-s5) 0 0; font-size: 11.5px; color: var(--ns-mute); line-height: 1.5; }
.pdf { margin-top: var(--ns-s3); display: inline-flex; gap: 6px; align-items: center; border: 0; background: var(--ns-ink); color: #fff; border-radius: var(--ns-r-pill); padding: 10px 18px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; }
.pdf:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }
</style>
