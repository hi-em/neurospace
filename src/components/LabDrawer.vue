<template>
  <Transition name="drawer">
    <div v-if="open" class="dr-scrim" @click.self="$emit('close')">
      <aside class="dr" role="dialog" aria-modal="true" :aria-label="title" ref="panel" tabindex="-1">
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
const props = defineProps({ open: Boolean, title: String })
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
.dr { width: min(760px, 100%); height: 100%; background: #fbfaf7; box-shadow: -20px 0 60px #0002; display: flex; flex-direction: column; outline: none; }
.dr-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #e3ded6; }
.dr-head h2 { margin: 0; font: 700 15px Inter, system-ui, sans-serif; }
.dr-close { border: 0; background: none; font-size: 26px; line-height: 1; cursor: pointer; padding: 0 6px; }
.dr-close:focus-visible { outline: 2px solid #C50000; }
.dr-body { overflow-y: auto; flex: 1; }
.drawer-enter-active, .drawer-leave-active { transition: opacity .2s ease; }
.drawer-enter-active .dr, .drawer-leave-active .dr { transition: transform .25s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .dr, .drawer-leave-to .dr { transform: translateX(40px); }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .dr, .drawer-leave-active .dr { transition: none; } }
</style>
