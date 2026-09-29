<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

import GeometryView from './components/GeometryView.vue'
import LabCard      from './components/LabCard.vue'
import LabSlider    from './components/LabSlider.vue'
import LabDrawer    from './components/LabDrawer.vue'
import LabReport    from './components/LabReport.vue'
import ScoreFlow    from './components/ScoreFlow.vue'
import NsIcon       from './components/NsIcon.vue'

import { calculateNeuroScore, getParameterContributions, dimensionMeta, paramInfo } from './utils/neuroScore.js'
import { CONTROL, QUESTIONS, PARAMS, PARAM_KEYS, DIMS, describeChange, encodeState, decodeState } from './utils/lab.js'
import { renderThumb } from './geometry/thumbs.js'
import './styles/base.css'

// ── The experiment: a control room and a variant (yours) ─────────────────────
const control = reactive({ ...CONTROL })
const variant = reactive({ ...CONTROL })
const controlScore = computed(() => calculateNeuroScore(control))
const variantScore = computed(() => calculateNeuroScore(variant))

const card = ref('pick')                  // pick → experiment, or custom
const question = ref(null)
const free = ref(false)
const custom = ref(loadCustom())
const questions = computed(() => [...QUESTIONS, ...custom.value])

function pick(q) {
  Object.assign(variant, control, q?.start ?? {})
  question.value = q
  free.value = !q
  card.value = 'exp'
}
function saveCustom({ text, keys }) {
  const q = { id: 'u' + Date.now().toString(36), text, keys, start: {}, own: true }
  custom.value = [...custom.value, q]
  try { localStorage.setItem('ns-questions', JSON.stringify(custom.value)) } catch {}
  pick(q)
}
function loadCustom() { try { return JSON.parse(localStorage.getItem('ns-questions') || '[]') } catch { return [] } }
const setParam = (k, v) => { variant[k] = v }
const promote = () => Object.assign(control, variant)

// ── Compare: one room at a time, or both; hold F to flip ─────────────────────
const compare = ref('variant')            // variant | control | split
const flip = ref(false)
const shownData = computed(() => (compare.value === 'control' || flip.value) ? control : variant)
const shownScore = computed(() => calculateNeuroScore(shownData.value))
const onKey = e => {
  if (e.target.closest?.('input, textarea, select')) return
  if (e.code === 'KeyF') flip.value = e.type === 'keydown'
}

// ── Stage ────────────────────────────────────────────────────────────────────
const mode = ref('isometric')
const solveMs = ref(null)
const materialConfig = reactive({ color: '#F4F0E8', opacity: 1, roughness: 0.62, metalness: 0, pattern: 'solid' })
const SWATCHES = [
  { hex: '#F4F0E8', label: 'Fabric' }, { hex: '#C50000', label: 'NeuroSpace red' }, { hex: '#1a1a1a', label: 'Black' },
  { hex: '#DEB887', label: 'Wood' }, { hex: '#B8B0A8', label: 'Concrete' },
]
const geoMain = ref(null), geoVariant = ref(null)
const narrow = ref(false)

// Time of day (equinox, Barcelona): the arches sit on the sun's path.
const hour = ref(15)
const playing = ref(false)
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
let raf = 0, last = 0
function playDay() {
  if (reduceMotion) return
  playing.value = !playing.value
  if (!playing.value) return
  last = performance.now()
  const step = t => {
    if (!playing.value) return
    hour.value += (t - last) / 1000 * 0.6
    if (hour.value > 17.5) hour.value = 6.5
    last = t
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
const hourLabel = computed(() => `${Math.floor(hour.value)}:${String(Math.round((hour.value % 1) * 60) % 60).padStart(2, '0')}`)

// ── Log ──────────────────────────────────────────────────────────────────────
const log = ref([])
function logResult() {
  const view = compare.value === 'split' ? geoVariant.value : (shownData.value === variant ? geoMain.value : null)
  const cc = getParameterContributions(control), cv = getParameterContributions(variant)
  log.value.push({
    dataUrl: view?.captureScreenshot() ?? '',
    from: controlScore.value, score: variantScore.value, delta: variantScore.value - controlScore.value,
    change: describeChange(control, variant),
    moved: DIMS.filter(d => cc[d.key] !== cv[d.key]),
  })
}

// ── Share and export ─────────────────────────────────────────────────────────
const toast = ref('')
let toastT = 0
function say(msg) { toast.value = msg; clearTimeout(toastT); toastT = setTimeout(() => { toast.value = '' }, 2200) }
async function share() {
  const s = encodeState({ c: { ...control }, v: { ...variant }, q: question.value?.id ?? null, u: custom.value, m: mode.value, h: +hour.value.toFixed(2) })
  history.replaceState(null, '', '#s=' + s)
  try { await navigator.clipboard.writeText(location.href); say('Link copied: it opens this exact experiment') }
  catch { say('Link is in the address bar') }
}
function exportObj() {
  const view = compare.value === 'split' ? geoVariant.value : geoMain.value
  const text = view?.exportOBJ()
  if (!text) return
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `neurospace-membrane-${variantScore.value}.obj` })
  a.click(); URL.revokeObjectURL(url)
  say('Membrane exported in metres, Y up')
}
function restore() {
  const st = decodeState(location.hash)
  if (!st) return
  Object.assign(control, st.c); Object.assign(variant, st.v)
  if (Array.isArray(st.u)) custom.value = st.u
  if (st.m) mode.value = st.m
  if (st.h) hour.value = st.h
  question.value = questions.value.find(q => q.id === st.q) ?? null
  free.value = !question.value
  card.value = 'exp'
}

// ── 3D icons: rendered by the solver, after first paint ──────────────────────
const thumbs = reactive({})
function makeThumbs() {
  const todo = questions.value.filter(q => !thumbs[q.id] && Object.keys(q.start).length)
  const next = () => {
    const q = todo.shift()
    if (!q) return
    thumbs[q.id] = renderThumb({ ...CONTROL, ...q.start })
    ;(window.requestIdleCallback || setTimeout)(next)
  }
  next()
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
let mq
onMounted(async () => {
  mq = window.matchMedia('(max-width: 900px)')
  narrow.value = mq.matches
  mq.addEventListener('change', e => { narrow.value = e.matches })
  document.addEventListener('keydown', onKey)
  document.addEventListener('keyup', onKey)
  restore()
  await nextTick()
  setTimeout(makeThumbs, 400)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('keyup', onKey)
})

const drawer = ref(null)
const PLANT_NOTE = {
  text: 'Indoor plants are associated with slightly lower blood pressure in a 2022 meta-analysis. Effects on attention and stress markers are mixed across studies.',
  source: 'Han, Ruan & Liao (2022), IJERPH. Not from the work of Valentine.',
}
const research = computed(() => DIMS.map(d => ({
  ...d, meta: dimensionMeta[d.key],
  notes: d.key === 'Potted Plants' ? [PLANT_NOTE] : PARAM_KEYS.filter(k => PARAMS[k].dim === d.key).map(k => paramInfo[k]),
})))
</script>

<template>
  <div class="lab" :class="{ narrow, split: compare === 'split' && !narrow, free: free && card === 'exp' }">

    <!-- Stage: the room, full-bleed -->
    <main class="stage" aria-label="Room">
      <template v-if="compare === 'split' && !narrow">
        <figure class="view">
          <GeometryView :data="control" :score="controlScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig" :interactive="false" label="Control" />
          <figcaption class="tag">Control · {{ controlScore }}</figcaption>
        </figure>
        <figure class="view">
          <GeometryView ref="geoVariant" :data="variant" :score="variantScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig" label="Variant"
            @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" />
          <figcaption class="tag dark">Variant · {{ variantScore }}</figcaption>
        </figure>
      </template>
      <figure v-else class="view">
        <GeometryView ref="geoMain" :data="shownData" :score="shownScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig"
          :label="shownData === control ? 'Control' : 'Variant'"
          @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" />
        <figcaption v-if="card === 'exp'" class="tag" :class="{ dark: shownData === variant }">
          {{ shownData === control ? 'Control' : 'Variant' }} · {{ shownScore }}<span v-if="flip"> · flipped</span>
        </figcaption>
      </figure>
      <p class="caption">membrane form-found live · force density<span v-if="solveMs"> · {{ solveMs.toFixed(1) }} ms</span></p>
    </main>

    <!-- Header -->
    <header class="head">
      <div>
        <h1 class="brand">Neuro<span>Space</span></h1>
        <p class="claim">Change one thing in a room; the lab estimates what it does to the person inside.</p>
      </div>
      <nav aria-label="Lab">
        <button @click="drawer = 'method'"><NsIcon name="question" :size="14" />Method</button>
        <button @click="drawer = 'research'">Research</button>
        <button class="red" @click="drawer = 'report'"><NsIcon name="log" :size="14" />Report<span v-if="log.length"> · {{ log.length }}</span></button>
        <button @click="share" title="Copy a link to this exact experiment"><NsIcon name="share" :size="14" />Share</button>
        <button @click="exportObj" title="Download the membrane as .obj"><NsIcon name="export" :size="14" />.obj</button>
      </nav>
    </header>

    <!-- The card -->
    <LabCard class="card"
      :state="card" :questions="questions" :question="question" :thumbs="thumbs"
      :control="control" :variant="variant" :control-score="controlScore" :variant-score="variantScore"
      :free="free" :log="log"
      @pick="pick" @custom="card = 'custom'" @save="saveCustom" @back="card = 'pick'"
      @set="setParam" @free="free = $event" @log="logResult" @promote="promote" />

    <!-- Free play: every slider along the bottom, the control as a ghost tick -->
    <section v-if="free && card === 'exp'" class="strip" aria-label="All parameters">
      <LabSlider v-for="k in PARAM_KEYS" :key="k" :k="k" :value="variant[k]" :control="control[k]" @set="setParam" />
    </section>

    <!-- Log cards -->
    <ol v-if="log.length && !free && !narrow" class="logs" aria-label="Logged experiments">
      <li v-for="(e, i) in log.slice(-3)" :key="i">
        <img :src="e.dataUrl" alt="" />
        <span class="k">EXP {{ String(log.length - Math.min(3, log.length) + i + 1).padStart(2, '0') }} · {{ e.change }}</span>
        <span class="s">{{ e.from }} → {{ e.score }} <em :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</em></span>
      </li>
    </ol>

    <!-- The band -->
    <div class="band" role="toolbar" aria-label="View">
      <div class="sun">
        <label for="hour"><NsIcon name="sun" :size="16" color="var(--ns-sun)" /><span>{{ hourLabel }}</span></label>
        <input id="hour" type="range" min="6.5" max="17.5" step="0.05" v-model.number="hour" aria-label="Time of day, equinox, Barcelona" />
        <button class="pill" @click="playDay" :disabled="reduceMotion" :aria-pressed="playing"><NsIcon :name="playing ? 'pause' : 'play'" :size="12" />day</button>
      </div>
      <span class="sep"></span>
      <div class="seg" role="group" aria-label="View mode">
        <button v-for="v in [['isometric', 'outside', 'Outside'], ['walk', 'inside', 'Inside'], ['plan', 'plan', 'Plan']]" :key="v[0]"
          :class="{ on: mode === v[0] }" :aria-pressed="mode === v[0]" @click="mode = v[0]"><NsIcon :name="v[1]" :size="14" />{{ v[2] }}</button>
      </div>
      <span class="sep"></span>
      <div class="seg" role="group" aria-label="Compare" title="Hold F to flip between the rooms">
        <button :class="{ on: compare === 'variant' }" :aria-pressed="compare === 'variant'" @click="compare = 'variant'"><NsIcon name="single" :size="14" />Variant</button>
        <button :class="{ on: compare === 'control' }" :aria-pressed="compare === 'control'" @click="compare = 'control'">Control</button>
        <button v-if="!narrow" :class="{ on: compare === 'split' }" :aria-pressed="compare === 'split'" @click="compare = 'split'"><NsIcon name="split" :size="14" />Split</button>
      </div>
      <span class="hint" aria-hidden="true">hold F</span>
      <span class="sep"></span>
      <button class="icon-btn" :class="{ on: materialConfig.pattern === 'grid' }" :aria-pressed="materialConfig.pattern === 'grid'"
        @click="materialConfig.pattern = materialConfig.pattern === 'grid' ? 'solid' : 'grid'" title="Show the cable net the solver works on"><NsIcon name="net" :size="18" /><span class="sr">Net</span></button>
      <div class="swatches" role="group" aria-label="Membrane colour">
        <button v-for="c in SWATCHES" :key="c.hex" class="sw" :class="{ on: materialConfig.color === c.hex }" :style="{ background: c.hex }"
          :aria-label="c.label" :aria-pressed="materialConfig.color === c.hex" @click="materialConfig.color = c.hex"></button>
      </div>
    </div>

    <p v-if="toast" class="toast" role="status">{{ toast }}</p>

    <!-- Method -->
    <LabDrawer :open="drawer === 'method'" title="Method" @close="drawer = null">
      <div class="doc">
        <p class="lede">BIM, reframed: from Building Information Modeling to Behavior Information Modeling. Seven parameters describe the room; the lab form-finds it and estimates what it does to the person inside.</p>
        <h3>How the score is made</h3>
        <ScoreFlow :params="variant" />
        <p>A transparent weighted sum, not an instrument: it estimates, it never measures a body, and it makes no clinical claim. Band width is the most each slider can add; the bars fill with what your variant earns. The weights are public in the repo so they can be argued with.</p>
        <h3>The room</h3>
        <p>One tensioned membrane, form-found in your browser with the force density method (Schek, 1974, written for Frei Otto's Munich Olympic roof). Every node of a cable net sits where its neighbours' pulls balance; with no pressure it is a soap film, with pressure a bubble.</p>
        <ul>
          <li><b>Ceiling height</b> lifts the compression ring the film hangs from.</li>
          <li><b>Wall count and curvature</b>: the ground edge is a control polygon blended into its cubic B-spline; low curvature pulls taut ridge cables, high curvature inflates the film.</li>
          <li><b>Openings and window-to-wall</b>: superellipse arches, one per hour on the sun's path (equinox, Barcelona); their area is solved with the gamma function.</li>
          <li><b>Biomorphic form</b> warps the film up to about 40%; past about 55% it pleats into a regular, high-contrast repetition.</li>
        </ul>
        <h3>History</h3>
        <p>v1 ran as a Grasshopper definition on IAAC's Rhino Compute server, which has been retired. This version was rebuilt in code from the rules, not ported from the definition. <a href="https://github.com/hi-em/neurospace" target="_blank" rel="noopener noreferrer">Source on GitHub</a>.</p>
      </div>
    </LabDrawer>

    <!-- Research: each dimension, its rules and its evidence, once -->
    <LabDrawer :open="drawer === 'research'" title="Research" @close="drawer = null">
      <div class="doc">
        <p class="lede">Informed by the work of <a href="https://cleovalentine.io/" target="_blank" rel="noopener noreferrer">Dr. Cleo Valentine</a> and the studies her review draws on. Each line says how strong the evidence is.</p>
        <section v-for="d in research" :key="d.key" class="dim">
          <h3><span class="dh"><NsIcon :name="d.icon" :size="16" :color="d.color" />{{ d.label }}</span><small>{{ d.meta.maxPts }} pts</small></h3>
          <p class="mute">{{ d.meta.consequence }}</p>
          <ul class="rules"><li v-for="r in d.meta.rules" :key="r.range" :class="'risk-' + r.risk"><b>{{ r.range }}</b> {{ r.outcome }}</li></ul>
          <div v-for="(n, i) in d.notes" :key="i" class="ev"><p>{{ n.text }}</p><p class="src">{{ n.source }}</p></div>
        </section>
      </div>
    </LabDrawer>

    <!-- Report -->
    <LabDrawer :open="drawer === 'report'" title="Report" @close="drawer = null">
      <LabReport :control="control" :variant="variant" :control-score="controlScore" :variant-score="variantScore" :log="log" />
    </LabDrawer>

    <footer class="credit">
      By <a href="https://www.linkedin.com/in/emilieelchidiac/" target="_blank" rel="noopener noreferrer">Emilie El Chidiac</a>
      · research <a href="https://cleovalentine.io/" target="_blank" rel="noopener noreferrer">Dr. Cleo Valentine</a>
    </footer>
  </div>
</template>

<style scoped>
.lab { position: fixed; inset: 0; background: var(--ns-sunk); color: var(--ns-ink); font: var(--ns-t-body)/var(--ns-lh) var(--ns-sans); overflow: hidden; }

/* stage: the room to the right of the card */
.stage { position: absolute; inset: 0 0 0 416px; display: grid; grid-template-columns: 1fr; }
.lab.split .stage { grid-template-columns: 1fr 1fr; }
.view { position: relative; margin: 0; min-width: 0; min-height: 0; }
.lab.split .view:first-child { border-right: 1px solid var(--ns-line); }
.tag { position: absolute; left: 50%; top: 72px; transform: translateX(-50%); font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; background: var(--ns-surface); border: 1px solid var(--ns-line); padding: 5px 10px; border-radius: var(--ns-r-pill); pointer-events: none; white-space: nowrap; }
.tag.dark { background: var(--ns-ink); color: #fff; border-color: var(--ns-ink); }
.caption { position: absolute; left: 22px; top: 78px; margin: 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); pointer-events: none; }

.head { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: flex-start; gap: var(--ns-s4); padding: 14px 22px; pointer-events: none; }
.head > * { pointer-events: auto; }
.brand { margin: 0; font: 700 18px var(--ns-sans); letter-spacing: -.02em; }
.brand span { color: var(--ns-red); }
.claim { margin: 0; font-size: 12px; color: var(--ns-mute); }
.head nav { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.head nav button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ns-line); background: #fbfaf7e6; border-radius: var(--ns-r-control); padding: 6px 10px; font: 500 var(--ns-t-ui) var(--ns-mono); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; color: var(--ns-ink); }
.head nav button.red { color: var(--ns-red); }

.card { position: absolute; left: 22px; top: 70px; bottom: 92px; width: 372px; }
.lab.free .card { bottom: auto; max-height: calc(100% - 290px); }

.strip { position: absolute; left: 22px; right: 22px; bottom: 92px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 18px; background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: var(--ns-r-card); box-shadow: var(--ns-e2); padding: 10px 16px 12px; }

.logs { position: absolute; right: 22px; bottom: 92px; display: flex; gap: 10px; list-style: none; margin: 0; padding: 0; }
.logs li { width: 150px; background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: 12px; padding: 8px; box-shadow: var(--ns-e2); display: flex; flex-direction: column; gap: 3px; }
.logs img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; background: var(--ns-paper); }
.logs .k { font: 9.5px var(--ns-mono); color: var(--ns-mute); }
.logs .s { font-weight: 700; }
.logs em { font: normal 700 12px var(--ns-mono); }
.up { color: var(--ns-green); } .dn { color: var(--ns-red); }

.band { position: absolute; left: calc(50% + 208px); transform: translateX(-50%); bottom: 22px; display: flex; align-items: center; gap: 10px; background: #fbfaf7f2; border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); box-shadow: var(--ns-e2); padding: 7px 10px 7px 14px; font: var(--ns-t-ui) var(--ns-mono); white-space: nowrap; max-width: calc(100% - 440px); }
.sun { display: flex; align-items: center; gap: 8px; }
.sun label { display: flex; align-items: center; gap: 6px; }
.sun label span { width: 36px; }
.sun input { width: 150px; accent-color: var(--ns-sun); margin: 0; }
.pill { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--ns-line); background: #fff; border-radius: var(--ns-r-pill); padding: 5px 10px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; color: var(--ns-ink); }
.sep { width: 1px; height: 22px; background: var(--ns-line); flex: none; }
.seg { display: flex; border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); overflow: hidden; background: #fff; }
.seg button { display: inline-flex; align-items: center; gap: 5px; border: 0; border-right: 1px solid var(--ns-line); background: none; padding: 6px 10px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; color: var(--ns-ink); }
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--ns-ink); color: #fff; }
.hint { font: 9.5px var(--ns-mono); color: var(--ns-mute); border: 1px solid var(--ns-line); border-radius: 4px; padding: 1px 4px; }
.icon-btn { border: 1px solid transparent; background: none; border-radius: 50%; padding: 4px; cursor: pointer; display: inline-flex; color: var(--ns-ink); }
.icon-btn.on { border-color: var(--ns-ink); }
.swatches { display: flex; gap: 6px; }
.sw { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #0002; cursor: pointer; padding: 0; }
.sw.on { outline: 2px solid var(--ns-red); outline-offset: 2px; }

.toast { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); margin: 0; background: var(--ns-ink); color: #fff; font: var(--ns-t-ui) var(--ns-mono); padding: 8px 14px; border-radius: var(--ns-r-pill); z-index: 60; }
.credit { position: absolute; left: 22px; bottom: 30px; margin: 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); width: 372px; }
.credit a { color: inherit; text-underline-offset: 3px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.lab button:focus-visible, .lab input:focus-visible, .lab a:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }

.doc { padding: var(--ns-s5) 26px 40px; font-size: 14px; line-height: 1.6; color: var(--ns-ink-2); }
.doc h3 { font: 700 var(--ns-t-title) var(--ns-sans); margin: 22px 0 6px; display: flex; justify-content: space-between; align-items: center; color: var(--ns-ink); }
.doc h3 small { font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); }
.dh { display: inline-flex; gap: 8px; align-items: center; }
.lede { font-size: 16px; color: var(--ns-ink); }
.mute { color: var(--ns-mute); margin: 0 0 8px; }
.dim { border-top: 1px solid var(--ns-line); }
.rules { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 4px; font-size: 13px; }
.rules b { font: 500 var(--ns-t-ui) var(--ns-mono); display: inline-block; min-width: 92px; }
.rules .risk-high b { color: var(--ns-red); } .rules .risk-low b { color: var(--ns-green); }
.ev p { margin: 0 0 4px; font-size: 13px; }
.src { font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); margin-bottom: 10px !important; }

/* Phones and narrow windows: room on top, the card below it, the band on the room */
.lab.narrow { position: static; overflow: visible; min-height: 100vh; display: flex; flex-direction: column; }
.lab.narrow .head { position: static; flex-wrap: wrap; padding: 12px 14px; background: var(--ns-surface); border-bottom: 1px solid var(--ns-line); }
.lab.narrow .head nav { margin-left: 0; justify-content: flex-start; }
.lab.narrow .stage { position: sticky; top: 0; height: 52vh; inset: auto; z-index: 4; background: var(--ns-sunk); }
.lab.narrow .caption { display: none; }
.lab.narrow .tag { top: 12px; }
.lab.narrow .band { position: sticky; top: 52vh; left: auto; transform: none; border-radius: 0; max-width: none; flex-wrap: wrap; white-space: normal; z-index: 4; margin: 0; }
.lab.narrow .sun { flex: 1 1 100%; } .lab.narrow .sun input { flex: 1; width: auto; }
.lab.narrow .hint { display: none; }
.lab.narrow .card { position: static; width: auto; margin: 12px; max-height: none; }
.lab.narrow .strip { position: static; grid-template-columns: 1fr; margin: 0 12px 12px; }
.lab.narrow .credit { position: static; width: auto; padding: 0 14px 24px; }
.lab.narrow .head { order: 0; } .lab.narrow .stage { order: 1; } .lab.narrow .band { order: 2; }
.lab.narrow .card { order: 3; } .lab.narrow .strip { order: 4; } .lab.narrow .credit { order: 5; }
</style>
