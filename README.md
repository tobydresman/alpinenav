# AlpineNav ⛰️ — PWA Setup Guide

A free, offline-capable GPS navigation app for mountaineering and mountain biking.
No subscriptions. No app store. Runs in Safari and installs to your iPhone home screen.

---

## What you need

1. A computer (any OS) 
2. A GitHub account 
3. Your iPhone 

That's it. No developer account. No fees.

---

## Step 1 — Generate the app icons

1. Open **`generate-icons.html`** in any browser (just double-click it)
2. Click **"Download icon-192.png"** → save it into the `icons/` folder
3. Click **"Download icon-512.png"** → save it into the `icons/` folder

---

## Step 2 — Put the app online (free, takes 5 minutes)

You need HTTPS hosting for GPS and offline to work. GitHub Pages is free and easy.

### GitHub Pages (recommended)

1. Go to **https://github.com/signup** and create a free account
2. Click **"New repository"** (the green button)
3. Name it `alpinenav`, set it to **Public**, click **Create repository**
4. Click **"uploading an existing file"** on the next screen
5. Drag **all the AlpineNav-PWA files** into the upload area (including the `icons/` folder)
6. Click **"Commit changes"**
7. Go to **Settings → Pages** (left sidebar)
8. Under "Branch", select **main** and click Save
9. Wait 1 minute, then your app is live at:
   **`https://YOUR-USERNAME.github.io/alpinenav`**

### Alternative: Netlify (even faster, no account needed)

1. Go to **https://app.netlify.com/drop**
2. Drag the entire `AlpineNav-PWA` folder onto the page
3. Get an instant URL like `https://random-name.netlify.app`

---

## Step 3 — Install on your iPhone

1. Open **Safari** on your iPhone (must be Safari, not Chrome)
2. Go to your app URL (e.g. `https://yourusername.github.io/alpinenav`)
3. Tap the **Share button** (the box with an arrow pointing up)
4. Scroll down and tap **"Add to Home Screen"**
5. Tap **"Add"** in the top right
6. AlpineNav now appears on your home screen like a normal app

---

## Step 4 — Allow location access

When you first open the app, Safari will ask for location permission.
Tap **"Allow While Using App"**.

If you missed it: **Settings → Safari → Location → Allow**
Or: **Settings → Privacy → Location Services → Safari → While Using**

---

## Using the app offline

### Automatic tile caching
As you browse the map, tiles are automatically saved. Any area you've viewed will be available offline.

### Pre-downloading your route area (recommended before a trip)
1. Open the app while on WiFi
2. Navigate the map to the area you're going to (Alps, your specific valley, etc.)
3. Zoom to about zoom level 12 so you can see your whole area
4. Tap **+** → **⬇️ Download Area offline**
5. Check the estimate (aim for under 1000 tiles — zoom in if needed, then download multiple sections)
6. Tap **Download** and wait for it to finish
7. Repeat for other areas of your trip
8. You're done — those tiles are saved and will work with no internet

> **Tip:** Download at a few different zoom levels by zooming in on key sections (your summit approach, your camp area) and running the download again. This gives you detail where you need it.

---

## Importing GPX files

GPX files from Komoot, Strava, Garmin, AllTrails, CalTopo etc. all work.

1. Get your GPX file onto your iPhone (AirDrop from your computer, or download from Komoot/Strava/etc.)
2. Open AlpineNav
3. Tap **+** → **📂 Import GPX file**
4. Choose the file from your Files app
5. Pick which folder to save it to
6. Tap **Import**

The route appears on the map immediately, and shows in your Library.

---

## Adding waypoints

1. Navigate the map to where you want the waypoint (e.g. a col, a water source, a camp spot)
2. Tap **+** → **📍 Add waypoint here**
3. Tap the exact spot on the map
4. Give it a name and optional notes
5. Choose a folder
6. Tap **Save**

---

## Organising with folders

Go to the **Library** tab (📁) to see all your saved data.

- Tap a folder to see its contents
- Tap any route or waypoint to fly to it on the map
- **Long-press a folder** to rename or delete it
- Use the **Move** button on any item to move it to a different folder

Suggested folder setup for an Alps trip:
- ⛰️ **Summits** — peaks you want to bag
- 🏕️ **Camps** — bivouac spots, huts, camping areas  
- 🚵 **Bike routes** — MTB tracks
- 🥾 **Hiking routes** — approach routes, via ferratas

---

## File structure (for reference)

```
AlpineNav-PWA/
├── index.html          ← the app UI
├── app.js              ← all the application logic
├── style.css           ← dark theme styles
├── storage.js          ← saves data to your device (IndexedDB)
├── gpxParser.js        ← reads GPX files
├── sw.js               ← service worker (makes it work offline)
├── manifest.json       ← tells iOS this is an installable app
├── generate-icons.html ← run once to create your icons
└── icons/
    ├── icon-192.png    ← app icon (generated in Step 1)
    └── icon-512.png    ← app icon large (generated in Step 1)
```

---

## Troubleshooting

**Map is blank when offline**
You need to browse the area first while on WiFi, or use the "Download Area" button. Tiles can't be loaded from thin air!

**GPS not working**
Make sure you gave Safari location permission. Also, GPS takes 10–20 seconds to get a fix when you first open the app outdoors.

**"Add to Home Screen" not showing**
You must use Safari, not Chrome or Firefox. On Safari, the share button is at the bottom of the screen.

**App lost my data**
Data is stored in your browser's IndexedDB. It persists indefinitely unless you clear Safari website data. Avoid doing that. To be safe, export important waypoints as GPX before clearing your browser.

**Installed the app but it won't open**
Try deleting and re-adding to home screen. Make sure the hosting URL is still live.

---

## Future ideas (add these whenever you want!)

- **Strava integration** — import your recent activities as routes
- **GPX export** — export your saved waypoints/tracks back to GPX
- **Elevation profile** — graph showing the climb/descent of a route
- **Compass overlay** — bearing to next waypoint
- **Custom waypoint colours** — different colours per category

*Built for Toby's Alps adventure — have an amazing trip! ⛰️🚵*
