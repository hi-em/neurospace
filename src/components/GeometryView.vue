<template>
  <div class="ns-viewport" :class="{ drop: dropping }">
    <div ref="containerEl" class="ns-three" role="img" :aria-label="ariaLabel"></div>
    <div ref="labelsEl" class="ns-labels" aria-hidden="true"></div>

    <!-- Walk: how to move, shown for a moment -->
    <Transition name="fade">
      <p v-if="props.placing && props.interactive !== false" class="walk-hint" :style="{ left: `calc(50% + ${inset / 2}px)` }">
        Click the floor to place a {{ props.placing }} plant · <kbd>Esc</kbd> to finish
      </p>
      <p v-else-if="props.mode === 'walk' && walkHint && props.interactive !== false" class="walk-hint" :style="{ left: `calc(50% + ${inset / 2}px)` }">
        <template v-if="isTouch">Drag to look · hold the button to walk</template>
        <template v-else><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · drag to look · <kbd>Shift</kbd> hurry</template>
      </p>
    </Transition>
    <button v-if="props.mode === 'walk' && isTouch && props.interactive !== false" class="walk-btn"
      @pointerdown.prevent="moveState.forward = true" @pointerup="moveState.forward = false" @pointerleave="moveState.forward = false"
      aria-label="Hold to walk forward">Hold to walk</button>

    <!-- Plan: north arrow, scale bar and legend, drawn like a sheet -->
    <template v-if="props.mode === 'plan' && props.interactive !== false">
      <div class="north" aria-hidden="true">
        <svg width="28" height="40" viewBox="0 0 28 40"><path d="M14 2 L22 26 L14 21 L6 26 Z" fill="currentColor" /><text x="14" y="38" text-anchor="middle">N</text></svg>
      </div>
      <div class="sheet" :style="{ left: `${inset + 24}px` }">
        <div class="scale" :style="{ width: scaleBar.px + 'px' }">
          <i v-for="k in scaleBar.ticks" :key="k" :style="{ left: (k / scaleBar.m) * 100 + '%' }">{{ k }}</i>
          <b></b>
        </div>
        <p>metres · plan cut at {{ (props.cutHeight ?? 1).toFixed(1) }} m · equinox sun path</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, ref, reactive, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { createRoom, writeRoom, roomParams, sunVector, sectionAt, UNITS_PER_M } from '@/geometry/membrane.js'
import { PLANT_SIZES, PLANT_ORDER, createPottedPlant, plantTop, plantSpot } from '@/geometry/plant.js'
import { createFigure } from '@/geometry/figure.js'
import { fabricUniforms, makeTranslucent, updateFabric, createRigging, timberTexture, weaveTexture, createShafts } from '@/geometry/look.js'

const props = defineProps({
  data: Object, score: Number, mode: String, sunHour: Number, materialConfig: Object,
  interactive: { type: Boolean, default: true }, label: String,
  insetLeft: { type: Number, default: 0 },     // px of this view under the card: the room centres in the rest
  cutHeight: { type: Number, default: 1 },     // plan cut, metres
  maxPlants: { type: Number, default: 5 },
  placing: { type: String, default: null },     // a plant size while placing: click the floor to set one down
})
const emits = defineEmits(['plantCountChanged', 'solved', 'sunHour', 'placingDone'])
const containerEl = ref(null)
const labelsEl = ref(null)
const isTouch = window.matchMedia?.('(pointer: coarse)').matches
const ariaLabel = computed(() => `${props.label || 'Room'}: a membrane form-found from the sliders`)
const U = UNITS_PER_M

// Three.js objects
let renderer, labelRenderer, perspCamera, orthoCamera, activeCamera
let scene, orbitControls, container, groundPlane, sunLight, hemiLight
const isPhone = window.matchMedia?.('(max-width: 768px), (pointer: coarse)').matches
let loadedObject = null, membraneMesh = null

const weave = weaveTexture()

function buildMeshMaterial() {
  const cfg = props.materialConfig || {}
  const roughness = cfg.roughness ?? 0.5
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(cfg.color || '#ffffff'),
    roughness,
    metalness: cfg.metalness ?? 0,
    transparent: (cfg.opacity ?? 1) < 1,
    opacity: cfg.opacity ?? 1,
    clearcoat: roughness < 0.3 ? 1 - roughness : 0,
    clearcoatRoughness: roughness * 0.5,
    envMapIntensity: 0.35,
    // Fabric: both faces drawn so the envelope reads as a solid from outside
    // and as a lit skin from inside; a little sheen for the weave.
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    sheen: 0.6,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#fff6ea'),
    vertexColors: true,                 // ambient occlusion baked from the geometry
    bumpMap: weave,
    bumpScale: 0.3,
  })
}

// In plan the film below the cut is drawn flat and pale, the way a plan shows
// what lies beneath the section; the poche carries the cut.
let fabricMat = null
const planMat = new THREE.MeshBasicMaterial({ color: 0xe4ded3, side: THREE.DoubleSide })
function applyMaterialConfig() {
  if (!membraneMesh) return
  fabricMat = makeTranslucent(buildMeshMaterial(), fabricU)
  membraneMesh.material = props.mode === 'plan' ? planMat : fabricMat
  applyCut()
  // The Grid pattern shows the cable net the form-finding solves, ridge
  // cables darker by their force density.
  if (netLines) netLines.visible = props.materialConfig?.pattern === 'grid'
}

// ── Walk: a person's pace, and the film as a ceiling you duck under ──────────
const EYE = 1.6 * U
const WALK = 1.4 * U            // m/s in scene units: an unhurried walk
const HURRY = 2.2
const velocity = new THREE.Vector3()
const moveState = reactive({ forward: false, backward: false, left: false, right: false, sprint: false })
const walkHint = ref(false)
let hintT = 0
let eyeY = EYE
const clock = new THREE.Clock()
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _want = new THREE.Vector3()
const _down = new THREE.Raycaster(), _downDir = new THREE.Vector3(0, -1, 0), _from = new THREE.Vector3()

let isDragging = false
let lastMouseX = 0, lastMouseY = 0
let cameraYaw = 0, cameraPitch = 0
const mouseSensitivity = 0.0035

// Ortho frustum size (half-height), updated when setting iso/plan views
let orthoFrustumSize = 100

// Plan cut
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.5 * U)

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  container = containerEl.value
  renderer.setSize(container.offsetWidth, container.offsetHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.localClippingEnabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  container.appendChild(renderer.domElement)

  labelRenderer = new CSS2DRenderer({ element: labelsEl.value })
  labelRenderer.setSize(container.offsetWidth, container.offsetHeight)

  const aspect = container.offsetWidth / container.offsetHeight
  perspCamera = new THREE.PerspectiveCamera(66, aspect, 0.1, 3000)
  perspCamera.position.set(0, EYE, 30)
  perspCamera.rotation.order = 'YXZ'
  orthoCamera = new THREE.OrthographicCamera(-orthoFrustumSize * aspect, orthoFrustumSize * aspect, orthoFrustumSize, -orthoFrustumSize, 0.01, 50000)
  activeCamera = perspCamera

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#E8E8E8')

  // Image-based light for the physically based materials: a soft studio room,
  // kept low so the sun through the openings stays the event.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  // Sky above, warm bounce from the floor below; its colours follow the score.
  hemiLight = new THREE.HemisphereLight(0xdfe7ef, 0xb49c80, 0.6)
  scene.add(hemiLight)

  sunLight = new THREE.DirectionalLight(0xfffbe8, 2.0)
  sunLight.castShadow = true
  const shadowRes = isPhone ? 1024 : 2048
  sunLight.shadow.mapSize.set(shadowRes, shadowRes)
  Object.assign(sunLight.shadow.camera, { near: 300, far: 900, left: -75, right: 75, top: 75, bottom: -75 })
  sunLight.shadow.bias = -0.0004
  sunLight.shadow.normalBias = 0.25
  sunLight.shadow.radius = 3
  scene.add(sunLight)

  const skyFill = new THREE.DirectionalLight(0xc9e8ff, 0.25)
  skyFill.position.set(-200, 300, -100)
  scene.add(skyFill)

  groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25 }))
  groundPlane.rotation.x = -Math.PI / 2
  groundPlane.position.y = -0.04 * U          // just under the floor: coplanar, the two would z-fight
  groundPlane.receiveShadow = true
  scene.add(groundPlane)

  orbitControls = new OrbitControls(orthoCamera, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.05
  orbitControls.enabled = false

  renderer.domElement.addEventListener('pointerdown', onMouseDown)
  renderer.domElement.addEventListener('pointermove', onMouseMove)
  renderer.domElement.addEventListener('pointerup', onMouseUp)
  renderer.domElement.addEventListener('pointerleave', onMouseUp)
  renderer.domElement.addEventListener('click', onPlantClick)
  renderer.domElement.addEventListener('pointermove', onPlaceMove)
  if (props.interactive !== false) {
    container.addEventListener('dragover', onDragOver)
    container.addEventListener('dragleave', onDragLeave)
    container.addEventListener('drop', onDrop)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
  }

  updateSunPosition(props.sunHour ?? 12)
  animate()
}

// ── Mouse drag (walk look) ──────────────────────────────────────────────────

function onMouseDown(e) {
  if (props.mode !== 'walk') return
  isDragging = true
  lastMouseX = e.clientX
  lastMouseY = e.clientY
}
function onMouseMove(e) {
  if (!isDragging || props.mode !== 'walk') return
  cameraYaw -= (e.clientX - lastMouseX) * mouseSensitivity
  cameraPitch -= (e.clientY - lastMouseY) * mouseSensitivity
  cameraPitch = Math.max(-1.2, Math.min(1.2, cameraPitch))
  lastMouseX = e.clientX
  lastMouseY = e.clientY
  perspCamera.rotation.y = cameraYaw
  perspCamera.rotation.x = cameraPitch
}
function onMouseUp() { isDragging = false }

// ── Keyboard (WASD) ─────────────────────────────────────────────────────────

function onKeyDown(e) {
  if (e.target.closest?.('input, textarea, select')) return
  if (e.code === 'Escape' && props.placing) { emits('placingDone'); return }
  if ((e.code === 'Delete' || e.code === 'Backspace') && selectedPlant) {
    e.preventDefault()
    deleteSelectedPlant()
    return
  }
  if (props.mode !== 'walk') return
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward = true; e.preventDefault(); break
    case 'KeyS': case 'ArrowDown':  moveState.backward = true; e.preventDefault(); break
    case 'KeyA': case 'ArrowLeft':  moveState.left = true; e.preventDefault(); break
    case 'KeyD': case 'ArrowRight': moveState.right = true; e.preventDefault(); break
    case 'ShiftLeft': case 'ShiftRight': moveState.sprint = true; break
  }
}
function onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward = false; break
    case 'KeyS': case 'ArrowDown':  moveState.backward = false; break
    case 'KeyA': case 'ArrowLeft':  moveState.left = false; break
    case 'KeyD': case 'ArrowRight': moveState.right = false; break
    case 'ShiftLeft': case 'ShiftRight': moveState.sprint = false; break
  }
}

// ── View setters ────────────────────────────────────────────────────────────

// Stand south-south-east, facing the arches the sun path puts on the south side.
const FRONT = new THREE.Vector3(Math.sin(2.6), 0, -Math.cos(2.6))

// Plants are solid: you walk round them, not through them.
const clearOfPlants = (x, z) => plants.every(p => Math.hypot(p.group.position.x - x, p.group.position.z - z) > (0.75 * p.group.scale.x + 0.35) * U)

// ...and none stands right in front of you when you arrive
const viewClear = (x, z) => plants.every(p => {
  const dx = p.group.position.x - x, dz = p.group.position.z - z, d = Math.hypot(dx, dz)
  return d > 2.2 * U || (dx * FRONT.x + dz * FRONT.z) / (d || 1) < Math.cos(0.6)
})

function setViewWalk() {
  // start inside, behind the oculus, facing the arches on the sun side, with a clear view
  const R = room.bounds.radius, side = new THREE.Vector3(-FRONT.z, 0, FRONT.x)
  let at = null
  for (const b of [0.16, 0.28, 0.06, 0.38]) for (const l of [0, 0.14, -0.14, 0.26, -0.26]) {
    const x = -FRONT.x * b * R + side.x * l * R, z = -FRONT.z * b * R + side.z * l * R
    if (!at && clearOfPlants(x, z) && viewClear(x, z) && filmAbove(x, z) > 1.15 * U) at = [x, z]
  }
  at ??= [-FRONT.x * 0.16 * R, -FRONT.z * 0.16 * R]
  perspCamera.position.set(at[0], 0, at[1])
  eyeY = eyeAt(perspCamera.position.x, perspCamera.position.z)
  perspCamera.position.y = eyeY
  velocity.set(0, 0, 0)
  cameraYaw = Math.atan2(-FRONT.x, -FRONT.z)
  cameraPitch = 0.08
  perspCamera.rotation.set(cameraPitch, cameraYaw, 0)
  walkHint.value = true
  clearTimeout(hintT)
  hintT = setTimeout(() => { walkHint.value = false }, 5000)
}

function setViewIsometric() {
  const center = new THREE.Vector3(0, room.bounds.height * 0.38, 0)
  const distance = Math.max(room.bounds.radius, room.bounds.height) * 3
  orthoCamera.position.set(center.x + FRONT.x * distance, center.y + distance * 0.8, center.z + FRONT.z * distance)
  orthoCamera.up.set(0, 1, 0)
  orthoCamera.lookAt(center)
  updateOrthoFrustum(frameGoal.size || room.bounds.radius * 1.3)
  orbitControls.target.copy(center)
  orbitControls.update()
}

function setViewTop() {
  // centred a little south of the room: the sun path swings round that side
  const zc = room.bounds.radius * 0.1
  orthoCamera.position.set(0, 600, zc)
  orthoCamera.up.set(0, 0, -1)
  orthoCamera.lookAt(0, 0, zc)
  updateOrthoFrustum(frameGoal.size || room.bounds.radius * 1.6)
  orbitControls.target.set(0, 0, zc)
  orbitControls.update()
}

function updateOrthoFrustum(halfSize) {
  orthoFrustumSize = halfSize
  const aspect = container.offsetWidth / container.offsetHeight
  orthoCamera.left = -halfSize * aspect
  orthoCamera.right = halfSize * aspect
  orthoCamera.top = halfSize
  orthoCamera.bottom = -halfSize
  orthoCamera.updateProjectionMatrix()
}

// The card floats over the left of the stage: shift the lens so the room sits
// in the middle of what is left. setViewOffset moves the image, not the camera.
const inset = ref(0)
function insetStep(dt) {
  const goal = props.insetLeft || 0
  if (inset.value === goal) return
  inset.value = reduceMotion || Math.abs(goal - inset.value) < 0.5 ? goal : inset.value + (goal - inset.value) * (1 - Math.exp(-8 * dt))
  applyViewOffset()
  updateFrameGoal()
}
function applyViewOffset() {
  const w = container.offsetWidth, h = container.offsetHeight
  for (const cam of [perspCamera, orthoCamera]) {
    if (inset.value < 0.5) cam.clearViewOffset()
    else cam.setViewOffset(w, h, -inset.value / 2, 0, w, h)
  }
}

// ── Sun position ──────────────────────────────────────────────────────────────

// The same solar model the openings are placed with: equinox, Barcelona.
const sunDir = new THREE.Vector3(0, 1, 0)
function updateSunPosition(hour) {
  if (!sunLight) return
  sunVector(hour, undefined, sunDir)
  sunLight.position.copy(sunDir).multiplyScalar(600)
  const low = 1 - Math.min(1, sunDir.y / 0.6)          // warmer and dimmer toward the horizon
  sunLight.color.setRGB(1.0, 0.95 - 0.2 * low, 0.86 - 0.35 * low)
  sunLight.intensity = 1.6 + 1.6 * (1 - low)
  if (shafts && shown) shafts.update(room, sunDir)
  if (plan) plan.sun(hour)
}

// ── Mode application ─────────────────────────────────────────────────────────

function applyMode() {
  if (!orbitControls) return
  updateFrameGoal()
  orbitControls.enabled = props.mode !== 'walk'
  activeCamera = props.mode === 'walk' ? perspCamera : orthoCamera
  if (props.mode === 'walk') setViewWalk()
  else if (props.mode === 'plan') setViewTop()
  else setViewIsometric()
  // plan: top-down, north up; pan and zoom, no turning it
  orbitControls.enableRotate = props.mode !== 'plan'
  if (plan) { plan.group.visible = props.mode === 'plan'; if (plan.group.visible) plan.layout() }
  if (labelsEl.value) labelsEl.value.style.display = props.mode === 'plan' ? '' : 'none'
  if (shafts) shafts.mesh.visible = props.mode !== 'plan'
  applyCut()
}

// ── Plan cut: clip the film at the cut height; at the crown, the roof plan ───

function applyCut() {
  if (!membraneMesh) return
  const on = props.mode === 'plan' && (props.cutHeight ?? 1) < room.ring.y - 0.05
  cutPlane.constant = (props.cutHeight ?? 1) * U
  membraneMesh.material = on ? planMat : fabricMat
  for (const mat of [fabricMat, planMat, rigging?.material]) {
    if (!mat) continue
    mat.clippingPlanes = on ? [cutPlane] : []
    mat.clipShadows = true
    mat.needsUpdate = true
  }
  if (plan) { plan.poche.visible = on; if (on) plan.section() }
}

// ── Plan drawing: the section poche, the sun path and the arches' hours ─────

let plan = null
function createPlan() {
  const group = new THREE.Group()
  group.visible = false
  const ink = new THREE.MeshBasicMaterial({ color: 0x1b1a18, side: THREE.DoubleSide, depthTest: false })
  const sunC = new THREE.Color('#b8800f')

  // Poche: the film cut at the section height, a thick ink line with gaps at the openings
  const maxQ = 260
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxQ * 4 * 3), 3))
  const pIdx = new Uint32Array(maxQ * 6)
  pg.setIndex(new THREE.BufferAttribute(pIdx, 1))
  const poche = new THREE.Mesh(pg, ink)
  poche.renderOrder = 10
  poche.frustumCulled = false
  group.add(poche)
  const pts = []
  function section() {
    sectionAt(room, props.cutHeight ?? 1, pts)
    const P = pg.attributes.position.array, T = 0.22 * U, y = (props.cutHeight ?? 1) * U + 0.05
    let q = 0
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1]
      if (!a || !b || q >= maxQ) continue
      const la = Math.hypot(a[0], a[1]) || 1, lb = Math.hypot(b[0], b[1]) || 1
      const v = q * 12
      P[v] = a[0]; P[v + 1] = y; P[v + 2] = a[1]
      P[v + 3] = b[0]; P[v + 4] = y; P[v + 5] = b[1]
      P[v + 6] = a[0] + a[0] / la * T; P[v + 7] = y; P[v + 8] = a[1] + a[1] / la * T
      P[v + 9] = b[0] + b[0] / lb * T; P[v + 10] = y; P[v + 11] = b[1] + b[1] / lb * T
      const o = q * 6, i0 = q * 4
      pIdx[o] = i0; pIdx[o + 1] = i0 + 1; pIdx[o + 2] = i0 + 2; pIdx[o + 3] = i0 + 1; pIdx[o + 4] = i0 + 3; pIdx[o + 5] = i0 + 2
      q++
    }
    pg.setDrawRange(0, q * 6)
    pg.attributes.position.needsUpdate = true
    pg.index.needsUpdate = true
  }

  // Sun path: the equinox arc from sunrise to sunset, projected on the ground
  const hairSun = new THREE.LineBasicMaterial({ color: sunC, transparent: true, opacity: 0.9, depthTest: false })
  const path = new THREE.Line(new THREE.BufferGeometry(), hairSun)
  const ticks = new THREE.LineSegments(new THREE.BufferGeometry(), hairSun)
  const ray = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: sunC, dashSize: 1.2, gapSize: 1.2, depthTest: false }))
  path.renderOrder = ticks.renderOrder = ray.renderOrder = 11
  path.frustumCulled = ticks.frustumCulled = ray.frustumCulled = false
  group.add(path, ticks, ray)
  const label = (text, cls) => { const d = document.createElement('div'); d.className = 'pl ' + (cls || ''); d.textContent = text; const o = new CSS2DObject(d); group.add(o); return o }
  const hourLabels = [7, 9, 11, 13, 15, 17].map(h => ({ h, o: label(String(h).padStart(2, '0'), 'hour') }))
  const sunDot = label('', 'sun')
  // the sun is a handle: drag it along its path to set the hour
  sunDot.element.title = 'Drag the sun along its path'
  const drag = e => {
    const p = screenToGround(e.clientX, e.clientY)
    if (!p) return
    const l = Math.hypot(p.x, p.z) || 1
    let best = props.sunHour ?? 15, bd = -2
    for (let h = 6.5; h <= 17.5; h += 0.05) { const [x, z] = ground(h, 1); const d = (x * p.x + z * p.z) / l; if (d > bd) { bd = d; best = h } }
    emits('sunHour', Math.round(best * 20) / 20)
  }
  const release = () => {
    window.removeEventListener('pointermove', drag)
    window.removeEventListener('pointerup', release)
    orbitControls.enabled = true
    sunDot.element.classList.remove('held')
  }
  sunDot.element.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation()
    orbitControls.enabled = false
    sunDot.element.classList.add('held')
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', release)
  })
  const archLabels = []
  const sv = new THREE.Vector3()
  const ground = (h, r) => { sunVector(h, undefined, sv); const l = Math.hypot(sv.x, sv.z) || 1; return [sv.x / l * r, sv.z / l * r] }
  let pathR = 0

  function layout() {
    const R = room.bounds.radius * 1.28
    pathR = R
    const arc = []
    for (let h = 6.2; h <= 17.8; h += 0.1) { const [x, z] = ground(h, R); arc.push(x, 0.1, z) }
    path.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arc, 3))
    const t = []
    for (let h = 7; h <= 17; h++) { const [x, z] = ground(h, R), [x2, z2] = ground(h, R + (h % 2 ? 2.2 : 1.2)); t.push(x, 0.1, z, x2, 0.1, z2) }
    ticks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(t, 3))
    for (const { h, o } of hourLabels) { const [x, z] = ground(h, R + 5); o.position.set(x, 0.1, z) }
    // the arches, each labelled with the hour it was placed for
    const st = room.stats, E = room.edge
    while (archLabels.length < st.arches) archLabels.push(label('', 'arch'))
    archLabels.forEach((o, i) => {
      o.visible = i < st.arches
      if (!o.visible) return
      const j = st.archCols[i], x = E[3 * j], z = E[3 * j + 2], l = Math.hypot(x, z) || 1
      o.position.set(x + x / l * 2.6, 0.1, z + z / l * 2.6)
      const hh = st.hours[i]
      o.element.textContent = `${Math.floor(hh)}:${String(Math.round((hh % 1) * 60)).padStart(2, '0')}`
    })
    sun(props.sunHour ?? 15)
  }
  function sun(h) {
    if (!pathR) return
    const [x, z] = ground(h, pathR)
    sunDot.position.set(x, 0.1, z)
    ray.geometry.setFromPoints([new THREE.Vector3(x, 0.1, z), new THREE.Vector3(0, 0.1, 0)])
    ray.computeLineDistances()
  }
  scene.add(group)
  return { group, poche, section, layout, sun }
}

// ── Scale bar for the plan: a round number of metres, drawn to scale ─────────
const scaleBar = reactive({ px: 100, m: 5, ticks: [0, 1, 2, 5] })
function updateScaleBar() {
  const pxPerM = container.offsetHeight / (2 * orthoFrustumSize / orthoCamera.zoom) * U
  const m = [1, 2, 5, 10, 20].find(v => v * pxPerM >= 90) ?? 20
  const px = Math.round(m * pxPerM)
  if (px === scaleBar.px && m === scaleBar.m) return
  scaleBar.px = px; scaleBar.m = m
  scaleBar.ticks = m === 5 ? [0, 1, 2, 5] : m === 10 ? [0, 5, 10] : m === 2 ? [0, 1, 2] : [0, m]
}

// ── Potted plants: dragged from the card, or placed on the golden angle ─────

const plants = []          // array of { group, size }
let selectedPlant = null
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
const dropping = ref(false)

function screenToGround(screenX, screenY) {
  if (!container || !renderer) return null
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, activeCamera)
  const hits = raycaster.intersectObject(groundPlane)
  return hits.length > 0 ? hits[0].point.clone() : null
}

function addPlantAtScreen(sizeKey, screenX, screenY) {
  if (plants.length >= props.maxPlants) return
  const point = screenToGround(screenX, screenY)
  if (!point) return
  const plant = createPottedPlant(sizeKey)
  plant.position.set(point.x, 0, point.z)
  plant.rotation.y = Math.random() * Math.PI * 2
  scene.add(plant)
  plants.push({ group: plant, size: sizeKey })
  fitPlants()
  emits('plantCountChanged', plants.length)
  selectPlant(plant)
}

function selectPlant(group) {
  if (selectedPlant) {
    selectedPlant.traverse(c => {
      if (c.isMesh && c.userData._origEmissive !== undefined) {
        c.material = c.material.clone()
        c.material.emissive.setHex(c.userData._origEmissive)
        delete c.userData._origEmissive
      }
    })
  }
  selectedPlant = group
  if (!group) return
  group.traverse(c => {
    if (c.isMesh) {
      c.userData._origEmissive = c.material.emissive ? c.material.emissive.getHex() : 0
      c.material = c.material.clone()
      c.material.emissive.setHex(0x444444)
    }
  })
}

function deleteSelectedPlant() {
  if (!selectedPlant) return
  scene.remove(selectedPlant)
  const idx = plants.findIndex(p => p.group === selectedPlant)
  if (idx >= 0) plants.splice(idx, 1)
  selectedPlant = null
  emits('plantCountChanged', plants.length)
}

function getPlantCount() { return plants.length }

// A plant never pokes through the film: under a low roof it is scaled down to
// stand a hand's width below the fabric where it is.
function fitPlants() {
  if (!membraneMesh) return
  for (const p of plants) {
    const film = filmAbove(p.group.position.x, p.group.position.z)
    const room_ = Number.isFinite(film) ? film - 0.15 * U : Infinity
    p.group.scale.setScalar(Math.max(0.35, Math.min(1, room_ / plantTop(p.size))))
  }
}

// Plants follow the count the parent holds. New ones land on golden-angle
// spots across the floor (tap to place); a dragged plant lands where dropped.
function syncPlants(n) {
  while (plants.length > n) scene.remove(plants.pop().group)
  while (plants.length < n) {
    const i = plants.length, size = PLANT_ORDER[i % 3]
    const [x, z] = plantSpot(i, room)
    const plant = createPottedPlant(size)
    plant.position.set(x, 0, z)
    plant.rotation.y = i * 1.7
    scene.add(plant)
    plants.push({ group: plant, size })
  }
  fitPlants()
}

// ── Placing: a ghost plant rides the cursor over the floor; a click plants it ─
let ghostPlant = null
function setPlacing(size) {
  if (ghostPlant) { scene.remove(ghostPlant); ghostPlant = null }
  renderer.domElement.style.cursor = size ? 'crosshair' : ''
  ghost(!!size)
  if (!size) return
  ghostPlant = createPottedPlant(size)
  ghostPlant.traverse(c => { if (c.isMesh) { c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.55; c.castShadow = false } })
  ghostPlant.visible = false
  scene.add(ghostPlant)
}
function onPlaceMove(e) {
  if (!ghostPlant) return
  const p = screenToGround(e.clientX, e.clientY)
  if (!p) { ghostPlant.visible = false; return }
  const film = filmAbove(p.x, p.z)
  ghostPlant.visible = true
  ghostPlant.position.set(p.x, 0, p.z)
  ghostPlant.scale.setScalar(Math.max(0.35, Math.min(1, (Number.isFinite(film) ? film - 0.15 * U : Infinity) / plantTop(props.placing))))
}

function onPlantClick(e) {
  if (!renderer || props.mode === 'walk') return
  if (props.placing) {
    addPlantAtScreen(props.placing, e.clientX, e.clientY)
    if (plants.length >= props.maxPlants) emits('placingDone')
    return
  }
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, activeCamera)
  const plantMeshes = []
  plants.forEach(p => p.group.traverse(c => { if (c.isMesh) plantMeshes.push(c) }))
  const hits = raycaster.intersectObjects(plantMeshes, false)
  if (hits.length > 0) {
    let obj = hits[0].object
    while (obj && !obj.userData.isPlant) obj = obj.parent
    if (obj) { selectPlant(obj); return }
  }
  selectPlant(null)
}

// While a plant is dragged over the room the film ghosts, so you see the floor
// you are aiming at; it stays ghosted a moment after the drop to show where it landed.
let ghostT = 0
function ghost(on) {
  clearTimeout(ghostT)
  if (!on && props.placing) return
  if (!fabricMat || fabricMat.transparent === on) return
  fabricMat.transparent = on
  fabricMat.opacity = on ? 0.25 : (props.materialConfig?.opacity ?? 1)
  fabricMat.depthWrite = !on
  fabricMat.needsUpdate = true
}
function onDragOver(e) {
  if (!e.dataTransfer?.types?.includes('application/x-ns-plant')) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  dropping.value = true
  ghost(true)
}
function onDragLeave() { dropping.value = false; ghostT = setTimeout(() => ghost(false), 300) }
function onDrop(e) {
  dropping.value = false
  const sizeKey = e.dataTransfer.getData('application/x-ns-plant')
  if (!sizeKey || !PLANT_SIZES[sizeKey]) return
  e.preventDefault()
  addPlantAtScreen(sizeKey, e.clientX, e.clientY)
  ghostT = setTimeout(() => ghost(false), 1400)
}

// ── Room (form-found in code, see geometry/membrane.js) ──────────────────────

const room = createRoom()
const fabricU = fabricUniforms()
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const MORPH_RATE = 7   // per second: a slider change settles in about half a second
let shown = null       // the parameter state on screen, easing toward `target`
let target = null
let rigging = null
let shafts = null
let netLines = null
let figure = null
let settle = 0

function buildRoomMeshes() {
  loadedObject = new THREE.Group()
  fabricMat = makeTranslucent(buildMeshMaterial(), fabricU)
  membraneMesh = new THREE.Mesh(room.membrane, fabricMat)
  membraneMesh.castShadow = membraneMesh.receiveShadow = true
  const floor = new THREE.Mesh(room.floor, new THREE.MeshStandardMaterial({ map: timberTexture(renderer), roughness: 0.5, envMapIntensity: 0.45, vertexColors: true }))
  floor.receiveShadow = true
  netLines = new THREE.LineSegments(room.net, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }))
  netLines.visible = props.materialConfig?.pattern === 'grid'
  rigging = createRigging(U)
  shafts = createShafts(U)
  figure = createFigure()
  loadedObject.add(membraneMesh, floor, netLines, rigging.group, figure.group)
  scene.add(loadedObject, shafts.mesh)
  plan = createPlan()
}

let lastSolveEmit = 0
function write(first = false) {
  const t0 = performance.now()
  writeRoom(room, shown, first ? {} : undefined)
  const ms = performance.now() - t0
  if (!first && t0 - lastSolveEmit > 400) { lastSolveEmit = t0; emits('solved', ms) }
  rigging?.update(room)
  figure?.update(room)
  shafts?.update(room, sunDir)
  if (plan && props.mode === 'plan') { plan.layout(); if (plan.poche.visible) plan.section() }
  updateFrameGoal()
}

// The orthographic views keep the whole room in frame as it grows or shrinks,
// fitted to the part of the stage the card leaves free.
const frameGoal = { size: 0, y: 0 }
function updateFrameGoal() {
  const b = room.bounds
  const w = container ? Math.max(container.offsetWidth * 0.4, container.offsetWidth - (props.insetLeft || 0)) : 1
  const aspect = container ? Math.min(1, w / Math.max(1, container.offsetHeight)) : 1
  frameGoal.size = props.mode === 'plan' ? b.radius * 1.78 / aspect : Math.max(b.radius * 1.3 / aspect, b.height * 0.88)
  frameGoal.y = props.mode === 'plan' ? 0 : b.height * 0.38
}
function frameStep(dt) {
  if (props.mode === 'walk' || !frameGoal.size) return
  const a = reduceMotion ? 1 : 1 - Math.exp(-5 * dt)
  const ds = frameGoal.size - orthoFrustumSize, dy = props.mode === 'plan' ? 0 : frameGoal.y - orbitControls.target.y
  if (Math.abs(ds) < 0.01 && Math.abs(dy) < 0.01) return
  updateOrthoFrustum(orthoFrustumSize + ds * a)
  orbitControls.target.y += dy * a
  orthoCamera.position.y += dy * a
}

function setTarget(data) {
  target = roomParams(data)
  if (!shown || reduceMotion) {
    const first = !shown
    shown = { ...target }
    write(first)
  }
}

// Ease every parameter toward its slider value and re-solve the same net from
// where it was: the membrane morphs, it is never rebuilt.
function morphStep(dt) {
  if (!target || !shown) return
  const a = 1 - Math.exp(-MORPH_RATE * dt)
  let changed = false
  for (const k in target) {
    const d = target[k] - shown[k]
    if (d === 0) continue
    shown[k] = Math.abs(d) < 1e-3 ? target[k] : shown[k] + d * a
    changed = true
  }
  // keep relaxing for a moment after the sliders stop: the film settles
  if (changed) { write(); settle = 40 }
  else if (settle > 0) { settle--; write(); if (settle === 0) fitPlants() }
}

// ── Walk step: a steady pace, easing in and out; the film is the ceiling ────

// Highest film above a plan point, by a ray cast down onto the membrane.
function filmAbove(x, z) {
  _from.set(x, 400, z)
  _down.set(_from, _downDir)
  const hit = _down.intersectObject(membraneMesh, false)[0]
  return hit ? hit.point.y : Infinity
}
// Eye height under the film: stand at 1.6 m, duck where the film comes lower.
const eyeAt = (x, z) => Math.max(0.9 * U, Math.min(EYE, filmAbove(x, z) - 0.3 * U))
function walkStep(dt) {
  perspCamera.getWorldDirection(_fwd)
  _fwd.y = 0
  if (_fwd.lengthSq() > 0) _fwd.normalize()
  _right.crossVectors(_fwd, _up)
  _want.set(0, 0, 0)
  if (moveState.forward) _want.add(_fwd)
  if (moveState.backward) _want.sub(_fwd)
  if (moveState.right) _want.add(_right)
  if (moveState.left) _want.sub(_right)
  if (_want.lengthSq() > 0) _want.normalize().multiplyScalar(WALK * (moveState.sprint ? HURRY : 1))
  velocity.lerp(_want, 1 - Math.exp(-8 * dt))
  if (velocity.lengthSq() < 1e-4) return
  // move, unless the film there is too low to stand under: slide along it instead
  const p = perspCamera.position, ok = (x, z) => filmAbove(x, z) > 1.15 * U && clearOfPlants(x, z)
  const nx = p.x + velocity.x * dt, nz = p.z + velocity.z * dt
  if (ok(nx, nz)) { p.x = nx; p.z = nz }
  else if (ok(nx, p.z)) { p.x = nx; velocity.z = 0 }
  else if (ok(p.x, nz)) { p.z = nz; velocity.x = 0 }
  else velocity.set(0, 0, 0)
  eyeY += (eyeAt(p.x, p.z) - eyeY) * (1 - Math.exp(-6 * dt))
  p.y = eyeY
}

// ── Score-driven atmosphere ──────────────────────────────────────────────────
// The score tints the air, it decides nothing: a cool flat grey while the
// estimate reads high stress, a warmer, brighter ground as it reads restorative.

const ATMO_STRESS = { bg: new THREE.Color('#d6d8dc'), sky: new THREE.Color('#c9d3de'), exposure: 0.95 }
const ATMO_CALM   = { bg: new THREE.Color('#eee6d8'), sky: new THREE.Color('#f3e6cf'), exposure: 1.12 }
const PLAN_BG = new THREE.Color('#f3efe8')
let atmo = -1, planBg = 0

function atmosphereStep(dt) {
  const goal = Math.min(1, Math.max(0, (props.score ?? 30) / 100))
  const pGoal = props.mode === 'plan' ? 1 : 0
  if (atmo === goal && planBg === pGoal) return
  atmo = atmo < 0 || reduceMotion || Math.abs(goal - atmo) < 1e-3 ? goal : atmo + (goal - atmo) * (1 - Math.exp(-3 * dt))
  planBg = reduceMotion || Math.abs(pGoal - planBg) < 1e-3 ? pGoal : planBg + (pGoal - planBg) * (1 - Math.exp(-8 * dt))
  // the plan reads as a drawing on paper; the other views take the score's air
  scene.background.copy(ATMO_STRESS.bg).lerp(ATMO_CALM.bg, atmo).lerp(PLAN_BG, planBg)
  hemiLight.color.copy(ATMO_STRESS.sky).lerp(ATMO_CALM.sky, atmo)
  renderer.toneMappingExposure = ATMO_STRESS.exposure + (ATMO_CALM.exposure - ATMO_STRESS.exposure) * atmo
}

// ── Animation loop ───────────────────────────────────────────────────────────

let rafId = 0
function animate() {
  rafId = requestAnimationFrame(animate)
  const delta = Math.min(clock.getDelta(), 0.1)
  morphStep(delta)
  insetStep(delta)
  frameStep(delta)
  atmosphereStep(delta)
  if (props.mode === 'walk') walkStep(delta)
  else orbitControls.update()
  updateFabric(fabricU, sunDir, activeCamera)
  renderer.render(scene, activeCamera)
  if (props.mode === 'plan') { labelRenderer.render(scene, activeCamera); updateScaleBar() }
}

// ── Window resize ────────────────────────────────────────────────────────────

let resizeObserver = null
function onWindowResize() {
  if (!container || !renderer) return
  const width = container.offsetWidth, height = container.offsetHeight
  perspCamera.aspect = width / height
  perspCamera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer.setSize(width, height)
  updateOrthoFrustum(orthoFrustumSize)
  applyViewOffset()
  updateFrameGoal()
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  clearTimeout(hintT)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  resizeObserver?.disconnect()
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onMouseDown)
    renderer.domElement.removeEventListener('pointermove', onMouseMove)
    renderer.domElement.removeEventListener('pointerup', onMouseUp)
    renderer.domElement.removeEventListener('pointerleave', onMouseUp)
    renderer.domElement.removeEventListener('click', onPlantClick)
    container?.removeEventListener('dragover', onDragOver)
    container?.removeEventListener('dragleave', onDragLeave)
    container?.removeEventListener('drop', onDrop)
    renderer.dispose()
  }
})

onMounted(() => {
  init()
  buildRoomMeshes()
  setTarget(props.data)
  syncPlants(props.data?.['Potted Plants'] ?? 0)
  inset.value = props.insetLeft || 0
  applyViewOffset()
  applyMode()
  frameStep(1)
  resizeObserver = new ResizeObserver(onWindowResize)
  resizeObserver.observe(container)
})

// ── Watchers ─────────────────────────────────────────────────────────────────

watch(() => props.data, (data) => { setTarget(data); syncPlants(data?.['Potted Plants'] ?? 0) }, { deep: true })
watch(() => props.mode, () => applyMode())
watch(() => props.cutHeight, () => applyCut())
watch(() => props.data?.['Height'], () => applyCut())
watch(() => props.materialConfig, () => { applyMaterialConfig() }, { deep: true })
watch(() => props.sunHour, h => { updateSunPosition(h) })
watch(() => props.placing, size => setPlacing(size))

// ── Screenshot capture ────────────────────────────────────────────

function captureScreenshot() {
  if (!renderer) return null
  renderer.render(scene, activeCamera)
  return renderer.domElement.toDataURL('image/png')
}

// The form-found membrane and its floor as an .obj in metres, Y up, for Rhino.
function exportOBJ() {
  const group = new THREE.Group()
  for (const [g, name] of [[room.membrane, 'membrane'], [room.floor, 'floor']]) {
    const m = new THREE.Mesh(g.clone())
    m.name = name
    m.scale.setScalar(1 / U)
    group.add(m)
  }
  group.updateMatrixWorld(true)
  return new OBJExporter().parse(group)
}

defineExpose({ captureScreenshot, addPlantAtScreen, deleteSelectedPlant, getPlantCount, exportOBJ })
</script>

<style scoped>
.ns-viewport { height: 100%; width: 100%; min-width: 200px; position: relative; }
.ns-three { height: 100%; width: 100%; min-width: 200px; position: inherit; }
.ns-viewport.drop::after { content: 'Drop to place the plant'; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;
  font: 500 var(--ns-t-ui) var(--ns-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ns-ink); background: var(--ns-surface); border: 1px dashed var(--ns-d-plants); border-radius: var(--ns-r-pill); padding: 8px 14px; }
.ns-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.ns-labels :deep(.pl) { font: 500 10px var(--ns-mono); letter-spacing: .08em; color: var(--ns-ink-2); white-space: nowrap; }
.ns-labels :deep(.pl.hour) { color: var(--ns-sun); }
.ns-labels :deep(.pl.arch) { background: var(--ns-surface); border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); padding: 2px 7px; color: var(--ns-ink); }
.ns-labels :deep(.pl.sun) { width: 16px; height: 16px; border-radius: 50%; background: var(--ns-sun); box-shadow: 0 0 0 5px #b8800f33; pointer-events: auto; cursor: grab; touch-action: none; transition: box-shadow var(--ns-fast); }
.ns-labels :deep(.pl.sun:hover), .ns-labels :deep(.pl.sun.held) { box-shadow: 0 0 0 9px #b8800f40; }
.ns-labels :deep(.pl.sun.held) { cursor: grabbing; }

.walk-hint { position: absolute; top: 118px; transform: translateX(-50%); margin: 0; display: flex; gap: 4px; align-items: center; pointer-events: none;
  font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-ink); background: #fbfaf7e6; border: 1px solid var(--ns-line); border-radius: var(--ns-r-pill); padding: 6px 12px; box-shadow: var(--ns-e1); white-space: nowrap; }
.walk-hint kbd { font: 500 10px var(--ns-mono); border: 1px solid var(--ns-line-strong); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; background: #fff; }
.walk-btn { position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 10; padding: 10px 18px; border-radius: var(--ns-r-pill); border: 1px solid var(--ns-ink); background: var(--ns-surface); font: 500 var(--ns-t-ui) var(--ns-mono); touch-action: none; }
.fade-enter-active, .fade-leave-active { transition: opacity var(--ns-slow) var(--ns-ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.north { position: absolute; right: 24px; top: 120px; color: var(--ns-ink); pointer-events: none; }
.north text { font: 600 11px var(--ns-mono); fill: currentColor; }
.sheet { position: absolute; bottom: 96px; pointer-events: none; }
.sheet p { margin: 8px 0 0; font: var(--ns-t-ui) var(--ns-mono); color: var(--ns-mute); }
.scale { position: relative; height: 6px; border: 1px solid var(--ns-ink); border-top: 0; margin-top: 16px; }
.scale b { position: absolute; left: 0; top: 0; height: 3px; width: 50%; background: var(--ns-ink); }
.scale i { position: absolute; top: -15px; transform: translateX(-50%); font: normal 10px var(--ns-mono); color: var(--ns-ink-2); }
@media (prefers-reduced-motion: reduce) { .fade-enter-active, .fade-leave-active { transition: none; } }
</style>
