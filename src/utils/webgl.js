/**
 * Can this browser draw the room at all? Asked once, before any renderer is
 * made. A laptop with its GPU blocklisted (or WebGL switched off by policy)
 * answers no: Chrome stopped falling back to software WebGL on its own, so
 * without this the room and every question icon would simply stay blank.
 */
export const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()   // give the test context straight back
    return true
  } catch {
    return false
  }
})()

/** The pictures baked for a browser without WebGL (scripts/bake-fallback.mjs). */
export const bakedIcon = id => `${import.meta.env.BASE_URL}fallback/q-${id}.png`
export const bakedRoom = `${import.meta.env.BASE_URL}fallback/room.webp`
