/**
 * NeuroScore utility — scoring logic and research content for NeuroSpace
 * Based on neuroarchitecture research by Dr. Cleo Valentine (cleovalentine.io)
 */

// ─────────────────────────────────────────────────────────────────
// Internal helpers — shared by calculateNeuroScore & getParameterContributions
// ─────────────────────────────────────────────────────────────────

function _normParams(params) {
  const wallCount = params['Wall Count'] ?? 4
  const curvature = params['Wall Curvature'] ?? 0.8
  const height    = params['Height'] ?? 5
  const biophilic = params['Biophilic Organic Form'] ?? 0
  const openings  = params['Opening Count'] ?? 2
  const openSize  = params['Opening Size'] ?? 5
  const plants    = params['Potted Plants'] ?? 0

  return {
    // Levels off at 3.5 m: the studies behind this rule tested roughly 2.3-3 m (audit, 2026-09-29)
    heightN:     Math.min(1, Math.max(0, (height - 2) / 1.5)),
    wallCountN:  (wallCount - 3) / 5,
    curvatureN:  (curvature - 0.7) / 0.25,
    biophilicN:  biophilic / 100,
    openingsN:   (openings - 1) / 9,
    openSizeN:   (openSize - 5) / 25,
    // Presence first: one plant in view earns 60%, each more adds a little, full at 5
    plantsN:     plants > 0 ? 0.6 + 0.4 * Math.min((plants - 1) / 4, 1) : 0,
  }
}

function _dimScores(n) {
  return {
    heightScore:    n.heightN,
    // Facets only count as far as the corners are soft: many hard corners are a
    // regular high-contrast repetition, the pattern linked to visual discomfort
    curveScore:     n.curvatureN * 0.6 + n.wallCountN * 0.4 * n.curvatureN,
    daylightScore:  n.openingsN * 0.4 + n.openSizeN * 0.6,
    biophilicScore: Math.max(0, 1 - Math.abs(n.biophilicN - 0.4) * 1.5), // optimal ~0.4
    plantScore:     n.plantsN,
  }
}

// ─────────────────────────────────────────────────────────────────
// Score calculation
// ─────────────────────────────────────────────────────────────────

export function calculateNeuroScore(params) {
  const d = _dimScores(_normParams(params))
  const raw = (
    d.heightScore    * 0.22 +  // Ceiling height → cognitive freedom
    d.curveScore     * 0.25 +  // Wall curvature → visual stress reduction
    d.daylightScore  * 0.22 +  // Natural light → wellbeing
    d.biophilicScore * 0.18 +  // Biophilic form → neuroinflammation
    d.plantScore     * 0.13    // Potted plants → attention restoration
  )
  return Math.round(Math.max(0, Math.min(1, raw)) * 100)
}

// ─────────────────────────────────────────────────────────────────
// Score labelling
// ─────────────────────────────────────────────────────────────────

export function getScoreLabel(score) {
  if (score <= 30) return { label: 'High Stress Potential',    color: '#C50000', bg: '#fff0f0' }
  if (score <= 55) return { label: 'Moderate Stress Potential', color: '#888888', bg: '#f5f5f5' }
  if (score <= 75) return { label: 'Calming',                   color: '#4A7C59', bg: '#eef5f1' }
  return                  { label: 'Restorative',               color: '#2D6A4F', bg: '#e6f4ee' }
}

// ─────────────────────────────────────────────────────────────────
// Per-dimension contributions (for donut chart)
// Returns values in 0–100 range representing each dimension's earned score
// ─────────────────────────────────────────────────────────────────

export function getParameterContributions(params) {
  const d = _dimScores(_normParams(params))
  return {
    'Ceiling Height': Math.round(d.heightScore    * 0.22 * 100),  // display name kept
    'Wall Quality':   Math.round(d.curveScore     * 0.25 * 100),
    'Natural Light':  Math.round(d.daylightScore  * 0.22 * 100),
    'Biophilic Form': Math.round(d.biophilicScore * 0.18 * 100),
    'Potted Plants':  Math.round(d.plantScore     * 0.13 * 100),
  }
}

// Max possible contribution per dimension (for chart reference)
export const contributionMaxima = {
  'Ceiling Height': 22,
  'Wall Quality':   25,
  'Natural Light':  22,
  'Biophilic Form': 18,
  'Potted Plants':  13,
}

// ─────────────────────────────────────────────────────────────────
// Dimension metadata — drives Scoring tab + hypothesis cards
// ─────────────────────────────────────────────────────────────────

export const dimensionMeta = {
  'Ceiling Height': {
    contributorKeys:   ['Height'],
    contributorLabels: ['Ceiling Height'],
    maxPts: 22,
    tagline: 'Cognitive mode & sense of confinement',
    consequence: 'Associated with whether occupants lean toward abstract or constrained thinking.',
    rules: [
      { range: '< 2.4m',   outcome: 'May read as confining',                          risk: 'high' },
      { range: '2.4–3.5m', outcome: 'Inside the studied range, benefit still rising', risk: 'moderate' },
      { range: '> 3.5m',   outcome: 'Full estimated benefit; more height adds volume', risk: 'low' },
    ],
    hypothesis(params) {
      const h = params['Height'] ?? 5
      if (h < 2.4) return `At ${h}m, the ceiling may read as confining; low ceilings are associated with more constrained thinking.`
      if (h < 3.5) return `At ${h}m, the ceiling is inside the studied range and below where this model levels off (3.5m).`
      return `At ${h}m, the ceiling is past 3.5m, where this model gives the full estimated benefit.`
    },
  },
  'Wall Quality': {
    contributorKeys:   ['Wall Curvature', 'Wall Count'],
    contributorLabels: ['Wall Curvature', 'Wall Count'],
    maxPts: 25,
    tagline: 'Visual stress potential',
    consequence: 'Angular, hard-cornered surfaces are estimated to raise visual stress potential.',
    rules: [
      { range: 'Low curvature', outcome: 'Angular forms → higher estimated visual stress',risk: 'high' },
      { range: 'Mid curvature', outcome: 'Lower estimated visual stress',            risk: 'moderate' },
      { range: 'High curvature', outcome: 'Smooth surfaces → lowest estimated visual stress', risk: 'low' },
    ],
    hypothesis(params) {
      const c = params['Wall Curvature'] ?? 0.8
      const n = params['Wall Count'] ?? 4
      if (c < 0.75 && n <= 4) return `Low curvature (${c}) and few facets (${n}) may activate visual stress responses.`
      if (c >= 0.85) return `High curvature (${c}) is estimated to lower visual stress potential; some studies report curved rooms are preferred.`
      return `Moderate curvature (${c}) with ${n} facets presents a reduced visual stress risk.`
    },
  },
  'Natural Light': {
    contributorKeys:   ['Opening Count', 'Opening Size'],
    contributorLabels: ['Opening Count', 'Opening Size'],
    maxPts: 22,
    tagline: 'Circadian rhythm & psychological wellbeing',
    consequence: 'Daylight and view access are among the better-supported factors associated with occupant wellbeing.',
    rules: [
      { range: 'Few / small',   outcome: 'Circadian disruption — artificial light dependence', risk: 'high' },
      { range: 'Moderate',      outcome: 'Partial daylight benefit',                           risk: 'moderate' },
      { range: 'Multiple / large', outcome: 'Good daylight and view access',                   risk: 'low' },
    ],
    hypothesis(params) {
      const n = params['Opening Count'] ?? 3
      const s = params['Opening Size'] ?? 15
      if (n <= 2 && s < 12) return `Low daylight access (${n} openings, size ${s}) may disrupt circadian rhythms.`
      if (n >= 6 || s >= 22) return `Strong daylight access (${n} openings, size ${s}) is associated with circadian health.`
      return `Moderate daylight access (${n} openings, size ${s}) provides partial circadian benefit.`
    },
  },
  'Biophilic Form': {
    contributorKeys:   ['Biophilic Organic Form'],
    contributorLabels: ['Biomorphic Form'],
    maxPts: 18,
    tagline: 'Biomorphic form & visual coherence',
    consequence: 'Biophilic design was associated with lower EEG delta power in a small pilot; the peak near 40% is a model assumption.',
    rules: [
      { range: '0–20%',  outcome: 'Rectilinear — no biomorphic benefit estimated', risk: 'moderate' },
      { range: '30–50%', outcome: 'Model optimum — highest estimated benefit',     risk: 'low' },
      { range: '> 60%',  outcome: 'Excessive complexity — visual coherence loss',   risk: 'moderate' },
    ],
    hypothesis(params) {
      const b = params['Biophilic Organic Form'] ?? 0
      if (b < 20) return `At ${b}%, the geometry is largely rectilinear, so this model estimates no biomorphic benefit.`
      if (b >= 30 && b <= 55) return `At ${b}%, biomorphic form is in the range this model scores highest; a small pilot associated biophilic design with lower EEG delta power.`
      return `At ${b}%, organic complexity is high — visual coherence may be reduced, increasing cognitive load.`
    },
  },
  'Potted Plants': {
    contributorKeys:   [],
    contributorLabels: ['Greenery (placed in scene)'],
    maxPts: 13,
    tagline: 'Vegetation in view',
    consequence: 'Some studies associate indoor plants with slightly lower blood pressure; effects on attention are mixed.',
    rules: [
      { range: '0 plants',   outcome: 'No biophilic benefit from vegetation',                risk: 'moderate' },
      { range: '1 plant',    outcome: 'Most of the estimated benefit: vegetation in view', risk: 'low' },
      { range: '2–5 plants', outcome: 'Each more plant adds a little, full at 5',        risk: 'low' },
    ],
    hypothesis(params) {
      const p = params['Potted Plants'] ?? 0
      if (p === 0) return `No plants placed — the estimated benefit of vegetation in view is absent.`
      if (p === 1) return `One plant placed — most of the estimated benefit of vegetation in view.`
      return `${p} plants placed — each extra plant adds a little to the estimate, full at 5.`
    },
  },
}

// ─────────────────────────────────────────────────────────────────
// Research content per GH parameter key
// ─────────────────────────────────────────────────────────────────

export const paramInfo = {
  'Wall Count': {
    label: 'Wall Count',
    group: 'Surface Quality',
    min: 3, max: 8, step: 1, defaultValue: 4,
    text: 'More wall facets approach a curved surface, but only when the corners are soft: in this model facets earn points in proportion to curvature, because many hard corners become a regular, high-contrast repetition, a pattern linked to visual discomfort.',
    source: 'Curvature reviewed in Valentine (2024). The impact of architectural form on physiological stress: a systematic review. Frontiers in Computer Science. Facet count is a NeuroSpace proxy, not tested.',
  },
  'Wall Curvature': {
    label: 'Wall Curvature',
    group: 'Surface Quality',
    min: 0.70, max: 0.95, step: 0.01, defaultValue: 0.8,
    text: 'Some studies report that curved interiors are judged more beautiful than angular ones. Curved walls are estimated here to lower visual stress potential. Physiological findings are mixed: the one reviewed study that tested cortisol found no difference.',
    source: 'Reviewed in Valentine (2024), The impact of architectural form on physiological stress: a systematic review, Frontiers in Computer Science; primary: Vartanian et al. (2013), PNAS.',
  },
  'Height': {
    label: 'Ceiling Height',
    group: 'Spatial Form',
    min: 2, max: 15, step: 1, defaultValue: 5,
    text: 'Higher ceilings are associated with more abstract, relational thinking and are more often judged beautiful. Lower ceilings may prime a sense of confinement. Evidence covers roughly 2.4 to 3 m; this model levels off at 3.5 m.',
    source: 'Reviewed in Valentine (2024), The impact of architectural form on physiological stress: a systematic review, Frontiers in Computer Science; primary: Meyers-Levy & Zhu (2007), Journal of Consumer Research; Vartanian et al. (2015), Journal of Environmental Psychology.',
  },
  'Biophilic Organic Form': {
    label: 'Biomorphic Form',
    group: 'Biophilic & Biomorphic',
    min: 0, max: 100, step: 1, defaultValue: 0,
    text: 'Nature-inspired geometry is associated with lower stress potential in early research. A 10-person EEG pilot reported lower delta power, a proposed marker of neuroinflammation, when people viewed more biophilic buildings. The peak near 40% is an assumption of this model: very busy, repetitive patterns are estimated to be fatiguing.',
    source: 'Valentine et al. (2024). Architectural Neuroimmunology: A Pilot Study Examining the Impact of Biophilic Architectural Design on Neuroinflammation. Buildings.',
  },
  'Opening Count': {
    label: 'Opening Count',
    group: 'Natural Light',
    min: 1, max: 10, step: 1, defaultValue: 3,
    text: 'Multiple window openings distribute natural light and provide varied views across the space. Some studies report that rooms without openings raise physiological stress, and access to daylight and views is associated with better wellbeing.',
    source: 'Reviewed in Valentine (2024), The impact of architectural form on physiological stress: a systematic review, Frontiers in Computer Science; primary: Fich et al. (2014), Physiology & Behavior.',
  },
  'Opening Size': {
    label: 'Opening Size',
    group: 'Natural Light',
    min: 5, max: 30, step: 1, defaultValue: 15,
    text: 'Window size shapes how much daylight enters, which is associated with circadian health and lower eye strain. Larger openings are estimated to help up to a point; very large glazing can add glare.',
    source: 'Reviewed in Valentine (2024), The impact of architectural form on physiological stress: a systematic review, Frontiers in Computer Science; primary: Kim, Park & Choo (2021), IJERPH.',
  },
}

// ─────────────────────────────────────────────────────────────────
// Grouped parameter order for the UI
// ─────────────────────────────────────────────────────────────────

export const paramGroups = [
  { name: 'Spatial Form',    keys: ['Height'] },
  { name: 'Surface Quality', keys: ['Wall Curvature', 'Wall Count'] },
  { name: 'Natural Light',   keys: ['Opening Count', 'Opening Size'] },
  { name: 'Biophilic & Biomorphic', keys: ['Biophilic Organic Form'] },
]
