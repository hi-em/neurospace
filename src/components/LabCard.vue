<template>
  <section class="card" :class="{ compact: free }" aria-label="Experiment">

    <!-- Pick: the questions are the way in -->
    <template v-if="state === 'pick'">
      <header class="head"><h2>What do you want to test?</h2><span>{{ questions.length }} questions</span></header>
      <div class="body">
        <p class="lede">Pick a question. Change one thing. The lab estimates what it does to the person inside.</p>
        <div class="qgrid">
          <button v-for="q in questions" :key="q.id" class="q" @click="$emit('pick', q)">
            <img v-if="thumbs[q.id]" :src="thumbs[q.id]" alt="" />
            <span v-else class="q-ph"></span>
            <span class="q-t"><NsIcon :name="PARAMS[q.keys[0]].icon" :size="14" :color="dimColor(q.keys[0])" />{{ q.text }}</span>
          </button>
          <button class="q add" @click="$emit('custom')"><NsIcon name="plus" :size="20" /><span>Ask your own</span></button>
          <button class="q add" @click="$emit('pick', null)"><NsIcon name="split" :size="20" /><span>Free play</span></button>
        </div>
      </div>
    </template>

    <!-- Your own question -->
    <template v-else-if="state === 'custom'">
      <header class="head"><h2>Your question</h2><span>new</span></header>
      <div class="body">
        <div class="step"><p class="n">01 · Ask it</p>
          <label class="sr" for="own-q">Your question</label>
          <input id="own-q" v-model="draft" class="field" placeholder="Can a low room feel open if it has enough light?" maxlength="90" />
        </div>
        <div class="step"><p class="n">02 · Choose what you'll change</p>
          <div class="chips" role="group" aria-label="Parameters">
            <button v-for="k in PARAM_KEYS" :key="k" class="chip" :class="{ on: picks.includes(k) }" :aria-pressed="picks.includes(k)" @click="toggle(k)">
              <NsIcon :name="PARAMS[k].icon" :size="14" :color="dimColor(k)" />{{ PARAMS[k].label }}
            </button>
          </div>
          <p class="note">Everything else is held at the control. Your question joins the list and travels in the share link.</p>
        </div>
        <div class="step btns">
          <button class="btn k" :disabled="!draft.trim() || !picks.length" @click="$emit('save', { text: draft.trim(), keys: picks })">Start experiment</button>
          <button class="btn" @click="$emit('back')">Cancel</button>
        </div>
      </div>
    </template>

    <!-- The experiment -->
    <template v-else>
      <header class="head">
        <h2>Experiment {{ String(log.length + 1).padStart(2, '0') }}</h2>
        <button class="link" @click="$emit('back')">All questions</button>
      </header>
      <div class="body">
        <div v-if="!free" class="step">
          <p class="n">01 · Question</p>
          <div class="qhead"><img v-if="thumbs[question.id]" :src="thumbs[question.id]" alt="" /><p>{{ question.text }}</p></div>
        </div>
        <div v-if="!free" class="step">
          <p class="n">02 · Change one thing</p>
          <LabSlider v-for="k in question.keys" :key="k" :k="k" :value="variant[k]" :control="control[k]" @set="(key, v) => $emit('set', key, v)" />
          <button class="link more" @click="$emit('free', true)">+ {{ 7 - question.keys.length }} others, held at the control</button>
        </div>
        <div class="step">
          <p class="n">{{ free ? 'Free play · observe' : '03 · Observe' }}</p>
          <div class="obs" aria-live="polite">
            <span class="a">{{ controlScore }}</span><span aria-hidden="true">→</span><span class="b">{{ variantScore }}</span>
            <span class="d" :class="delta > 0 ? 'up' : delta < 0 ? 'dn' : ''">{{ delta > 0 ? '+' : '' }}{{ delta }}</span>
          </div>
          <p class="lbl">{{ label }} · variant vs control</p>
          <PetalRose v-if="!free" :variant="variant" :control="control" :center="variantScore" :size="260" />
          <p v-if="!free" class="hyp">{{ hypothesis }}</p>
          <button v-if="free" class="link" @click="$emit('free', false)">Back to one question</button>
        </div>
        <div class="step">
          <p class="n">{{ free ? 'Log' : '04 · Log' }}</p>
          <div class="btns">
            <button class="btn k" @click="$emit('log')"><NsIcon name="log" :size="14" />Log result</button>
            <button class="btn" @click="$emit('promote')">Make this the control</button>
          </div>
        </div>
      </div>
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
  free: Boolean,
  log: { type: Array, default: () => [] },
})
defineEmits(['pick', 'custom', 'save', 'back', 'set', 'free', 'log', 'promote'])

const dimColor = k => dimOf(PARAMS[k].dim).color
const delta = computed(() => props.variantScore - props.controlScore)
const label = computed(() => getScoreLabel(props.variantScore).label)
const hypothesis = computed(() => props.question ? (dimensionMeta[PARAMS[props.question.keys[0]].dim]?.hypothesis(props.variant) ?? '') : '')

const draft = ref('')
const picks = ref([])
const toggle = k => { picks.value = picks.value.includes(k) ? picks.value.filter(x => x !== k) : [...picks.value, k] }
watch(() => props.state, s => { if (s === 'custom') { draft.value = ''; picks.value = [] } })
</script>

<style scoped>
.card { display: flex; flex-direction: column; background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: var(--ns-r-card); box-shadow: var(--ns-e2); overflow: hidden; min-height: 0; }
.head { display: flex; justify-content: space-between; align-items: baseline; padding: var(--ns-s3) var(--ns-s4); border-bottom: 1px solid var(--ns-line); }
.head h2 { margin: 0; font: 700 var(--ns-t-title) var(--ns-sans); }
.head span { font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); }
.body { overflow-y: auto; min-height: 0; }
.lede { margin: 0; padding: var(--ns-s3) var(--ns-s4) 0; color: var(--ns-ink-2); font-size: var(--ns-t-body); line-height: var(--ns-lh); }
.qgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: var(--ns-s3) var(--ns-s4) var(--ns-s4); }
.q { display: flex; flex-direction: column; gap: 6px; text-align: left; border: 1px solid var(--ns-line); border-radius: 12px; background: #fff; padding: 8px; cursor: pointer; font: inherit; color: inherit; transition: border-color var(--ns-fast), transform var(--ns-fast) var(--ns-ease); }
.q:hover { border-color: var(--ns-ink); transform: translateY(-1px); }
.q img, .q-ph { width: 100%; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--ns-paper); object-fit: cover; }
.q-t { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; line-height: 1.3; }
.q.add { border-style: dashed; align-items: center; justify-content: center; color: var(--ns-mute); min-height: 110px; font-size: 12px; }
.step { padding: var(--ns-s3) var(--ns-s4); border-bottom: 1px solid var(--ns-line); }
.n { margin: 0 0 var(--ns-s2); font: 500 var(--ns-t-micro) var(--ns-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--ns-red); }
.qhead { display: flex; gap: 10px; align-items: center; }
.qhead img { width: 76px; height: 57px; border-radius: 8px; background: var(--ns-paper); object-fit: cover; }
.qhead p { margin: 0; font-size: var(--ns-t-body); }
.obs { display: flex; align-items: baseline; gap: 10px; }
.a { font-size: 24px; color: var(--ns-mute); }
.b { font: 700 var(--ns-t-score) var(--ns-sans); letter-spacing: -.03em; }
.d { font: 700 14px var(--ns-mono); }
.up { color: var(--ns-green); } .dn { color: var(--ns-red); }
.lbl { margin: 2px 0 0; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-mute); }
.hyp { margin: var(--ns-s2) 0 0; font-size: 12.5px; color: var(--ns-ink-2); line-height: var(--ns-lh); }
.btns { display: flex; gap: var(--ns-s2); flex-wrap: wrap; }
.btn { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--ns-line); background: #fff; border-radius: var(--ns-r-pill); padding: 8px 14px; font: var(--ns-t-ui) var(--ns-mono); cursor: pointer; color: var(--ns-ink); }
.btn.k { background: var(--ns-ink); color: #fff; border-color: var(--ns-ink); }
.btn:disabled { opacity: .4; cursor: default; }
.link { background: none; border: 0; padding: 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.more { margin-top: var(--ns-s3); }
.field { width: 100%; border: 1px solid var(--ns-line); border-radius: 10px; padding: 10px 12px; font: var(--ns-t-body) var(--ns-sans); background: #fff; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--ns-line); background: #fff; border-radius: var(--ns-r-pill); padding: 6px 10px; font: 12px var(--ns-sans); cursor: pointer; color: var(--ns-ink); }
.chip.on { border-color: var(--ns-ink); box-shadow: inset 0 0 0 1px var(--ns-ink); }
.note { margin: var(--ns-s2) 0 0; font-size: 12px; color: var(--ns-mute); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }
</style>
