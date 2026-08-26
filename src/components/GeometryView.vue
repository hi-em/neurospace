<template>
  <div id="viewport">
    <div id="threejs-container"></div>
    <div v-if="errorMessage" class="error-overlay">{{ errorMessage }}</div>

    <!-- Cut plane slider — only visible in plan view -->
    <div v-if="props.mode === 'plan'" class="cut-plane-overlay">
      <button class="cut-plane-toggle" :class="{ active: cutPlaneEnabled }" @click="toggleCutPlane">
        {{ cutPlaneEnabled ? 'Cut ON' : 'Cut OFF' }}
      </button>
      <label class="cut-plane-label">Cut Height</label>
      <input
        type="range"
        class="cut-plane-slider"
        min="1"
        max="16"
        step="0.1"
        :disabled="!cutPlaneEnabled"
        v-model.number="cutPlaneHeight"
      />
      <span class="cut-plane-value">{{ cutPlaneHeight.toFixed(1) }}m</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch, nextTick, ref, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { Rhino3dmLoader } from 'three/addons/loaders/3DMLoader.js'
import { runCompute, loadRhino } from '@/scripts/compute.js'

const loader = new Rhino3dmLoader()
loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.0.0-beta2/')

const props = defineProps(['data', 'path', 'color', 'mode', 'sunHour', 'showSurroundings', 'materialConfig'])
const emits = defineEmits(['updateMetadata', 'docReady', 'plantCountChanged'])

// Three.js objects
let renderer, perspCamera, orthoCamera, activeCamera
let scene, orbitControls, container, axesHelper, groundPlane, sunLight
let loadedObject = null
let hasLoaded = false
let surroundingsGroup = null

const isReady = ref(false)
const errorMessage = ref(null)

// Material presets
const PATTERN_NONE = 'solid'
const PATTERN_WIREFRAME = 'wireframe'
const PATTERN_GRID = 'grid'

function buildMeshMaterial() {
  const cfg = props.materialConfig || {}
  const color = new THREE.Color(cfg.color || '#ffffff')
  const opacity = cfg.opacity ?? 1.0
  const roughness = cfg.roughness ?? 0.5
  const metalness = cfg.metalness ?? 0.0
  const pattern = cfg.pattern || PATTERN_NONE
  const isTransparent = opacity < 1.0
  const isWireframe = pattern === PATTERN_WIREFRAME

  // Clearcoat for glossy feel: low roughness → high clearcoat
  const clearcoat = roughness < 0.3 ? 1.0 - roughness : 0
  const clearcoatRoughness = roughness * 0.5

  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    transparent: isTransparent,
    opacity,
    clearcoat,
    clearcoatRoughness,
    wireframe: isWireframe,
    side: THREE.DoubleSide,
  })
}

function applyMaterialConfig() {
  if (!loadedObject) return
  const cfg = props.materialConfig || {}
  const pattern = cfg.pattern || PATTERN_NONE

  // Clean up existing grid overlays
  cleanupGridOverlays()

  const mat = buildMeshMaterial()
  loadedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      const hadClip = child.material.clippingPlanes && child.material.clippingPlanes.length > 0
      child.material = mat.clone()
      if (hadClip && cutPlaneEnabled.value) {
        child.material.clippingPlanes = [cutPlane]
        child.material.clipShadows = true
      }
      child.material.needsUpdate = true
    }
  })

  // Add grid lines overlay if pattern is grid
  if (pattern === PATTERN_GRID) {
    addGridOverlay()
  }
}

// Grid overlay helpers
let gridOverlays = []

function addGridOverlay() {
  if (!loadedObject) return
  const gridMat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 })
  loadedObject.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const edges = new THREE.EdgesGeometry(child.geometry, 15)
      const line = new THREE.LineSegments(edges, gridMat)
      child.add(line)
      gridOverlays.push(line)
    }
  })
}

function cleanupGridOverlays() {
  gridOverlays.forEach(l => {
    if (l.parent) l.parent.remove(l)
    l.geometry?.dispose()
    l.material?.dispose()
  })
  gridOverlays = []
}

// Cut plane (plan view section)
const cutPlaneHeight = ref(10)
const cutPlaneEnabled = ref(false)
let cutPlane = null
let geoWorldHeight = 1 // actual Y extent of the loaded geometry in world units

// Dynamic cut plane max based on ceiling height
const cutPlaneMax = computed(() => {
  const h = props.data?.['Height'] ?? 15
  return h + 1
})

// Walk mode constants
const eyeHeight = 5
const walkSpeed = 100.0
const sprintMultiplier = 2.5
const jumpHeight = 15
const gravity = 60
let clock = new THREE.Clock()

// Pre-allocated vectors reused every animation frame (avoids per-frame GC pressure)
const _walkForward = new THREE.Vector3()
const _walkRight   = new THREE.Vector3()
const _walkUp      = new THREE.Vector3(0, 1, 0)

// Walk mode state
const moveState = { forward: false, backward: false, left: false, right: false, sprint: false }
let isJumping = false
let jumpVelocity = 0
const velocity = new THREE.Vector3()

// Walk camera look state
let isDragging = false
let lastMouseX = 0, lastMouseY = 0
let cameraYaw = 0, cameraPitch = 0
const mouseSensitivity = 0.003

// Ortho frustum size (half-height), updated when setting iso/plan views
let orthoFrustumSize = 100

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  container = document.getElementById('threejs-container')
  renderer.setSize(container.offsetWidth, container.offsetHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.localClippingEnabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const aspect = container.offsetWidth / container.offsetHeight

  // Perspective camera — walk mode
  perspCamera = new THREE.PerspectiveCamera(75, aspect, 0.01, 50000)
  perspCamera.position.set(0, eyeHeight, 100)
  perspCamera.rotation.order = 'YXZ'

  // Orthographic camera — isometric & plan modes
  orthoCamera = new THREE.OrthographicCamera(
    -orthoFrustumSize * aspect, orthoFrustumSize * aspect,
    orthoFrustumSize, -orthoFrustumSize,
    0.01, 50000
  )

  activeCamera = perspCamera

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#E8E8E8')

  axesHelper = new THREE.AxesHelper(5)
  scene.add(axesHelper)

  // Neutral white ambient so geometry reads true colour
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambientLight)

  // Sun light — position and color are driven by updateSunPosition()
  sunLight = new THREE.DirectionalLight(0xfffbe8, 2.0)
  sunLight.position.set(300, 500, 200)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 2000
  sunLight.shadow.camera.left = -400
  sunLight.shadow.camera.right = 400
  sunLight.shadow.camera.top = 400
  sunLight.shadow.camera.bottom = -400
  sunLight.shadow.bias = -0.0005
  scene.add(sunLight)

  // Soft sky fill from the opposite side — no shadows
  const skyFill = new THREE.DirectionalLight(0xc9e8ff, 0.4)
  skyFill.position.set(-200, 300, -100)
  scene.add(skyFill)

  // Ground plane to receive shadows
  const groundGeo = new THREE.PlaneGeometry(2000, 2000)
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 })
  groundPlane = new THREE.Mesh(groundGeo, groundMat)
  groundPlane.rotation.x = -Math.PI / 2
  groundPlane.position.y = 0
  groundPlane.receiveShadow = true
  scene.add(groundPlane)

  // OrbitControls bound to orthoCamera (used for iso/plan modes)
  orbitControls = new OrbitControls(orthoCamera, renderer.domElement)
  orbitControls.enableDamping = true
  orbitControls.dampingFactor = 0.05
  orbitControls.enabled = false // disabled until an orbit mode is selected

  // Mouse drag listeners for walk mode look + plant selection
  renderer.domElement.addEventListener('mousedown', onMouseDown)
  renderer.domElement.addEventListener('mousemove', onMouseMove)
  renderer.domElement.addEventListener('mouseup', onMouseUp)
  renderer.domElement.addEventListener('mouseleave', onMouseUp)
  renderer.domElement.addEventListener('click', onPlantClick)

  // Drop zone for plants
  renderer.domElement.addEventListener('dragover', onDragOver)
  renderer.domElement.addEventListener('drop', onDrop)

  // Keyboard listeners for WASD + Delete
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)

  cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutPlaneHeight.value)
  buildSurroundings()
  updateSunPosition(props.sunHour ?? 12)
  applyMode()
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
  const dx = e.clientX - lastMouseX
  const dy = e.clientY - lastMouseY
  lastMouseX = e.clientX
  lastMouseY = e.clientY

  cameraYaw -= dx * mouseSensitivity
  cameraPitch -= dy * mouseSensitivity
  cameraPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, cameraPitch))

  perspCamera.rotation.y = cameraYaw
  perspCamera.rotation.x = cameraPitch
}

function onMouseUp() {
  isDragging = false
}

// ── Keyboard (WASD) ─────────────────────────────────────────────────────────

function onKeyDown(e) {
  // Delete selected plant
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (selectedPlant) {
      e.preventDefault()
      deleteSelectedPlant()
      return
    }
  }
  if (props.mode !== 'walk') return
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    moveState.forward = true; break
    case 'KeyS': case 'ArrowDown':  moveState.backward = true; break
    case 'KeyA': case 'ArrowLeft':  moveState.left = true; break
    case 'KeyD': case 'ArrowRight': moveState.right = true; break
    case 'Space':
      e.preventDefault()
      if (!isJumping) { isJumping = true; jumpVelocity = jumpHeight }
      break
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

function setViewWalk() {
  if (!loadedObject) return
  const box = new THREE.Box3().setFromObject(loadedObject)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.z)

  perspCamera.position.set(center.x, eyeHeight, center.z + maxDim * 1.5)
  cameraYaw = 0
  cameraPitch = 0
  perspCamera.rotation.y = cameraYaw
  perspCamera.rotation.x = cameraPitch
}

function setViewIsometric() {
  const FALLBACK = 300  // world units — fits the surroundings context
  let center = new THREE.Vector3()
  let maxDim = FALLBACK

  if (loadedObject) {
    const box = new THREE.Box3().setFromObject(loadedObject)
    if (box.min.x !== Infinity) {
      box.getCenter(center)
      const size = box.getSize(new THREE.Vector3())
      maxDim = Math.max(size.x, size.y, size.z) || FALLBACK
    }
  }

  const distance = maxDim * 2
  // True isometric: camera along (-1,1,-1) from center
  orthoCamera.position.set(center.x - distance, center.y + distance, center.z - distance)
  orthoCamera.up.set(0, 1, 0)
  orthoCamera.lookAt(center)

  updateOrthoFrustum(maxDim * 0.85)
  orbitControls.target.copy(center)
  orbitControls.update()
}

function setViewTop() {
  const FALLBACK = 300
  let center = new THREE.Vector3()
  let maxDim = FALLBACK

  if (loadedObject) {
    const box = new THREE.Box3().setFromObject(loadedObject)
    if (box.min.x !== Infinity) {
      box.getCenter(center)
      const size = box.getSize(new THREE.Vector3())
      maxDim = Math.max(size.x, size.z) || FALLBACK
    }
  }

  const distance = maxDim * 3
  orthoCamera.position.set(center.x, center.y + distance, center.z)
  orthoCamera.up.set(0, 0, -1)
  orthoCamera.lookAt(center)

  updateOrthoFrustum(maxDim * 0.85)
  orbitControls.target.copy(center)
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

// ── Sun position ──────────────────────────────────────────────────────────────

function updateSunPosition(hour) {
  if (!sunLight) return
  const t = (hour - 6) / 12                        // 0 → 1 (sunrise → sunset)
  const azimuth = t * Math.PI                       // east → west arc (0 → π)
  const elev    = Math.sin(t * Math.PI)             // 0 → 1 → 0 (peak at noon)
  const elevRad = elev * (Math.PI / 2)
  const dist    = 600

  sunLight.position.set(
    Math.cos(azimuth) * Math.cos(elevRad) * dist,
    Math.sin(elevRad) * dist,
    Math.sin(azimuth) * Math.cos(elevRad) * dist * 0.6
  )

  // Warm orange near horizon → warm white at noon
  const warmth = 1 - elev
  sunLight.color.setRGB(1.0, 0.97 - warmth * 0.25, 0.91 - warmth * 0.45)

  // Dimmer at dawn/dusk, brightest at noon (kept softer for translucent material)
  sunLight.intensity = 0.4 + elev * 1.1
}

// ── Surroundings ─────────────────────────────────────────────────────────────

function buildSurroundings() {
  surroundingsGroup = new THREE.Group()

  const SPACING = 210   // block centre spacing
  const ROAD_W = 18     // road width
  const RANGE = 2       // ±2 → 5×5 grid
  const GRID_SIZE = (RANGE * 2 + 1) * SPACING   // 1050 — finite square

  // Finite ground plane — clean square, no fog
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xD8D8D8, roughness: 0.95, metalness: 0 })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  surroundingsGroup.add(ground)

  // Roads — span only the grid, between block centres
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0 })
  for (let g = -RANGE; g < RANGE; g++) {
    const pos = (g + 0.5) * SPACING
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, GRID_SIZE), roadMat)
    ns.rotation.x = -Math.PI / 2
    ns.position.set(pos, 0.01, 0)
    surroundingsGroup.add(ns)
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, ROAD_W), roadMat)
    ew.rotation.x = -Math.PI / 2
    ew.position.set(0, 0.01, pos)
    surroundingsGroup.add(ew)
  }

  // Buildings — sparse: skip centre block + ~45% of others left empty
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xE2E0DC, roughness: 0.85, metalness: 0 })
  for (let gx = -RANGE; gx <= RANGE; gx++) {
    for (let gz = -RANGE; gz <= RANGE; gz++) {
      if (gx === 0 && gz === 0) continue      // neurospace block
      if (Math.random() < 0.45) continue       // empty plot
      const x = gx * SPACING
      const z = gz * SPACING
      const h = 30 + Math.random() * 120
      const w = 100 + Math.random() * 70
      const d = 100 + Math.random() * 70
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat)
      mesh.position.set(x, h / 2, z)
      mesh.castShadow = false
      mesh.receiveShadow = true
      surroundingsGroup.add(mesh)
    }
  }

  scene.fog = null
  scene.add(surroundingsGroup)
  surroundingsGroup.visible = props.showSurroundings ?? true
}

// ── Mode application ─────────────────────────────────────────────────────────

function applyMode() {
  if (!orbitControls) return
  if (props.mode === 'walk') {
    orbitControls.enabled = false
    activeCamera = perspCamera
    if (loadedObject) setViewWalk()
  } else {
    orbitControls.enabled = true
    activeCamera = orthoCamera
    if (props.mode === 'isometric') {
      setViewIsometric()
    } else {
      setViewTop()
    }
  }
}

// ── Material color update ────────────────────────────────────────────────────

function updateMaterialColor() {
  if (!loadedObject) return
  const hex = parseInt(props.color, 16)
  loadedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.color.setHex(hex)
    }
  })
}
// ── Cut plane ────────────────────────────────────────────────────────────────

function applyCutPlane() {
  if (!cutPlane) return
  // At or above ceiling + 1, disable the cut so the full geometry is visible
  if (cutPlaneHeight.value >= cutPlaneMax.value) {
    removeCutPlane()
    return
  }
  // Map the slider (in design-meters) to actual world-space Y
  const ceilingH = props.data?.['Height'] ?? 15
  const worldY = (cutPlaneHeight.value / ceilingH) * geoWorldHeight
  cutPlane.constant = worldY
  if (!loadedObject) return
  loadedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.clippingPlanes = [cutPlane]
      child.material.clipShadows = true
      child.material.needsUpdate = true
    }
  })
}

function removeCutPlane() {
  if (!loadedObject) return
  loadedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.clippingPlanes = []
      child.material.needsUpdate = true
    }
  })
}

function toggleCutPlane() {
  cutPlaneEnabled.value = !cutPlaneEnabled.value
  if (cutPlaneEnabled.value) applyCutPlane()
  else removeCutPlane()
}

// ── Potted plants — drag-and-drop system ─────────────────────────────────

const plants = []          // array of { group, size }
let selectedPlant = null   // currently selected plant group
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

// Plant size configs
const PLANT_SIZES = {
  small:  { potRadius: 1.0, potHeight: 1.5, foliageScale: 0.55, label: 'S' },
  medium: { potRadius: 1.8, potHeight: 2.5, foliageScale: 1.0,  label: 'M' },
  large:  { potRadius: 2.6, potHeight: 3.5, foliageScale: 1.5,  label: 'L' },
}

function createPottedPlant(sizeKey) {
  const cfg = PLANT_SIZES[sizeKey] || PLANT_SIZES.medium
  const plant = new THREE.Group()
  plant.userData.isPlant = true
  plant.userData.sizeKey = sizeKey

  // Pot
  const potGeo = new THREE.CylinderGeometry(cfg.potRadius, cfg.potRadius * 0.72, cfg.potHeight, 16)
  const potMat = new THREE.MeshPhongMaterial({ color: 0xB5651D, shininess: 40 })
  const pot = new THREE.Mesh(potGeo, potMat)
  pot.position.y = cfg.potHeight / 2
  pot.castShadow = true
  pot.receiveShadow = true
  plant.add(pot)

  // Pot rim
  const rimGeo = new THREE.TorusGeometry(cfg.potRadius * 1.03, cfg.potRadius * 0.1, 8, 24)
  const rim = new THREE.Mesh(rimGeo, potMat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = cfg.potHeight
  rim.castShadow = true
  plant.add(rim)

  // Soil
  const soilGeo = new THREE.CylinderGeometry(cfg.potRadius * 0.94, cfg.potRadius * 0.94, 0.2, 16)
  const soilMat = new THREE.MeshPhongMaterial({ color: 0x3E2723 })
  const soil = new THREE.Mesh(soilGeo, soilMat)
  soil.position.y = cfg.potHeight - 0.1
  plant.add(soil)

  // Foliage cluster
  const s = cfg.foliageScale
  const leafMat = new THREE.MeshPhongMaterial({ color: 0x4CAF50, shininess: 30 })
  const foliage = [
    { x: 0,       y: cfg.potHeight + 2.3 * s, z: 0,       r: 1.8 * s },
    { x: 0.9 * s, y: cfg.potHeight + 1.5 * s, z: 0.6 * s, r: 1.3 * s },
    { x: -0.8*s,  y: cfg.potHeight + 1.7 * s, z: -0.5*s,  r: 1.2 * s },
    { x: 0.3*s,   y: cfg.potHeight + 2.9 * s, z: -0.4*s,  r: 1.1 * s },
    { x: -0.5*s,  y: cfg.potHeight + 1.3 * s, z: 0.8*s,   r: 1.0 * s },
  ]
  foliage.forEach(({ x, y, z, r }) => {
    const geo = new THREE.SphereGeometry(r, 12, 10)
    const mesh = new THREE.Mesh(geo, leafMat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    plant.add(mesh)
  })

  // Stem
  const stemH = 1.5 * s
  const stemGeo = new THREE.CylinderGeometry(0.12 * s, 0.18 * s, stemH, 8)
  const stemMat = new THREE.MeshPhongMaterial({ color: 0x33691E })
  const stem = new THREE.Mesh(stemGeo, stemMat)
  stem.position.y = cfg.potHeight + stemH / 2
  stem.castShadow = true
  plant.add(stem)

  return plant
}

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
  const point = screenToGround(screenX, screenY)
  if (!point) return

  const plant = createPottedPlant(sizeKey)
  plant.position.set(point.x, 0, point.z)
  plant.rotation.y = Math.random() * Math.PI * 2
  scene.add(plant)
  plants.push({ group: plant, size: sizeKey })
  emitPlantCount()
  selectPlant(plant)
}

function emitPlantCount() {
  emits('plantCountChanged', plants.length)
}

function selectPlant(group) {
  // Deselect previous
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

  // Highlight selected
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
  emitPlantCount()
}

function getPlantCount() {
  return plants.length
}

// Click to select / deselect a plant
function onPlantClick(e) {
  if (!renderer) return
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, activeCamera)

  // Collect all plant meshes
  const plantMeshes = []
  plants.forEach(p => {
    p.group.traverse(c => { if (c.isMesh) plantMeshes.push(c) })
  })

  const hits = raycaster.intersectObjects(plantMeshes, false)
  if (hits.length > 0) {
    // Walk up to find the plant group
    let obj = hits[0].object
    while (obj && !obj.userData.isPlant) obj = obj.parent
    if (obj) {
      selectPlant(obj)
      return
    }
  }
  // Clicked empty space — deselect
  selectPlant(null)
}

// Drag-and-drop handlers for plant placement
function onDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}

function onDrop(e) {
  e.preventDefault()
  const sizeKey = e.dataTransfer.getData('text/plain')
  if (!sizeKey || !PLANT_SIZES[sizeKey]) return
  addPlantAtScreen(sizeKey, e.clientX, e.clientY)
}

// ── Compute (Grasshopper) ────────────────────────────────────────────────────

let computeGeneration = 0   // bumped each call; stale results are discarded
let isComputing = false      // prevents overlapping compute calls
let pendingData = null       // stores the latest data while a compute is in-flight

async function compute() {
  // If already computing, stash the latest data and bail — it will run after the current one.
  if (isComputing) {
    pendingData = JSON.parse(JSON.stringify(props.data))
    return
  }

  isComputing = true
  const generation = ++computeGeneration
  console.log('Running compute #' + generation + '…\ndata sent:', props.data)
  errorMessage.value = null

  try {
    const ghData = { ...props.data }
    const doc = await runCompute(ghData, props.path)

    // Stale? A newer compute was queued → skip this result entirely.
    if (generation !== computeGeneration) return

    if (doc.metadata) {
      emits('updateMetadata', doc.metadata)
    }

    // Remove existing geometry (keep lights, axes, ground, and plants)
    const plantGroups = plants.map(p => p.group)
    const toRemove = scene.children.filter(c =>
      !c.isLight &&
      c !== axesHelper &&
      c !== groundPlane &&
      c !== surroundingsGroup &&
      !plantGroups.includes(c)
    )
    toRemove.forEach(c => scene.remove(c))
    loadedObject = null

    const buffer = new Uint8Array(doc.toByteArray()).buffer
    // Emit a copy — loader.parse transfers the original ArrayBuffer to a Worker
    // which neuters it (byteLength → 0), so the download must use an independent copy.
    emits('docReady', buffer.slice(0))
    await new Promise((resolve, reject) => {
      loader.parse(buffer, function (object) {
        // Double-check staleness inside the async parse callback too
        if (generation !== computeGeneration) { resolve(); return }

        let meshMaterial = buildMeshMaterial()

        let edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x004499,
          linewidth: 2
        })

        let hasVisibleGeometry = false

        object.traverse((child) => {
          if (child.isMesh) {
            child.material = meshMaterial
            if (cutPlaneEnabled.value) {
              child.material.clippingPlanes = [cutPlane]
              child.material.clipShadows = true
            }
            child.castShadow = true
            child.receiveShadow = true
            hasVisibleGeometry = true
          }
        })

        if (!hasVisibleGeometry) {
          object.traverse((child) => {
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              const edges = new THREE.EdgesGeometry(child.geometry)
              const line = new THREE.LineSegments(edges, edgeMaterial)
              scene.add(line)
              hasVisibleGeometry = true
            }
          })
        }

        // Rhino Z-up → Three.js Y-up
        object.rotation.x = -Math.PI / 2
        object.updateMatrixWorld(true)

        // Sit the geometry on y = 0 — guard against empty bounding box (no meshes)
        const box = new THREE.Box3().setFromObject(object)
        if (box.min.y !== Infinity) {
          object.position.y -= box.min.y
        }

        loadedObject = object
        scene.add(object)

        // Measure actual world-space height for accurate cut-plane mapping
        const finalBox = new THREE.Box3().setFromObject(object)
        geoWorldHeight = (finalBox.min.y !== Infinity ? finalBox.max.y - finalBox.min.y : 0) || 1
        console.log(`[Geometry] height=${geoWorldHeight.toFixed(4)} width=${(finalBox.max.x - finalBox.min.x).toFixed(4)} depth=${(finalBox.max.z - finalBox.min.z).toFixed(4)}`)

        if (!hasLoaded) {
          applyMode()
          hasLoaded = true
        }
        console.log('Compute #' + generation + ' done')
        resolve()
      }, function (error) {
        console.error('Error parsing geometry:', error)
        errorMessage.value = 'Geometry parse error: ' + (error?.message || String(error))
        reject(error)
      })
    })
  } catch (error) {
    console.error('Compute failed:', error)
    // The shared Rhino Compute server this was built against is retired, so every
    // failure down this path now means the same thing. The raw fetch error told a
    // visitor nothing; this says what actually happened and what still works.
    errorMessage.value = 'The geometry is gone because the Rhino Compute server behind it '
      + 'was retired at the end of the course year; the NeuroScore still runs in your browser.'
  } finally {
    isComputing = false
    // If new data arrived while we were computing, run again with the latest values
    if (pendingData) {
      pendingData = null
      compute()
    }
  }
}

// ── Animation loop ───────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()

  if (props.mode === 'walk') {
    const speed = walkSpeed * (moveState.sprint ? sprintMultiplier : 1.0)

    perspCamera.getWorldDirection(_walkForward)
    _walkForward.y = 0
    if (_walkForward.lengthSq() > 0) _walkForward.normalize()

    _walkRight.crossVectors(_walkForward, _walkUp)

    if (moveState.forward)  perspCamera.position.addScaledVector(_walkForward, speed * delta)
    if (moveState.backward) perspCamera.position.addScaledVector(_walkForward, -speed * delta)
    if (moveState.right)    perspCamera.position.addScaledVector(_walkRight, speed * delta)
    if (moveState.left)     perspCamera.position.addScaledVector(_walkRight, -speed * delta)

    // Jump physics
    if (isJumping) {
      jumpVelocity -= gravity * delta
      perspCamera.position.y += jumpVelocity * delta
      if (perspCamera.position.y <= eyeHeight) {
        perspCamera.position.y = eyeHeight
        isJumping = false
        jumpVelocity = 0
      }
    } else {
      perspCamera.position.y = eyeHeight
    }
  } else {
    orbitControls.update()
  }

  renderer.render(scene, activeCamera)
}

// ── Window resize ────────────────────────────────────────────────────────────

window.addEventListener('resize', onWindowResize)
function onWindowResize() {
  if (!container) return
  const width = container.offsetWidth
  const height = container.offsetHeight

  perspCamera.aspect = width / height
  perspCamera.updateProjectionMatrix()

  updateOrthoFrustum(orthoFrustumSize)

  renderer.setSize(width, height)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('resize', onWindowResize)
  if (renderer) {
    renderer.domElement.removeEventListener('mousedown', onMouseDown)
    renderer.domElement.removeEventListener('mousemove', onMouseMove)
    renderer.domElement.removeEventListener('mouseup', onMouseUp)
    renderer.domElement.removeEventListener('mouseleave', onMouseUp)
    renderer.domElement.removeEventListener('click', onPlantClick)
    renderer.domElement.removeEventListener('dragover', onDragOver)
    renderer.domElement.removeEventListener('drop', onDrop)
  }
})

onMounted(async () => {
  init()
  await loadRhino()
  await nextTick()
  isReady.value = true
  // Explicitly trigger the first compute with default parameters.
  // Relying solely on the watcher can miss this on deployed builds
  // due to Vue reactivity batching during the async mount.
  compute()
})

// ── Watchers ─────────────────────────────────────────────────────────────────

watch(
  () => props.data,
  () => {
    if (!isReady.value) return
    compute()
  },
  { deep: true }
)

watch(() => props.mode, (newMode) => {
  applyMode()
  if (newMode === 'plan') {
    cutPlaneEnabled.value = true
    applyCutPlane()
  } else {
    cutPlaneEnabled.value = false
    removeCutPlane()
  }
})

watch(cutPlaneHeight, () => {
  if (cutPlaneEnabled.value) applyCutPlane()
})

watch(() => props.color, () => { updateMaterialColor() })

watch(() => props.materialConfig, () => { applyMaterialConfig() }, { deep: true })

// Clamp cut plane height when ceiling height changes
watch(() => props.data?.['Height'], () => {
  if (cutPlaneHeight.value > cutPlaneMax.value) {
    cutPlaneHeight.value = cutPlaneMax.value
  }
  if (cutPlaneEnabled.value) applyCutPlane()
})

watch(() => props.showSurroundings, (val) => {
  if (surroundingsGroup) surroundingsGroup.visible = val ?? true
})

watch(() => props.sunHour, h => { updateSunPosition(h) })

// ── Screenshot capture ────────────────────────────────────────────

function captureScreenshot() {
  if (!renderer) return null
  renderer.render(scene, activeCamera)
  return renderer.domElement.toDataURL('image/png')
}

defineExpose({ captureScreenshot, addPlantAtScreen, deleteSelectedPlant, getPlantCount })
</script>

<style scoped>
#viewport {
  height: 100%;
  width: 100%;
  min-width: 200px;
  position: relative;
}

#threejs-container {
  height: 100%;
  width: 100%;
  min-width: 200px;
  position: inherit;
}

.error-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(197, 0, 0, 0.88);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-family: 'Roboto Mono', monospace;
  font-size: 0.9rem;
  max-width: 80%;
  text-align: center;
  z-index: 10;
}

.cut-plane-overlay {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  z-index: 10;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid #E5E5E5;
  border-radius: 10px;
  padding: 0.85rem 0.7rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.cut-plane-toggle {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.5rem;
  border-radius: 5px;
  border: 1px solid #E5E5E5;
  background: #f5f5f5;
  color: #6B6B6B;
  cursor: pointer;
  white-space: nowrap;
}
.cut-plane-toggle.active {
  background: #C50000;
  color: #fff;
  border-color: #C50000;
}

.cut-plane-label {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6B6B6B;
  white-space: nowrap;
}

.cut-plane-value {
  font-family: 'Roboto Mono', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: #C50000;
}

.cut-plane-slider {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 6px;
  height: 140px;
  cursor: pointer;
  accent-color: #C50000;
}
</style>
