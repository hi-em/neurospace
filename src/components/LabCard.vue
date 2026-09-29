<template>
  <section class="card" :class="{ mini: collapsed }" aria-label="Experiment">

    <!-- Mini: one line that keeps the experiment in view while the room has the screen -->
    <button v-if="collapsed" class="minibar" @click="$emit('collapse', false)" aria-label="Expand the experiment card">
      <img v-if="state === 'exp' && question && thumbs[question.id]" :src="thumbs[question.id]" alt="" />
      <span v-else class="mini-ic"><NsIcon :name="state === 'exp' ? 'split' : 'question'" :size="18" /></span>
      <span class="mini-t">
        <b>{{ state === 'exp' ? (question?.text ?? 'Free play') : 'What do you want to test?' }}</b>
        <span v-if="state === 'exp'" class="mini-s">{{ controlScore }} → {{ variantScore }} <em :class="tone">{{ signed }}</em></span>
        <span v-else class="mini-s">{{ questions.length }} questions</span>
      </span>
      <NsIcon name="expand" :size="18" />
    </button>

    <template v-else>
      <header class="head">
        <h2>{{ state === 'pick' ? 'What do you want to test?' : state === 'custom' ? 'Your question' : `Experiment ${String(log.length + 1).padStart(2, '0')}` }}</h2>
        <button v-if="state === 'exp'" class="link" @click="$emit('back')">All questions</button>
        <button v-if="collapsible" class="icon" @click="$emit('collapse', true)" aria-label="Collapse the card to a mini view" title="Collapse"><NsIcon name="collapse" :size="18" /></button>
      </header>

      <div ref="bodyEl" class="body">
        <!-- Pick: the questions are the way in -->
        <template v-if="state === 'pick'">
          <p class="lede">Pick a question, change one thing, and the lab estimates what it does to the person inside.</p>
          <div class="qgrid">
            <button v-for="q in questions" :key="q.id" class="q" @click="$emit('pick', q)">
              <img v-if="thumbs[q.id]" :src="thumbs[q.id]" alt="" />
              <span v-else class="q-ph"></span>
              <span class="q-t"><NsIcon :name="PARAMS[q.keys[0]].icon" :size="14" :color="dimColor(q.keys[0])" /><span>{{ q.text }}</span></span>
              <span v-if="q.own" class="own">yours</span>
            </button>
            <button class="q add" @click="$emit('custom')"><NsIcon name="plus" :size="20" /><span>Ask your own</span></button>
            <button class="q add" @click="$emit('pick', null)"><NsIcon name="split" :size="20" /><span>Free play</span></button>
          </div>
        </template>

        <!-- Your own question -->
        <template v-else-if="state === 'custom'">
          <div class="step"><p class="n">01 · Ask it</p>
            <label class="sr" for="own-q">Your question</label>
            <input id="own-q" v-model="draft" class="field" placeholder="Can a low room feel open with enough light?" maxlength="90" />
          </div>
          <div class="step"><p class="n">02 · Choose what you'll change</p>
            <div class="chips" role="group" aria-label="Parameters">
              <button v-for="k in PARAM_KEYS" :key="k" class="chip" :class="{ on: picks.includes(k) }" :aria-pressed="picks.includes(k)" @click="toggle(k)">
                <NsIcon :name="PARAMS[k].icon" :size="14" :color="dimColor(k)" />{{ PARAMS[k].label }}
              </button>
            </div>
            <p class="note">Everything else stays at the control. Your question gets its own 3D icon and travels in the share link.</p>
          </div>
          <div class="step btns">
            <button class="btn k" :disabled="!draft.trim() || !picks.length" @click="$emit('save', { text: draft.trim(), keys: picks })">Start experiment</button>
            <button class="btn" @click="$emit('back')">Cancel</button>
          </div>
        </template>

        <!-- The experiment -->
        <template v-else>
          <div class="step">
            <p class="n">01 · Question</p>
            <div class="qhead">
              <img v-if="question && thumbs[question.id]" :src="thumbs[question.id]" alt="" />
              <span v-else class="qh-ic"><NsIcon name="split" :size="20" /></span>
              <p>{{ question?.text ?? 'Free play: every parameter, one room against the control.' }}</p>
            </div>
          </div>

          <div class="step">
            <p class="n">02 · {{ question ? 'Change one thing' : 'Change anything' }}</p>
            <LabSlider v-for="k in mainKeys" :key="k" :k="k" :value="variant[k]" :control="control[k]" :placing="placing" @place="$emit('place', $event)" @set="(key, v) => $emit('set', key, v)" />
            <template v-if="question">
              <button class="link more" :aria-expanded="showAll" @click="showAll = !showAll">
                {{ showAll ? 'Hide the others' : `+ ${otherKeys.length} others, held at the control` }}
              </button>
              <div v-if="showAll" class="others">
                <LabSlider v-for="k in otherKeys" :key="k" :k="k" :value="variant[k]" :control="control[k]" :held="variant[k] === control[k]" :placing="placing" @place="$emit('place', $event)" @set="(key, v) => $emit('set', key, v)" />
              </div>
            </template>
          </div>

          <div class="step">
            <p class="n">03 · Observe</p>
            <div class="obs" aria-live="polite">
              <span class="a">{{ controlScore }}</span><span class="arr" aria-hidden="true">→</span><span class="b">{{ variantScore }}</span>
              <span class="d" :class="tone">{{ signed }}</span>
            </div>
            <p class="lbl">{{ label }}</p>
            <PetalRose :variant="variant" :control="control" :center="variantScore" :size="296" />
            <p v-if="hypothesis" class="hyp">{{ hypothesis }}</p>
          </div>

          <div class="step">
            <p class="n">04 · Log</p>
            <div class="btns">
              <button class="btn k" @click="$emit('log')"><NsIcon name="log" :size="14" />Log result</button>
              <button class="btn" @click="$emit('promote')" title="The variant becomes the new control">Make this the control</button>
            </div>
            <ol v-if="log.length" class="logs" aria-label="Logged experiments">
              <li v-for="(e, i) in log.slice(-3)" :key="i">
                <img :src="e.dataUrl" alt="" />
                <span class="lk">{{ String(log.length - Math.min(3, log.length) + i + 1).padStart(2, '0') }}</span>
                <span class="ls">{{ e.score }} <em :class="e.delta > 0 ? 'up' : e.delta < 0 ? 'dn' : ''">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</em></span>
              </li>
            </ol>
            <button v-if="log.length" class="link" @click="$emit('report')">Open the report ({{ log.length }}) →</button>
          </div>
        </template>
      </div>
      <footer class="foot"><slot name="foot" /></footer>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import NsIcon from './NsIcon.vue'
import LabSlider from './LabSlider.vue'
import PetalRose from './PetalRose.vue'
import { PARAMS, PARAM_KEYS, dimOf } from '../utils/lab.js'
import { dimensionMeta, getScoreLabel } from '../utils/neuroScore.js'

const props = defineProps({
  state: { type: String, default: 'pick' },
  questions: { type: Array, required: true },
  question: { type: Object, default: null },
  thumbs: { type: Object, default: () => ({}) },
  control: { type: Object, required: true },
  variant: { type: Object, required: true },
  controlScore: Number,
  variantScore: Number,
  log: { type: Array, default: () => [] },
  collapsed: Boolean,
  collapsible: { type: Boolean, default: true },
  placing: { type: String, default: null },
})
defineEmits(['pick', 'custom', 'save', 'back', 'set', 'log', 'promote', 'collapse', 'report', 'place'])

const dimColor = k => dimOf(PARAMS[k].dim).color
const delta = computed(() => props.variantScore - props.controlScore)
const signed = computed(() => (delta.value > 0 ? '+' : '') + delta.value)
const tone = computed(() => delta.value > 0 ? 'up' : delta.value < 0 ? 'dn' : '')
const label = computed(() => getScoreLabel(props.variantScore).label)
const mainKeys = computed(() => props.question ? props.question.keys : PARAM_KEYS)
const otherKeys = computed(() => PARAM_KEYS.filter(k => !mainKeys.value.includes(k)))
const hypothesis = computed(() => props.question ? (dimensionMeta[PARAMS[props.question.keys[0]].dim]?.hypothesis(props.variant) ?? '') : '')
const showAll = ref(false)
const bodyEl = ref(null)
// a new state starts at its top
watch(() => `${props.state}|${props.question?.id ?? ''}`, () => { showAll.value = false; if (bodyEl.value) bodyEl.value.scrollTop = 0 })

const draft = ref('')
const picks = ref([])
const toggle = k => { picks.value = picks.value.includes(k) ? picks.value.filter(x => x !== k) : [...picks.value, k] }
watch(() => props.state, s => { if (s === 'custom') { draft.value = ''; picks.value = [] } })
</script>

<style scoped>
.card { display: flex; flex-direction: column; background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: var(--ns-r-card); box-shadow: var(--ns-e2); overflow: hidden; min-height: 0; }
.head { display: flex; align-items: center; gap: var(--ns-s3); padding: 10px 10px 10px var(--ns-s4); border-bottom: 1px solid var(--ns-line); }
.head h2 { margin: 0; flex: 1; min-width: 0; font: 700 var(--ns-t-title) var(--ns-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 1px solid transparent; border-radius: var(--ns-r-control); background: none; cursor: pointer; color: var(--ns-ink-2); }
.icon:hover { border-color: var(--ns-line); background: #fff; }
.body { overflow-y: auto; min-height: 0; overscroll-behavior: contain; }
.foot { padding: 9px var(--ns-s4); border-top: 1px solid var(--ns-line); font: var(--ns-t-micro) var(--ns-mono); color: var(--ns-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foot:empty { display: none; }

.lede { margin: 0; padding: var(--ns-s3) var(--ns-s4) 0; color: var(--ns-ink-2); font-size: var(--ns-t-body); line-height: var(--ns-lh); }
.qgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: var(--ns-s3) var(--ns-s4) var(--ns-s4); }
.q { position: relative; display: flex; flex-direction: column; gap: 6px; text-align: left; border: 1px solid var(--ns-line); border-radius: 12px; background: #fff; padding: 8px; cursor: pointer; font: inherit; color: inherit; transition: border-color var(--ns-fast), transform var(--ns-fast) var(--ns-ease); }
.q:hover { border-color: var(--ns-ink); transform: translateY(-1px); }
.q img, .q-ph { width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--ns-paper); object-fit: cover; }
.q-ph { background: linear-gradient(90deg, var(--ns-paper), var(--ns-sunk), var(--ns-paper)); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
.q-t { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; line-height: 1.3; }
.q-t :deep(svg) { flex: none; margin-top: 1px; }
.own { position: absolute; top: 12px; left: 12px; font: 500 9px var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; background: var(--ns-ink); color: #fff; border-radius: var(--ns-r-pill); padding: 2px 6px; }
.q.add { border-style: dashed; align-items: center; justify-content: center; color: var(--ns-mute); min-height: 110px; font-size: 12px; }

.step { padding: var(--ns-s3) var(--ns-s4); border-bottom: 1px solid var(--ns-line); }
.step:last-child { border-bottom: 0; }
.n { margin: 0 0 var(--ns-s2); font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ns-red); }
.qhead { display: flex; gap: 10px; align-items: center; }
.qhead img, .qh-ic { width: 72px; height: 54px; flex: none; border-radius: 8px; background: var(--ns-paper); object-fit: cover; }
.qh-ic { display: grid; place-items: center; color: var(--ns-mute); }
.qhead p { margin: 0; font-size: var(--ns-t-body); line-height: 1.35; }
.others { margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--ns-line); }

.obs { display: flex; align-items: baseline; gap: 8px; }
.a { font-size: 22px; color: var(--ns-mute); }
.arr { color: var(--ns-mute); }
.b { font: 700 var(--ns-t-score) var(--ns-sans); letter-spacing: -.03em; line-height: 1; }
.d { font: 700 14px var(--ns-mono); }
.up { color: var(--ns-green); } .dn { color: var(--ns-red); }
.lbl { margin: 4px 0 0; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-ink-2); }
.lbl span { color: var(--ns-mute); }
.hyp { margin: var(--ns-s2) 0 0; font-size: 12.5px; color: var(--ns-ink-2); line-height: var(--ns-lh); }

.btns { display: flex; gap: var(--ns-s2); flex-wrap: wrap; }
.btn { display: inline-flex; gap: 6px; align-items: center; height: 32px; border: 1px solid var(--ns-line); background: #fff; border-radius: var(--ns-r-pill); padding: 0 14px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; color: var(--ns-ink); }
.btn:hover { border-color: var(--ns-ink); }
.btn.k { background: var(--ns-ink); color: #fff; border-color: var(--ns-ink); }
.btn:disabled { opacity: .4; cursor: default; }
.link { background: none; border: 0; padding: 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; white-space: nowrap; }
.link:hover { color: var(--ns-ink); }
.more { margin-top: var(--ns-s2); }
.logs { list-style: none; margin: var(--ns-s3) 0 var(--ns-s2); padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.logs li { display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; align-items: baseline; background: #fff; border: 1px solid var(--ns-line); border-radius: 10px; padding: 5px; }
.logs img { grid-column: 1 / -1; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; background: var(--ns-paper); }
.lk { font: var(--ns-t-micro) var(--ns-mono); color: var(--ns-mute); }
.ls { font: 700 12px var(--ns-sans); text-align: right; }
.ls em { font: normal 700 10px var(--ns-mono); }

.field { width: 100%; box-sizing: border-box; border: 1px solid var(--ns-line); border-radius: 10px; padding: 10px 12px; font: var(--ns-t-body) var(--ns-sans); background: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--ns-line); background: #fff; border-radius: var(--ns-r-pill); padding: 6px 10px; font: 12px var(--ns-sans); cursor: pointer; color: var(--ns-ink); }
.chip.on { border-color: var(--ns-ink); box-shadow: inset 0 0 0 1px var(--ns-ink); }
.note { margin: var(--ns-s2) 0 0; font-size: 12px; color: var(--ns-mute); line-height: 1.4; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* mini */
.minibar { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px 8px 8px; border: 0; background: none; cursor: pointer; text-align: left; font: inherit; color: var(--ns-ink); }
.minibar img, .mini-ic { width: 52px; height: 39px; flex: none; border-radius: 8px; background: var(--ns-paper); object-fit: cover; display: grid; place-items: center; color: var(--ns-mute); }
.mini-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mini-t b { font: 600 12.5px var(--ns-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-s { font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-ink-2); }
.mini-s em { font-style: normal; font-weight: 700; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .q-ph { animation: none; } }
</style>
