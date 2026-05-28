/**
 * storage.js — IndexedDB wrapper for AlpineNav
 * Stores folders, waypoints and routes locally on the device.
 * Exposed on window.DB so app.js can call DB.saveWaypoint() etc.
 */

const DB_NAME = 'alpinenav';
const DB_VERSION = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      ['folders', 'waypoints', 'routes'].forEach((store) => {
        if (!db.objectStoreNames.contains(store))
          db.createObjectStore(store, { keyPath: 'id' });
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function txGet(storeName) {
  return openDB().then((db) =>
    new Promise((res, rej) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    })
  );
}

function txPut(storeName, value) {
  return openDB().then((db) =>
    new Promise((res, rej) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    })
  );
}

function txDelete(storeName, id) {
  return openDB().then((db) =>
    new Promise((res, rej) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    })
  );
}

// ── Default folder (always present, cannot be deleted) ─────────────────────
const DEFAULT_FOLDER = { id: 'default', name: 'Unfiled', icon: '📁', createdAt: 0 };

// ── Folders ─────────────────────────────────────────────────────────────────
async function getFolders() {
  const saved = await txGet('folders');
  return [DEFAULT_FOLDER, ...saved.sort((a, b) => a.createdAt - b.createdAt)];
}
async function createFolder(name, icon = '📁') {
  const f = { id: uid(), name, icon, createdAt: Date.now() };
  await txPut('folders', f);
  return f;
}
async function deleteFolder(id) {
  if (id === 'default') return;
  // Reassign contents to Unfiled before deleting
  for (const w of await txGet('waypoints')) {
    if (w.folderId === id) await txPut('waypoints', { ...w, folderId: 'default' });
  }
  for (const r of await txGet('routes')) {
    if (r.folderId === id) await txPut('routes', { ...r, folderId: 'default' });
  }
  await txDelete('folders', id);
}
async function renameFolder(id, name) {
  if (id === 'default') return;
  const all = await txGet('folders');
  const f = all.find((x) => x.id === id);
  if (f) await txPut('folders', { ...f, name });
}

// ── Waypoints ────────────────────────────────────────────────────────────────
async function saveWaypoint(data) {
  const w = { ...data, id: uid(), createdAt: Date.now() };
  await txPut('waypoints', w);
  return w;
}
async function updateWaypoint(id, changes) {
  const all = await txGet('waypoints');
  const w = all.find((x) => x.id === id);
  if (w) await txPut('waypoints', { ...w, ...changes });
}
async function deleteWaypoint(id) { await txDelete('waypoints', id); }

// ── Routes ───────────────────────────────────────────────────────────────────
async function saveRoute(data) {
  const r = { ...data, id: uid(), createdAt: Date.now() };
  await txPut('routes', r);
  return r;
}
async function updateRoute(id, changes) {
  const all = await txGet('routes');
  const r = all.find((x) => x.id === id);
  if (r) await txPut('routes', { ...r, ...changes });
}
async function deleteRoute(id) { await txDelete('routes', id); }

// ── Expose on window ─────────────────────────────────────────────────────────
window.DB = {
  DEFAULT_FOLDER,
  getFolders, createFolder, deleteFolder, renameFolder,
  getAll: txGet,
  saveWaypoint, updateWaypoint, deleteWaypoint,
  saveRoute, updateRoute, deleteRoute,
};
