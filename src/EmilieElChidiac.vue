<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'

import GeometryView from './components/GeometryView.vue'
import LabNotebook  from './components/LabNotebook.vue'
import LabDrawer    from './components/LabDrawer.vue'
import LabReport    from './components/LabReport.vue'

import { calculateNeuroScore, dimensionMeta, paramInfo } from './utils/neuroScore.js'
import './styles/base.css'

// ── The experiment: a control room and a variant (yours) ─────────────────────
// Keys are the v1 Grasshopper input names; the score reads the same keys.
const DEFAULTS = {
  'Wall Count': 4, 'Wall Curvature': 0.8, 'Height': 5, 'Biophilic Organic Form': 0,
  'Opening Count': 3, 'Opening Size': 15, 'Potted Plants': 0,
}
// The first question, already asked: 2.4 m against 3.5 m, the range the evidence covers
const control = reactive({ ...DEFAULTS, Height: 2.4 })
const variant = reactive({ ...DEFAULTS, Height: 3.5 })
const controlScore = computed(() => calculateNeuroScore(control))
const variantScore = computed(() => calculateNeuroScore(variant))
const delta = computed(() => variantScore.value - controlScore.value)

const questionId = ref('height')
const free = ref(false)
function setQuestion(id) {
  questionId.value = id
  free.value = id === 'free'
  Object.assign(variant, control)                     // a new question starts from the control
}
function setParam(key, value) { variant[key] = value }
function promote() { Object.assign(control, variant) }

// ── Log (feeds the report and its PDF) ───────────────────────────────────────
const log = ref([])
const geoVariant = ref(null)
const SHORT = { 'Height': 'ceiling', 'Wall Curvature': 'curvature', 'Wall Count': 'walls', 'Opening Count': 'openings',
  'Opening Size': 'window %', 'Biophilic Organic Form': 'biomorphic', 'Potted Plants': 'plants' }
function logResult() {
  const changed = Object.keys(DEFAULTS).filter(k => variant[k] !== control[k])
  const change = changed.length
    ? changed.map(k => `${SHORT[k]} ${+Number(control[k]).toFixed(2)}→${+Number(variant[k]).toFixed(2)}`).join(', ')
    : 'no change'
  log.value.push({
    dataUrl: geoVariant.value?.captureScreenshot() ?? '',
    score: variantScore.value, from: controlScore.value, delta: delta.value,
    change, timestamp: new Date().toISOString(),
  })
}

// ── Stage ────────────────────────────────────────────────────────────────────
const mode = ref('isometric')
const showSurroundings = ref(true)
const solveMs = ref(null)
const narrow = ref(false)
const shown = ref('variant')                            // phones show one room at a time
const materialConfig = reactive({ color: '#F4F0E8', opacity: 1, roughness: 0.62, metalness: 0, pattern: 'solid' })
const lookOpen = ref(false)
const SWATCHES = [
  { hex: '#F4F0E8', label: 'Fabric' }, { hex: '#C50000', label: 'NeuroSpace red' }, { hex: '#1a1a1a', label: 'Black' },
  { hex: '#DEB887', label: 'Wood' }, { hex: '#B8B0A8', label: 'Concrete' },
]

// Time of day (equinox, Barcelona): the arches sit on the sun's path, so moving the
// sun is how the openings' logic becomes visible.
const hour = ref(16)
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

let mq
onMounted(() => {
  mq = window.matchMedia('(max-width: 900px)')
  narrow.value = mq.matches
  mq.addEventListener('change', e => { narrow.value = e.matches })
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

// ── Drawers ──────────────────────────────────────────────────────────────────
const drawer = ref(null)
const PLANT_NOTE = {
  text: 'Indoor plants are associated with slightly lower blood pressure in a 2022 meta-analysis. Effects on attention and stress markers are mixed across studies.',
  source: 'Han, Ruan & Liao (2022), IJERPH. Not from the work of Valentine.',
}
</script>

<template>
  <div class="lab" :class="{ narrow }">

    <header class="lab-head">
      <h1 class="lab-brand">Neuro<span>Space</span></h1>
      <p class="lab-claim">Change one thing in a room; the lab estimates what it does to the person inside.</p>
      <nav class="lab-nav" aria-label="Lab">
        <button @click="drawer = 'method'">Method</button>
        <button @click="drawer = 'research'">Research</button>
        <button class="lab-report" @click="drawer = 'report'">Report{{ log.length ? ` · ${log.length}` : '' }}</button>
      </nav>
      <p class="lab-credit">
        By <a href="https://www.linkedin.com/in/emilieelchidiac/" target="_blank" rel="noopener noreferrer">Emilie El Chidiac</a>
        · research <a href="https://cleovalentine.io/" target="_blank" rel="noopener noreferrer">Dr. Cleo Valentine</a>
      </p>
    </header>

    <LabNotebook
      class="lab-notebook"
      :control="control" :variant="variant"
      :control-score="controlScore" :variant-score="variantScore"
      :question-id="questionId" :free="free" :log="log"
      @question="setQuestion" @set="setParam" @free="free = $event"
      @log="logResult" @promote="promote"
    />

    <main class="lab-stage" aria-label="Rooms">
      <div class="lab-views" :class="{ single: narrow }">
        <template v-if="!narrow">
          <figure class="lab-view">
            <GeometryView :data="control" :score="controlScore" :mode="mode" :sun-hour="hour"
              :show-surroundings="showSurroundings" :material-config="materialConfig" :interactive="false" label="Control" />
            <figcaption class="lab-tag">Control <b>{{ controlScore }}</b></figcaption>
          </figure>
          <figure class="lab-view">
            <GeometryView ref="geoVariant" :data="variant" :score="variantScore" :mode="mode" :sun-hour="hour"
              :show-surroundings="showSurroundings" :material-config="materialConfig" label="Variant"
              @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" />
            <figcaption class="lab-tag dark">Variant · yours <b>{{ variantScore }}</b></figcaption>
          </figure>
          <div class="lab-delta" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''" aria-live="polite">
            <b>{{ delta > 0 ? '+' : '' }}{{ delta }}</b><span>variant vs control</span>
          </div>
        </template>
        <template v-else>
          <figure class="lab-view">
            <GeometryView ref="geoVariant" :data="shown === 'control' ? control : variant"
              :score="shown === 'control' ? controlScore : variantScore" :mode="mode" :sun-hour="hour"
              :show-surroundings="showSurroundings" :material-config="materialConfig" :label="shown"
              @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" />
            <div class="lab-toggle" role="tablist" aria-label="Which room">
              <button role="tab" :aria-selected="shown === 'control'" :class="{ on: shown === 'control' }" @click="shown = 'control'">Control {{ controlScore }}</button>
              <button role="tab" :aria-selected="shown === 'variant'" :class="{ on: shown === 'variant' }" @click="shown = 'variant'">Variant {{ variantScore }}</button>
            </div>
            <div class="lab-delta small" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''"><b>{{ delta > 0 ? '+' : '' }}{{ delta }}</b></div>
          </figure>
        </template>
      </div>

      <div class="lab-bar">
        <div class="lab-sun">
          <label for="lab-hour">☀ <span>{{ hourLabel }}</span></label>
          <input id="lab-hour" type="range" min="6.5" max="17.5" step="0.05" v-model.number="hour" aria-label="Time of day, equinox, Barcelona" />
          <button class="lab-chip" @click="playDay" :disabled="reduceMotion" :aria-pressed="playing">{{ playing ? '❚❚ pause' : '▶ play the day' }}</button>
        </div>
        <div class="lab-seg" role="group" aria-label="View">
          <button v-for="v in [['isometric', 'Outside'], ['walk', 'Inside'], ['plan', 'Plan']]" :key="v[0]"
            :class="{ on: mode === v[0] }" :aria-pressed="mode === v[0]" @click="mode = v[0]">{{ v[1] }}</button>
        </div>
        <div class="lab-seg" role="group" aria-label="Display">
          <button :class="{ on: materialConfig.pattern === 'grid' }" :aria-pressed="materialConfig.pattern === 'grid'"
            @click="materialConfig.pattern = materialConfig.pattern === 'grid' ? 'solid' : 'grid'" title="Show the cable net the solver works on">Net</button>
          <button :class="{ on: showSurroundings }" :aria-pressed="showSurroundings" @click="showSurroundings = !showSurroundings">Context</button>
          <button :class="{ on: lookOpen }" :aria-expanded="lookOpen" @click="lookOpen = !lookOpen">Look</button>
        </div>
        <div v-if="lookOpen" class="lab-look" role="group" aria-label="Membrane colour">
          <button v-for="c in SWATCHES" :key="c.hex" class="lab-swatch" :class="{ on: materialConfig.color === c.hex }"
            :style="{ background: c.hex }" :aria-label="c.label" :aria-pressed="materialConfig.color === c.hex"
            @click="materialConfig.color = c.hex"></button>
        </div>
        <p class="lab-caption">membrane form-found live · force density<span v-if="solveMs"> · {{ solveMs.toFixed(1) }} ms</span></p>
      </div>
    </main>

    <!-- Method -->
    <LabDrawer :open="drawer === 'method'" title="Method" @close="drawer = null">
      <div class="lab-doc">
        <p class="lab-lede">BIM, reframed: from Building Information Modeling to Behavior Information Modeling. The room is described by seven parameters; the lab form-finds it and estimates what it does to the person inside.</p>
        <h3>The room</h3>
        <p>One tensioned membrane, form-found in your browser with the force density method (Schek, 1974, written for Frei Otto's Munich Olympic roof). Every node of a cable net sits where its neighbours' pulls balance; with no pressure it is a soap film, with pressure a bubble.</p>
        <ul>
          <li><b>Ceiling height</b> lifts the compression ring the film hangs from.</li>
          <li><b>Wall count and curvature</b>: the ground edge is a control polygon blended into its cubic B-spline; low curvature pulls taut ridge cables, high curvature inflates the film.</li>
          <li><b>Openings and window-to-wall</b>: superellipse arches, one per hour on the sun's path (equinox, Barcelona); their area is solved with the gamma function.</li>
          <li><b>Biomorphic form</b> warps the film up to about 40%; past about 55% it pleats into a regular, high-contrast repetition.</li>
        </ul>
        <h3>The score</h3>
        <p>A transparent weighted sum, not an instrument: it estimates, it never measures a body, and it makes no clinical claim. Weights: ceiling 0.22 · walls 0.25 · daylight 0.22 · biomorphic form 0.18 · plants 0.13. They are public in the repo so they can be argued with.</p>
        <h3>History</h3>
        <p>v1 ran as a Grasshopper definition on IAAC's Rhino Compute server, which has been retired. This version was rebuilt in code from the rules, not ported from the definition.</p>
        <p><a href="https://github.com/hi-em/neurospace" target="_blank" rel="noopener noreferrer">Source on GitHub</a></p>
      </div>
    </LabDrawer>

    <!-- Research: every dimension, its rules, and each parameter's evidence, once -->
    <LabDrawer :open="drawer === 'research'" title="Research" @close="drawer = null">
      <div class="lab-doc">
        <section v-for="(meta, name) in dimensionMeta" :key="name" class="lab-dim">
          <h3>{{ name }} <span>{{ meta.maxPts }} pts</span></h3>
          <p class="lab-dim-tag">{{ meta.consequence }}</p>
          <ul class="lab-rules"><li v-for="r in meta.rules" :key="r.range" :class="'risk-' + r.risk"><b>{{ r.range }}</b> {{ r.outcome }}</li></ul>
          <div v-for="k in (meta.contributorKeys.length ? meta.contributorKeys : ['__plants'])" :key="k" class="lab-ev">
            <p>{{ (k === '__plants' ? PLANT_NOTE : paramInfo[k]).text }}</p>
            <p class="lab-src">{{ (k === '__plants' ? PLANT_NOTE : paramInfo[k]).source }}</p>
          </div>
        </section>
      </div>
    </LabDrawer>

    <!-- Report: control vs variant once, the log, and the PDF -->
    <LabDrawer :open="drawer === 'report'" title="Report" @close="drawer = null">
      <LabReport :control="control" :variant="variant" :control-score="controlScore" :variant-score="variantScore" :log="log" />
    </LabDrawer>
  </div>
</template>

<style scoped>
.lab { height: 100vh; display: grid; grid-template-columns: 340px 1fr; grid-template-rows: auto 1fr; overflow: hidden; color: #111; font-family: Inter, system-ui, sans-serif; background: #f6f3ee; }
.lab-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 18px; padding: 10px 18px; border-bottom: 1px solid #e3ded6; background: #fbfaf7; flex-wrap: wrap; }
.lab-brand { margin: 0; font: 700 18px Inter, system-ui, sans-serif; letter-spacing: -.02em; }
.lab-brand span { color: #C50000; }
.lab-claim { margin: 0; font-size: 12.5px; color: #6f6a63; }
.lab-nav { margin-left: auto; display: flex; gap: 4px; }
.lab-nav button { border: 0; background: none; font: 500 11px 'Roboto Mono', monospace; letter-spacing: .08em; text-transform: uppercase; padding: 6px 8px; cursor: pointer; border-radius: 6px; }
.lab-nav button:hover { background: #efebe4; }
.lab-report { color: #C50000; }
.lab-credit { margin: 0; font: 11px 'Roboto Mono', monospace; color: #6f6a63; }
.lab-credit a { color: inherit; text-underline-offset: 3px; }
.lab-notebook { min-height: 0; }
.lab-stage { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.lab-views { position: relative; flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
.lab-views.single { grid-template-columns: 1fr; }
.lab-view { position: relative; margin: 0; min-width: 0; min-height: 0; border-right: 1px solid #e3ded6; }
.lab-view:last-of-type { border-right: 0; }
.lab-tag { position: absolute; left: 12px; top: 12px; font: 500 10.5px 'Roboto Mono', monospace; letter-spacing: .12em; text-transform: uppercase; background: #fbfaf7; border: 1px solid #e3ded6; padding: 5px 10px; border-radius: 999px; pointer-events: none; }
.lab-tag b { margin-left: 6px; font-size: 12px; letter-spacing: 0; }
.lab-tag.dark { background: #111; color: #fff; border-color: #111; }
.lab-delta { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 92px; height: 92px; border-radius: 50%; background: #fbfaf7; border: 1px solid #e3ded6; box-shadow: 0 8px 30px #0002; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 5; pointer-events: none; }
.lab-delta b { font-size: 26px; letter-spacing: -.03em; }
.lab-delta span { font: 9px 'Roboto Mono', monospace; color: #6f6a63; text-align: center; width: 64px; }
.lab-delta.up b { color: #2d6a4f; } .lab-delta.dn b { color: #C50000; }
.lab-delta.small { left: auto; right: 12px; top: 12px; transform: none; width: 56px; height: 56px; }
.lab-toggle { position: absolute; left: 12px; top: 12px; display: flex; border: 1px solid #e3ded6; border-radius: 999px; overflow: hidden; background: #fbfaf7; z-index: 5; }
.lab-toggle button { border: 0; background: none; padding: 7px 12px; font: 500 11px 'Roboto Mono', monospace; }
.lab-toggle button.on { background: #111; color: #fff; }
.lab-bar { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid #e3ded6; background: #fbfaf7; flex-wrap: wrap; }
.lab-sun { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 240px; font: 11px 'Roboto Mono', monospace; }
.lab-sun label span { display: inline-block; width: 38px; }
.lab-sun input { flex: 1; accent-color: #c98a2e; }
.lab-chip { border: 1px solid #111; border-radius: 999px; background: #fff; padding: 5px 12px; font: 11px 'Roboto Mono', monospace; cursor: pointer; white-space: nowrap; }
.lab-seg { display: flex; border: 1px solid #e3ded6; border-radius: 8px; overflow: hidden; }
.lab-seg button { border: 0; border-right: 1px solid #e3ded6; background: #fff; padding: 6px 11px; font: 11px 'Roboto Mono', monospace; cursor: pointer; }
.lab-seg button:last-child { border-right: 0; }
.lab-seg button.on { background: #111; color: #fff; }
.lab-look { position: absolute; right: 16px; bottom: 56px; display: flex; gap: 8px; padding: 10px; background: #fbfaf7; border: 1px solid #e3ded6; border-radius: 12px; box-shadow: 0 8px 24px #0002; z-index: 6; }
.lab-swatch { width: 26px; height: 26px; border-radius: 50%; border: 1px solid #0003; cursor: pointer; }
.lab-swatch.on { outline: 2px solid #C50000; outline-offset: 2px; }
.lab-caption { margin: 0 0 0 auto; font: 10.5px 'Roboto Mono', monospace; color: #6f6a63; }
.lab button:focus-visible, .lab input:focus-visible, .lab a:focus-visible { outline: 2px solid #C50000; outline-offset: 2px; }

.lab-doc { padding: 20px 26px 40px; font-size: 14px; line-height: 1.6; color: #2b2825; }
.lab-doc h3 { font: 700 13px Inter, system-ui, sans-serif; margin: 22px 0 6px; display: flex; justify-content: space-between; }
.lab-doc h3 span { font: 11px 'Roboto Mono', monospace; color: #6f6a63; }
.lab-lede { font-size: 16px; color: #111; }
.lab-dim { border-top: 1px solid #e3ded6; padding-top: 4px; }
.lab-dim-tag { margin: 0 0 8px; color: #6f6a63; }
.lab-rules { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 4px; font-size: 13px; }
.lab-rules b { font: 500 11px 'Roboto Mono', monospace; display: inline-block; min-width: 92px; }
.lab-rules .risk-high b { color: #C50000; } .lab-rules .risk-low b { color: #2d6a4f; }
.lab-ev p { margin: 0 0 4px; font-size: 13px; }
.lab-src { font: 11px 'Roboto Mono', monospace; color: #6f6a63; margin-bottom: 10px !important; }

/* Phones and narrow windows: the room on top, the notebook below it */
.lab.narrow { display: flex; flex-direction: column; height: auto; overflow: visible; }
.lab.narrow .lab-head { order: 0; }
.lab.narrow .lab-stage { order: 1; }
.lab.narrow .lab-notebook { order: 2; }
.lab.narrow .lab-head { gap: 8px 12px; padding: 10px 14px; }
.lab.narrow .lab-claim, .lab.narrow .lab-credit { flex-basis: 100%; }
.lab.narrow .lab-nav { margin-left: auto; }
.lab.narrow .lab-stage { position: sticky; top: 0; z-index: 4; height: 58vh; background: #f6f3ee; }
.lab.narrow .lab-bar { padding: 8px 10px; gap: 8px; }
.lab.narrow .lab-sun { min-width: 100%; }
.lab.narrow .lab-caption { display: none; }
.lab.narrow .lab-notebook { border-right: 0; }
</style>
