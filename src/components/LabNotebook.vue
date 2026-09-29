<template>
  <section class="nb" aria-label="Experiment notebook">
    <header class="nb-head">
      <h2>Experiment {{ String(log.length + 1).padStart(2, '0') }}</h2>
      <span>{{ log.length }} logged</span>
    </header>

    <!-- 01 · Question -->
    <div class="nb-step">
      <p class="nb-n">01 · Question</p>
      <label class="nb-sr" for="nb-question">Question</label>
      <select id="nb-question" class="nb-select" :value="questionId" @change="$emit('question', $event.target.value)">
        <option v-for="q in QUESTIONS" :key="q.id" :value="q.id">{{ q.text }}</option>
      </select>
    </div>

    <!-- 02 · Change one thing -->
    <div class="nb-step">
      <p class="nb-n">02 · {{ free ? 'Change anything' : 'Change one thing' }}</p>
      <div v-for="key in shownKeys" :key="key" class="nb-param">
        <div class="nb-row">
          <label :for="'nb-' + key">{{ PARAMS[key].label }}</label>
          <b>{{ fmt(key, variant[key]) }}</b>
        </div>

        <template v-if="key === 'Potted Plants'">
          <div class="nb-plants">
            <button
              v-for="s in PLANT_SIZES" :key="s"
              class="nb-chip"
              draggable="true"
              @dragstart="onDrag($event, s)"
              @click="$emit('set', key, Math.min(5, variant[key] + 1))"
              :aria-label="'Add a ' + s + ' plant'"
            >+ {{ s }}</button>
            <button class="nb-chip" :disabled="!variant[key]" @click="$emit('set', key, variant[key] - 1)" aria-label="Remove a plant">−</button>
          </div>
          <p class="nb-was">tap to place, or drag onto the room · control {{ control[key] }}</p>
        </template>
        <template v-else>
          <input
            :id="'nb-' + key"
            type="range"
            :min="PARAMS[key].min" :max="PARAMS[key].max" :step="PARAMS[key].step"
            :value="variant[key]"
            :style="{ accentColor: PARAMS[key].color }"
            :aria-valuetext="fmt(key, variant[key])"
            @input="$emit('set', key, Number($event.target.value))"
          />
          <p class="nb-was">control {{ fmt(key, control[key]) }}</p>
        </template>

        <details class="nb-note">
          <summary>Research</summary>
          <p>{{ research(key).text }}</p>
          <p class="nb-src">{{ research(key).source }}</p>
        </details>
      </div>
      <button class="nb-more" @click="$emit('free', !free)" :aria-expanded="free">
        {{ free ? 'Hold the others at the control' : `+ ${otherCount} other parameters, held at the control` }}
      </button>
    </div>

    <!-- 03 · Observe -->
    <div class="nb-step">
      <p class="nb-n">03 · Observe</p>
      <div class="nb-obs" aria-live="polite">
        <span class="nb-a">{{ controlScore }}</span>
        <span aria-hidden="true">→</span>
        <span class="nb-b">{{ variantScore }}</span>
        <span class="nb-d" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''">{{ delta > 0 ? '+' : '' }}{{ delta }}</span>
        <span class="nb-label">{{ label.label }}</span>
      </div>
      <ul class="nb-dims">
        <li v-for="d in dims" :key="d.name" :class="{ on: d.touched }">
          <span class="nb-dim-name">{{ d.name }}</span>
          <span class="nb-bar" :aria-label="`${d.name}: control ${d.c}, variant ${d.v} of ${d.max}`">
            <i class="c" :style="{ width: (d.c / d.max * 100) + '%' }"></i>
            <i class="v" :style="{ width: (d.v / d.max * 100) + '%', background: d.color }"></i>
          </span>
          <span class="nb-pts">{{ d.v }}/{{ d.max }}</span>
        </li>
      </ul>
      <p class="nb-hyp">{{ hypothesis }}</p>
    </div>

    <!-- 04 · Log -->
    <div class="nb-step">
      <p class="nb-n">04 · Log</p>
      <div class="nb-actions">
        <button class="nb-btn primary" @click="$emit('log')">Log result</button>
        <button class="nb-btn" @click="$emit('promote')">Make this the control</button>
      </div>
      <ol v-if="log.length" class="nb-log">
        <li v-for="(e, i) in log" :key="i">
          <img :src="e.dataUrl" alt="" />
          <span class="nb-log-k">EXP {{ String(i + 1).padStart(2, '0') }} · {{ e.change }}</span>
          <span class="nb-log-s">{{ e.from }} → {{ e.score }} <em :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</em></span>
        </li>
      </ol>
    </div>

    <p class="nb-frame">
      Dr. Cleo Valentine's note on NeuroSpace set the frame: treat every score as a hypothesis, then watch how it translates.
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { paramInfo, dimensionMeta, getParameterContributions, contributionMaxima, getScoreLabel } from '../utils/neuroScore.js'

const props = defineProps({
  control: { type: Object, required: true },
  variant: { type: Object, required: true },
  controlScore: { type: Number, required: true },
  variantScore: { type: Number, required: true },
  questionId: { type: String, required: true },
  free: { type: Boolean, default: false },
  log: { type: Array, default: () => [] },
})
defineEmits(['question', 'set', 'free', 'log', 'promote'])

// One vocabulary for the whole app: the dimension names the score and the
// report use, and one short label per slider.
const PARAMS = {
  'Height':                 { label: 'Ceiling height',  min: 2,    max: 15,   step: 0.1,  unit: ' m', dp: 1, color: '#3b6fb6', dim: 'Ceiling Height' },
  'Wall Curvature':         { label: 'Wall curvature',  min: 0.70, max: 0.95, step: 0.01, unit: '',   dp: 2, color: '#d9651f', dim: 'Wall Quality' },
  'Wall Count':             { label: 'Wall count',      min: 3,    max: 8,    step: 1,    unit: '',   dp: 0, color: '#d9651f', dim: 'Wall Quality' },
  'Opening Count':          { label: 'Openings',        min: 1,    max: 10,   step: 1,    unit: '',   dp: 0, color: '#7a6bb5', dim: 'Natural Light' },
  'Opening Size':           { label: 'Window-to-wall',  min: 5,    max: 30,   step: 1,    unit: ' %', dp: 0, color: '#7a6bb5', dim: 'Natural Light' },
  'Biophilic Organic Form': { label: 'Biomorphic form', min: 0,    max: 100,  step: 1,    unit: ' %', dp: 0, color: '#3f8a55', dim: 'Biophilic Form' },
  'Potted Plants':          { label: 'Plants',          min: 0,    max: 5,    step: 1,    unit: '',   dp: 0, color: '#8a9a2e', dim: 'Potted Plants' },
}
const DIM_COLORS = { 'Ceiling Height': '#3b6fb6', 'Wall Quality': '#d9651f', 'Natural Light': '#7a6bb5', 'Biophilic Form': '#3f8a55', 'Potted Plants': '#8a9a2e' }
const PLANT_SIZES = ['small', 'medium', 'large']

const QUESTIONS = [
  { id: 'height',   text: 'Does a higher ceiling lower stress potential?', keys: ['Height'] },
  { id: 'curve',    text: 'Do curved walls read calmer than corners?',     keys: ['Wall Curvature'] },
  { id: 'count',    text: 'How many walls before a room reads as curved?', keys: ['Wall Count'] },
  { id: 'openings', text: 'Do more openings help?',                        keys: ['Opening Count'] },
  { id: 'size',     text: 'How much window is enough?',                    keys: ['Opening Size'] },
  { id: 'bio',      text: 'Is more organic form always better?',           keys: ['Biophilic Organic Form'] },
  { id: 'plants',   text: 'What does greenery add?',                       keys: ['Potted Plants'] },
  { id: 'free',     text: 'Free play: change anything',                    keys: Object.keys(PARAMS) },
]
defineExpose({ QUESTIONS, PARAMS })

const question = computed(() => QUESTIONS.find(q => q.id === props.questionId) || QUESTIONS[0])
const shownKeys = computed(() => (props.free ? Object.keys(PARAMS) : question.value.keys))
const otherCount = computed(() => Object.keys(PARAMS).length - question.value.keys.length)

function fmt(key, v) {
  const p = PARAMS[key]
  return Number(v).toFixed(p.dp) + p.unit
}

function research(key) {
  if (key === 'Potted Plants') {
    return {
      text: 'Indoor plants are associated with slightly lower blood pressure in a 2022 meta-analysis. Effects on attention and stress markers are mixed across studies.',
      source: 'Han, Ruan & Liao (2022). Effects of Indoor Plants on Human Functions: A Systematic Review with Meta-Analyses. IJERPH. Not from the work of Valentine.',
    }
  }
  return paramInfo[key]
}

function onDrag(e, size) {
  e.dataTransfer.setData('text/plain', size)
  e.dataTransfer.effectAllowed = 'copy'
}

const label = computed(() => getScoreLabel(props.variantScore))
const delta = computed(() => props.variantScore - props.controlScore)

const touchedDims = computed(() => new Set(Object.keys(PARAMS)
  .filter(k => props.variant[k] !== props.control[k])
  .map(k => PARAMS[k].dim)))

const dims = computed(() => {
  const c = getParameterContributions(props.control), v = getParameterContributions(props.variant)
  return Object.keys(v).map(name => ({
    name, c: c[name], v: v[name], max: contributionMaxima[name], color: DIM_COLORS[name], touched: touchedDims.value.has(name),
  }))
})

const hypothesis = computed(() => {
  const dim = PARAMS[question.value.keys[0]].dim
  const name = question.value.id === 'free' ? ([...touchedDims.value][0] || 'Ceiling Height') : dim
  return dimensionMeta[name]?.hypothesis(props.variant) ?? ''
})
</script>

<style scoped>
.nb { display: flex; flex-direction: column; background: #fbfaf7; border-right: 1px solid #e3ded6; overflow-y: auto; min-height: 0; }
.nb-head { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 18px; border-bottom: 1px solid #e3ded6; position: sticky; top: 0; background: #fbfaf7; z-index: 1; }
.nb-head h2 { font: 700 15px Inter, system-ui, sans-serif; margin: 0; }
.nb-head span, .nb-was, .nb-src, .nb-more, .nb-pts, .nb-log-k { font-family: 'Roboto Mono', monospace; font-size: 11px; color: #6f6a63; }
.nb-step { padding: 14px 18px; border-bottom: 1px solid #e3ded6; }
.nb-n { font: 500 10px 'Roboto Mono', monospace; letter-spacing: .14em; text-transform: uppercase; color: #C50000; margin: 0 0 8px; }
.nb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.nb-select { width: 100%; font: 13px Inter, system-ui, sans-serif; padding: 9px 10px; border: 1px solid #e3ded6; border-radius: 10px; background: #fff; }
.nb-param { margin-top: 10px; }
.nb-row { display: flex; justify-content: space-between; font-size: 13px; }
.nb-row b { font: 500 13px 'Roboto Mono', monospace; }
.nb-param input[type=range] { width: 100%; margin: 8px 0 2px; }
.nb-was { margin: 2px 0 0; }
.nb-note { margin-top: 6px; font-size: 12px; color: #4a4540; }
.nb-note summary { font: 11px 'Roboto Mono', monospace; color: #6f6a63; cursor: pointer; }
.nb-note p { margin: 6px 0 0; line-height: 1.45; }
.nb-plants { display: flex; gap: 6px; margin-top: 8px; }
.nb-chip { flex: 1; padding: 8px 6px; border: 1px dashed #cfc8bd; border-radius: 8px; background: #fff; font: 12px Inter, system-ui, sans-serif; cursor: pointer; }
.nb-chip:disabled { opacity: .4; cursor: default; }
.nb-more { margin-top: 12px; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.nb-obs { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.nb-a { font-size: 24px; color: #8a847c; }
.nb-b { font: 700 40px Inter, system-ui, sans-serif; letter-spacing: -.03em; }
.nb-d { font: 700 14px 'Roboto Mono', monospace; }
.up { color: #2d6a4f; } .dn { color: #C50000; }
.nb-label { width: 100%; font: 10.5px 'Roboto Mono', monospace; text-transform: uppercase; letter-spacing: .1em; color: #6f6a63; }
.nb-dims { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 7px; }
.nb-dims li { display: grid; grid-template-columns: 104px 1fr 44px; gap: 8px; align-items: center; font-size: 12px; color: #6f6a63; }
.nb-dims li.on { color: #111; font-weight: 500; }
.nb-bar { position: relative; height: 6px; background: #ebe7e0; border-radius: 3px; }
.nb-bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
.nb-bar i.c { background: #cfc8bd; }
.nb-bar i.v { opacity: .9; height: 4px; top: 1px; }
.nb-pts { text-align: right; }
.nb-hyp { margin: 12px 0 0; font-size: 12.5px; line-height: 1.45; }
.nb-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.nb-btn { border: 1px solid #e3ded6; background: #fff; border-radius: 999px; padding: 8px 14px; font: 11px 'Roboto Mono', monospace; cursor: pointer; }
.nb-btn.primary { background: #111; color: #fff; border-color: #111; }
.nb-log { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 8px; }
.nb-log li { display: grid; grid-template-columns: 56px 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; }
.nb-log img { grid-row: 1 / 3; width: 56px; height: 40px; object-fit: cover; border-radius: 6px; background: #ece7df; }
.nb-log-s { font-weight: 700; font-size: 13px; }
.nb-log-s em { font-style: normal; font-family: 'Roboto Mono', monospace; font-size: 12px; }
.nb-frame { margin: auto 0 0; padding: 14px 18px; font-size: 12px; color: #6f6a63; line-height: 1.5; }
button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #C50000; outline-offset: 2px; }
</style>
