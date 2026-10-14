# SubLanka

A Sinhala-first Chrome extension for finding, translating, and displaying synchronized Sinhala subtitles over web video.

> **Status: Milestone 2 (local subtitle playback).** Load your own `.srt` or `.vtt` file and SubLanka shows it in sync with an HTML5 video on the page, with timing and appearance controls. Finding subtitles online and translating English subtitles are **not implemented yet**.

## Features

### Implemented

- **Load subtitle files**: `.srt` (SubRip) and `.vtt` (WebVTT), UTF-8 with or without BOM, CRLF or LF line endings, up to 5 MB. The popup shows the file name, the number of cues, and whether playback is active. You can replace or remove the file.
- **Synchronized playback**: subtitles follow the video's real `currentTime`. This holds through pause, seeking, speed changes, the video ending, a source change, and the page replacing its `<video>` element.
- **Overlapping cues** are shown together, one per line, in file order.
- **Timing offset**: −5, −1, −0.5, +0.5, +1 and +5 second steps, plus Reset. It takes effect immediately.
- **Appearance**: font size (Small, Medium, Large, X-Large), text colour (white, yellow), background (none, translucent, solid), and position (bottom, raised, higher). Changes apply immediately, without restarting playback.
- **Saved preferences**: appearance and offset are kept in `chrome.storage.local` and survive popup closes and browser restarts.
- **Video detection**: finds the HTML5 videos on the page, ignores tiny preview or ad videos, and prefers the one that is playing. If there are several, the popup lets you pick which one the subtitles follow.
- **Fullscreen**: subtitles stay visible when a player container or a bare `<video>` goes fullscreen.
- **Local only**: files are read and parsed in the popup and never uploaded. There are no network requests, remote scripts or analytics.
- **Demo subtitle**: the Milestone 1 fixed sample line, kept under _Developer tools_ for debugging.

### Not implemented yet

- Searching for Sinhala subtitles online
- Translating English subtitles
- Remembering a subtitle file after the page reloads

## Using it

1. Open a page with an HTML5 video and click the SubLanka toolbar icon.
2. The **Player** card shows what was found: _Video detected_, _N videos detected_ (with a picker), _No compatible video detected_, or _Unsupported page_.
3. Under **Subtitles**, click **Choose .srt or .vtt file**. If some blocks of the file were invalid, they are skipped and listed. A file with no valid cues is rejected with an error.
4. Play the video. Use **Show subtitles** to turn them off and on without unloading the file.

### Timing offset

`subtitle time = video.currentTime − offset`

- **Positive** values show subtitles **later**. Use this when subtitles appear before the speech. With +2 s, a cue that starts at 10 s appears at 12 s.
- **Negative** values show subtitles **earlier**.

The offset is a saved preference. It applies to every page and is not tied to one file.

### Supported file formats

| | SRT | WebVTT |
| --- | --- | --- |
| Timestamps | `00:00:01,200` (also accepts `.`) | `00:01.200` and `00:00:01.200` |
| Sequence numbers / cue ids | optional, can be non-numeric | optional |
| Multiline cues | yes | yes |
| Formatting tags (`<i>`, `<b>`, `<font>`, `<v>`, `<c>`, `{\an8}`) | removed; text kept | removed; text kept |
| `NOTE`, `STYLE`, `REGION` blocks | n/a | skipped, never shown |
| Cue settings (`line:`, `align:`…) | n/a | parsed and ignored |

Subtitle text is always rendered as plain text with `textContent`, never as HTML.

The file must be UTF-8. Files in other encodings (for example legacy Windows code pages or UTF-16) are rejected with a message asking you to re-save them as UTF-8.

## How it works

```
popup (React)                                  page (content.js)
─────────────                                  ─────────────────
read File → parse SRT/VTT → cues ──load-track──▶ PlaybackController
get-state / set-enabled / select-video ───────▶   ├ picks a <video>, listens to its media events
                    ◀────────── PlayerState ───    ├ binary-searches active cues at currentTime − offset
save settings → chrome.storage ──onChanged────▶   └ updates the Shadow DOM overlay (top layer)
```

- **Messaging**: the popup injects `content.js` before every message (a no-op after the first time) and sends a typed message. The content script validates every message at runtime and answers with the page's real `PlayerState`. Closing and reopening the popup rebuilds the UI from that state, so a loaded track is never lost while the page stays open. While open, the popup refreshes the status once a second.
- **Settings** are not sent as messages. The popup writes them to `chrome.storage.local`, and the content script loads them on start and follows `storage.onChanged`.
- **Synchronization**:
  - The controller listens to `play`, `playing`, `pause`, `seeking`, `seeked`, `timeupdate`, `ratechange`, `ended`, `emptied` and `loadedmetadata`.
  - While the video plays, it also re-checks the time on every animation frame, because `timeupdate` alone fires only about 4 times a second.
  - Frames are scheduled only while playing, and cancelled on pause, end, and cleanup.
  - The time always comes from `currentTime`, never from a separate timer.
  - Each lookup is a binary search plus a short backward walk over the cues that could still be on screen.
  - The DOM is touched only when the displayed text changes.
- **Video selection**:
  - Videos smaller than 160×90 CSS pixels are ignored.
  - Of the rest, a playing video wins, then the one you last started, then the largest visible one.
  - Starting another video moves the subtitles to it, unless you picked a video in the popup.
  - A once-a-second check notices when the attached `<video>` is removed and switches to a replacement. It only selects a video and never drives subtitle timing.
- **Fullscreen**: the overlay is a manual popover (`popover="manual"`), so it renders in the browser's top layer. On every `fullscreenchange` it is hidden and shown again, which moves it above the newly fullscreen element. The page's DOM, including the video, is never moved, wrapped, or modified. If the Popover API is missing or fails, it falls back to moving into a fullscreen container.

**Permissions:** `activeTab`, `scripting` and `storage`. There are no host permissions, so SubLanka can touch a page only after you click its toolbar icon there. There is no background service worker.

## Project structure

```
sublanka/
├── public/manifest.json, icons/     # MV3 manifest (v0.2.0) and icons, copied to dist/
├── popup.html                       # popup entry
├── src/
│   ├── subtitles/                   # pure parsing + search (popup side)
│   │   ├── types.ts                 # SubtitleCue, ParsedSubtitles, SubtitleParseError
│   │   ├── cueBlocks.ts             # shared block splitting, timestamps, text cleanup
│   │   ├── srtParser.ts, vttParser.ts
│   │   ├── subtitleFile.ts          # extension, size and UTF-8 checks
│   │   └── subtitleSearch.ts        # cue index + binary search for active cues
│   ├── content/
│   │   ├── index.ts                 # one-time setup, message + storage listeners
│   │   ├── playbackController.ts    # track, video binding, sync loop
│   │   ├── videoCandidates.ts       # video detection and ranking
│   │   ├── subtitleOverlay.ts       # Shadow DOM overlay, top-layer fullscreen handling
│   │   └── styles.css               # overlay + appearance styles
│   ├── popup/
│   │   ├── App.tsx                  # state, file import, settings
│   │   ├── tabBridge.ts             # chrome.tabs / chrome.scripting calls
│   │   └── components/              # cards, segmented controls, switches
│   └── shared/
│       ├── messages.ts              # message types + runtime validation
│       ├── settings.ts              # settings model, validation, storage
│       └── constants.ts
└── test-page/
    ├── index.html                   # manual test page
    ├── media/test-clip.webm         # generated 2-minute test pattern (ffmpeg testsrc)
    └── fixtures/                    # Sinhala SRT/VTT samples, malformed and overlapping files
```

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install
npm run build
```

Load it in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder. If you are upgrading from 0.1.0, click the reload icon on the SubLanka card instead.
4. Pin SubLanka from the extensions (puzzle) menu
5. Reload any tabs that were open before installing or updating

### Scripts

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Rebuilds popup and content script into `dist/` on every change |
| `npm run build`     | Type-checks, then builds the production extension into `dist/` |
| `npm run typecheck` | `tsc` in strict mode                                           |
| `npm run lint`      | ESLint                                                         |
| `npm test`          | Vitest unit tests                                              |

`npm run dev` has no hot reload. After a rebuild, reload the extension in `chrome://extensions`, reload the test tab, and reopen the popup. It runs two watchers with `&`, so it needs a POSIX shell (macOS, Linux, WSL or Git Bash).

## Testing

### Manual test page

```bash
npx vite        # then open http://localhost:5173/test-page/index.html
```

The page has:
- a seekable 2-minute generated test clip with a seconds counter in the frame;
- a precise `currentTime` readout;
- seek and speed controls;
- both fullscreen modes;
- a button that replaces the `<video>` element;
- a second player, to test the video picker;
- a tiny preview video that must never be picked.

The fixtures in `test-page/fixtures/` contain original, copyright-free Sinhala lines:

| File | What to check |
| --- | --- |
| `sample-si.srt` | 11 cues, with a BOM and CRLF line endings. Each starts with its expected time, e.g. `(0:10)`. |
| `sample-si.vtt` | Same cues, plus a header, `NOTE`, `STYLE` and `REGION` blocks, cue ids and settings. None of the metadata may appear on screen. |
| `overlapping-si.vtt` | Two lines on screen between 4–6 s and 10–12 s. |
| `malformed-si.srt` | Loads 3 cues and reports 5 skipped blocks. |

The page also lists a checklist. Opening it straight from disk (`file://`) works if you enable **Allow access to file URLs** for SubLanka.

### Automated tests

`npm test` runs 87 Vitest tests in jsdom. They cover:
- SRT and VTT parsing (fixtures, BOM, mixed line endings, invalid timestamps, malformed and empty files, overlaps, a 5000-cue file);
- the cue search, checked against a naive scan on 10 000 cues;
- file checks and settings validation;
- message validation and the popup ↔ tab bridge (with a mocked `chrome` API);
- the playback controller (seek, pause, rate, end, offset, overlaps, video selection and replacement, no duplicate listeners);
- the overlay (appearance, no duplicates, cleanup, top-layer ordering).

jsdom has no media playback, Popover API, or fullscreen. Those tests drive fake videos and a simulated top layer, so they check SubLanka's logic, not the browser's rendering.

## Known limitations

- **The loaded file lives only in the page's memory.** Closing and reopening the popup keeps it, but reloading or navigating the page clears it. This is deliberate: subtitle files are not stored without a reason. Preferences (offset, appearance) are saved.
- **Navigating while the popup is open** can revoke `activeTab` access; reopen the popup.
- **Iframes:** only videos in the top-level page are found. Players embedded in an iframe (for example a YouTube embed on another site) are reported as unreachable.
- **Streaming sites** (Netflix and others) are untested. SubLanka can only follow a `<video>` element the page exposes. It does not read protected subtitle tracks, intercept encrypted media, or bypass DRM, and never will. A site may also hide, cover, or replace its player in ways SubLanka cannot follow.
- **Fullscreen:**
  - Needs the Popover API (Chrome 114+). Without it, a fullscreen bare `<video>` or `<iframe>` hides the subtitle.
  - A dialog or popover the page opens after the subtitle can cover it until the next fullscreen change.
  - Subtitles are not shown in Picture-in-Picture windows.
- **Positioning** is relative to the viewport, not to the video. On a page with a small inline player, subtitles appear at the bottom of the window. Fullscreen and full-window players are unaffected.
- **WebVTT layout** (cue `line`/`position`/`align` settings, `::cue` styles, regions) is ignored. All cues are centred at the chosen position.
- **File picker in the popup:** on some platforms Chrome closes extension popups when a native dialog takes focus. If that happens, the file is not loaded. This has not been verified on every OS.

## Roadmap

- **Milestone 3:**
  - find existing Sinhala subtitles from permitted sources;
  - optionally remember the last file per site, with user consent;
  - position subtitles relative to the video's own box;
  - support players inside same-origin iframes.
- **Milestone 4:** English → Sinhala translation of user-supplied subtitle files.
- Later: per-site compatibility work where technically and legally feasible.
