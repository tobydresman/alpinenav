/**
 * gpxParser.js — Parses GPX XML files into AlpineNav waypoints and routes.
 * Handles <wpt> (waypoints), <trk>/<trkpt> (tracks), <rte>/<rtept> (routes).
 * No dependencies — plain browser JavaScript.
 */

window.parseGPX = function parseGPX(gpxString) {
  const result = { waypoints: [], routes: [] };

  // Use the browser's DOMParser for clean XML handling
  const doc = new DOMParser().parseFromString(gpxString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.warn('GPX parse error:', parseError.textContent);
    return result;
  }

  const text = (el, tag) => el.querySelector(tag)?.textContent?.trim();

  function parseCoord(el) {
    const lat = parseFloat(el.getAttribute('lat'));
    const lon = parseFloat(el.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) return null;
    const ele = parseFloat(el.querySelector('ele')?.textContent);
    return { lat, lng: lon, alt: isNaN(ele) ? undefined : ele };
  }

  // ── Waypoints <wpt> ──────────────────────────────────────────────────────
  doc.querySelectorAll('wpt').forEach((wpt) => {
    const coord = parseCoord(wpt);
    if (!coord) return;
    result.waypoints.push({
      name: text(wpt, 'name') || 'Waypoint',
      description: text(wpt, 'desc'),
      coordinate: coord,
    });
  });

  // ── Tracks <trk> ─────────────────────────────────────────────────────────
  doc.querySelectorAll('trk').forEach((trk) => {
    const coords = [];
    trk.querySelectorAll('trkpt').forEach((pt) => {
      const c = parseCoord(pt);
      if (c) coords.push(c);
    });
    if (coords.length < 2) return;
    result.routes.push({
      name: text(trk, 'name') || 'Track',
      description: text(trk, 'desc'),
      coordinates: coords,
      source: 'gpx',
      distanceKm: calcDistanceKm(coords),
      elevationGainM: calcElevationGain(coords),
    });
  });

  // ── Routes <rte> ─────────────────────────────────────────────────────────
  doc.querySelectorAll('rte').forEach((rte) => {
    const coords = [];
    rte.querySelectorAll('rtept').forEach((pt) => {
      const c = parseCoord(pt);
      if (c) coords.push(c);
    });
    if (coords.length < 2) return;
    result.routes.push({
      name: text(rte, 'name') || 'Route',
      description: text(rte, 'desc'),
      coordinates: coords,
      source: 'gpx',
      distanceKm: calcDistanceKm(coords),
      elevationGainM: calcElevationGain(coords),
    });
  });

  return result;
};

function calcDistanceKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return Math.round(total * 10) / 10;
}

function calcElevationGain(coords) {
  let gain = 0;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1].alt ?? 0;
    const curr = coords[i].alt ?? 0;
    if (curr > prev) gain += curr - prev;
  }
  return Math.round(gain);
}
