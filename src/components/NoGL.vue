<template>
  <!-- The room as a picture, for a browser that cannot draw it: the questions,
       the sliders and the score never needed 3D, so the lab stays open. -->
  <div class="nogl" :style="{ paddingLeft: inset + 'px' }">
    <img :src="bakedRoom" alt="The NeuroSpace room, a tensioned membrane with arched openings, as a still picture" />
    <p><b>WebGL is off in your browser</b>Turn it on for the geometry to show. Until then, this is a picture of the room; the questions and the score still work.</p>
  </div>
</template>

<script setup>
import { bakedRoom } from '../utils/webgl.js'
defineProps({ inset: { type: Number, default: 0 } })
</script>

<style scoped>
.nogl { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding-bottom: 72px; }
.nogl img { width: min(58%, 760px); border-radius: var(--ns-r-card); box-shadow: 0 12px 30px #00000014; }
.nogl p { margin: 0; max-width: 520px; padding: 0 16px; text-align: center; font: 14px/1.45 var(--ns-sans); color: var(--ns-ink-2); }
.nogl b { display: block; margin-bottom: 4px; font: 600 11px/1.4 var(--ns-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--ns-red); }
</style>
