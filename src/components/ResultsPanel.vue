<template>
  <section class="ns-results" id="ns-results">
    <div class="ns-results-inner">
      <div ref="pdfReportEl">

      <!-- Header -->
      <div class="ns-results-header">
        <p class="ns-section-eyebrow">Analysis Report</p>
        <h2 class="ns-section-title">Your NeuroScore</h2>
        <p class="ns-section-desc">
          See how each spatial parameter contributes to your design's neurophysiological
          stress profile. Export your results as a PDF report.
          Compare different configurations by capturing your score at each state — use the
          gallery below as a hypothesis log.
        </p>
      </div>

      <!-- ── Hypothesis cards ─────────────────────────────── -->
      <div class="ns-hypotheses" ref="hypothesesEl">
        <p class="ns-section-eyebrow">What This Design Predicts</p>
        <p class="ns-hyp-intro">Each hypothesis is generated from your current parameter values.</p>
        <div class="ns-hypothesis-grid">
          <div
            v-for="(meta, dimName, idx) in dimensionMeta"
            :key="dimName"
            class="ns-hypothesis-card"
            :class="{ 'ns-hyp-visible': hypothesesVisible }"
            :style="{ transitionDelay: idx * 90 + 'ms' }"
          >
            <div class="ns-hyp-header">
              <span class="ns-hyp-name">{{ dimName }}</span>
              <span
                class="ns-hyp-pts"
                :style="{ color: SEGMENT_COLORS[Object.keys(dimensionMeta).indexOf(dimName)] }"
              >{{ contributions[dimName] ?? 0 }}/{{ contributionMaxima[dimName] }}</span>
            </div>
            <p class="ns-hyp-statement">{{ meta.hypothesis(props.params) }}</p>
            <p class="ns-hyp-tagline">{{ meta.tagline }}</p>
          </div>
        </div>
      </div>

      <!-- ── Score Infographic: Gauge + Radar ──────────────── -->
      <div class="ns-infographic-row">

        <!-- Gauge Dial -->
        <div class="ns-gauge-card">
          <p class="ns-chart-title">NeuroScore Dial</p>
          <svg class="ns-gauge-svg" viewBox="0 0 200 150">
            <!-- Background arc -->
            <path d="M 20 105 A 80 80 0 0 1 180 105" fill="none" stroke="#E5E5E5" stroke-width="14" stroke-linecap="round"/>
            <!-- Colored arc segments matching score thresholds -->
            <path v-for="seg in gaugeSegments" :key="seg.id" :d="seg.d" fill="none" :stroke="seg.color" stroke-width="14" :stroke-linecap="seg.cap"/>
            <!-- Tick marks -->
            <g v-for="tick in gaugeTicks" :key="tick.pct">
              <line :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" stroke="#ccc" stroke-width="0.8"/>
              <text :x="tick.tx" :y="tick.ty" text-anchor="middle" font-size="6" fill="#aaa" font-family="'Roboto Mono', monospace">{{ tick.pct }}</text>
            </g>
            <!-- Score number -->
            <text x="100" y="85" text-anchor="middle" :fill="scoreInfo.color" font-size="36" font-weight="700" font-family="Inter, sans-serif">{{ score }}</text>
            <text x="100" y="98" text-anchor="middle" fill="#6B6B6B" font-size="10" font-family="'Roboto Mono', monospace">/ 100</text>
            <!-- Emoji face -->
            <g class="ns-gauge-face">
              <circle cx="100" cy="118" r="9" fill="none" :stroke="scoreInfo.color" stroke-width="1.3"/>
              <circle cx="96.5" cy="116" r="1.3" :fill="scoreInfo.color"/>
              <circle cx="103.5" cy="116" r="1.3" :fill="scoreInfo.color"/>
              <path :d="faceMouthPath" fill="none" :stroke="scoreInfo.color" stroke-width="1.3" stroke-linecap="round"/>
            </g>
            <text x="100" y="142" text-anchor="middle" :fill="scoreInfo.color" font-size="8" font-weight="600" font-family="'Roboto Mono', monospace" letter-spacing="0.5">{{ scoreInfo.label.toUpperCase() }}</text>
          </svg>
        </div>

        <!-- Radar Chart -->
        <div class="ns-radar-card">
          <p class="ns-chart-title">Dimension Balance</p>
          <svg class="ns-radar-svg" viewBox="0 0 240 270">
            <polygon v-for="level in radarLevels" :key="level" :points="radarGridPoints(level)" fill="none" stroke="#E5E5E5" stroke-width="0.8"/>
            <text v-for="level in radarLevels" :key="'gl'+level" x="122" :y="125 - 85 * level + 3" font-size="6" fill="#ccc" font-family="'Roboto Mono', monospace">{{ Math.round(level * 100) }}%</text>
            <line v-for="i in 5" :key="'ax'+i" x1="120" y1="125" :x2="radarVertex(i-1, 1.0)[0]" :y2="radarVertex(i-1, 1.0)[1]" stroke="#E5E5E5" stroke-width="0.5"/>
            <polygon :points="radarDataPoints" class="ns-radar-polygon" stroke-width="2" stroke-linejoin="round"/>
            <circle v-for="(seg, i) in donutSegments" :key="'rd'+i" :cx="radarDataVertex(i)[0]" :cy="radarDataVertex(i)[1]" r="4.5" :fill="seg.color" stroke="white" stroke-width="1.5"/>
            <g v-for="(seg, i) in donutSegments" :key="'rl'+i">
              <text :x="radarLabelPos(i)[0]" :y="radarLabelPos(i)[1]" text-anchor="middle" font-size="8.5" font-family="'Roboto Mono', monospace" fill="#6B6B6B">{{ radarShortNames[i] }}</text>
              <text :x="radarLabelPos(i)[0]" :y="radarLabelPos(i)[1] + 11" text-anchor="middle" font-size="8" font-weight="600" font-family="'Roboto Mono', monospace" :fill="seg.color">{{ seg.max > 0 ? Math.round(seg.earned / seg.max * 100) : 0 }}%</text>
            </g>
          </svg>
        </div>

      </div>

      <!-- Score + chart grid -->
      <div class="ns-results-grid">

        <!-- Donut chart -->
        <div class="ns-chart-card">
          <p class="ns-chart-title">Score Breakdown</p>
          <p class="ns-chart-subtitle">Points earned per dimension (out of max) · hover to explore</p>

          <div class="ns-donut-wrap">
            <svg class="ns-donut-svg" viewBox="-50 -50 100 100">
              <!-- Background ring -->
              <circle
                cx="0" cy="0" r="35"
                fill="none"
                stroke="rgba(0,0,0,0.06)"
                stroke-width="13"
              />
              <!-- Segments — hoverable -->
              <circle
                v-for="(seg, i) in donutSegments"
                :key="seg.name"
                cx="0" cy="0" r="35"
                fill="none"
                :stroke="seg.color"
                stroke-width="13"
                :stroke-dasharray="seg.dasharray"
                :stroke-dashoffset="seg.dashoffset"
                stroke-linecap="round"
                class="ns-donut-segment"
                :class="{ 'ns-donut-segment-dim': hoveredSegment && hoveredSegment.name !== seg.name }"
                :style="{ animationDelay: i * 80 + 'ms', cursor: 'pointer' }"
                @mouseover="hoveredSegment = seg"
                @mouseleave="hoveredSegment = null"
              />
            </svg>

            <!-- Donut hover card (shown inside the ring) -->
            <Transition name="ns-fade">
              <div v-if="hoveredSegment" class="ns-donut-hover-card">
                <span class="ns-dhc-name">{{ hoveredSegment.name }}</span>
                <span class="ns-dhc-score">{{ hoveredSegment.earned }}<span class="ns-dhc-max"> / {{ hoveredSegment.max }}</span></span>
                <p class="ns-dhc-consequence">{{ dimensionMeta[hoveredSegment.name]?.consequence }}</p>
              </div>
              <div v-else class="ns-donut-center">
                <span class="ns-donut-score" :style="{ color: scoreInfo.color }">{{ score }}</span>
                <span class="ns-donut-label">/ 100</span>
              </div>
            </Transition>
          </div>

          <!-- Legend -->
          <div class="ns-chart-legend">
            <div v-for="seg in donutSegments" :key="seg.name" class="ns-legend-item">
              <span class="ns-legend-dot" :style="{ background: seg.color }"></span>
              <span class="ns-legend-name">{{ seg.name }}</span>
              <span class="ns-legend-val">{{ seg.earned }}/{{ seg.max }}</span>
            </div>
          </div>
        </div>

        <!-- Parameter breakdown bars -->
        <div class="ns-breakdown-card">
          <p class="ns-breakdown-title">Parameter Contributions</p>
          <div class="ns-breakdown-list">
            <div
              v-for="(item, idx) in breakdownItems"
              :key="item.key"
              class="ns-breakdown-item"
            >
              <div class="ns-breakdown-row">
                <span class="ns-breakdown-name">{{ item.label }}</span>
                <span class="ns-breakdown-score">{{ item.earned }}/{{ item.max }}</span>
              </div>
              <!-- Contributing param values -->
              <div v-if="item.contributors.length" class="ns-breakdown-contributors">
                {{ item.contributors.join(' · ') }}
              </div>
              <div class="ns-breakdown-bar">
                <div
                  class="ns-breakdown-fill"
                  :style="{
                    width: item.max > 0 ? (item.earned / item.max * 100) + '%' : '0%',
                    background: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
                  }"
                ></div>
              </div>
            </div>
          </div>

          <div class="ns-breakdown-total">
            <div class="ns-breakdown-row">
              <span class="ns-breakdown-total-label">Total NeuroScore</span>
              <span
                class="ns-breakdown-score ns-breakdown-total-score"
                :style="{ color: scoreInfo.color }"
              >{{ score }} / 100</span>
            </div>
            <div>
              <span
                class="ns-score-label-pill"
                :style="{ color: scoreInfo.color }"
              >{{ scoreInfo.label }}</span>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Thermometers + Brain Map side by side ──────────── -->
      <div class="ns-thermo-brain-row">

      <!-- Dimension Thermometers -->
      <div class="ns-thermo-section">
        <p class="ns-section-eyebrow">Dimension Thermometers</p>
        <p class="ns-thermo-subtitle">Fill level shows how much of each dimension's maximum you've earned</p>
        <div class="ns-thermo-row">
          <div v-for="(item, idx) in thermoItems" :key="item.name" class="ns-thermo-item">
            <span class="ns-thermo-pct">{{ Math.round(item.pct) }}%</span>
            <div class="ns-thermo-tube">
              <div class="ns-thermo-fill" :style="{ height: item.pct + '%', background: item.color }"></div>
              <div class="ns-thermo-zone ns-zone-33"></div>
              <div class="ns-thermo-zone ns-zone-66"></div>
            </div>
            <span class="ns-thermo-val">{{ item.earned }}/{{ item.max }}</span>
            <span class="ns-thermo-name">{{ radarShortNames[idx] }}</span>
          </div>
        </div>
      </div>

      <!-- Neurological Impact Map -->
      <div class="ns-brain-section">
        <p class="ns-section-eyebrow">Neurological Impact Map</p>
        <p class="ns-brain-subtitle">Brain regions most affected by your current spatial design</p>
        <div class="ns-brain-layout">
          <svg class="ns-brain-svg" viewBox="0 0 220 185">
            <path d="M 95 155 C 65 153, 40 138, 30 118 C 20 98, 22 72, 32 54 C 45 34, 70 24, 100 24 C 130 24, 155 34, 168 54 C 180 72, 182 98, 172 118 C 162 138, 140 153, 115 155 Z" fill="#f7f7f7" stroke="#ddd" stroke-width="1.5"/>
            <ellipse cx="172" cy="133" rx="20" ry="16" fill="#f0f0f0" stroke="#ddd" stroke-width="1"/>
            <path d="M 162 145 C 167 158, 165 168, 162 175" fill="none" stroke="#ddd" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M 100 24 C 105 52, 98 82, 105 112" fill="none" stroke="#e5e5e5" stroke-width="0.8" stroke-dasharray="3 2"/>
            <ellipse cx="65" cy="70" rx="28" ry="33" :fill="SEGMENT_COLORS[0]" :opacity="brainRegionOpacity(0)" class="ns-brain-region"/>
            <ellipse cx="115" cy="54" rx="28" ry="22" :fill="SEGMENT_COLORS[1]" :opacity="brainRegionOpacity(1)" class="ns-brain-region"/>
            <ellipse cx="158" cy="82" rx="18" ry="26" :fill="SEGMENT_COLORS[2]" :opacity="brainRegionOpacity(2)" class="ns-brain-region"/>
            <ellipse cx="90" cy="118" rx="30" ry="20" :fill="SEGMENT_COLORS[3]" :opacity="brainRegionOpacity(3)" class="ns-brain-region"/>
            <ellipse cx="118" cy="94" rx="16" ry="14" :fill="SEGMENT_COLORS[4]" :opacity="brainRegionOpacity(4)" class="ns-brain-region"/>
          </svg>
          <div class="ns-brain-legend">
            <div v-for="(item, idx) in brainRegions" :key="item.region" class="ns-brain-legend-item">
              <span class="ns-brain-dot" :style="{ background: SEGMENT_COLORS[idx], opacity: brainRegionOpacity(idx) }"></span>
              <div class="ns-brain-legend-text">
                <span class="ns-brain-region-name">{{ item.region }}</span>
                <span class="ns-brain-dim-name">{{ item.dimension }}</span>
                <span class="ns-brain-effect">{{ item.effect }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      </div><!-- end ns-thermo-brain-row -->

      </div><!-- end pdfReportEl -->

      <!-- Snapshots gallery -->
      <div class="ns-snapshots">
        <p class="ns-snapshots-title">Captured Moments</p>
        <div v-if="snapshots.length === 0" class="ns-snapshots-empty">
          No captures yet — use the
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; display:inline-block;">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          button while in the Lab to capture your design.
        </div>
        <div v-else class="ns-snapshots-grid">
          <div v-for="(snap, i) in snapshots" :key="i" class="ns-snapshot">
            <img :src="snap.dataUrl" :alt="'Capture ' + (i+1)" />
            <span class="ns-snapshot-badge">NeuroScore {{ snap.score }}</span>
            <div class="ns-snapshot-overlay">
              <button class="ns-snapshot-dl" @click="downloadSnapshot(snap, i)">
                ↓ Download
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Export buttons -->
      <div class="ns-export-row">
        <button class="ns-export-btn primary" @click="exportPDF">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 13h12M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Download Report (PDF)
        </button>
      </div>

      <!-- ── Print-only research notes (hidden on screen) ─── -->
      <div class="ns-print-research">
        <p class="ns-prc-heading">Research Notes · Per Parameter</p>
        <div v-for="(info, key) in paramInfo" :key="key" class="ns-prc-item">
          <p class="ns-prc-label">{{ info.label }}</p>
          <p class="ns-prc-text">{{ info.text }}</p>
          <p class="ns-prc-source">{{ info.source }}</p>
        </div>
        <div class="ns-prc-item">
          <p class="ns-prc-label">Greenery</p>
          <p class="ns-prc-text">Indoor plants reduce cortisol, lower blood pressure, and improve attention restoration. Visual access to vegetation triggers parasympathetic activation and supports cognitive recovery.</p>
          <p class="ns-prc-source">Valentine, C. — Biophilic Design &amp; Neuroinflammation Pilot Study</p>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  getScoreLabel,
  getParameterContributions,
  contributionMaxima,
  paramInfo,
  dimensionMeta,
} from '../utils/neuroScore.js'

const props = defineProps({
  score:     { type: Number, default: 0 },
  snapshots: { type: Array,  default: () => [] },
  params:    { type: Object, default: () => ({}) },
})


const scoreInfo = computed(() => getScoreLabel(props.score))

const contributions = computed(() => getParameterContributions(props.params))

// ── Donut chart segments ─────────────────────────────────────────
const DONUT_R = 35
const CIRCUMFERENCE = 2 * Math.PI * DONUT_R
const SEGMENT_COLORS = ['#3182BD', '#E6550D', '#756BB1', '#31A354', '#66BB6A']

const hoveredSegment = ref(null)

// ── Gauge dial ───────────────────────────────────────────────────
// Color ranges matching score thresholds
const GAUGE_BANDS = [
  { from: 0,  to: 30,  color: '#C50000' },
  { from: 30, to: 55,  color: '#E6A817' },
  { from: 55, to: 75,  color: '#888888' },
  { from: 75, to: 100, color: '#2D6A4F' },
]

function gaugePointAt(pct) {
  const angle = Math.PI * (1 - pct / 100)
  return {
    x: 100 + 80 * Math.cos(angle),
    y: 105 - 80 * Math.sin(angle),
  }
}

const gaugeSegments = computed(() => {
  const s = props.score
  if (s <= 0) return []
  const clampedScore = Math.max(0.5, Math.min(99.5, s))
  const segs = []

  for (const band of GAUGE_BANDS) {
    if (clampedScore <= band.from) break
    const segStart = band.from
    const segEnd = Math.min(clampedScore, band.to)
    if (segEnd <= segStart) continue

    const startPt = gaugePointAt(segStart)
    const endPt = gaugePointAt(segEnd)
    const largeArc = (segEnd - segStart) > 50 ? 1 : 0
    const isFirst = band.from === 0
    const isLast = segEnd >= clampedScore

    segs.push({
      id: `gauge-${band.from}`,
      d: `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)} A 80 80 0 ${largeArc} 1 ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)}`,
      color: band.color,
      cap: isFirst || isLast ? 'round' : 'butt',
    })
  }
  return segs
})

const faceMouthPath = computed(() => {
  if (props.score > 75) return 'M 95 122 Q 100 127 105 122'
  if (props.score > 55) return 'M 96 121.5 Q 100 124 104 121.5'
  if (props.score > 30) return 'M 96 122 L 104 122'
  return 'M 95 124 Q 100 120 105 124'
})

const gaugeTicks = computed(() => {
  return [0, 25, 50, 75, 100].map(pct => {
    const angle = Math.PI * (1 - pct / 100)
    const r = 80, cx = 100, cy = 105
    const cos = Math.cos(angle), sin = Math.sin(angle)
    return {
      pct,
      x1: cx + (r + 2) * cos, y1: cy - (r + 2) * sin,
      x2: cx + (r + 8) * cos, y2: cy - (r + 8) * sin,
      tx: cx + (r + 16) * cos, ty: cy - (r + 16) * sin + 2,
    }
  })
})

// ── Radar chart ──────────────────────────────────────────────────
const RADAR_R = 85
const radarLevels = [0.25, 0.5, 0.75, 1.0]
const radarShortNames = ['Ceiling', 'Walls', 'Light', 'Biophilic', 'Plants']

function radarVertex(index, ratio) {
  const angle = -Math.PI / 2 + (2 * Math.PI / 5) * index
  return [
    120 + RADAR_R * ratio * Math.cos(angle),
    125 + RADAR_R * ratio * Math.sin(angle),
  ]
}

function radarGridPoints(level) {
  return Array.from({ length: 5 }, (_, i) => {
    const pt = radarVertex(i, level)
    return `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`
  }).join(' ')
}

const radarDataPoints = computed(() => {
  return Object.entries(contributionMaxima).map(([name, max], i) => {
    const earned = contributions.value[name] ?? 0
    const ratio = max > 0 ? Math.max(0.05, earned / max) : 0.05
    const pt = radarVertex(i, ratio)
    return `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`
  }).join(' ')
})

function radarDataVertex(index) {
  const entries = Object.entries(contributionMaxima)
  const [name, max] = entries[index]
  const earned = contributions.value[name] ?? 0
  const ratio = max > 0 ? Math.max(0.05, earned / max) : 0.05
  return radarVertex(index, ratio)
}

function radarLabelPos(index) {
  const pt = radarVertex(index, 1.25)
  const yAdj = index === 0 ? -4 : 4
  return [pt[0], pt[1] + yAdj]
}

// ── Thermometers ─────────────────────────────────────────────────
const thermoItems = computed(() => {
  return Object.entries(contributionMaxima).map(([name, max], idx) => {
    const earned = contributions.value[name] ?? 0
    const pct = max > 0 ? (earned / max) * 100 : 0
    return { name, earned, max, pct, color: SEGMENT_COLORS[idx] }
  })
})

// ── Brain heatmap ────────────────────────────────────────────────
function brainRegionOpacity(dimIndex) {
  const entries = Object.entries(contributionMaxima)
  const [name, max] = entries[dimIndex]
  const earned = contributions.value[name] ?? 0
  return max > 0 ? Math.max(0.15, (earned / max) * 0.7 + 0.15) : 0.15
}

const brainRegions = [
  { region: 'Prefrontal Cortex', dimension: 'Ceiling Height', effect: 'Cognitive freedom & cortisol regulation' },
  { region: 'Parietal Lobe', dimension: 'Wall Quality', effect: 'Visual stress & spatial processing' },
  { region: 'Visual Cortex', dimension: 'Natural Light', effect: 'Circadian rhythm & eye strain reduction' },
  { region: 'Temporal Lobe', dimension: 'Biophilic Form', effect: 'Neuroinflammation & visual coherence' },
  { region: 'Limbic System', dimension: 'Potted Plants', effect: 'Attention restoration & stress response' },
]

// ── PDF report ref ───────────────────────────────────────────────
const pdfReportEl = ref(null)

const donutSegments = computed(() => {
  const entries = Object.entries(contributionMaxima)
  const segments = []
  let cumulativeMax = 0

  entries.forEach(([name, maxVal], i) => {
    const earned = contributions.value[name] ?? 0
    const totalSlice = (maxVal / 100) * CIRCUMFERENCE
    const earnedLen  = (earned / 100) * CIRCUMFERENCE
    const offset = CIRCUMFERENCE / 4 - cumulativeMax

    segments.push({
      name,
      color:      SEGMENT_COLORS[i],
      earned,
      max:        maxVal,
      dasharray:  `${earnedLen} ${CIRCUMFERENCE - earnedLen}`,
      dashoffset: offset,
    })

    cumulativeMax += totalSlice
  })

  return segments
})

// ── Parameter breakdown bars ──────────────────────────────────────
const breakdownItems = computed(() => {
  return Object.entries(contributionMaxima).map(([name, max]) => {
    const meta = dimensionMeta[name]
    const paramValues = (meta?.contributorKeys ?? []).map(key => {
      const val = props.params[key]
      const info = paramInfo[key]
      if (!info || val == null) return null
      const formatted = info.step < 1 ? Number(val).toFixed(2) : Math.round(val)
      return `${info.label}: ${formatted}`
    }).filter(Boolean)

    return {
      key: name,
      label: name,
      contributors: paramValues,
      earned: contributions.value[name] ?? 0,
      max,
    }
  })
})

// ── Hypothesis cards scroll reveal ───────────────────────────────
const hypothesesEl = ref(null)
const hypothesesVisible = ref(false)

onMounted(() => {
  if (!hypothesesEl.value) return
  const observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting) hypothesesVisible.value = true },
    { threshold: 0.1 }
  )
  observer.observe(hypothesesEl.value)
})

// ── Export functions ─────────────────────────────────────────────
async function exportPDF() {
  const el = pdfReportEl.value
  if (!el) return

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#FFFFFF',
  })

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 10
  const contentW = pageW - margin * 2
  const headerH = 12
  const footerH = 10
  const usableH = pageH - headerH - footerH

  // Header
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(80)
  pdf.text('IAAC MACAD 2025\u20132026  \u00B7  Neuroarchitecture Lab', margin, 7)
  pdf.setDrawColor(197, 0, 0)
  pdf.setLineWidth(0.4)
  pdf.line(margin, 9, pageW - margin, 9)

  // Scale image to fit one page
  const imgW = contentW
  const imgH = (canvas.height / canvas.width) * imgW
  const scale = imgH > usableH ? usableH / imgH : 1
  const finalW = imgW * scale
  const finalH = imgH * scale
  const xOffset = margin + (contentW - finalW) / 2

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOffset, headerH, finalW, finalH)

  // Footer
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.setTextColor(130)
  const ts = new Date().toLocaleString()
  pdf.text('NeuroSpace \u2014 Behavior Information Modeling', margin, pageH - 4)
  pdf.text(ts, pageW - margin, pageH - 4, { align: 'right' })

  pdf.save(`neurospace-report-score${props.score}.pdf`)
}

function downloadSnapshot(snap, index) {
  const a = document.createElement('a')
  a.href = snap.dataUrl
  a.download = `neurospace-capture-${index + 1}-score${snap.score}.png`
  a.click()
}
</script>
