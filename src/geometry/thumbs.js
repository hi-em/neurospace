/**
 * 3D icons: small renders of the real membrane, made by the same solver as
 * the room. One offscreen renderer, reused; each call returns a PNG data URL.
 */
import * as THREE from 'three'
import { createRoom, writeRoom, roomParams, sunVector, UNITS_PER_M } from './membrane.js'
import { createRigging } from './look.js'

let renderer, scene, camera, sun, meshes
function setup(w, h) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(2)
  renderer.setSize(w, h)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xf3ead9, 0xb49c80, 1.1))
  sun = new THREE.DirectionalLight(0xfff0d8, 2.6)
  sun.position.copy(sunVector(15)).multiplyScalar(300)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 100, far: 600 })
  scene.add(sun)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.18 }))
  ground.receiveShadow = true
  scene.add(ground)
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000)
  meshes = []
}

export function renderThumb(sliders, { w = 120, h = 90, color = '#f4f0e8' } = {}) {
  if (!renderer) setup(w, h)
  meshes.forEach(m => scene.remove(m))
  const room = writeRoom(createRoom(), roomParams(sliders))
  const film = new THREE.Mesh(room.membrane, new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }))
  const floor = new THREE.Mesh(room.floor, new THREE.MeshStandardMaterial({ color: '#c9a57c', roughness: 0.7 }))
  film.castShadow = true; floor.receiveShadow = true
  const rig = createRigging(UNITS_PER_M); rig.update(room)
  meshes = [film, floor, rig.group]
  scene.add(...meshes)
  // plants as simple green domes, enough to read at icon size
  const n = sliders['Potted Plants'] || 0
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, r = (0.9 + 0.8 * Math.sqrt(i)) * UNITS_PER_M
    const p = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshStandardMaterial({ color: '#5f8f45', roughness: 0.6 }))
    p.position.set(Math.cos(a) * r, 2.4, Math.sin(a) * r); p.castShadow = true
    scene.add(p); meshes.push(p)
  }
  const R = room.bounds.radius, H = room.bounds.height, half = Math.max(R * 1.05, H * 0.8)
  camera.left = -half * w / h; camera.right = half * w / h; camera.top = half; camera.bottom = -half
  camera.position.set(Math.sin(2.6) * 300, H * 0.4 + 240, -Math.cos(2.6) * 300)
  camera.lookAt(0, H * 0.35, 0)
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/png')
}
