/**
 * How the membrane room is drawn: translucent fabric, the edge cable and
 * compression ring, a timber floor and a sky. Geometry lives in membrane.js;
 * nothing here changes a shape.
 */
import * as THREE from 'three'

/**
 * Backlit translucency for a Standard/Physical material: where the sun falls on
 * the far side of the fabric, the near side glows, the way a PTFE tent reads
 * from inside. `uniforms.uSunView` must hold the sun direction in view space.
 */
export const fabricUniforms = () => ({
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1.0, 0.93, 0.82) },
  uTranslucency: { value: 1.1 },
})

export function makeTranslucent(material, uniforms) {
  material.customProgramCacheKey = () => 'ns-fabric'
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.fragmentShader = 'uniform vec3 uSunView;\nuniform vec3 uSunColor;\nuniform float uTranslucency;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
  {
    // light arriving through the fabric: the side facing away from the sun glows
    float through = max(0.0, dot(-normal, uSunView));
    outgoingLight += uTranslucency * through * uSunColor * diffuseColor.rgb * 0.75;
  }
  #include <opaque_fragment>`)
  }
  return material
}

/** Keeps the translucency uniform in step with the sun and the camera. */
export function updateFabric(uniforms, sunDirWorld, camera) {
  uniforms.uSunView.value.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse)
}

/** Edge cable and compression ring, rebuilt cheaply after each write. */
export function createRigging(units) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.3, metalness: 0.9 })
  const edge = new THREE.Mesh(new THREE.BufferGeometry(), steel)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 10, 64), steel)
  ring.rotation.x = Math.PI / 2
  edge.castShadow = ring.castShadow = true
  const group = new THREE.Group()
  group.add(edge, ring)
  const pts = []
  function update(room) {
    const e = room.edge, n = e.length / 3 - 1
    pts.length = 0
    for (let i = 0; i < n; i += 2) pts.push(new THREE.Vector3(e[3 * i], e[3 * i + 1] + 0.02 * units, e[3 * i + 2]))
    edge.geometry.dispose()
    edge.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length, 0.022 * units, 5, true)
    const r = room.ring
    ring.position.set(r.x * units, r.y * units, r.z * units)
    ring.rotation.set(Math.PI / 2 + r.tiltX, 0, r.tiltZ)
    ring.scale.setScalar(r.r * units)
  }
  return { group, update, material: steel }
}

/** Oak boards, drawn once into a canvas; the floor's uvs are in metres. */
export function timberTexture(renderer) {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')
  const boards = 16            // 4 m tile → 0.25 m boards
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let b = 0; b < boards; b++) {
    const x = (b * c.width) / boards, w = c.width / boards
    let y = -rnd() * 400
    while (y < c.height) {
      const len = 300 + rnd() * 500
      const l = 58 + rnd() * 10, hue = 30 + rnd() * 6
      g.fillStyle = `hsl(${hue}, 38%, ${l}%)`
      g.fillRect(x, y, w, len)
      g.globalAlpha = 0.08
      for (let k = 0; k < 14; k++) {       // grain
        g.fillStyle = rnd() > 0.5 ? '#5a3a1e' : '#fff3e0'
        g.fillRect(x + rnd() * w, y, 1 + rnd() * 2, len)
      }
      g.globalAlpha = 1
      g.fillStyle = 'rgba(60,35,15,0.35)'
      g.fillRect(x, y, w, 2)
      y += len
    }
    g.fillStyle = 'rgba(60,35,15,0.4)'
    g.fillRect(x, 0, 2, c.height)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / 4, 1 / 4)             // uv metres → one tile per 4 m
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return t
}

/** A soft vertical sky, warm at the horizon. */
export function skyTexture(top = '#e9e4dc', horizon = '#f6efe4') {
  const c = document.createElement('canvas')
  c.width = 2; c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, top); grad.addColorStop(0.62, horizon); grad.addColorStop(1, '#ddd3c4')
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
