<template>
  <Transition name="drawer">
    <div v-if="open" class="dr-scrim" @click.self="$emit('close')">
      <aside class="dr" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title" ref="panel" tabindex="-1">
        <header class="dr-head">
          <h2>{{ title }}</h2>
          <button class="dr-close" @click="$emit('close')" aria-label="Close">×</button>
        </header>
        <div class="dr-body"><slot /></div>
      </aside>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
const props = defineProps({ open: Boolean, title: String, wide: Boolean })
const emit = defineEmits(['close'])
const panel = ref(null)
const onKey = e => { if (e.key === 'Escape') emit('close') }
watch(() => props.open, async o => {
  if (o) { document.addEventListener('keydown', onKey); await nextTick(); panel.value?.focus() }
  else document.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.dr-scrim { position: fixed; inset: 0; background: #1111; z-index: 50; display: flex; justify-content: flex-end; }
.dr { width: min(760px, 100%); height: 100%; background: var(--ns-surface); box-shadow: -20px 0 60px #0002; display: flex; flex-direction: column; outline: none; }
.dr.wide { width: min(1080px, 100%); background: var(--ns-sunk); }
.dr-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--ns-line); background: var(--ns-surface); }
.dr-head h2 { margin: 0; font: 700 var(--ns-t-title) var(--ns-sans); }
.dr-close { border: 0; background: none; font-size: 26px; line-height: 1; cursor: pointer; padding: 0 6px; }
.dr-close:focus-visible { outline: 2px solid var(--ns-red); }
.dr-body { overflow-y: auto; flex: 1; }
.drawer-enter-active, .drawer-leave-active { transition: opacity .2s ease; }
.drawer-enter-active .dr, .drawer-leave-active .dr { transition: transform .25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .dr, .drawer-leave-to .dr { transform: translateX(40px); }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .dr, .drawer-leave-active .dr { transition: none; } }
</style>
