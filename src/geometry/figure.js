/**
 * A scale figure: one person, 1.75 m, in the matte white of an architectural
 * model. It stands just outside the middle arch, facing in, so every view of
 * the room carries its own measure.
 */
import * as THREE from 'three'
import { UNITS_PER_M } from './membrane.js'

export function createFigure() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.85 })
  const g = new THREE.Group()
  const part = (geo, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; g.add(m); return m }
  // metres, then scaled to scene units
  part(new THREE.CapsuleGeometry(0.075, 0.72, 4, 10), -0.1, 0.44, 0)          // legs
  part(new THREE.CapsuleGeometry(0.075, 0.72, 4, 10), 0.1, 0.44, 0.03)
  part(new THREE.CapsuleGeometry(0.19, 0.36, 6, 14), 0, 1.15, 0).scale.set(1, 1, 0.62)   // torso
  part(new THREE.CapsuleGeometry(0.05, 0.56, 4, 8), -0.27, 1.12, 0, 0.08)     // arms
  part(new THREE.CapsuleGeometry(0.05, 0.56, 4, 8), 0.27, 1.12, 0, -0.08)
  part(new THREE.SphereGeometry(0.115, 16, 12), 0, 1.635, 0)                  // head: top at 1.75 m
  g.scale.setScalar(UNITS_PER_M)

  const _p = new THREE.Vector3()
  /** Stand outside the middle arch, a metre from the hem, facing the room. */
  function update(room) {
    const st = room.stats, E = room.edge
    const j = st.archCols?.[Math.floor((st.arches - 1) / 2)] ?? 0
    const x = E[3 * j], z = E[3 * j + 2], l = Math.hypot(x, z) || 1
    _p.set(x + (x / l) * 1.1 * UNITS_PER_M, 0, z + (z / l) * 1.1 * UNITS_PER_M)
    g.position.copy(_p)
    g.rotation.y = Math.atan2(-x, -z)
  }
  return { group: g, update }
}
