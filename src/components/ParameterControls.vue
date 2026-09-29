<template>
  <div class="ns-controls-panel">

    <!-- Tab header -->
    <div class="ns-controls-header">
      <div class="ns-panel-tabs">
        <button
          :class="['ns-panel-tab', { active: activeTab === 'params' }]"
          @click="activeTab = 'params'"
        >Parameters</button>
        <button
          :class="['ns-panel-tab', { active: activeTab === 'scoring' }]"
          @click="activeTab = 'scoring'"
        >Scoring</button>
      </div>
      <p v-if="activeTab === 'params'" class="ns-controls-subtitle">
        Adjust spatial variables · click label for research context
      </p>
      <p v-else class="ns-controls-subtitle">
        How each dimension is scored
      </p>
    </div>

    <!-- One-time onboarding hint (parameters tab only) -->
    <div v-if="showOnboarding && activeTab === 'params'" class="ns-onboarding">
      <ol class="ns-onboarding-list">
        <li>Drag sliders to adjust spatial parameters</li>
        <li>Watch your NeuroScore update live</li>
        <li>Scroll down to view your Analysis Report</li>
      </ol>
      <button class="ns-onboarding-close" @click="dismissOnboarding" title="Dismiss">✕</button>
    </div>

    <!-- ── PARAMETERS TAB ──────────────────────────────────── -->
    <div v-if="activeTab === 'params'" class="ns-controls-body">
      <div
        v-for="group in paramGroups"
        :key="group.name"
        class="ns-param-group"
      >
        <p class="ns-param-group-label">{{ group.name }}</p>

        <div
          v-for="ghKey in group.keys"
          :key="ghKey"
          class="ns-param-item"
        >
          <div class="ns-param-header">
            <span
              class="ns-param-label ns-param-label-info"
              :class="{ active: activeTooltip === ghKey }"
              @click="toggleTooltip(ghKey)"
              :title="'Research context for ' + paramInfo[ghKey].label"
            >{{ paramInfo[ghKey].label }}<sup class="ns-info-dot">?</sup></span>
            <span class="ns-param-value">{{ formatValue(ghKey, localValues[ghKey]) }}</span>
          </div>

          <!-- Research tooltip -->
          <div v-if="activeTooltip === ghKey" class="ns-tooltip">
            <p class="ns-tooltip-text">{{ paramInfo[ghKey].text }}</p>
            <p class="ns-tooltip-source">{{ paramInfo[ghKey].source }}</p>
          </div>

          <!-- Slider -->
          <input
            type="range"
            class="ns-slider"
            :min="paramInfo[ghKey].min"
            :max="paramInfo[ghKey].max"
            :step="paramInfo[ghKey].step"
            v-model.number="localValues[ghKey]"
            :style="sliderStyle(ghKey)"
            @input="onSliderInput(ghKey)"
            @mouseup="emit('update', localValues[ghKey], ghKey)"
            @touchend="emit('update', localValues[ghKey], ghKey)"
          />
        </div>

        <!-- Greenery (drag-to-place) — inside the Biophilic & Biomorphic group -->
        <div v-if="group.name === 'Biophilic & Biomorphic'" class="ns-param-item">
          <div class="ns-param-header">
            <span
              class="ns-param-label ns-param-label-info"
              :class="{ active: activeTooltip === '_greenery' }"
              @click="toggleTooltip('_greenery')"
              :title="'Research context for ' + greeneryInfo.label"
            >{{ greeneryInfo.label }}<sup class="ns-info-dot">?</sup></span>
            <span class="ns-param-value">{{ plantCount }}</span>
          </div>

          <!-- Research tooltip -->
          <div v-if="activeTooltip === '_greenery'" class="ns-tooltip">
            <p class="ns-tooltip-text">{{ greeneryInfo.text }}</p>
            <p class="ns-tooltip-source">{{ greeneryInfo.source }}</p>
          </div>

          <div class="ns-plant-palette">
            <p class="ns-plant-hint">Drag a plant onto the scene to place it</p>

            <div class="ns-plant-sizes">
              <div
                v-for="s in plantSizes"
                :key="s.key"
                class="ns-plant-chip"
                :title="'Drag ' + s.label + ' plant'"
                draggable="true"
                @dragstart="onPlantDragStart($event, s.key)"
              >
                <svg class="ns-plant-svg" :style="{ width: s.iconSize + 'px', height: s.iconSize + 'px' }" viewBox="0 0 32 32" fill="none">
                  <rect x="11" y="22" width="10" height="8" rx="1.5" fill="#B5651D"/>
                  <rect x="12" y="21" width="8" height="2" rx="1" fill="#A0522D"/>
                  <ellipse cx="16" cy="16" :rx="s.leafR" :ry="s.leafR" fill="#4CAF50"/>
                  <ellipse cx="13" cy="18" :rx="s.leafR * 0.7" :ry="s.leafR * 0.65" fill="#66BB6A"/>
                  <ellipse cx="19" cy="17" :rx="s.leafR * 0.65" :ry="s.leafR * 0.7" fill="#43A047"/>
                  <rect x="15" y="18" width="2" height="4" rx="0.8" fill="#33691E"/>
                </svg>
                <span class="ns-plant-chip-label">{{ s.label }}</span>
              </div>
            </div>

            <div class="ns-plant-counter">
              <span class="ns-plant-count-text">
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none" style="vertical-align:-2px; margin-right:4px;">
                  <ellipse cx="16" cy="15" rx="6" ry="6" fill="#4CAF50"/>
                  <rect x="14" y="19" width="4" height="4" rx="0.8" fill="#33691E"/>
                  <rect x="12" y="22" width="8" height="5" rx="1" fill="#B5651D"/>
                </svg>
                {{ plantCount }} plant{{ plantCount !== 1 ? 's' : '' }} placed
              </span>
              <button
                v-if="plantCount > 0"
                class="ns-plant-delete-btn"
                @click="emit('deletePlant')"
                title="Delete selected plant (or select one first)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Remove
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── SCORING TAB ──────────────────────────────────────── -->
    <div v-if="activeTab === 'scoring'" class="ns-scoring-tab">
      <div
        v-for="(meta, dimName) in dimensionMeta"
        :key="dimName"
        class="ns-scoring-card"
      >
        <div class="ns-scoring-card-header">
          <span class="ns-scoring-card-name">{{ dimName }}</span>
          <span class="ns-scoring-card-pts">{{ meta.maxPts }} pts</span>
        </div>
        <p class="ns-scoring-tagline">{{ meta.tagline }}</p>
        <p class="ns-scoring-consequence">{{ meta.consequence }}</p>
        <div class="ns-scoring-rules">
          <div
            v-for="rule in meta.rules"
            :key="rule.range"
            :class="['ns-scoring-rule', 'risk-' + rule.risk]"
          >
            <span class="ns-scoring-rule-range">{{ rule.range }}</span>
            <span class="ns-scoring-rule-outcome">{{ rule.outcome }}</span>
          </div>
        </div>
        <p class="ns-scoring-contributors">
          Contributing: {{ meta.contributorLabels.join(' + ') || 'Drag-to-place plants' }}
        </p>
      </div>
    </div>

    <!-- View mode at bottom -->
    <div class="ns-view-mode">
      <span class="ns-view-label">View Mode</span>
      <div class="ns-view-tabs">
        <button
          v-for="v in viewOptions"
          :key="v.value"
          class="ns-view-tab"
          :class="{ active: mode === v.value }"
          @click="emit('modeChange', v.value)"
        >{{ v.short }}</button>
      </div>
      <p v-if="mode === 'walk'" class="ns-walk-hint">
        Drag to look · WASD to move · Space to jump · Shift to sprint
      </p>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { paramInfo, paramGroups, dimensionMeta } from '../utils/neuroScore.js'

const props = defineProps({
  mode: { type: String, default: 'isometric' },
  plantCount: { type: Number, default: 0 },
})

const emit = defineEmits(['update', 'modeChange', 'deletePlant'])

// Tab state
const activeTab = ref('params')

// Local slider values — initialized from paramInfo defaults
const localValues = reactive(
  Object.fromEntries(
    Object.entries(paramInfo).map(([key, info]) => [key, info.defaultValue])
  )
)

const activeTooltip = ref(null)

function toggleTooltip(key) {
  activeTooltip.value = activeTooltip.value === key ? null : key
}

function formatValue(key, val) {
  if (paramInfo[key].step < 1) return Number(val).toFixed(2)
  return Math.round(val)
}

// Live score update on every input
function onSliderInput(ghKey) {
  emit('update', localValues[ghKey], ghKey)
}

const viewOptions = [
  { value: 'walk',      short: 'Walk' },
  { value: 'isometric', short: 'Iso'  },
  { value: 'plan',      short: 'Plan' },
]

// Map each GH parameter key to its dimension color
const PARAM_COLORS = {
  'Height':                  '#3182BD',
  'Wall Count':              '#E6550D',
  'Wall Curvature':          '#E6550D',
  'Opening Count':           '#756BB1',
  'Opening Size':            '#756BB1',
  'Biophilic Organic Form':  '#31A354',
}

function sliderStyle(key) {
  const info = paramInfo[key]
  const val = localValues[key]
  const pct = ((val - info.min) / (info.max - info.min)) * 100
  const color = PARAM_COLORS[key] || 'var(--ns-red)'
  return {
    background: `linear-gradient(90deg, ${color} ${pct}%, var(--ns-grey-light) ${pct}%)`,
    '--ns-slider-color': color,
  }
}

// ── Onboarding banner ──────────────────────────────────────────────
const ONBOARDING_KEY = 'ns-onboarding-dismissed'
const showOnboarding = ref(!localStorage.getItem(ONBOARDING_KEY))

function dismissOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, '1')
  showOnboarding.value = false
}

// ── Greenery (research-backed parameter) ──────────────────────────
const greeneryInfo = {
  label: 'Greenery',
  text: 'Indoor plants are associated with slightly lower blood pressure in a 2022 meta-analysis. Effects on attention and stress markers are mixed across studies. Some studies report that seeing vegetation helps people recover from mental fatigue.',
  source: 'Han, Ruan & Liao (2022). Effects of Indoor Plants on Human Functions: A Systematic Review with Meta-Analyses. IJERPH. Not from the work of Valentine.',
}

const plantSizes = [
  { key: 'small',  label: 'Small',  iconSize: 24, leafR: 4.5 },
  { key: 'medium', label: 'Medium', iconSize: 30, leafR: 6 },
  { key: 'large',  label: 'Large',  iconSize: 36, leafR: 7.5 },
]

function onPlantDragStart(e, sizeKey) {
  e.dataTransfer.setData('text/plain', sizeKey)
  e.dataTransfer.effectAllowed = 'copy'
}
</script>

<style scoped>
</style>
