/**
 * app.js — AlpineNav main application
 *
 * Sections:
 *   1. State
 *   2. Helpers
 *   3. Map initialisation
 *   4. GPS location
 *   5. Markers & routes rendering
 *   6. Tab navigation
 *   7. FAB menu
 *   8. Add Waypoint flow
 *   9. GPX import flow
 *  10. Download Area flow
 *  11. Library panel
 *  12. Settings panel
 *  13. Sheet/overlay helpers
 *  14. App initialisation
 */

// ── 1. State ─────────────────────────────────────────────────────────────────
let map;
let folders  = [];
let waypoints = [];
let routes   = [];

const markerLayers = {}; // waypointId → L.CircleMarker
const routeLayers  = {}; // routeId    → L.Polyline

let addingWaypoint = false;
let pendingCoord   = null;   // { lat, lng } waiting for name

let pendingGPX     = null;   // { name, parsed } waiting for folder choice
let importFolderId = 'default';
let wptFolderId    = 'default';
let movingItem     = null;   // { type:'waypoint'|'route', id, folderId }

let currentLibFolderId = null; // null = folder list view

const FOLDER_EMOJIS = ['📁','⛰️','🚵','🏕️','🗺️','🧭','🥾','🏔️','🌲','❄️','🔵','🔴','🟢','⭐'];
let newFolderEmoji = '📁';

// ── 2. Helpers ────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function show(id)    { $(id)?.classList.remove('hidden'); }
function hide(id)    { $(id)?.classList.add('hidden'); }
function toggle(id)  { $(id)?.classList.toggle('hidden'); }

function setStatus(msg) { $('topbar-status').textContent = msg; }

// Tile math for Download Area
function latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

function getTileUrls(bounds, minZ, maxZ) {
  const urls = [];
  const subdomains = ['a', 'b', 'c'];
  for (let z = minZ; z <= maxZ; z++) {
    const nw = latLngToTile(bounds.getNorth(), bounds.getWest(), z);
    const se = latLngToTile(bounds.getSouth(), bounds.getEast(), z);
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) {
        const s = subdomains[(x + y) % 3];
        urls.push(`https://${s}.tile.opentopomap.org/${z}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

// ── 3. Map initialisation ────────────────────────────────────────────────────

function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
  }).setView([46.5, 10.5], 8); // Default: Alps overview

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  }).addTo(map);

  // Tap map to place waypoint (only when in adding mode)
  map.on('click', (e) => {
    if (!addingWaypoint) return;
    pendingCoord = { lat: e.latlng.lat, lng: e.latlng.lng };
    stopAddingWaypoint();
    openWaypointSheet(pendingCoord);
  });
}

// ── 4. GPS location ───────────────────────────────────────────────────────────

let locationMarker   = null;
let accuracyCircle   = null;
let locationWatcher  = null;
let hasLocationFix   = false;

function startLocation() {
  if (!navigator.geolocation) {
    setStatus('GPS not available');
    return;
  }
  setStatus('Locating…');

  locationWatcher = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;

      if (!hasLocationFix) {
        // First fix — fly to location
        map.setView([lat, lng], 14);
        hasLocationFix = true;
        setStatus('');
      }

      // Update or create the location dot
      if (!locationMarker) {
        locationMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#fff',
          weight: 2.5,
          fillColor: '#2196f3',
          fillOpacity: 1,
          zIndexOffset: 1000,
        }).addTo(map);

        accuracyCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: '#2196f3',
          fillColor: '#2196f3',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(map);
      } else {
        locationMarker.setLatLng([lat, lng]);
        accuracyCircle.setLatLng([lat, lng]).setRadius(accuracy);
      }
    },
    (err) => {
      if (err.code === 1) setStatus('Location blocked');
      else setStatus('No GPS fix');
    },
    { enableHighAccuracy: true, maximumAge: 3000 }
  );
}

function centreOnUser() {
  if (locationMarker) {
    map.setView(locationMarker.getLatLng(), Math.max(map.getZoom(), 14), { animate: true });
  } else {
    setStatus('Waiting for GPS…');
  }
}

// ── 5. Markers & route rendering ─────────────────────────────────────────────

function renderAllMarkers() {
  // Clear existing
  Object.values(markerLayers).forEach((m) => map.removeLayer(m));
  Object.values(routeLayers).forEach((l)  => map.removeLayer(l));
  for (const k in markerLayers) delete markerLayers[k];
  for (const k in routeLayers)  delete routeLayers[k];

  // Draw routes (below waypoints)
  routes.forEach(addRouteLayer);

  // Draw waypoints (on top)
  waypoints.forEach(addWaypointLayer);
}

function addWaypointLayer(w) {
  const m = L.circleMarker([w.coordinate.lat, w.coordinate.lng], {
    radius: 9,
    color: '#fff',
    weight: 2,
    fillColor: w.color || '#ff6b35',
    fillOpacity: 1,
  }).addTo(map);

  // Label
  m.bindTooltip(w.name, {
    permanent: true,
    direction: 'top',
    offset: [0, -10],
    className: 'wpt-label',
    opacity: 0.9,
  });

  markerLayers[w.id] = m;
}

function addRouteLayer(r) {
  const latlngs = r.coordinates.map((c) => [c.lat, c.lng]);
  const line = L.polyline(latlngs, {
    color: r.color || '#00b4d8',
    weight: 3.5,
    opacity: 0.88,
  }).addTo(map);
  routeLayers[r.id] = line;
}

function removeWaypointLayer(id) {
  if (markerLayers[id]) { map.removeLayer(markerLayers[id]); delete markerLayers[id]; }
}

function removeRouteLayer(id) {
  if (routeLayers[id]) { map.removeLayer(routeLayers[id]); delete routeLayers[id]; }
}

// ── 6. Tab navigation ─────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  hide('panel-library');
  hide('panel-settings');

  if (tab === 'library') {
    show('panel-library');
    renderLibrary();
  } else if (tab === 'settings') {
    show('panel-settings');
    renderSettings();
  }
  // 'map' tab just hides the panels (map is always underneath)
}

// ── 7. FAB menu ───────────────────────────────────────────────────────────────

function initFAB() {
  const fab  = $('fab');
  const menu = $('fab-menu');

  fab.addEventListener('click', () => {
    fab.classList.toggle('open');
    menu.classList.toggle('hidden');
  });

  $('fab-add-wpt').addEventListener('click', () => {
    closeFAB();
    startAddingWaypoint();
  });

  $('fab-import').addEventListener('click', () => {
    closeFAB();
    $('gpx-file-input').click();
  });

  $('fab-download').addEventListener('click', () => {
    closeFAB();
    openDownloadSheet();
  });

  // Close FAB menu when tapping elsewhere
  document.addEventListener('click', (e) => {
    if (!fab.contains(e.target) && !menu.contains(e.target)) closeFAB();
  });
}

function closeFAB() {
  $('fab').classList.remove('open');
  hide('fab-menu');
}

// ── 8. Add Waypoint flow ──────────────────────────────────────────────────────

function startAddingWaypoint() {
  addingWaypoint = true;
  show('add-hint');
  show('btn-cancel-wpt');
  map.getContainer().style.cursor = 'crosshair';
}

function stopAddingWaypoint() {
  addingWaypoint = false;
  hide('add-hint');
  hide('btn-cancel-wpt');
  map.getContainer().style.cursor = '';
}

function openWaypointSheet(coord) {
  $('wpt-coords').textContent =
    `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
  $('wpt-name').value = '';
  $('wpt-desc').value = '';
  wptFolderId = 'default';
  renderFolderChips('wpt-folder-chips', folders, 'default', (id) => { wptFolderId = id; });
  $('wpt-save').disabled = true;
  openSheet('sheet-wpt');
}

function initWaypointSheet() {
  $('wpt-name').addEventListener('input', () => {
    $('wpt-save').disabled = !$('wpt-name').value.trim();
  });

  $('wpt-cancel').addEventListener('click', () => {
    closeSheet('sheet-wpt');
    pendingCoord = null;
  });

  $('wpt-save').addEventListener('click', async () => {
    const name = $('wpt-name').value.trim();
    const desc = $('wpt-desc').value.trim();
    if (!name || !pendingCoord) return;

    const w = await DB.saveWaypoint({
      name, description: desc,
      coordinate: pendingCoord,
      folderId: wptFolderId,
    });
    waypoints.push(w);
    addWaypointLayer(w);

    closeSheet('sheet-wpt');
    pendingCoord = null;
  });

  $('btn-cancel-wpt').addEventListener('click', () => stopAddingWaypoint());
  $('btn-centre').addEventListener('click', centreOnUser);
}

// ── 9. GPX import flow ────────────────────────────────────────────────────────

function initGPXImport() {
  $('gpx-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // allow re-importing same file

    const text = await file.text();
    const parsed = parseGPX(text);

    if (parsed.waypoints.length === 0 && parsed.routes.length === 0) {
      alert('No waypoints or routes found in this file. Make sure it is a valid .gpx file.');
      return;
    }

    pendingGPX = { name: file.name, parsed };
    importFolderId = 'default';

    $('import-name').textContent = file.name;
    const parts = [];
    if (parsed.waypoints.length) parts.push(`${parsed.waypoints.length} waypoint${parsed.waypoints.length !== 1 ? 's' : ''}`);
    if (parsed.routes.length)    parts.push(`${parsed.routes.length} route${parsed.routes.length !== 1 ? 's' : ''}`);
    $('import-stats').textContent = parts.join('  •  ');

    renderFolderChips('import-folder-chips', folders, 'default', (id) => { importFolderId = id; });
    openSheet('sheet-import');
  });

  $('import-cancel').addEventListener('click', () => {
    closeSheet('sheet-import');
    pendingGPX = null;
  });

  $('import-confirm').addEventListener('click', async () => {
    if (!pendingGPX) return;
    const { parsed } = pendingGPX;

    for (const w of parsed.waypoints) {
      const saved = await DB.saveWaypoint({ ...w, folderId: importFolderId });
      waypoints.push(saved);
      addWaypointLayer(saved);
    }
    for (const r of parsed.routes) {
      const saved = await DB.saveRoute({ ...r, folderId: importFolderId });
      routes.push(saved);
      addRouteLayer(saved);
    }

    closeSheet('sheet-import');
    pendingGPX = null;

    // Zoom to show the imported content if it has coordinates
    const allCoords = [
      ...parsed.waypoints.map((w) => [w.coordinate.lat, w.coordinate.lng]),
      ...parsed.routes.flatMap((r) => r.coordinates.map((c) => [c.lat, c.lng])),
    ];
    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
    }
  });
}

// ── 10. Download Area flow ────────────────────────────────────────────────────

function openDownloadSheet() {
  const bounds = map.getBounds();
  const urls   = getTileUrls(bounds, 10, 14);
  const sizeMB = Math.round(urls.length * 0.05); // ~50KB per tile estimate

  if (urls.length > 3000) {
    $('dl-estimate').textContent = `~${urls.length} tiles — too many. Zoom in more and try again.`;
    $('dl-start').disabled = true;
  } else {
    $('dl-estimate').textContent = `~${urls.length} tiles  •  ~${sizeMB}MB estimated`;
    $('dl-start').disabled = false;
  }

  hide('dl-progress-wrap');
  openSheet('sheet-download');
}

function initDownloadSheet() {
  $('dl-cancel').addEventListener('click', () => closeSheet('sheet-download'));

  $('dl-start').addEventListener('click', () => {
    const bounds = map.getBounds();
    const urls   = getTileUrls(bounds, 10, 14);

    $('dl-start').disabled = true;
    $('dl-cancel').textContent = 'Close';
    show('dl-progress-wrap');
    $('dl-bar').style.width = '0%';
    $('dl-progress-text').textContent = `0 / ${urls.length} tiles`;

    // Send tile list to service worker for background caching
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CACHE_TILES', urls });
    } else {
      $('dl-progress-text').textContent = 'Service worker not ready. Try again after refreshing.';
    }
  });

  // Listen for progress updates from the service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'TILE_PROGRESS') {
      const pct = Math.round((event.data.done / event.data.total) * 100);
      $('dl-bar').style.width = pct + '%';
      $('dl-progress-text').textContent = `${event.data.done} / ${event.data.total} tiles`;
    }
    if (event.data.type === 'TILE_DONE') {
      $('dl-progress-text').textContent = `Done! ${event.data.total} tiles cached.`;
      $('dl-bar').style.width = '100%';
    }
  });
}

// ── 11. Library panel ─────────────────────────────────────────────────────────

function renderLibrary() {
  const body = $('lib-body');
  body.innerHTML = '';

  if (currentLibFolderId === null) {
    // ── Folder list view ──
    $('lib-back').classList.add('hidden');
    $('lib-title').textContent = 'Library';
    $('lib-new-folder').classList.remove('hidden');

    if (folders.length === 0) {
      body.innerHTML = '<p class="empty-msg">No folders yet.</p>';
      return;
    }

    folders.forEach((f) => {
      const wCount = waypoints.filter((w) => w.folderId === f.id).length;
      const rCount = routes.filter((r) => r.folderId === f.id).length;
      const total  = wCount + rCount;
      const parts  = [];
      if (wCount) parts.push(`${wCount} wpt`);
      if (rCount) parts.push(`${rCount} route${rCount !== 1 ? 's' : ''}`);

      const row = document.createElement('div');
      row.className = 'folder-row';
      row.innerHTML = `
        <span class="f-icon">${f.icon || '📁'}</span>
        <div class="f-info">
          <div class="f-name">${f.name}</div>
          <div class="f-sub">${total === 0 ? 'Empty' : parts.join('  •  ')}</div>
        </div>
        <span class="chevron">›</span>`;

      row.addEventListener('click', () => {
        currentLibFolderId = f.id;
        renderLibrary();
      });

      // Long press to rename / delete
      if (f.id !== 'default') {
        let pressTimer;
        row.addEventListener('touchstart', () => {
          pressTimer = setTimeout(() => folderContextMenu(f), 600);
        });
        row.addEventListener('touchend', () => clearTimeout(pressTimer));
        row.addEventListener('touchmove', () => clearTimeout(pressTimer));
      }

      body.appendChild(row);
    });

  } else {
    // ── Folder contents view ──
    const folder = folders.find((f) => f.id === currentLibFolderId);
    $('lib-back').classList.remove('hidden');
    $('lib-title').textContent = `${folder?.icon || '📁'} ${folder?.name || ''}`;
    $('lib-new-folder').classList.add('hidden');

    const fw = waypoints.filter((w) => w.folderId === currentLibFolderId);
    const fr = routes.filter((r) => r.folderId === currentLibFolderId);

    if (fw.length === 0 && fr.length === 0) {
      body.innerHTML = '<p class="empty-msg">This folder is empty.<br>Add waypoints on the map<br>or import a GPX file.</p>';
      return;
    }

    if (fr.length > 0) {
      const header = document.createElement('p');
      header.className = 'sec-header';
      header.textContent = `Routes (${fr.length})`;
      body.appendChild(header);
      fr.forEach((r) => body.appendChild(makeRouteRow(r)));
    }

    if (fw.length > 0) {
      const header = document.createElement('p');
      header.className = 'sec-header';
      header.textContent = `Waypoints (${fw.length})`;
      body.appendChild(header);
      fw.forEach((w) => body.appendChild(makeWaypointRow(w)));
    }
  }
}

function makeWaypointRow(w) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-dot" style="background:${w.color || '#ff6b35'}"></div>
    <div class="item-info">
      <div class="item-name">${w.name}</div>
      <div class="item-sub">${w.coordinate.lat.toFixed(4)}, ${w.coordinate.lng.toFixed(4)}${w.coordinate.alt ? `  •  ${Math.round(w.coordinate.alt)}m` : ''}</div>
      ${w.description ? `<div class="item-desc">${w.description}</div>` : ''}
    </div>
    <div class="item-acts">
      <button class="item-btn move-btn">Move</button>
      <button class="item-btn del del-btn">Delete</button>
    </div>`;

  row.querySelector('.move-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    movingItem = { type: 'waypoint', id: w.id, folderId: w.folderId };
    openMoveSheet();
  });

  row.querySelector('.del-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirm(`Delete waypoint "${w.name}"?`)) return;
    DB.deleteWaypoint(w.id);
    waypoints = waypoints.filter((x) => x.id !== w.id);
    removeWaypointLayer(w.id);
    renderLibrary();
  });

  // Tap row = fly to waypoint on map
  row.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    map.setView([w.coordinate.lat, w.coordinate.lng], Math.max(map.getZoom(), 15), { animate: true });
    switchTab('map');
  });

  return row;
}

function makeRouteRow(r) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const sub = [
    r.distanceKm    ? `${r.distanceKm} km`    : '',
    r.elevationGainM ? `+${r.elevationGainM}m` : '',
    !r.distanceKm && !r.elevationGainM ? `${r.coordinates.length} pts` : '',
  ].filter(Boolean).join('  •  ');
  row.innerHTML = `
    <div class="item-dot route" style="background:${r.color || '#00b4d8'}"></div>
    <div class="item-info">
      <div class="item-name">${r.name}</div>
      <div class="item-sub">${sub}</div>
      ${r.description ? `<div class="item-desc">${r.description}</div>` : ''}
    </div>
    <div class="item-acts">
      <button class="item-btn move-btn">Move</button>
      <button class="item-btn del del-btn">Delete</button>
    </div>`;

  row.querySelector('.move-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    movingItem = { type: 'route', id: r.id, folderId: r.folderId };
    openMoveSheet();
  });

  row.querySelector('.del-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirm(`Delete route "${r.name}"?`)) return;
    DB.deleteRoute(r.id);
    routes = routes.filter((x) => x.id !== r.id);
    removeRouteLayer(r.id);
    renderLibrary();
  });

  row.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (r.coordinates.length > 0) {
      const bounds = L.latLngBounds(r.coordinates.map((c) => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [40, 40], animate: true });
      switchTab('map');
    }
  });

  return row;
}

function folderContextMenu(f) {
  const choice = prompt(`"${f.name}"\n\nType "rename" to rename, or "delete" to delete:`);
  if (!choice) return;
  if (choice.trim().toLowerCase() === 'rename') {
    const newName = prompt('New folder name:', f.name);
    if (newName?.trim()) {
      DB.renameFolder(f.id, newName.trim());
      const idx = folders.findIndex((x) => x.id === f.id);
      if (idx !== -1) folders[idx] = { ...folders[idx], name: newName.trim() };
      renderLibrary();
    }
  } else if (choice.trim().toLowerCase() === 'delete') {
    if (!confirm(`Delete folder "${f.name}"? Items will move to Unfiled.`)) return;
    DB.deleteFolder(f.id);
    folders = folders.filter((x) => x.id !== f.id);
    waypoints = waypoints.map((w) => w.folderId === f.id ? { ...w, folderId: 'default' } : w);
    routes    = routes.map((r) => r.folderId === f.id ? { ...r, folderId: 'default' } : r);
    renderLibrary();
  }
}

function initLibraryPanel() {
  $('lib-back').addEventListener('click', () => {
    currentLibFolderId = null;
    renderLibrary();
  });

  $('lib-new-folder').addEventListener('click', () => {
    newFolderEmoji = '📁';
    $('folder-name').value = '';
    renderEmojiChips();
    openSheet('sheet-folder');
  });
}

// Move item sheet
function openMoveSheet() {
  const list = $('move-folder-list');
  list.innerHTML = '';
  folders
    .filter((f) => movingItem && f.id !== movingItem.folderId)
    .forEach((f) => {
      const row = document.createElement('div');
      row.className = 'move-row';
      row.innerHTML = `<span style="font-size:22px;margin-right:12px">${f.icon}</span><span style="font-size:16px;font-weight:600">${f.name}</span>`;
      row.addEventListener('click', async () => {
        if (!movingItem) return;
        if (movingItem.type === 'waypoint') {
          await DB.updateWaypoint(movingItem.id, { folderId: f.id });
          waypoints = waypoints.map((w) => w.id === movingItem.id ? { ...w, folderId: f.id } : w);
        } else {
          await DB.updateRoute(movingItem.id, { folderId: f.id });
          routes = routes.map((r) => r.id === movingItem.id ? { ...r, folderId: f.id } : r);
        }
        movingItem = null;
        closeSheet('sheet-move');
        renderLibrary();
      });
      list.appendChild(row);
    });
  openSheet('sheet-move');
}

// Folder creation sheet
function renderEmojiChips() {
  const row = $('folder-emoji-row');
  row.innerHTML = '';
  FOLDER_EMOJIS.forEach((e) => {
    const chip = document.createElement('div');
    chip.className = 'emoji-chip' + (e === newFolderEmoji ? ' active' : '');
    chip.textContent = e;
    chip.addEventListener('click', () => {
      newFolderEmoji = e;
      renderEmojiChips();
    });
    row.appendChild(chip);
  });
}

function initFolderSheet() {
  $('folder-cancel').addEventListener('click', () => closeSheet('sheet-folder'));
  $('folder-save').addEventListener('click', async () => {
    const name = $('folder-name').value.trim();
    if (!name) return;
    const f = await DB.createFolder(name, newFolderEmoji);
    folders.push(f);
    closeSheet('sheet-folder');
    renderLibrary();
  });
  $('move-cancel').addEventListener('click', () => { movingItem = null; closeSheet('sheet-move'); });
}

// ── 12. Settings panel ────────────────────────────────────────────────────────

function renderSettings() {
  const body = $('settings-body');
  body.innerHTML = `
    <div class="set-section">
      <div class="set-title">My Data</div>
      <div class="set-card">
        <div class="set-row"><span class="set-label">Waypoints</span><span class="set-val">${waypoints.length}</span></div>
        <div class="set-row"><span class="set-label">Routes</span><span class="set-val">${routes.length}</span></div>
        <div class="set-row"><span class="set-label">Folders</span><span class="set-val">${Math.max(0, folders.length - 1)}</span></div>
        <div class="set-row"><span class="set-label danger" id="btn-clear-data" style="cursor:pointer">Clear all data</span></div>
      </div>
    </div>

    <div class="set-section">
      <div class="set-title">Offline Maps</div>
      <div class="set-card" style="padding:14px">
        <p class="info-text">Map tiles are cached automatically as you browse. Use the <strong>⬇️ Download Area</strong> button on the map (tap +) to pre-cache your route before you leave WiFi.</p>
        <p class="info-text">Zoom levels 10–14 are downloaded, which gives you topo detail down to footpath level.</p>
        <button class="link-btn" id="btn-clear-tiles">Clear tile cache</button>
      </div>
    </div>

    <div class="set-section">
      <div class="set-title">GPX Files</div>
      <div class="set-card" style="padding:14px">
        <p class="info-text">Import .gpx files from Komoot, Strava, Garmin, or CalTopo. Tap + on the map then "Import GPX file" and choose your file.</p>
        <p class="info-text">Tracks, routes, and waypoints are all supported.</p>
      </div>
    </div>

    <div class="set-section">
      <div class="set-title">About</div>
      <div class="set-card">
        <div class="set-row"><span class="set-label">AlpineNav</span><span class="set-val">v1.0</span></div>
        <div class="set-row"><span class="set-label">Map data</span><span class="set-val">OpenTopoMap</span></div>
        <div class="set-row"><a href="https://opentopomap.org/about" target="_blank" class="set-label set-link">OpenTopoMap licence ↗</a></div>
      </div>
    </div>`;

  $('btn-clear-data').addEventListener('click', () => {
    if (!confirm('Delete ALL waypoints, routes, and folders? This cannot be undone.')) return;
    indexedDB.deleteDatabase('alpinenav');
    waypoints = []; routes = []; folders = [DB.DEFAULT_FOLDER];
    renderAllMarkers();
    renderSettings();
    alert('All data cleared. Refresh the app to reset fully.');
  });

  $('btn-clear-tiles').addEventListener('click', async () => {
    if (!confirm('Delete the cached map tile data?')) return;
    await caches.delete('alpinenav-tiles-v1');
    alert('Tile cache cleared.');
  });
}

// ── 13. Sheet / overlay helpers ───────────────────────────────────────────────

function openSheet(id) {
  show('overlay');
  show(id);
}

function closeSheet(id) {
  hide(id);
  // Only hide overlay if no other sheets are open
  const anyOpen = ['sheet-wpt','sheet-import','sheet-download','sheet-folder','sheet-move']
    .some((s) => !$(s).classList.contains('hidden'));
  if (!anyOpen) hide('overlay');
}

// Tap overlay to close any open sheet
function initOverlay() {
  $('overlay').addEventListener('click', () => {
    ['sheet-wpt','sheet-import','sheet-download','sheet-folder','sheet-move'].forEach(closeSheet);
    hide('overlay');
    // Also reset add-waypoint mode
    if (addingWaypoint) stopAddingWaypoint();
    if (pendingGPX) pendingGPX = null;
  });
}

// ── Folder chip renderer (used in waypoint + import sheets) ──────────────────
function renderFolderChips(containerId, folderList, defaultSelected, onSelect) {
  const container = $(containerId);
  container.innerHTML = '';
  let selected = defaultSelected;
  folderList.forEach((f) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (f.id === selected ? ' active' : '');
    chip.textContent = `${f.icon} ${f.name}`;
    chip.addEventListener('click', () => {
      selected = f.id;
      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      onSelect(f.id);
    });
    container.appendChild(chip);
  });
}

// ── 14. App initialisation ────────────────────────────────────────────────────

async function init() {
  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('SW registration failed:', e);
    });
  }

  // Load data from IndexedDB
  [folders, waypoints, routes] = await Promise.all([
    DB.getFolders(),
    DB.getAll('waypoints'),
    DB.getAll('routes'),
  ]);

  // Set up the map
  initMap();

  // Render saved data on map
  renderAllMarkers();

  // Start GPS
  startLocation();

  // Wire up all UI
  initTabs();
  initFAB();
  initWaypointSheet();
  initGPXImport();
  initDownloadSheet();
  initLibraryPanel();
  initFolderSheet();
  initOverlay();
}

// Start when the page is ready
document.addEventListener('DOMContentLoaded', init);
