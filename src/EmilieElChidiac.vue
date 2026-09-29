<script setup>
import { ref, reactive, computed } from 'vue'

import GeometryView    from './components/GeometryView.vue'
import HeroSection     from './components/HeroSection.vue'
import ParameterControls from './components/ParameterControls.vue'
import NeuroScoreHUD   from './components/NeuroScoreHUD.vue'
import ResultsPanel    from './components/ResultsPanel.vue'

import { calculateNeuroScore } from './utils/neuroScore.js'

import './styles/neurospace.css'

// ── Slider state (keys kept from the v1 Grasshopper inputs; the score reads them too) ──
const sliderValues = reactive({
  'Wall Count':              4,
  'Wall Curvature':          0.8,
  'Height':                  5,
  'Biophilic Organic Form':  0,
  'Opening Count':           3,
  'Opening Size':            15,
})

function updateValue(newValue, ghKey) {
  sliderValues[ghKey] = newValue
}

// computeData drives the room geometry (geometry/room.js)
const computeData = computed(() => ({ ...sliderValues }))

// ── Plant count (managed by GeometryView drag-and-drop) ─────────────────────
const plantCount = ref(0)

function onPlantCountChanged(count) {
  plantCount.value = count
}

function onDeletePlant() {
  if (geoView.value) geoView.value.deleteSelectedPlant()
}

// Include plant count in scoring data
const scoreData = computed(() => ({ ...sliderValues, 'Potted Plants': plantCount.value }))

// ── NeuroScore ───────────────────────────────────────────────────────────────
const neuroScore = computed(() => calculateNeuroScore(scoreData.value))

// ── View mode ────────────────────────────────────────────────────────────────
const mode = ref('isometric')

// ── Surroundings toggle ───────────────────────────────────────────────────────
const showSurroundings = ref(true)

// ── Fixed visual settings ────────────────────────────────────────────────────
// Late-afternoon sun at 4PM for warm light and visible shadows
const SUN_HOUR = 16

// ── Material config ──────────────────────────────────────────────────────────
const materialConfig = reactive({
  color: '#C50000',
  opacity: 1.0,
  roughness: 0.1,
  metalness: 0.0,
  pattern: 'solid',
})

// ── Screenshot capture ───────────────────────────────────────────────────────
const geoView       = ref(null)
const snapshots     = ref([])
const isCapturing   = ref(false)
const vizOpen       = ref(false)

const colorSwatches = [
  { hex: '#ffffff', label: 'White' },
  { hex: '#1a1a1a', label: 'Black' },
  { hex: '#C50000', label: 'Red' },
  { hex: '#1565C0', label: 'Blue' },
  { hex: '#2E7D32', label: 'Green' },
  { hex: '#F9A825', label: 'Yellow' },
  { hex: '#DEB887', label: 'Wood' },
  { hex: '#B8B0A8', label: 'Concrete' },
]

const patternOptions = [
  { key: 'solid',     label: 'Solid' },
  { key: 'wireframe', label: 'Wire' },
  { key: 'grid',      label: 'Grid' },
]

function setMatProp(key, value) {
  materialConfig[key] = value
}

function vizSliderStyle(val, min, max) {
  const pct = ((val - min) / (max - min)) * 100
  return {
    background: `linear-gradient(90deg, var(--ns-red) ${pct}%, var(--ns-grey-light) ${pct}%)`,
  }
}

function captureSnapshot() {
  if (!geoView.value) return
  isCapturing.value = true
  const dataUrl = geoView.value.captureScreenshot()
  if (dataUrl) {
    snapshots.value.push({
      dataUrl,
      score: neuroScore.value,
      timestamp: new Date().toISOString(),
    })
  }
  setTimeout(() => { isCapturing.value = false }, 400)
}

// ── Scroll navigation ─────────────────────────────────────────────────────────
const toolSection = ref(null)

function scrollToTool() {
  toolSection.value?.scrollIntoView({ behavior: 'smooth' })
}

function scrollToResults() {
  const el = document.getElementById('ns-results')
  el?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div class="ns-app">

    <!-- ① Hero ──────────────────────────────────────────────────────────── -->
    <HeroSection @enterLab="scrollToTool" />

    <!-- ② Tool ──────────────────────────────────────────────────────────── -->
    <section class="ns-tool" ref="toolSection">

      <!-- Left panel: controls -->
      <ParameterControls
        :mode="mode"
        :plantCount="plantCount"
        @update="updateValue"
        @modeChange="mode = $event"
        @deletePlant="onDeletePlant"
      />

      <!-- Right: 3D viewer + HUD overlays -->
      <div class="ns-viewer-wrap">

        <GeometryView
          ref="geoView"
          :data="computeData"
          :mode="mode"
          :sunHour="SUN_HOUR"
          :showSurroundings="showSurroundings"
          :materialConfig="materialConfig"
          @plantCountChanged="onPlantCountChanged"
        />

        <!-- Toolbar buttons -->
        <div class="ns-viewer-toolbar">

          <!-- Visualization button -->
          <div class="ns-viz-wrap">
            <button
              class="ns-capture-btn"
              :class="{ active: vizOpen }"
              @click="vizOpen = !vizOpen"
              title="Visualization settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Visualization
            </button>

            <Transition name="ns-viz-pop">
              <div v-if="vizOpen" class="ns-viz-popover">
                <div class="ns-viz-pop-header">
                  <span class="ns-viz-pop-title">Visualization</span>
                  <button class="ns-viz-pop-close" @click="vizOpen = false" title="Close">&times;</button>
                </div>

                <!-- Color -->
                <div class="ns-viz-row">
                  <span class="ns-viz-label">Color</span>
                  <div class="ns-viz-color-row">
                    <button
                      v-for="c in colorSwatches"
                      :key="c.hex"
                      class="ns-viz-swatch"
                      :class="{ active: materialConfig.color === c.hex }"
                      :style="{ background: c.hex }"
                      :title="c.label"
                      @click="setMatProp('color', c.hex)"
                    ></button>
                    <label class="ns-viz-color-custom" title="Pick custom color">
                      <input type="color" :value="materialConfig.color" @input="setMatProp('color', $event.target.value)" />
                      <span class="ns-viz-custom-icon">+</span>
                    </label>
                  </div>
                </div>

                <!-- Transparency -->
                <div class="ns-viz-row">
                  <div class="ns-viz-row-header">
                    <span class="ns-viz-label">Transparency</span>
                    <span class="ns-viz-value">{{ Math.round((1 - materialConfig.opacity) * 100) }}%</span>
                  </div>
                  <input
                    type="range" class="ns-viz-slider" min="0" max="1" step="0.05"
                    :value="1 - materialConfig.opacity"
                    :style="vizSliderStyle(1 - materialConfig.opacity, 0, 1)"
                    @input="setMatProp('opacity', 1 - Number($event.target.value))"
                  />
                </div>

                <!-- Finish -->
                <div class="ns-viz-row">
                  <div class="ns-viz-row-header">
                    <span class="ns-viz-label">Finish</span>
                    <span class="ns-viz-value">{{ materialConfig.roughness <= 0.3 ? 'Glossy' : materialConfig.roughness >= 0.7 ? 'Matte' : 'Satin' }}</span>
                  </div>
                  <input
                    type="range" class="ns-viz-slider" min="0" max="1" step="0.05"
                    v-model.number="materialConfig.roughness"
                    :style="vizSliderStyle(materialConfig.roughness, 0, 1)"
                  />
                  <div class="ns-viz-range-labels"><span>Glossy</span><span>Matte</span></div>
                </div>

                <!-- Metalness -->
                <div class="ns-viz-row">
                  <div class="ns-viz-row-header">
                    <span class="ns-viz-label">Metalness</span>
                    <span class="ns-viz-value">{{ Math.round(materialConfig.metalness * 100) }}%</span>
                  </div>
                  <input
                    type="range" class="ns-viz-slider" min="0" max="1" step="0.05"
                    v-model.number="materialConfig.metalness"
                    :style="vizSliderStyle(materialConfig.metalness, 0, 1)"
                  />
                </div>

                <!-- Pattern -->
                <div class="ns-viz-row">
                  <span class="ns-viz-label">Pattern</span>
                  <div class="ns-viz-pattern-tabs">
                    <button
                      v-for="p in patternOptions"
                      :key="p.key"
                      class="ns-viz-pattern-tab"
                      :class="{ active: materialConfig.pattern === p.key }"
                      @click="setMatProp('pattern', p.key)"
                    >{{ p.label }}</button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Surroundings toggle button -->
          <button
            class="ns-capture-btn"
            :class="{ active: showSurroundings }"
            @click="showSurroundings = !showSurroundings"
            title="Toggle surrounding context"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="6" height="12" rx="1"/><rect x="10" y="4" width="6" height="15" rx="1"/>
              <rect x="18" y="9" width="4" height="10" rx="1"/><line x1="1" y1="22" x2="23" y2="22"/>
            </svg>
            Context
          </button>

          <!-- Capture button -->
          <button
            class="ns-capture-btn"
            :class="{ 'ns-capture-flash': isCapturing }"
            @click="captureSnapshot"
            title="Capture this moment"
          >
            <svg class="ns-camera-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Capture
          </button>

        </div>

        <!-- Shutter flash overlay -->
        <div v-if="isCapturing" class="ns-shutter-overlay"></div>

        <!-- NeuroScore HUD -->
        <NeuroScoreHUD :score="neuroScore" />

        <!-- Scroll to results (centered) -->
        <button
          class="ns-report-btn"
          @click="scrollToResults"
          title="See your full report"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M2 7l4 4 4-4" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          View Report
        </button>

      </div>
    </section>

    <!-- ③ Results ───────────────────────────────────────────────────────── -->
    <ResultsPanel
      :score="neuroScore"
      :snapshots="snapshots"
      :params="scoreData"
    />

  </div>
</template>

