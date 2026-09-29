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
  uTranslucency: { value: 0.85 },
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
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfc9bf, roughness: 0.5, metalness: 0.3 })
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
    // every edge node, centripetal: the cable follows the arch corners without
    // overshooting them, so it stays on the film's hem
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(e[3 * i], e[3 * i + 1], e[3 * i + 2]))
    edge.geometry.dispose()
    edge.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), pts.length * 2, 0.022 * units, 6, true)
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

/**
 * A woven fabric bump: a fine basket weave, tiled every 0.5 m in the
 * membrane's metre uvs. Only visible up close, which is the point.
 */
export function weaveTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128)
  const n = 16, w = 128 / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const warp = (i + j) % 2 === 0
    const grad = warp ? g.createLinearGradient(i * w, 0, i * w + w, 0) : g.createLinearGradient(0, j * w, 0, j * w + w)
    grad.addColorStop(0, '#6a6a6a'); grad.addColorStop(0.5, '#a8a8a8'); grad.addColorStop(1, '#6a6a6a')
    g.fillStyle = grad; g.fillRect(i * w, j * w, w, w)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)                      // uv metres → a 0.5 m tile
  return t
}

/**
 * Light shafts: each sunlit arch (and the oculus) swept along the sun vector
 * down to the floor, drawn as a faint additive sheet that fades as it falls.
 * Only arches facing the sun get one; the geometry is the actual projection.
 */
export function createShafts(units, maxCols = 257, ringPts = 64) {
  const maxV = (maxCols + ringPts + 1) * 2
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxV * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('fade', new THREE.BufferAttribute(new Float32Array(maxV), 1).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(maxV * 3), 1).setUsage(THREE.DynamicDrawUsage))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1.0, 0.9, 0.72) }, uOpacity: { value: 0.1 } },
    vertexShader: 'attribute float fade; varying float vFade; void main(){ vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vFade; void main(){ float a = uOpacity * pow(1.0 - vFade, 1.6); gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2

  function update(room, sunDir) {
    const P = g.attributes.position.array, F = g.attributes.fade.array, I = g.index.array
    let v = 0, k = 0
    const L = sunDir
    mat.uniforms.uOpacity.value = L.y > 0.05 ? 0.24 * Math.min(1, L.y / 0.3) : 0
    // a ray stops at the floor, or at the far side of the envelope, whichever comes first
    // (the envelope taken as a circle of the room's radius: |p − t·d| = R along d = −L̂ₕ)
    const Rb = 0.97 * room.bounds.radius, horiz = Math.hypot(L.x, L.z) || 1e-6
    const dx = -L.x / horiz, dz = -L.z / horiz
    const put = (x, y, z) => {
      P[3 * v] = x; P[3 * v + 1] = y; P[3 * v + 2] = z; F[v] = 0
      const pd = x * dx + z * dz, disc = pd * pd - (x * x + z * z) + Rb * Rb
      const tWall = disc > 0 ? pd + Math.sqrt(disc) : 0          // horizontal run to the far side
      const s = Math.min(y / L.y, Math.max(0, tWall) / horiz)
      P[3 * v + 3] = x - L.x * s; P[3 * v + 4] = y - L.y * s; P[3 * v + 5] = z - L.z * s; F[v + 1] = 1
      v += 2
    }
    const quad = (a) => { I[k++] = a; I[k++] = a + 1; I[k++] = a + 2; I[k++] = a + 1; I[k++] = a + 3; I[k++] = a + 2 }
    const e = room.edge, n = e.length / 3 - 1
    let prevLit = false
    for (let j = 0; j <= n; j++) {
      const x = e[3 * j], y = e[3 * j + 1], z = e[3 * j + 2]
      const len = Math.hypot(x, z) || 1
      const lit = y > 0.15 * units && (x * L.x + z * L.z) / len > 0.05       // lifted and facing the sun
      if (lit) {
        if (prevLit) quad(v - 2)
        put(x, y, z)
      }
      prevLit = lit
    }
    // the oculus: its ring swept down the same way
    const r = room.ring, ring0 = v
    for (let i = 0; i <= ringPts; i++) {
      const a = (i / ringPts) * Math.PI * 2
      put((r.x + r.r * Math.cos(a)) * units, r.y * units, (r.z + r.r * Math.sin(a)) * units)
      if (i > 0) quad(v - 4)
    }
    void ring0
    g.setDrawRange(0, k)
    g.attributes.position.needsUpdate = true
    g.attributes.fade.needsUpdate = true
    g.index.needsUpdate = true
  }
  return { mesh, update, material: mat }
}
