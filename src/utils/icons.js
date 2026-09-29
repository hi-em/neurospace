/**
 * NeuroSpace icons: 24 × 24, 1.5 px stroke, round caps, drawn in the room's
 * own vocabulary (arches, a vault, a spiral), never generic pictograms.
 * Each is an SVG inner string; the <NsIcon> component or innerHTML wraps it.
 */
export const ICONS = {
  // parameters and dimensions
  ceiling:   '<path d="M4 20V11a8 8 0 0 1 16 0v9"/><path d="M12 4v9"/><path d="M9.5 6.5 12 4l2.5 2.5"/><path d="M3 20h18"/>',
  curvature: '<path d="M4 20V10"/><path d="M4 10a6 6 0 0 1 6-6h10"/><path d="M4 20h16" opacity=".35"/><circle cx="4" cy="10" r="1.2" fill="currentColor" stroke="none"/>',
  walls:     '<path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.8" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.8" cy="16.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="21" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.2" cy="16.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.2" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
  openings:  '<path d="M3 19h18"/><path d="M4.5 19v-4a2 2 0 0 1 4 0v4"/><path d="M10 19v-5a2 2 0 0 1 4 0v5"/><path d="M15.5 19v-4a2 2 0 0 1 4 0v4"/>',
  window:    '<path d="M3 20h18"/><path d="M6 20v-8a6 6 0 0 1 12 0v8"/><path d="M6 15h12" opacity=".4"/><path d="M6 17.5h12" opacity=".4"/>',
  form:      '<path d="M12 12a1.5 1.5 0 1 1 1.5 1.5 3.5 3.5 0 0 1-3.5-3.5 5.5 5.5 0 0 1 5.5-5.5 7.5 7.5 0 0 1 7.5 7.5"/><path d="M12 12c-4 0-7 3-8 8" opacity=".5"/>',
  plants:    '<path d="M8 20h8l1-5H7z"/><path d="M12 15V9"/><path d="M12 11c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5z"/>',
  // interface
  sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  play:      '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause:     '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
  outside:   '<path d="M3 17 12 21l9-4-9-4z"/><path d="M6 15.6V11a6 6 0 0 1 12 0v4.6"/>',
  inside:    '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  plan:      '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 20v-3h4v3" /><path d="M4 12h3M17 12h3"/>',
  single:    '<rect x="4" y="5" width="16" height="14" rx="2"/>',
  split:     '<rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="14" rx="2"/>',
  flip:      '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  net:       '<path d="M4 20c2-9 6-15 8-16 2 1 6 7 8 16"/><path d="M8 20c1-6 3-11 4-12 1 1 3 6 4 12"/><path d="M5 15h14M7 10h10" opacity=".6"/>',
  swatch:    '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4" opacity=".6"/><circle cx="12" cy="16" r="4" opacity=".35"/>',
  log:       '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  share:     '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  export:    '<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  question:  '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>',
}

export function svg(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`
}

/** Parameter key → icon, dimension colour token, short label */
export const PARAM_ICON = {
  'Height': ['ceiling', '--ns-d-ceiling', 'Ceiling height'],
  'Wall Curvature': ['curvature', '--ns-d-walls', 'Wall curvature'],
  'Wall Count': ['walls', '--ns-d-walls', 'Wall count'],
  'Opening Count': ['openings', '--ns-d-light', 'Openings'],
  'Opening Size': ['window', '--ns-d-light', 'Window-to-wall'],
  'Biophilic Organic Form': ['form', '--ns-d-form', 'Biomorphic form'],
  'Potted Plants': ['plants', '--ns-d-plants', 'Plants'],
}
