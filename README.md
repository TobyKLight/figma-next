<img width="960" alt="Cover" src="https://user-images.githubusercontent.com/563095/224496751-07d020d5-6722-493b-933c-45d7a4a06f1d.png">

# figma-next
Next pans through Figma canvas frames on the current page using a minimal, next / previous interface.

Right-click the prev/next bar (Mac: Control-click or two-finger tap), press Escape, or long-press either button to open **Settings**: set transition time, and in FigJam choose which object types count as frames, connector-follow options, and optional vertical navigation. The Help tab documents keyboard shortcuts, journey/camera paths, and FigJam behavior.

Install (Community): https://www.figma.com/community/plugin/1212837078233436615/Next

## Run a local / development build in FigJam or Figma

Use this when you want the version from this repo (including unreleased changes) instead of the Community listing.

1. Install and open **Figma Desktop** (local plugins are loaded from the desktop app, not the browser).
2. Clone this repository somewhere on your machine, e.g.:
   ```bash
   git clone https://github.com/TobyKLight/figma-next.git
   cd figma-next
   ```
3. In Figma / FigJam: **Menu → Plugins → Development → Import plugin from manifest…**
4. Select this repo’s `manifest.json`.
5. Run the plugin from **Plugins → Development → Next** (or whatever name appears under Development).

Always launch the **Development** copy of the plugin after importing. The Community-installed “Next” is a separate published build and will not pick up your local `code.js` / `ui.html` changes.

If you edit TypeScript, rebuild before reloading:

```bash
pnpm install --ignore-scripts
pnpm build
```

Then use **Plugins → Development → Next** again (or re-run from the plugin menu). Figma hot-reloads `ui.html` in many cases; `code.js` needs a rebuild + re-run after `code.ts` changes.

## Develop
```bash
pnpm install --ignore-scripts
pnpm build
pnpm watch   # optional: rebuild on save
```
