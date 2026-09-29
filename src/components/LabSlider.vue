<template>
  <div class="sl">
    <div class="row">
      <label :for="id"><NsIcon :name="p.icon" :size="16" :color="color" />{{ p.label }}</label>
      <b>{{ fmt(k, value) }}</b>
    </div>
    <template v-if="k === 'Potted Plants'">
      <div class="plants">
        <button v-for="s in ['small', 'medium', 'large']" :key="s" class="chip" draggable="true"
          @dragstart="e => { e.dataTransfer.setData('text/plain', s); e.dataTransfer.effectAllowed = 'copy' }"
          @click="$emit('set', k, Math.min(5, value + 1))" :aria-label="`Add a ${s} plant`">+ {{ s }}</button>
        <button class="chip" :disabled="!value" @click="$emit('set', k, value - 1)" aria-label="Remove a plant">−</button>
      </div>
      <p class="ctl">control {{ control }} · tap to place, or drag onto the room</p>
    </template>
    <template v-else>
      <div class="track">
        <input :id="id" type="range" :min="p.min" :max="p.max" :step="p.step" :value="value"
          :style="{ accentColor: color }" :aria-valuetext="fmt(k, value)"
          @input="$emit('set', k, Number($event.target.value))" />
        <i class="ghost" :style="{ left: `calc(7px + ${ghost} * (100% - 14px))` }" :title="`control ${fmt(k, control)}`"></i>
      </div>
      <p class="ctl">control {{ fmt(k, control) }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import NsIcon from './NsIcon.vue'
import { PARAMS, dimOf, fmt } from '../utils/lab.js'
const props = defineProps({ k: { type: String, required: true }, value: Number, control: Number })
defineEmits(['set'])
const p = computed(() => PARAMS[props.k])
const color = computed(() => dimOf(p.value.dim).color)
const id = computed(() => 'sl-' + props.k.replace(/\s+/g, '-'))
const ghost = computed(() => (props.control - p.value.min) / (p.value.max - p.value.min))
</script>

<style scoped>
.sl { margin-top: var(--ns-s2); }
.row { display: flex; justify-content: space-between; align-items: center; font-size: var(--ns-t-body); }
.row label { display: flex; gap: 6px; align-items: center; }
.row b { font: 500 var(--ns-t-body) var(--ns-mono); }
.track { position: relative; margin: 8px 0 2px; }
.track input { width: 100%; margin: 0; }
.ghost { position: absolute; top: 50%; transform: translate(-1px, -50%); width: 2px; height: 14px; background: var(--ns-ink); opacity: .35; border-radius: 1px; pointer-events: none; }
.ctl { margin: 2px 0 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); }
.plants { display: flex; gap: 6px; margin-top: var(--ns-s2); }
.chip { flex: 1; padding: 8px 6px; border: 1px dashed var(--ns-line-strong); border-radius: var(--ns-r-control); background: #fff; font: 12px var(--ns-sans); cursor: pointer; color: var(--ns-ink); }
.chip:disabled { opacity: .4; cursor: default; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--ns-red); outline-offset: 2px; }
</style>
