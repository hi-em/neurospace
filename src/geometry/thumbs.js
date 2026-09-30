/**
 * 3D icons and report stills: small renders of the real membrane, made by the
 * same solver as the room, and of the potted plants. One offscreen renderer,
 * reused; each call returns a PNG data URL.
 */
import * as THREE from 'three'
import { createRoom, writeRoom, roomParams, roomSpecs, sunVector, UNITS_PER_M } from './membrane.js'
import { createRigging } from './look.js'
import { createPottedPlant, plantSpot, plantTop, PLANT_ORDER } from './plant.js'
import { hasWebGL } from '../utils/webgl.js'

let renderer, scene, ortho, persp, sun, hemi, ground, meshes = []
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(2)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  scene = new THREE.Scene()
  hemi = new THREE.HemisphereLight(0xf3ead9, 0xb49c80, 1.1)
  scene.add(hemi)
  sun = new THREE.DirectionalLight(0xfff0d8, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 100, far: 600 })
  scene.add(sun)
  ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.18 }))
  ground.receiveShadow = true
  scene.add(ground)
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000)
  persp = new THREE.PerspectiveCamera(72, 1, 0.05, 2000)
  persp.rotation.order = 'YXZ'
}
// the last few solved rooms, so a report's four views and its numbers share one solve
const cache = new Map()
function solved(sliders) {
  const key = JSON.stringify(roomParams(sliders))
  let room = cache.get(key)
  if (!room) {
    room = writeRoom(createRoom(), roomParams(sliders))
    cache.set(key, room)
    if (cache.size > 6) cache.delete(cache.keys().next().value)
  }
  return room
}
// highest film above a plan point, for fitting plants under a low roof
const _ray = new THREE.Raycaster(), _down = new THREE.Vector3(0, -1, 0)
function filmAt(room, x, z) {
  _ray.set(new THREE.Vector3(x, 400, z), _down)
  const hit = _ray.intersectObject(new THREE.Mesh(room.membrane, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), false)[0]
  return hit ? hit.point.y : Infinity
}
function clear() { meshes.forEach(m => scene.remove(m)); meshes = [] }
function size(w, h) { renderer.setSize(w, h, false) }

// Stand south-south-east, facing the arches the sun path puts on the south side.
const FRONT = new THREE.Vector3(Math.sin(2.6), 0, -Math.cos(2.6))

/**
 * The membrane for a slider state. view: 'iso' (outside), 'plan' (from above)
 * or 'inside' (standing at the back, facing the sunny arches).
 */
export function renderThumb(sliders, { w = 120, h = 90, color = '#f4f0e8', view = 'iso', hour = 15, bg = null } = {}) {
  if (!hasWebGL) return ''              // no picture rather than a thrown renderer
  if (!renderer) setup()
  size(w, h)
  clear()
  scene.background = bg ? new THREE.Color(bg) : null
  sun.position.copy(sunVector(hour)).multiplyScalar(300)
  hemi.intensity = view === 'inside' ? 2.4 : 1.1          // inside, the sky comes through the fabric
  const room = solved(sliders)
  const film = new THREE.Mesh(room.membrane, new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }))
  const floor = new THREE.Mesh(room.floor, new THREE.MeshStandardMaterial({ color: '#c9a57c', roughness: 0.7 }))
  film.castShadow = true; floor.receiveShadow = true
  const rig = createRigging(UNITS_PER_M); rig.update(room)
  meshes = [film, floor, rig.group]
  scene.add(...meshes)
  const n = sliders['Potted Plants'] || 0
  for (let i = 0; i < n; i++) {
    const [x, z] = plantSpot(i, room), size = PLANT_ORDER[i % 3]
    const p = createPottedPlant(size)
    p.position.set(x, 0, z)
    p.scale.setScalar(Math.max(0.35, Math.min(1, (filmAt(room, x, z) - 0.15 * UNITS_PER_M) / plantTop(size))))
    p.rotation.y = i * 1.7
    scene.add(p); meshes.push(p)
  }
  const R = room.bounds.radius, H = room.bounds.height
  let cam = ortho
  if (view === 'plan') {
    const half = R * 1.08
    Object.assign(ortho, { left: -half * w / h, right: half * w / h, top: half, bottom: -half })
    ortho.position.set(0, 400, 0); ortho.up.set(0, 0, -1); ortho.lookAt(0, 0, 0)
    ortho.updateProjectionMatrix()
  } else if (view === 'inside') {
    cam = persp
    persp.aspect = w / h; persp.updateProjectionMatrix()
    const eye = Math.min(1.6, 0.62 * room.ring.y) * UNITS_PER_M
    persp.position.set(-FRONT.x * R * 0.14, eye, -FRONT.z * R * 0.14)
    persp.rotation.set(0.16, Math.atan2(-FRONT.x, -FRONT.z), 0)
  } else {
    const half = Math.max(R * 1.05, H * 0.8)
    Object.assign(ortho, { left: -half * w / h, right: half * w / h, top: half, bottom: -half })
    ortho.up.set(0, 1, 0)
    ortho.position.set(FRONT.x * 300, H * 0.4 + 240, FRONT.z * 300)
    ortho.lookAt(0, H * 0.35, 0)
    ortho.updateProjectionMatrix()
  }
  renderer.render(scene, cam)
  return renderer.domElement.toDataURL('image/png')
}

/** The geometry numbers for a slider state, from the same solve. */
export function specsFor(sliders) {
  return roomSpecs(solved(sliders))
}

/** A potted plant, three-quarter view, for the drag tiles. */
export function renderPlant(sizeKey, { w = 96, h = 96 } = {}) {
  if (!renderer) setup()
  size(w, h)
  clear()
  scene.background = null
  sun.position.copy(sunVector(15)).multiplyScalar(300)
  const p = createPottedPlant(sizeKey)
  scene.add(p); meshes = [p]
  hemi.intensity = 1.1
  const top = 3.6 + 2.6 * 1.5, half = top * 0.62
  Object.assign(ortho, { left: -half * w / h, right: half * w / h, top: half, bottom: -half })
  ortho.up.set(0, 1, 0)
  ortho.position.set(FRONT.x * 60, 40 + top * 0.45, FRONT.z * 60)
  ortho.lookAt(0, top * 0.45, 0)
  ortho.updateProjectionMatrix()
  renderer.render(scene, ortho)
  return renderer.domElement.toDataURL('image/png')
}
