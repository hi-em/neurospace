<template>
  <div id="viewport">
    <div id="threejs-container"></div>

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
import { onMounted, onBeforeUnmount, watch, ref, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createRoom, writeRoom, roomParams, sunVector, UNITS_PER_M } from '@/geometry/membrane.js'
import { fabricUniforms, makeTranslucent, updateFabric, createRigging, timberTexture, weaveTexture, createShafts } from '@/geometry/look.js'

const props = defineProps(['data', 'score', 'mode', 'sunHour', 'showSurroundings', 'materialConfig'])
const emits = defineEmits(['plantCountChanged'])

// Three.js objects
let renderer, perspCamera, orthoCamera, activeCamera
let scene, orbitControls, container, axesHelper, groundPlane, sunLight, hemiLight
const isPhone = window.matchMedia?.('(max-width: 768px), (pointer: coarse)').matches
let loadedObject = null
let surroundingsGroup = null

// Material presets
const PATTERN_NONE = 'solid'
const PATTERN_WIREFRAME = 'wireframe'
const PATTERN_GRID = 'grid'

const weave = weaveTexture()

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
    envMapIntensity: 0.35,
    wireframe: isWireframe,
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

function applyMaterialConfig() {
  if (!loadedObject) return
  const cfg = props.materialConfig || {}
  const pattern = cfg.pattern || PATTERN_NONE

  const mat = buildMeshMaterial()
  loadedObject.traverse((child) => {
    if (child.isMesh && child.userData.tinted) {
      const hadClip = child.material.clippingPlanes && child.material.clippingPlanes.length > 0
      child.material = makeTranslucent(mat.clone(), fabricU)
      if (hadClip && cutPlaneEnabled.value) {
        child.material.clippingPlanes = [cutPlane]
        child.material.clipShadows = true
      }
      child.material.needsUpdate = true
    }
  })

  // The Grid pattern shows the cable net the form-finding solves, ridge
  // cables darker by their force density.
  if (netLines) netLines.visible = pattern === PATTERN_GRID
}

// Cut plane (plan view section)
const cutPlaneHeight = ref(1.5)   // a plan is cut at door height: the arches read as gaps
const cutPlaneEnabled = ref(false)
let cutPlane = null

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.localClippingEnabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
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

  // Image-based light for the physically based materials: a soft studio room,
  // kept low so the sun through the openings stays the event.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  axesHelper = new THREE.AxesHelper(5)
  axesHelper.visible = false
  scene.add(axesHelper)

  // Sky above, warm bounce from the floor below; its colours follow the score.
  hemiLight = new THREE.HemisphereLight(0xdfe7ef, 0xb49c80, 0.6)
  scene.add(hemiLight)

  // Sun light — position and color are driven by updateSunPosition()
  sunLight = new THREE.DirectionalLight(0xfffbe8, 2.0)
  sunLight.position.set(300, 500, 200)
  sunLight.castShadow = true
  // Shadow frustum fitted to the room, not the city: sharp window edges on the
  // floor matter more than the context buildings, which do not cast.
  const shadowRes = isPhone ? 1024 : 2048
  sunLight.shadow.mapSize.set(shadowRes, shadowRes)
  sunLight.shadow.camera.near = 300
  sunLight.shadow.camera.far = 900
  sunLight.shadow.camera.left = -75
  sunLight.shadow.camera.right = 75
  sunLight.shadow.camera.top = 75
  sunLight.shadow.camera.bottom = -75
  sunLight.shadow.bias = -0.0004
  sunLight.shadow.normalBias = 0.25
  sunLight.shadow.radius = 3
  scene.add(sunLight)

  // Soft sky fill from the opposite side — no shadows
  const skyFill = new THREE.DirectionalLight(0xc9e8ff, 0.25)
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

  // start inside, at the back of the room, facing the arches on the sun side
  const front = new THREE.Vector3(Math.sin(2.6), 0, -Math.cos(2.6))
  perspCamera.position.set(center.x - front.x * maxDim * 0.28, eyeHeight, center.z - front.z * maxDim * 0.28)
  cameraYaw = Math.atan2(-front.x, -front.z)
  cameraPitch = 0.12
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
  // Stand south-south-east, facing the arches the sun path puts on the south side.
  const front = new THREE.Vector3(Math.sin(2.6), 0, -Math.cos(2.6))
  orthoCamera.position.set(center.x + front.x * distance, center.y + distance * 0.8, center.z + front.z * distance)
  orthoCamera.up.set(0, 1, 0)
  orthoCamera.lookAt(center)

  updateOrthoFrustum(maxDim * 0.8)
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
}

// ── Surroundings ─────────────────────────────────────────────────────────────

function buildSurroundings() {
  surroundingsGroup = new THREE.Group()

  const SPACING = 210   // block centre spacing
  const ROAD_W = 18     // road width
  const RANGE = 2       // ±2 → 5×5 grid
  const GRID_SIZE = (RANGE * 2 + 1) * SPACING   // 1050 — finite square

  // Finite ground plane — clean square, no fog
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xe4dccf, roughness: 0.95, metalness: 0 })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  surroundingsGroup.add(ground)

  // Roads — span only the grid, between block centres
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xd3c9ba, roughness: 0.9, metalness: 0 })
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
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xebe5dc, roughness: 0.85, metalness: 0 })
  // seeded, so the context is the same block on every visit
  let seed = 20260929
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let gx = -RANGE; gx <= RANGE; gx++) {
    for (let gz = -RANGE; gz <= RANGE; gz++) {
      if (gx === 0 && gz === 0) continue      // neurospace block
      if (random() < 0.45) continue       // empty plot
      const x = gx * SPACING
      const z = gz * SPACING
      const h = 30 + random() * 120
      const w = 100 + random() * 70
      const d = 100 + random() * 70
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
  updateFrameGoal()
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

// ── Cut plane ────────────────────────────────────────────────────────────────

function applyCutPlane() {
  if (!cutPlane) return
  // At or above ceiling + 1, disable the cut so the full geometry is visible
  if (cutPlaneHeight.value >= cutPlaneMax.value) {
    removeCutPlane()
    return
  }
  cutPlane.constant = cutPlaneHeight.value * UNITS_PER_M
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
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb8653a, roughness: 0.85 })
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
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1 })
  const soil = new THREE.Mesh(soilGeo, soilMat)
  soil.position.y = cfg.potHeight - 0.1
  plant.add(soil)

  // Foliage: leaves on the golden angle (phyllotaxis), one instanced draw per plant
  const s = cfg.foliageScale
  const leafCount = Math.round(34 + 30 * s)
  const leafGeo = new THREE.SphereGeometry(1, 8, 6).scale(0.32 * s, 0.05 * s, 0.95 * s).translate(0, 0, 0.8 * s)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide })
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
  const col = new THREE.Color()
  const GOLDEN = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < leafCount; i++) {
    const f = i / leafCount
    // young leaves stand up at the crown, older ones arch out below
    e.set(-0.2 + 1.25 * f, i * GOLDEN, 0, 'YXZ')
    q.setFromEuler(e)
    const k = 0.9 + 0.18 * Math.sin(i * 12.9898)
    m.compose(new THREE.Vector3(0, cfg.potHeight + (2.6 - 1.9 * f) * s, 0), q, new THREE.Vector3(k, k, k))
    leaves.setMatrixAt(i, m)
    leaves.setColorAt(i, col.setHSL(0.27 + 0.05 * f, 0.55, 0.26 + 0.12 * (1 - f)))
  }
  leaves.castShadow = true
  leaves.receiveShadow = true
  plant.add(leaves)

  // Stem
  const stemH = 2.2 * s
  const stemGeo = new THREE.CylinderGeometry(0.1 * s, 0.16 * s, stemH, 8)
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6b2a, roughness: 0.8 })
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
let settle = 0

function buildRoomMeshes() {
  loadedObject = new THREE.Group()
  const membrane = new THREE.Mesh(room.membrane, makeTranslucent(buildMeshMaterial(), fabricU))
  membrane.userData.tinted = true
  membrane.castShadow = membrane.receiveShadow = true
  const floor = new THREE.Mesh(room.floor, new THREE.MeshStandardMaterial({ map: timberTexture(renderer), roughness: 0.5, envMapIntensity: 0.45, vertexColors: true }))
  floor.receiveShadow = true
  netLines = new THREE.LineSegments(room.net, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }))
  netLines.visible = (props.materialConfig?.pattern) === PATTERN_GRID
  rigging = createRigging(UNITS_PER_M)
  shafts = createShafts(UNITS_PER_M)
  loadedObject.add(membrane, floor, netLines, rigging.group)
  scene.add(loadedObject, shafts.mesh)
}

function write(first = false) {
  writeRoom(room, shown, first ? {} : undefined)
  rigging?.update(room)
  shafts?.update(room, sunDir)
  updateFrameGoal()
}

// The orthographic views keep the whole room in frame as it grows or shrinks.
const frameGoal = { size: 0, y: 0 }
function updateFrameGoal() {
  const b = room.bounds
  frameGoal.size = props.mode === 'plan' ? b.radius * 1.25 : Math.max(b.radius * 1.3, b.height * 0.88)
  frameGoal.y = props.mode === 'plan' ? 0 : b.height * 0.38
}
function frameStep(dt) {
  if (props.mode === 'walk' || !frameGoal.size) return
  const a = reduceMotion ? 1 : 1 - Math.exp(-5 * dt)
  const ds = frameGoal.size - orthoFrustumSize, dy = frameGoal.y - orbitControls.target.y
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
  else if (settle > 0) { settle--; write() }
}

// ── Score-driven atmosphere ──────────────────────────────────────────────────
// The score tints the air, it decides nothing: a cool flat grey while the
// estimate reads high stress, a warmer, brighter ground as it reads restorative.

const ATMO_STRESS = { bg: new THREE.Color('#d6d8dc'), sky: new THREE.Color('#c9d3de'), exposure: 0.95 }
const ATMO_CALM   = { bg: new THREE.Color('#eee6d8'), sky: new THREE.Color('#f3e6cf'), exposure: 1.12 }
let atmo = -1

function atmosphereStep(dt) {
  const goal = Math.min(1, Math.max(0, (props.score ?? 30) / 100))
  if (atmo === goal) return
  atmo = atmo < 0 || reduceMotion || Math.abs(goal - atmo) < 1e-3
    ? goal
    : atmo + (goal - atmo) * (1 - Math.exp(-3 * dt))
  scene.background.copy(ATMO_STRESS.bg).lerp(ATMO_CALM.bg, atmo)
  hemiLight.color.copy(ATMO_STRESS.sky).lerp(ATMO_CALM.sky, atmo)
  renderer.toneMappingExposure = ATMO_STRESS.exposure + (ATMO_CALM.exposure - ATMO_STRESS.exposure) * atmo
}

// ── Animation loop ───────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()

  morphStep(Math.min(delta, 0.1))
  frameStep(Math.min(delta, 0.1))
  atmosphereStep(Math.min(delta, 0.1))

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

  updateFabric(fabricU, sunDir, activeCamera)
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

onMounted(() => {
  init()
  buildRoomMeshes()
  setTarget(props.data)
  applyMode()
})

// ── Watchers ─────────────────────────────────────────────────────────────────

watch(() => props.data, (data) => setTarget(data), { deep: true })

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
