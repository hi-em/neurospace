<template>
  <span class="ns-icon" :style="color ? { color } : null" aria-hidden="true" v-html="markup"></span>
</template>

<script setup>
import { computed } from 'vue'
import { svg } from '../utils/icons.js'
const props = defineProps({ name: { type: String, required: true }, size: { type: Number, default: 16 }, color: String })
const markup = computed(() => svg(props.name, props.size))
</script>

<style scoped>
.ns-icon { display: inline-flex; flex: none; line-height: 0; }
</style>
