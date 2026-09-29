<template>
  <div class="sl" :class="{ held }">
    <div class="row">
      <label :for="id"><NsIcon :name="p.icon" :size="16" :color="color" />{{ p.label }}</label>
      <b>{{ k === 'Potted Plants' ? `${value} / ${p.max}` : fmt(k, value) }}</b>
    </div>

    <!-- Plants: real 3D plants, dragged onto the floor or tapped in -->
    <template v-if="k === 'Potted Plants'">
      <div class="plants" role="group" aria-label="Add a plant">
        <button v-for="s in SIZES" :key="s" class="tile" draggable="true" :disabled="value >= p.max"
          @dragstart="e => drag(e, s)" @click="$emit('set', k, Math.min(p.max, value + 1))" :aria-label="`Add a ${s} plant`" :title="`Drag a ${s} plant onto the floor, or click to add one`">
          <img v-if="icons[s]" :src="icons[s]" alt="" draggable="false" />
          <span v-else class="ph"></span>
          <span class="nm">{{ s }}</span>
        </button>
        <button class="minus" :disabled="!value" @click="$emit('set', k, value - 1)" aria-label="Remove a plant">−</button>
      </div>
      <p class="ctl">control {{ control }} · drag onto the floor, or click</p>
    </template>

    <template v-else>
      <div class="track" :style="{ '--c': color, '--f': fill, '--g': ghost }">
        <input :id="id" type="range" :min="p.min" :max="p.max" :step="p.step" :value="value"
          :aria-valuetext="fmt(k, value)" @input="$emit('set', k, Number($event.target.value))" />
        <i class="ghost" :title="`control ${fmt(k, control)}`"></i>
      </div>
      <p class="ctl">control {{ fmt(k, control) }}</p>
    </template>
  </div>
</template>

<script>
import { reactive } from 'vue'
import { renderPlant } from '../geometry/thumbs.js'
// one render per size for the whole app, made on first use
const icons = reactive({})
const SIZES = ['small', 'medium', 'large']
let queued = false
function makeIcons() {
  if (queued) return
  queued = true
  const next = () => { const s = SIZES.find(x => !icons[x]); if (!s) return; icons[s] = renderPlant(s, { w: 88, h: 88 }); (window.requestIdleCallback || setTimeout)(next) }
  next()
}
</script>

<script setup>
import { computed, onMounted } from 'vue'
import NsIcon from './NsIcon.vue'
import { PARAMS, dimOf, fmt } from '../utils/lab.js'
const props = defineProps({ k: { type: String, required: true }, value: Number, control: Number, held: Boolean })
defineEmits(['set'])
const p = computed(() => PARAMS[props.k])
const color = computed(() => dimOf(p.value.dim).color)
const id = computed(() => 'sl-' + props.k.replace(/\s+/g, '-'))
const frac = v => (v - p.value.min) / (p.value.max - p.value.min)
const ghost = computed(() => frac(props.control))
const fill = computed(() => frac(props.value))
onMounted(() => { if (props.k === 'Potted Plants') makeIcons() })

function drag(e, s) {
  e.dataTransfer.setData('application/x-ns-plant', s)
  e.dataTransfer.effectAllowed = 'copy'
  const img = e.currentTarget.querySelector('img')
  if (img) e.dataTransfer.setDragImage(img, 36, 60)
}
</script>

<style scoped>
.sl { padding: 6px 0; }
.sl.held { opacity: .78; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: var(--ns-t-body); }
.row label { display: flex; gap: 6px; align-items: center; min-width: 0; }
.row b { font: 500 var(--ns-t-ui) var(--ns-mono); white-space: nowrap; }

/* A thin track filled in the dimension's colour up to the value; the control is
   a short ink tick on the track. */
.track { position: relative; height: 20px; margin: 4px 0 0; }
.track::before { content: ''; position: absolute; left: 7px; right: 7px; top: 50%; height: 4px; transform: translateY(-50%); border-radius: 2px;
  background: linear-gradient(to right, var(--c) calc(var(--f) * 100%), var(--ns-line) calc(var(--f) * 100%)); }
.track input { position: relative; width: 100%; margin: 0; height: 20px; background: none; appearance: none; -webkit-appearance: none; cursor: pointer; }
.track input::-webkit-slider-runnable-track { height: 20px; background: none; }
.track input::-moz-range-track { height: 20px; background: none; }
.track input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: 3px; border-radius: 50%; background: #fff; border: 2px solid var(--c); box-shadow: var(--ns-e1); transition: transform var(--ns-fast) var(--ns-ease); }
.track input::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--c); }
.track input:active::-webkit-slider-thumb { transform: scale(1.15); }
.ghost { position: absolute; top: 50%; left: calc(7px + var(--g) * (100% - 14px)); transform: translate(-1px, -50%); width: 2px; height: 12px; background: var(--ns-ink); opacity: .45; border-radius: 1px; pointer-events: none; }
.ctl { margin: 0; font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .04em; color: var(--ns-mute); }

.plants { display: grid; grid-template-columns: repeat(3, 1fr) 32px; gap: 6px; margin: 6px 0 4px; }
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0; padding: 4px 4px 5px; border: 1px solid var(--ns-line); border-radius: 10px; background: #fff; cursor: grab; color: var(--ns-ink);
  transition: border-color var(--ns-fast), transform var(--ns-fast) var(--ns-ease), box-shadow var(--ns-fast); }
.tile:hover:not(:disabled) { border-color: var(--ns-d-plants); transform: translateY(-1px); box-shadow: var(--ns-e1); }
.tile:active { cursor: grabbing; }
.tile:disabled { opacity: .4; cursor: default; }
.tile img, .tile .ph { width: 100%; max-width: 64px; aspect-ratio: 1; object-fit: contain; }
.tile .ph { border-radius: 8px; background: var(--ns-paper); }
.nm { font: var(--ns-t-micro) var(--ns-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--ns-mute); }
.minus { border: 1px solid var(--ns-line); border-radius: 10px; background: #fff; font: 16px var(--ns-mono); cursor: pointer; color: var(--ns-ink); }
.minus:disabled { opacity: .4; cursor: default; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }
</style>
