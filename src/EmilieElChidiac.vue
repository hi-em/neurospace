<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

import GeometryView from './components/GeometryView.vue'
import LabCard      from './components/LabCard.vue'
import LabDrawer    from './components/LabDrawer.vue'
import LabReport    from './components/LabReport.vue'
import ScoreFlow    from './components/ScoreFlow.vue'
import ScoreMatrix  from './components/ScoreMatrix.vue'
import NsIcon       from './components/NsIcon.vue'

import { calculateNeuroScore, getParameterContributions, dimensionMeta, paramInfo } from './utils/neuroScore.js'
import { CONTROL, QUESTIONS, PARAMS, PARAM_KEYS, DIMS, describeChange, encodeState, decodeState, iconState } from './utils/lab.js'
import { renderThumb } from './geometry/thumbs.js'
import './styles/base.css'

// ── The experiment: a control room and a variant (yours) ─────────────────────
const control = reactive({ ...CONTROL })
const variant = reactive({ ...CONTROL })
const controlScore = computed(() => calculateNeuroScore(control))
const variantScore = computed(() => calculateNeuroScore(variant))

const card = ref('pick')                  // pick → experiment, or custom
const question = ref(null)                // null in an experiment: free play
const custom = ref(loadCustom())
const questions = computed(() => [...QUESTIONS, ...custom.value])

function pick(q) {
  Object.assign(variant, control, q?.start ?? {})
  question.value = q
  card.value = 'exp'
  // on a phone, bring the experiment up to just under the pinned room and band
  if (narrow.value) nextTick(() => {
    const c = document.querySelector('.lab.narrow .card'), d = document.querySelector('.lab.narrow .dock')
    if (c && d) window.scrollTo({ top: c.offsetTop - d.getBoundingClientRect().bottom + 4, behavior: reduceMotion ? 'auto' : 'smooth' })
  })
}
function saveCustom({ text, keys }) {
  const q = { id: 'u' + Date.now().toString(36), text, keys, start: {}, own: true }
  custom.value = [...custom.value, q]
  try { localStorage.setItem('ns-questions', JSON.stringify(custom.value)) } catch {}
  pick(q)
  makeThumbs()
}
function loadCustom() { try { return JSON.parse(localStorage.getItem('ns-questions') || '[]') } catch { return [] } }
const setParam = (k, v) => { variant[k] = v }
// Placing plants: pick a size in the card, then click the floor of the variant
const placing = ref(null)
function placePlants(size) {
  placing.value = size
  if (size && compare.value === 'control') compare.value = 'variant'
}
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
const VIEWS = [['isometric', 'outside', 'Outside'], ['walk', 'inside', 'Inside'], ['plan', 'plan', 'Plan']]
const SWATCHES = [
  { hex: '#F4F0E8', label: 'Fabric' }, { hex: '#C50000', label: 'NeuroSpace red' }, { hex: '#1a1a1a', label: 'Black' },
  { hex: '#DEB887', label: 'Wood' }, { hex: '#B8B0A8', label: 'Concrete' },
]
const geoMain = ref(null), geoVariant = ref(null)
const narrow = ref(!!window.matchMedia?.('(max-width: 900px)').matches)   // known before the views mount
const vw = ref(window.innerWidth)
const onResize = () => { vw.value = window.innerWidth }

// The card floats over the room; collapsed to its mini bar, the room takes the
// whole stage. The views shift their lens by the width the card covers.
const RAIL = 16 + 360 + 16
const collapsed = ref(readPref('ns-card') === 'mini')
const setCollapsed = v => { collapsed.value = v; writePref('ns-card', v ? 'mini' : 'open') }
const inset = computed(() => (narrow.value || collapsed.value) ? 0 : RAIL)
// On a narrower stage the band drops its words and keeps its icons; narrower
// still, it leaves the room's side and runs full width under the card.
const compact = computed(() => vw.value - inset.value < 1040)
const tight = computed(() => !narrow.value && inset.value > 0 && vw.value - inset.value < 720)
const swatchOpen = ref(false)
function readPref(k) { try { return localStorage.getItem(k) } catch { return null } }
function writePref(k, v) { try { localStorage.setItem(k, v) } catch {} }

// Plan cut height, metres: from knee height to the crown. At 1 m the arches
// cut through the section, so the openings read as gaps, as in a drawn plan.
const cut = ref(1)
const cutMax = computed(() => Math.max(0.6, +variant['Height']))

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
const deltaNow = computed(() => variantScore.value - controlScore.value)
function logResult() {
  const view = compare.value === 'split' ? geoVariant.value : (shownData.value === variant ? geoMain.value : null)
  const cc = getParameterContributions(control), cv = getParameterContributions(variant)
  log.value.push({
    dataUrl: view?.captureScreenshot() ?? '',
    from: controlScore.value, score: variantScore.value, delta: variantScore.value - controlScore.value,
    change: describeChange(control, variant),
    params: { ...variant }, control: { ...control },
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
  card.value = 'exp'
}

// ── 3D icons: rendered by the solver, after first paint ──────────────────────
const thumbs = reactive({})
let thumbing = false
function makeThumbs() {
  if (thumbing) return
  thumbing = true
  const next = () => {
    const q = questions.value.find(q => !thumbs[q.id])
    if (!q) { thumbing = false; return }
    thumbs[q.id] = renderThumb({ ...CONTROL, ...iconState(q) })
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
  window.addEventListener('resize', onResize)
  restore()
  await nextTick()
  setTimeout(makeThumbs, 400)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('keyup', onKey)
  window.removeEventListener('resize', onResize)
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
  <div class="lab" :class="{ narrow, split: compare === 'split' && !narrow, collapsed, compact, tight }" :style="{ '--inset': inset + 'px' }">

    <!-- Stage: the room, full-bleed under everything -->
    <main class="stage" aria-label="Room">
      <template v-if="compare === 'split' && !narrow">
        <figure class="view">
          <GeometryView :data="control" :score="controlScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig" :interactive="false" label="Control"
            :inset-left="inset" :cut-height="cut" />
          <figcaption class="tag" :style="{ left: `calc(50% + ${inset / 2}px)` }">Control · {{ controlScore }}</figcaption>
        </figure>
        <figure class="view">
          <GeometryView ref="geoVariant" :data="variant" :score="variantScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig" label="Variant"
            :cut-height="cut" @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" @sun-hour="hour = $event" :placing="placing" @placing-done="placing = null" />
          <figcaption class="tag dark">Variant · {{ variantScore }}</figcaption>
        </figure>
        <!-- the difference, on the seam between the two rooms -->
        <div class="delta" :class="deltaNow > 0 ? 'up' : deltaNow < 0 ? 'dn' : ''" aria-live="polite">
          <b>{{ deltaNow > 0 ? '+' : '' }}{{ deltaNow }}</b><span>variant<br />vs control</span>
        </div>
      </template>
      <figure v-else class="view">
        <GeometryView ref="geoMain" :data="shownData" :score="shownScore" :mode="mode" :sun-hour="hour" :material-config="materialConfig"
          :label="shownData === control ? 'Control' : 'Variant'" :inset-left="inset" :cut-height="cut"
          @plant-count-changed="variant['Potted Plants'] = $event" @solved="solveMs = $event" @sun-hour="hour = $event" :placing="shownData === variant ? placing : null" @placing-done="placing = null" />
        <figcaption v-if="card === 'exp'" class="tag" :class="{ dark: shownData === variant }" :style="{ left: `calc(50% + ${inset / 2}px)` }">
          {{ shownData === control ? 'Control' : 'Variant' }} · {{ shownScore }}<span v-if="flip"> · held F</span>
        </figcaption>
      </figure>
    </main>

    <!-- Left rail: who and what, then the experiment -->
    <aside class="rail">
      <header class="brand">
        <h1>Neuro<span>Space</span></h1>
        <p>Change one thing in a room; the lab estimates what it does to the person inside.</p>
      </header>
      <LabCard class="card"
        :state="card" :questions="questions" :question="question" :thumbs="thumbs"
        :control="control" :variant="variant" :control-score="controlScore" :variant-score="variantScore"
        :log="log" :collapsed="collapsed && !narrow" :collapsible="!narrow" :placing="placing" @place="placePlants"
        @pick="pick" @custom="card = 'custom'" @save="saveCustom" @back="card = 'pick'"
        @set="setParam" @log="logResult" @promote="promote" @collapse="setCollapsed" @report="drawer = 'report'">
        <template #foot>
          By <a href="https://www.linkedin.com/in/emilieelchidiac/" target="_blank" rel="noopener noreferrer">Emilie El Chidiac</a>
          · research <a href="https://cleovalentine.io/" target="_blank" rel="noopener noreferrer">Dr. Cleo Valentine</a>
        </template>
      </LabCard>
    </aside>

    <!-- Top right: reading and taking the work away -->
    <nav class="bar docbar" aria-label="Lab">
      <button @click="drawer = 'method'" title="How the room and the score are made"><NsIcon name="flow" :size="16" /><span class="w">Method</span></button>
      <button @click="drawer = 'research'" title="The evidence behind each dimension"><NsIcon name="book" :size="16" /><span class="w">Research</span></button>
      <button class="red" @click="drawer = 'report'" title="Report and PDF"><NsIcon name="log" :size="16" /><span class="w">Report</span><span v-if="log.length" class="count">{{ log.length }}</span></button>
      <span class="sep"></span>
      <button @click="share" title="Copy a link to this exact experiment"><NsIcon name="share" :size="16" /><span class="w">Share</span></button>
      <button @click="exportObj" title="Download the membrane as .obj, in metres"><NsIcon name="export" :size="16" /><span class="w">.obj</span></button>
    </nav>

    <!-- Bottom: how you look at the room -->
    <div class="dock">
      <p class="status">membrane form-found live · force density<span v-if="solveMs"> · {{ solveMs.toFixed(1) }} ms</span></p>
      <div class="bar band" role="toolbar" aria-label="View">
        <div class="grp sun" title="Time of day, equinox, Barcelona">
          <NsIcon name="sun" :size="16" color="var(--ns-sun)" />
          <label for="hour" class="t">{{ hourLabel }}</label>
          <input id="hour" class="range" type="range" min="6.5" max="17.5" step="0.05" v-model.number="hour" aria-label="Time of day, equinox, Barcelona"
            :style="{ '--c': 'var(--ns-sun)', '--f': (hour - 6.5) / 11 }" />
          <button class="ib" @click="playDay" :disabled="reduceMotion" :aria-pressed="playing" :aria-label="playing ? 'Pause the day' : 'Play the day'"><NsIcon :name="playing ? 'pause' : 'play'" :size="12" /></button>
        </div>
        <span class="sep"></span>
        <div class="seg" role="group" aria-label="View">
          <button v-for="v in VIEWS" :key="v[0]" :class="{ on: mode === v[0] }" :aria-pressed="mode === v[0]" @click="mode = v[0]" :title="v[2]" :aria-label="v[2]">
            <NsIcon :name="v[1]" :size="16" /><span class="w">{{ v[2] }}</span>
          </button>
        </div>
        <Transition name="grow">
          <div v-if="mode === 'plan'" class="grp cut" title="Plan cut height">
            <NsIcon name="cut" :size="16" />
            <input id="cut" class="range" type="range" min="0.3" :max="cutMax" step="0.1" v-model.number="cut" aria-label="Plan cut height"
              :style="{ '--c': 'var(--ns-ink)', '--f': (cut - 0.3) / Math.max(0.1, cutMax - 0.3) }" />
            <label for="cut" class="t">{{ cut >= cutMax - 0.05 ? 'roof' : cut.toFixed(1) + ' m' }}</label>
          </div>
        </Transition>
        <span class="sep"></span>
        <div class="seg" role="group" aria-label="Compare" title="Hold F to flip to the control">
          <button :class="{ on: compare === 'variant' }" :aria-pressed="compare === 'variant'" @click="compare = 'variant'" aria-label="Variant"><NsIcon name="single" :size="16" /><span class="w">Variant</span></button>
          <button :class="{ on: compare === 'control' }" :aria-pressed="compare === 'control'" @click="compare = 'control'" aria-label="Control"><span class="cdot"></span><span class="w">Control</span></button>
          <button v-if="!narrow" :class="{ on: compare === 'split' }" :aria-pressed="compare === 'split'" @click="compare = 'split'" aria-label="Split"><NsIcon name="split" :size="16" /><span class="w">Split</span></button>
        </div>
        <kbd class="kbd" :class="{ on: flip }" title="Hold F to flip to the control" aria-hidden="true">F</kbd>
        <span class="sep"></span>
        <button class="ib" :class="{ on: materialConfig.pattern === 'grid' }" :aria-pressed="materialConfig.pattern === 'grid'"
          @click="materialConfig.pattern = materialConfig.pattern === 'grid' ? 'solid' : 'grid'" title="Show the cable net the solver works on" aria-label="Cable net"><NsIcon name="net" :size="18" /></button>
        <div class="swatches" :class="{ pop: compact }" role="group" aria-label="Membrane colour">
          <button v-if="compact" class="sw cur" :style="{ background: materialConfig.color }" :aria-expanded="swatchOpen" aria-label="Membrane colour" @click="swatchOpen = !swatchOpen"></button>
          <div v-if="!compact || swatchOpen" class="sw-list">
            <button v-for="c in SWATCHES" :key="c.hex" class="sw" :class="{ on: materialConfig.color === c.hex }" :style="{ background: c.hex }"
              :aria-label="c.label" :title="c.label" :aria-pressed="materialConfig.color === c.hex" @click="materialConfig.color = c.hex; swatchOpen = false"></button>
          </div>
        </div>
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
        <h3>The model as a matrix</h3>
        <p>The same sum, read the way a machine-learning layer is read: seven inputs, a weight matrix, five outputs and one score. Hover a cell for its value.</p>
        <ScoreMatrix mode="weights" :params="variant" />
        <h3>The room</h3>
        <p>One tensioned membrane, form-found in your browser with the force density method (Schek, 1974, written for Frei Otto's Munich Olympic roof). Every node of a cable net sits where its neighbours' pulls balance; with no pressure it is a soap film, with pressure a bubble, inflated only until its crown meets the ring.</p>
        <ul>
          <li><b>Ceiling height</b> lifts the compression ring the film hangs from: the ring is always the top of the room.</li>
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
      <LabReport :control="control" :variant="variant" :control-score="controlScore" :variant-score="variantScore" :log="log"
        :question="question" :hour="hour" :color="materialConfig.color" />
    </LabDrawer>
  </div>
</template>

<style scoped>
.lab { position: fixed; inset: 0; background: var(--ns-sunk); color: var(--ns-ink); font: var(--ns-t-body)/var(--ns-lh) var(--ns-sans); overflow: hidden; }

/* stage: full-bleed; in split the seam sits in the middle of what the card leaves */
.stage { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr; }
.lab.split .stage { grid-template-columns: calc(var(--inset) + (100% - var(--inset)) / 2) 1fr; }
.view { position: relative; margin: 0; min-width: 0; min-height: 0; }
.lab.split .view:first-child { box-shadow: 1px 0 0 var(--ns-line-strong); z-index: 1; }
.tag { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; background: var(--ns-surface); border: 1px solid var(--ns-line); padding: 5px 10px; border-radius: var(--ns-r-pill); pointer-events: none; white-space: nowrap; transition: left var(--ns-slow) var(--ns-ease); }
.tag.dark { background: var(--ns-ink); color: #fff; border-color: var(--ns-ink); }
.delta { position: absolute; top: 50%; left: calc(var(--inset) + (100% - var(--inset)) / 2); transform: translate(-50%, -50%); z-index: 2; width: 96px; height: 96px; border-radius: 50%;
  background: var(--ns-surface); border: 1px solid var(--ns-line); box-shadow: var(--ns-e2); display: grid; place-content: center; text-align: center; gap: 2px; pointer-events: none;
  transition: left var(--ns-slow) var(--ns-ease); }
.delta b { font: 700 28px var(--ns-sans); letter-spacing: -.02em; line-height: 1; }
.delta span { font: 9px/1.2 var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ns-mute); }
.delta.up b { color: var(--ns-green); } .delta.dn b { color: var(--ns-red); }

/* rail: brand, then the card; the card is as tall as its content, never taller than the rail */
.rail { position: absolute; left: 16px; top: 14px; bottom: 16px; width: 360px; display: flex; flex-direction: column; gap: 10px; pointer-events: none; z-index: 5; }
.rail > * { pointer-events: auto; }
.brand h1 { margin: 0; font: 700 18px var(--ns-sans); letter-spacing: -.02em; line-height: 1.2; }
.brand h1 span { color: var(--ns-red); }
.brand p { margin: 2px 0 0; font-size: 12px; line-height: 1.35; color: var(--ns-ink-2); max-width: 340px; }
.card { flex: 0 1 auto; min-height: 0; }
.card :deep(.foot a) { color: inherit; text-underline-offset: 3px; }

/* one bar style for both toolbars: a floating pill of 32-px controls */
.bar { display: flex; align-items: center; gap: 6px; background: #fbfaf7ee; backdrop-filter: blur(8px); border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); box-shadow: var(--ns-e2); padding: 5px; font: var(--ns-t-ui) var(--ns-mono); white-space: nowrap; }
.bar button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; min-width: 32px; padding: 0 10px; border: 0; background: none; border-radius: var(--ns-r-pill); font: 500 var(--ns-t-ui) var(--ns-mono); letter-spacing: .04em; cursor: pointer; color: var(--ns-ink); transition: background var(--ns-fast), color var(--ns-fast); }
.bar button:hover { background: var(--ns-sunk); }
.sep { width: 1px; height: 20px; background: var(--ns-line); flex: none; }

.docbar { position: absolute; top: 14px; right: 16px; z-index: 5; }
.docbar button { text-transform: uppercase; letter-spacing: .08em; }
.docbar .red { color: var(--ns-red); }
.count { display: inline-grid; place-items: center; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--ns-red); color: #fff; font-size: 10px; letter-spacing: 0; }

.dock { position: absolute; bottom: 16px; left: calc(var(--inset) + (100% - var(--inset)) / 2); transform: translateX(-50%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: calc(100% - var(--inset) - 32px); transition: left var(--ns-slow) var(--ns-ease); }
.status { margin: 0; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .06em; color: var(--ns-mute); pointer-events: none; }
.band { max-width: 100%; }
.grp { display: flex; align-items: center; gap: 8px; padding: 0 4px 0 8px; }
.grp .t { font: 500 var(--ns-t-ui) var(--ns-mono); min-width: 38px; }
.cut .t { min-width: 40px; text-align: right; }
.bar .ib { width: 32px; padding: 0; }
.bar .ib.on { background: var(--ns-ink); color: #fff; }
.seg { display: flex; gap: 2px; background: var(--ns-sunk); border-radius: var(--ns-r-pill); padding: 2px; }
.bar .seg button { height: 28px; }
.bar .seg button:hover { background: #fff; }
.bar .seg button.on { background: var(--ns-ink); color: #fff; }
.cdot { width: 14px; height: 14px; border-radius: 50%; border: 1.5px dashed currentColor; box-sizing: border-box; }
.kbd { font: 500 10px var(--ns-mono); border: 1px solid var(--ns-line-strong); border-bottom-width: 2px; border-radius: 5px; padding: 1px 5px; color: var(--ns-mute); background: #fff; transition: all var(--ns-fast); }
.kbd.on { background: var(--ns-ink); color: #fff; border-color: var(--ns-ink); }

/* the time and cut sliders: the same thin filled track as the card's */
.range { width: 120px; height: 20px; margin: 0; appearance: none; -webkit-appearance: none; cursor: pointer; background: none; }
.range::-webkit-slider-runnable-track { height: 20px; border-radius: 2px;
  background: linear-gradient(to right, var(--c) calc(var(--f) * 100%), var(--ns-line) calc(var(--f) * 100%)) center / 100% 4px no-repeat; }
.range::-moz-range-track { height: 4px; background: var(--ns-line); }
.range::-moz-range-progress { height: 4px; background: var(--c); }
.range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: 3px; border-radius: 50%; background: #fff; border: 2px solid var(--c); box-shadow: var(--ns-e1); }
.range::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--c); }
.cut .range { width: 96px; }

.swatches { position: relative; display: flex; align-items: center; padding: 0 6px 0 2px; }
.sw-list { display: flex; gap: 6px; }
.swatches.pop .sw-list { position: absolute; bottom: 44px; right: -6px; background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); box-shadow: var(--ns-e2); padding: 8px 10px; }
.bar .sw { width: 18px; height: 18px; min-width: 0; padding: 0; border-radius: 50%; border: 1px solid #0002; transition: transform var(--ns-fast) var(--ns-ease); }
.bar .sw:hover { transform: scale(1.12); }
.sw.on { outline: 2px solid var(--ns-red); outline-offset: 2px; }

/* tight: the band runs under the card, full width */
.lab.tight .rail { bottom: 78px; }
.lab.tight .dock { left: 50%; max-width: calc(100% - 32px); }
.lab.tight .status { display: none; }
/* collapsed split: the tags sit under the mini card */
.lab.collapsed.split .tag { top: 132px; }

/* compact: icons only */
.lab.compact .w { display: none; }
.lab.compact .range { width: 84px; }
.lab.compact .cut .range { width: 64px; }

.grow-enter-active, .grow-leave-active { transition: opacity var(--ns-slow) var(--ns-ease), max-width var(--ns-slow) var(--ns-ease); overflow: hidden; max-width: 260px; }
.grow-enter-from, .grow-leave-to { opacity: 0; max-width: 0; }

.toast { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); margin: 0; background: var(--ns-ink); color: #fff; font: var(--ns-t-ui) var(--ns-mono); padding: 8px 14px; border-radius: var(--ns-r-pill); z-index: 60; }
.lab button:focus-visible, .lab input:focus-visible, .lab a:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }

.doc { max-width: 760px; margin: 0 auto; padding: 32px 40px 48px; font-size: 14px; line-height: 1.6; color: var(--ns-ink-2); }
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
@media (prefers-reduced-motion: reduce) { .tag, .delta, .dock { transition: none; } }

/* Phones and narrow windows: a slim header (brand left, tools right), the room
   and its band held at the top while you scroll, then the card */
.lab.narrow { position: relative; overflow: visible; min-height: 100vh; display: flex; flex-direction: column; }
.lab.narrow .rail { display: contents; }
.lab.narrow .brand { order: 0; padding: 12px 14px 10px; }
.lab.narrow .brand h1 { line-height: 38px; }
.lab.narrow .brand p { font-size: 11.5px; max-width: none; }
.lab.narrow .docbar { position: absolute; top: 10px; right: 10px; padding: 3px; gap: 2px; box-shadow: var(--ns-e1); }
.lab.narrow .docbar button { height: 30px; min-width: 30px; padding: 0 7px; }
.lab.narrow .docbar .sep { display: none; }
.lab.narrow .stage { order: 2; inset: auto; position: sticky; top: 0; height: 44vh; z-index: 4; background: var(--ns-sunk); }
.lab.narrow .tag { top: 10px; }
.lab.narrow .dock { order: 3; position: sticky; top: 44vh; left: auto; transform: none; max-width: none; z-index: 4; }
.lab.narrow .status { display: none; }
.lab.narrow .band { border-radius: 0; flex-wrap: wrap; justify-content: center; row-gap: 4px; box-shadow: 0 6px 12px -10px #0003; width: 100%; box-sizing: border-box; padding: 6px 10px; }
/* the band on a phone: the time of day across the top, the view tools beneath */
.lab.narrow .grp.sun { flex: 1 1 100%; padding: 0 2px; }
.lab.narrow .grp.sun .range { flex: 1; width: auto; }
.lab.narrow .grp.sun + .sep { display: none; }
.lab.narrow .kbd { display: none; }
.lab.narrow .card { order: 4; margin: 12px; }
.lab.narrow .doc { padding: 20px 18px 40px; }
</style>
