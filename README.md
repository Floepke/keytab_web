# keyTAB Web

Browser-native foundation for keyTAB, informed by the `keyTAB2` document model.

## First Run

Install Node.js 22 LTS or newer, then run:

```bash
cd keytab-web
npm install
npm run dev
```

Vite prints the local browser URL, normally `http://localhost:5173`.

## Current Scope

- Traditional application menu, icon toolbar, status bar, and snap-size dock.
- A paper-space SVG preview with keyTAB-style stave and grid geometry.
- TypeScript document data, base-grid math, typed events, and JSON serialization for the `.ktw` web format.

The browser document format is `.ktw` JSON.

## Checks

```bash
npm run test
npm run build
```

## Desktop Packages

Electron packages the built web application with a desktop runtime. Install the
new development dependencies once, then create packages with:

```bash
npm run dist:linux # AppImage and .deb in release/
npm run dist:win   # portable .exe and installer in release/
npm run dist:mac   # .dmg and .zip in release/
npm run dist:all   # Linux + Windows packages when run on Linux
```

`npm run dist` builds the targets supported by the current machine. Build macOS
packages on macOS, Windows packages on Windows, and Linux packages on Linux.
Unsigned macOS and Windows packages may show operating-system security warnings.

`npm run dist:all` builds the web application once, then produces the Linux
AppImage and `.deb` plus Windows portable and NSIS `.exe` packages on Linux. A
macOS `.dmg` must still be built on macOS, where `npm run dist:mac` creates it.

Before publishing, replace the placeholder `homepage`, `author`, and Linux
`maintainer` values in `package.json` with the project's real release metadata.