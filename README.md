# SubLanka

A Sinhala-first Chrome extension for finding, translating, and displaying synchronized Sinhala subtitles over web video.

> **Status: Milestone 1 (foundation).** The extension loads, shows a popup, and can display a **demo** Sinhala subtitle over any normal web page. Subtitle discovery, translation, file upload, and timing sync are **not implemented yet**.

## Features (Milestone 1)

- Manifest V3 extension with a React + Tailwind toolbar popup (light and dark mode)
- Honest current-tab status: _Ready to use_, _Unsupported page_, or _Unable to access this tab_, based on whether Chrome actually lets the extension script the page
- **Show / Hide Demo Subtitle**: injects a content script that renders a Sinhala subtitle near the bottom centre of the viewport
  - Rendered in a Shadow DOM, so page CSS cannot restyle it and it cannot restyle the page
  - `pointer-events: none`, so it never blocks clicks, video controls, or playback
  - Idempotent: repeated clicks never create duplicates; removable without reloading
  - State is read from the page itself, so the popup shows the right button after it is closed and reopened
  - Follows the fullscreen element when a site makes a player container fullscreen (see limitations)
- Upcoming features listed as non-interactive "Coming soon" items

## Tech stack

TypeScript (strict) · React 19 · Vite · Tailwind CSS v4 · Chrome Manifest V3 · Lucide icons · Vitest + jsdom · ESLint (typescript-eslint)

No build plugin for extensions is used: Vite runs two plain builds (see `vite.config.ts`).

## Project structure

```
sublanka/
├── public/
│   ├── manifest.json          # MV3 manifest, copied to dist/ as-is
│   └── icons/                 # 16/32/48/128 px toolbar icons
├── popup.html                 # popup entry
├── src/
│   ├── popup/
│   │   ├── main.tsx           # React mount
│   │   ├── App.tsx            # popup screen + toggle logic
│   │   ├── tabBridge.ts       # all chrome.tabs / chrome.scripting calls
│   │   └── components/        # Header, TabStatusCard, UpcomingFeatures
│   ├── content/
│   │   ├── index.ts           # message listener (registered once per page)
│   │   ├── subtitleOverlay.ts # overlay DOM: show / hide / fullscreen placement
│   │   ├── styles.css         # overlay styles, inlined into the shadow root
│   │   └── subtitleOverlay.test.ts
│   ├── shared/
│   │   ├── constants.ts       # demo text, overlay tag, content script path
│   │   └── messages.ts        # popup ↔ content message types + runtime guard
│   └── styles/globals.css     # Tailwind entry for the popup
├── test-page/index.html       # local HTML5 video page for manual testing
├── vite.config.ts
└── eslint.config.js
```

### How it works

1. Opening the popup grants `activeTab` for the current tab.
2. The popup checks the tab URL, then runs a tiny probe with `chrome.scripting.executeScript` that reports whether the overlay exists. A failed probe means Chrome blocks access to the page.
3. On **Show/Hide**, the popup injects `content.js` (a no-op after the first injection) and sends a typed message with `chrome.tabs.sendMessage`. The content script replies with the actual overlay state.

There is no background service worker. Nothing in this milestone needs one, and `chrome.action.onClicked` is not used because the action has a popup.

**Permissions:** `activeTab` and `scripting` only. No host permissions, so the extension can touch a page only after you click its toolbar icon on that page.

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install
npm run build
```

Load it in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. Pin SubLanka from the extensions (puzzle) menu

### Scripts

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Rebuilds popup and content script into `dist/` on every change       |
| `npm run build`     | Type-checks, then builds the production extension into `dist/`       |
| `npm run typecheck` | `tsc` in strict mode                                                |
| `npm run lint`      | ESLint                                                              |
| `npm test`          | Vitest unit tests for the overlay and message guard                 |

`npm run dev` has no hot reload. After a rebuild, click the reload icon on the SubLanka card in `chrome://extensions` and reopen the popup. Already-open pages keep the old content script until they are reloaded. The `dev` script uses `&` to run two watchers, so it needs a POSIX shell (macOS, Linux, WSL, or Git Bash).

## Testing the demo overlay

**On any website:** open a normal `https://` page, click the SubLanka icon, then click **Show Demo Subtitle**. Click **Hide Demo Subtitle** to remove it. Close and reopen the popup: the button should still match what is on the page.

**On the local video page:**

```bash
npx vite        # then open http://localhost:5173/test-page/index.html
```

The page plays a canvas-generated video, so no media files are downloaded or bundled. You can also load your own video file. It has two fullscreen buttons:

- **Fullscreen player container**: the subtitle should stay visible.
- **Fullscreen bare `<video>`**: the subtitle is hidden. This is a known limitation, explained below.

To open the test page straight from disk (`file://`), first enable **Allow access to file URLs** on the extension's details page. Otherwise the popup shows _Unable to access this tab_.

**Pages that should report unsupported or blocked:** `chrome://` pages, the Chrome Web Store, and other extensions' pages.

## Known limitations

- **Demo only.** The subtitle is one fixed sample line. There is no timing, no subtitle file parsing, no discovery, and no translation yet.
- **Fullscreen:** only the fullscreen element's own subtree is painted. When a site makes a player _container_ fullscreen (most custom players), the overlay moves into it and stays visible. When a page fullscreens a bare `<video>` element (for example the native video controls' fullscreen button), the overlay cannot be shown above it.
- **Iframes:** the overlay is injected into the top frame only. Players embedded in an iframe (for example YouTube embeds on another site) show the subtitle over the outer page, and a fullscreen iframe hides it.
- **Netflix and other streaming sites:** untested. Overlaying a demo line should work in principle, but a site's player code may remove or cover foreign elements. SubLanka does not, and will not, extract subtitles from protected streams or bypass DRM.
- `activeTab` access lasts until the tab navigates. After navigating, reopen the popup before toggling.

## Roadmap

- **Milestone 2:** load a local `.srt` / `.vtt` Sinhala file and display it in sync with the page's `<video>` (`timeupdate`), with offset adjustment
- **Milestone 3:** subtitle appearance settings (size, position, background), saved with `chrome.storage`
- **Milestone 4:** discovery of existing Sinhala subtitles from permitted sources
- **Milestone 5:** English → Sinhala translation of user-supplied subtitle files
- Later: per-site compatibility work where technically and legally feasible
