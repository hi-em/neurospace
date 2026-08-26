import rhino3dm from "https://cdn.jsdelivr.net/npm/rhino3dm@8.0.0-beta2/rhino3dm.module.js"
import RhinoCompute from "compute-rhino3d"
import { store } from "../stores/storeSingletons"

RhinoCompute.url = "https://compute8.iaac.net/"
RhinoCompute.apiKey = "macad2026"

const COMPUTE_TIMEOUT_MS = 5000

let rhino, doc, res

// Cache the GH definition binary after first fetch — avoids re-downloading on every compute
const ghCache = new Map()

async function loadRhino() {
  return new Promise((resolve) => {
    rhino3dm().then((m) => {
      console.log("[Compute] rhino3dm loaded.")
      rhino = m
      resolve(true)
    })
  })
}

async function runCompute(data, path) {
  store.computing = true
  try {
    const def = await loadGH(path)
    res = await compute(def, data)

    if (res.errors && res.errors.length > 0) {
      console.error("[Compute] Server errors:", res.errors)
    }
    if (res.warnings && res.warnings.length > 0) {
      console.warn("[Compute] Server warnings:", res.warnings)
    }

    doc = createDoc(res)
    return doc
  } finally {
    store.computing = false
  }
}

async function loadGH(definitionPath) {
  if (ghCache.has(definitionPath)) return ghCache.get(definitionPath)
  const res = await fetch(definitionPath)
  const buffer = await res.arrayBuffer()
  const def = new Uint8Array(buffer)
  ghCache.set(definitionPath, def)
  return def
}

async function compute(definition, definitionInputs) {
  const startTime = performance.now()

  const trees = []
  for (const [key, value] of Object.entries(definitionInputs)) {
    const param = new RhinoCompute.Grasshopper.DataTree(key)
    param.append([0], Array.isArray(value) ? value : [value])
    trees.push(param)
  }

  // compute8.iaac.net is retired and hangs rather than refusing, so the browser sat
  // on it for the full two-minute TCP timeout before anyone saw why. Race it: the
  // server is not coming back, and five seconds is already generous for a request
  // that used to answer in under two.
  const res = await Promise.race([
    RhinoCompute.Grasshopper.evaluateDefinition(definition, trees),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Rhino Compute did not answer')), COMPUTE_TIMEOUT_MS)),
  ])

  const duration = (performance.now() - startTime) / 1000
  console.log(`[Compute] GH evaluated in ${duration.toFixed(3)}s`)
  console.log('[Compute] inputs sent:', Object.fromEntries(trees.map(t => [t.ParamName, t.InnerTree])))
  console.log('[Compute] raw response values:', res.values?.map(v => ({
    param: v.ParamName,
    paths: Object.entries(v.InnerTree).map(([path, items]) => ({
      path,
      count: items.length,
      types: items.map(i => i.type)
    }))
  })))
  return res
}

function createDoc(res) {
  doc = new rhino.File3dm()
  let geometryCount = 0
  const metadata = []

  for (let i = 0; i < res.values.length; i++) {
    const paramName = res.values[i].ParamName
    for (const [, value] of Object.entries(res.values[i].InnerTree)) {
      for (const d of value) {
        const dataType = String(d.type)

        if (
          dataType.includes("Geometry") ||
          dataType.includes("Brep") ||
          dataType.includes("Mesh") ||
          dataType.includes("Extrusion") ||
          dataType.includes("Surface")
        ) {
          try {
            console.log(`[Compute] geometry type='${dataType}' in param '${paramName}'`)
            const data = JSON.parse(d.data)
            const rhinoObject = rhino.CommonObject.decode(data)
            if (!rhinoObject) {
              console.warn(`[Compute] Null geometry skipped in output '${paramName}'`)
              continue
            }

            // Breps and Extrusions from Compute lack pre-computed render meshes.
            // The Three.js Rhino3dmLoader worker uses face.getMesh() which returns null
            // for unmeshed faces, producing no visible geometry. Convert to Mesh first.
            let added = false
            const isBrep = dataType.includes('Brep') || dataType.includes('Surface')
            const isExtrusion = dataType.includes('Extrusion')
            if (isBrep || isExtrusion) {
              try {
                const mp = new rhino.MeshingParameters(0.5)
                // Extrusion must be converted to Brep before meshing
                let brepObj = rhinoObject
                if (isExtrusion && typeof rhinoObject.toBrep === 'function') {
                  brepObj = rhinoObject.toBrep(false)
                }
                const meshes = rhino.Mesh.createFromBrep(brepObj, mp)
                if (meshes && meshes.length > 0) {
                  for (const m of meshes) {
                    doc.objects().add(m, null)
                    geometryCount++
                  }
                  added = true
                  console.log(`[Compute] Converted ${isExtrusion ? 'Extrusion' : 'Brep'}→Mesh (${meshes.length} mesh(es)) in '${paramName}'`)
                }
              } catch (meshErr) {
                console.warn(`[Compute] Brep→Mesh failed in '${paramName}', adding raw:`, meshErr)
              }
            }

            if (!added) {
              doc.objects().add(rhinoObject, null)
              geometryCount++
            }
          } catch (e) {
            console.error(`[Compute] Failed to decode geometry in '${paramName}':`, e)
          }
        } else {
          try {
            metadata.push({ name: paramName, value: JSON.parse(d.data) })
          } catch (e) {
            // non-critical: metadata item couldn't be parsed
          }
        }
      }
    }
  }

  console.log(`[Compute] Added ${geometryCount} geometry object(s) to doc.`)

  // Copy geometry userStrings to object attributes
  const objects = doc.objects()
  for (let i = 0; i < objects.count; i++) {
    const rhinoObject = objects.get(i)
    if (rhinoObject.geometry().userStringCount > 0) {
      const userStrings = rhinoObject.geometry().getUserStrings()
      for (const [key, val] of userStrings) {
        rhinoObject.attributes().setUserString(key, val)
      }
    }
  }

  doc.metadata = metadata
  return doc
}

export { loadRhino, runCompute }
