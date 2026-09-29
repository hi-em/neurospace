/**
 * A potted plant, built from primitives: a terracotta pot and leaves set on
 * the golden angle (phyllotaxis), one instanced draw per plant. Used in the
 * room and for the plant tiles in the card.
 */
import * as THREE from 'three'
import { planRadiusAt, UNITS_PER_M } from './membrane.js'

// Where the i-th plant stands when it is added rather than dropped: along the
// back half of the room, halfway to the wall, fanning out from the axis
// opposite the sunny arches, so the view in and the openings stay clear.
const BACK = Math.atan2(Math.cos(2.6), -Math.sin(2.6))        // the direction away from the arches
const FAN = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]
export const PLANT_ORDER = ['medium', 'small', 'large']
export function plantSpot(i, room) {
  const a = BACK + FAN[i % FAN.length], r = 0.5 * planRadiusAt(room, a) * UNITS_PER_M
  return [Math.cos(a) * r, Math.sin(a) * r, a]
}

// Plant size configs
export const PLANT_SIZES = {
  small:  { potRadius: 1.0, potHeight: 1.5, foliageScale: 0.55, label: 'S' },
  medium: { potRadius: 1.8, potHeight: 2.5, foliageScale: 1.0,  label: 'M' },
  large:  { potRadius: 2.6, potHeight: 3.5, foliageScale: 1.5,  label: 'L' },
}

/** Top of a plant's foliage above the floor, in scene units. */
export const plantTop = sizeKey => { const c = PLANT_SIZES[sizeKey] || PLANT_SIZES.medium; return c.potHeight + 3.4 * c.foliageScale }

export function createPottedPlant(sizeKey) {
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

