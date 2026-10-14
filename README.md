# SubLanka

A Sinhala-first Chrome extension for finding, translating, and displaying synchronized Sinhala subtitles over web video.

> **Status: Milestone 3 (Sinhala subtitle discovery).** Search OpenSubtitles.com for Sinhala subtitles from the popup, pick a result, and SubLanka downloads it and plays it in sync with an HTML5 video on the page. Local `.srt`/`.vtt` files still work as before. Searching needs your own OpenSubtitles API key (see [API setup](#api-setup)). Translating English subtitles is **not implemented yet**.
>
> **Live OpenSubtitles searching and downloading have not been tested with real credentials yet.** The client follows the documented API and is covered by mocked tests; see [What has been verified](#what-has-been-verified).

## Features

### Implemented

- **Load subtitle files**: `.srt` (SubRip) and `.vtt` (WebVTT), UTF-8 with or without BOM, CRLF or LF line endings, up to 5 MB. The popup shows the file name, the number of cues, and whether playback is active. You can replace or remove the file.
- **Synchronized playback**: subtitles follow the video's real `currentTime`. This holds through pause, seeking, speed changes, the video ending, a source change, and the page replacing its `<video>` element.
- **Overlapping cues** are shown together, one per line, in file order.
- **Timing offset**: −5, −1, −0.5, +0.5, +1 and +5 second steps, plus Reset. It takes effect immediately.
- **Video-relative placement**: the subtitle sits on the video's own rendered box, centred over it, wherever the video is (an inline player, a full-window player or fullscreen). Text size scales with the video's width.
- **Position**: _Very low_, _Low_, _Medium_ (default), _High_ and _Very high_ in the **Position** card. Each step is a share of the video's height (5%, 10%, 15%, 23%, 32%) above its bottom edge. Move subtitles higher when they cover a watermark, a source label or burned-in text. Changes apply immediately.
- **Hide credits and watermarks** (on by default, in the **Position** card): skips any cue that stays on screen for over a minute. Translator credits and site names are often timed to cover a whole episode; real dialogue never lasts that long. Turn it off to see them.
- **Pinned cues**: SRT cues tagged with an ASS position such as `{\an9}` (common for translator credits and site names) are drawn where the file puts them. Top-row tags go to the top-left, top or top-right of the video, and middle-row tags to the middle. They no longer stack onto the dialogue at the bottom. Bottom-row tags (`{\an1}`–`{\an3}`) use the normal subtitle position.
- **Appearance**: font size (Small, Medium, Large, X-Large), text colour (white, yellow) and background (none, translucent, solid). Changes apply immediately, without restarting playback.
- **Saved preferences**: position, appearance and offset are kept in `chrome.storage.local` and survive popup closes and browser restarts.
- **Video detection**: finds the HTML5 videos on the page, ignores tiny preview or ad videos, and prefers the one that is playing. If there are several, the popup lets you pick which one the subtitles follow.
- **Fullscreen**: subtitles stay visible when a player container or a bare `<video>` goes fullscreen.
- **Privacy**:
  - local files are read and parsed in the popup and never uploaded;
  - the only network requests go to opensubtitles.com, and only when you search or load a result;
  - those requests send just the title, year, season and episode, never the page URL or contents;
  - no video is uploaded and no streaming traffic is read;
  - there are no remote scripts, analytics, trackers or ads.
- **Demo subtitle**: the Milestone 1 fixed sample line, kept under _Developer tools_ for debugging.

- **Sinhala subtitle search** (Milestone 3): search OpenSubtitles.com by title, type (movie or TV episode), optional year, and season/episode. See [Subtitle discovery](#subtitle-discovery).
- **Popup tabs**: _Subtitles_ (player, loaded track, timing), _Search_ and _Settings_ (position, appearance, subtitle provider, developer tools).

### Not implemented yet

- Translating English subtitles
- Remembering a subtitle file after the page reloads

## Subtitle discovery

### Workflow

1. Open a page with a video and click the SubLanka icon. Open the **Search** tab.
2. SubLanka checks the page's public metadata for a movie or episode title. If it finds one, it says where it came from (for example _Possible match from the tab title: Stranger Things · S01E03_) and pre-fills an empty form. If not, it says so. It never claims a detection it did not make.
3. Correct the details or type them in: **Movie** or **TV episode**, title, optional year, and season and episode for TV. The language is always Sinhala (`si`).
4. Click **Search**. While it runs you can **Cancel search**. Results show only fields the provider returned:
   - release name and the movie or episode it belongs to;
   - language and format (always SRT; see below);
   - upload date and download count;
   - _Hearing impaired_, _Trusted uploader_, _AI translated_ and _Machine translated_ flags;
   - a _Part 1 of N only_ tag for multi-CD subtitles;
   - a _Details_ link to the subtitle's OpenSubtitles page.
5. Each result has a match label. SubLanka never picks one for you:
   - **Strong match**: the title matches, plus the year (movie) or season and episode (TV).
   - **Title match**: the title matches, but nothing else could be confirmed.
   - **Possible match**: the title could not be confirmed.
   - **Check details**: the provider reports a different year, episode or media type.
   Results are ordered by match label, then by release-name evidence (e.g. `S01E03` or the year in the release name), then trusted uploader, then download count. When several results match equally, the popup says so and lists all of them. **Show more results** loads the next page.
6. Click **Load subtitles** on the one you want. If subtitles are already loaded, the popup says this will replace them; the click is the explicit action. SubLanka then:
   1. requests a download link;
   2. downloads the file;
   3. checks it (size, type, UTF-8);
   4. parses it with the same SRT/WebVTT parser as local files;
   5. loads it into the page.
   The result says which file loaded and how many downloads the provider says you have left today.
7. Timing offset, position, appearance, fullscreen and the on/off switch all work as for local files. The **Subtitles** tab shows the source: _Local upload_ or _OpenSubtitles_. Replace a downloaded track with a local file (or the reverse) at any time.

### Movie and episode detection

Detection reads only metadata the page publishes for everyone, in this order:

1. **JSON-LD structured data**: schema.org `Movie` (name, year) and `TVEpisode` (series, season, episode, episode name), including `@graph` lists.
2. **Open Graph tags**: `og:title` when `og:type` is `video.movie` or `video.episode`, plus `video:release_date`.
3. **The tab title**, then **the page's first `<h1>`**.

Free-text titles are parsed as follows:
- Episode notation is recognised as `S01E03`, `Season 1 Episode 3` or `1x03`. Other numbers are never read as episodes, so `1920x1080`, `4x4` and `Apollo 13` are safe.
- A year is read only when bracketed, as in `Interstellar (2014)`, so `Blade Runner 2049` and `1917` keep their titles.
- The site name (`og:site_name` or the host name) is removed.
- When structured data and the tab title disagree, structured data wins.

Detection runs only when you open the popup. The result stays in the popup and is never sent anywhere until you click **Search**.

**Limitations**:
- Many sites expose no title at all. A page whose title only names the site (for example just "Netflix") detects nothing, and you type the title. Netflix detection has not been tested on the live site.
- A page about a video that is not a film, such as a YouTube vlog, may produce a "possible match" from its tab title. It is labelled as a guess, and you decide whether to search.
- IMDb/TMDb identifiers are not read from pages and never invented, so searches are by title.

### Provider integration design

```
src/providers/
├── types.ts                  # SubtitleProvider, SubtitleQuery, SubtitleResult, ProviderError (provider-neutral)
├── index.ts                  # PROVIDERS registry, SINHALA_LANGUAGE = "si"
└── opensubtitles/
    ├── client.ts             # REST calls, headers, status → error mapping, capped file download
    ├── mapper.ts             # untrusted JSON → SubtitleResult / SearchPage; URL allow-list
    ├── index.ts              # credentials storage + the SubtitleProvider implementation
    └── fixtures.ts           # mocked API responses for tests
src/discovery/
├── mediaDetection.ts         # page metadata → DetectedMedia
└── subtitleRanking.ts        # match assessment and ordering
src/background/
├── index.ts                  # MV3 service worker: accepts download requests from the popup only
└── downloadSubtitle.ts       # download → validate → parse → load into the tab
```

The popup and the worker only use the provider-neutral types; nothing outside `providers/opensubtitles/` sees raw API JSON. Adding a provider means:
1. write an adapter that implements `SubtitleProvider`;
2. add it to `PROVIDERS`;
3. add its id to `SUBTITLE_SOURCES`.

**OpenSubtitles.com REST API v1** (`https://api.opensubtitles.com/api/v1`). The old opensubtitles.org XML-RPC API is not used.

| Call | Use |
| --- | --- |
| `GET /subtitles` | `languages=si`, `query` (lowercase), `type=movie\|episode`, optional `year`, `season_number`, `episode_number`, `page`. Parameters are sent in alphabetical order, as the docs ask. `page=1` is left out because the API answers it with a 301 redirect (verified live). |
| `POST /download` | `{ file_id, sub_format: "srt" }` returns a temporary `link`, `file_name` and `remaining`. Each call counts against the download quota. |
| `GET <link>` | The file itself. No API key or token is sent. |
| `POST /login` | Optional. `{ username, password }` returns `token` and `base_url`. |

Every API request carries `Api-Key` and `X-User-Agent: SubLanka v0.3.0`. The docs ask for a `User-Agent` naming the app, and browsers do not let extensions set `User-Agent`; the API accepts `X-User-Agent` instead. A signed-in request also carries `Authorization: Bearer <token>`.

Errors are mapped to messages:

| Response | Message shown |
| --- | --- |
| 401 | Sign-in expired. The saved token is discarded. |
| 403 | API key rejected. |
| 406 | _Download limit reached. Please try again later._, plus the reset time the provider reports |
| 410 | Download link expired |
| 429 | Too many requests |
| 5xx | Provider unavailable |
| Network failure, 30 s timeout | Specific messages for each |
| Malformed JSON | _Unexpected response_ |

There are no automatic retries.

### Downloads and formats

- SubLanka asks OpenSubtitles to convert every download to SRT (`sub_format: "srt"`). No archives are handled, so there is no zip extraction.
- The file then goes through `readSubtitleFile`, the same function used for local uploads:
  - `.srt`/`.vtt` extension;
  - 5 MB limit;
  - strict UTF-8;
  - SRT/WebVTT parser;
  - warnings for skipped blocks.
- Before parsing, the downloaded file is also checked:
  - the link must be `https://` on `opensubtitles.com` or a subdomain, and after redirects it must still be there;
  - HTML, JSON, script, image and media content types are rejected;
  - the body is read with a hard 5 MB cap, even when no `Content-Length` is sent.
- Subtitle text is shown with `textContent`, never as HTML. Provider text in the popup is rendered by React as plain text, and links are only rendered when they point at opensubtitles.com.

### Popup lifecycle (what happens if the popup closes)

- **Search** runs in the popup with an `AbortController`. Closing the popup, starting a new search or pressing **Cancel search** aborts it. A late reply from an older search is ignored.
- **Search state**: the form and the results already received are kept in `chrome.storage.session` (memory only, cleared when the browser closes). Reopening the popup restores them. A search that was still running when the popup closed is simply gone; search again.
- **Download and load** run in the background service worker, so they finish even if the popup closes. Progress (_Downloading…_, _Loaded…_, or the error) is mirrored to `chrome.storage.session`, and a reopened popup shows it.
- If the worker is suspended mid-download, the reopened popup shows _The last download was interrupted_ after 2 minutes.
- **Navigation during download**: the worker records the tab's URL before downloading and checks it again before loading. If the page changed, or the tab closed, nothing is loaded, and the message says why. Chrome also revokes `activeTab` access when a tab navigates.
- The worker has no timers or polling. It wakes only for a download request from the popup and rejects messages from content scripts or other extensions.

## API setup

OpenSubtitles requires an API key for every request.

1. Create a free account at [opensubtitles.com](https://www.opensubtitles.com).
2. In your profile, open **API Consumers** and create a consumer. This gives you an API key. See the [getting started guide](https://opensubtitles.tawk.help/article/getting-started).
3. In SubLanka, open **Settings → Subtitle provider**, paste the key and click **Save**.
4. Optional: sign in with your OpenSubtitles username and password for your account's download allowance.

How credentials are handled:
- **The API key is never built into the extension.** Each user enters their own. It is stored in `chrome.storage.local` on that device and sent only to `api.opensubtitles.com` (or the `*.opensubtitles.com` host returned by `/login`). There is no `.env` file and no `VITE_*` variable, because anything bundled into an extension is readable by anyone who installs it.
- **The password is never stored.** It is sent once to `POST /login` over HTTPS. Only the returned token is kept, in `chrome.storage.session`: memory only, gone when the browser closes, and not readable by content scripts.
- **Remove key** deletes the key and signs you out. **Sign out** discards the token.

**Public release:** asking each user for their own key is fine for development and for technically minded users. A store release with a shared application key would need a small backend proxy that holds the key and forwards only search and download calls, possibly with per-user login. That proxy is not built here. Decide it together with OpenSubtitles' terms for your API consumer before publishing.

### Download quota

These are OpenSubtitles' rules, not SubLanka's:
- Searching is not limited.
- Downloads are limited:
  - without signing in, a small number per day per IP address (5 per 24 hours according to the getting-started guide);
  - signed-in users get an allowance by account rank (10 or more per day, up to 1000 for VIP);
  - the counter resets daily.
- SubLanka shows the `remaining` count the provider returns after each download.
- When the limit is reached, it shows the provider's reset time.
- It never retries automatically and never works around the quota.

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

Milestone 3 adds the Search tab and a background worker:

```
popup Search tab ──search (fetch, AbortController)──▶ api.opensubtitles.com
popup ──download-subtitle──▶ background worker ──POST /download, GET link──▶ *.opensubtitles.com
                             background worker ──load-track (source: opensubtitles)──▶ content.js
popup ──detect-media──▶ content.js (reads page metadata) ──▶ DetectedMedia | null
```

Local playback works as in Milestone 2:

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

**Permissions:** `activeTab`, `scripting` and `storage`, plus one host permission: `https://*.opensubtitles.com/*`.
- The API host already allows cross-origin requests (`Access-Control-Allow-Origin: *`, verified).
- The host permission is still needed for the download-link host, whose CORS behaviour could not be verified without a key, and for VIP API hosts returned by `/login`.
- It covers only the provider's own domain. There is no `<all_urls>`.
- SubLanka still touches a web page only after you click its toolbar icon there.

A module background service worker (`background.js`) handles downloads.

## Project structure

```
sublanka/
├── public/manifest.json, icons/     # MV3 manifest (v0.3.0) and icons, copied to dist/
├── popup.html                       # popup entry
├── src/
│   ├── subtitles/                   # pure parsing + search (popup side)
│   │   ├── types.ts                 # SubtitleCue, ParsedSubtitles, SubtitleParseError
│   │   ├── cueBlocks.ts             # shared block splitting, timestamps, text cleanup
│   │   ├── srtParser.ts, vttParser.ts
│   │   ├── subtitleFile.ts          # extension, size and UTF-8 checks
│   │   └── subtitleSearch.ts        # cue index + binary search for active cues
│   ├── background/                  # service worker: download → parse → load (Milestone 3)
│   ├── discovery/                   # media detection, match ranking (Milestone 3)
│   ├── providers/                   # provider-neutral types + OpenSubtitles adapter (Milestone 3)
│   ├── content/
│   │   ├── index.ts                 # one-time setup, message + storage listeners
│   │   ├── playbackController.ts    # track, video binding, sync loop
│   │   ├── videoCandidates.ts       # video detection and ranking
│   │   ├── subtitleOverlay.ts       # Shadow DOM overlay, top-layer fullscreen handling
│   │   └── styles.css               # overlay + appearance styles
│   ├── popup/
│   │   ├── App.tsx                  # tabs, state, file import, settings
│   │   ├── tabBridge.ts             # chrome.tabs / chrome.scripting / worker calls
│   │   ├── searchState.ts           # search form validation + session persistence
│   │   └── components/              # tabs, search panel, result cards, provider settings, cards
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
3. Click **Load unpacked** and select the `dist/` folder. If you are upgrading from an earlier version, click the reload icon on the SubLanka card instead. Version 0.3.0 asks for one new permission, access to opensubtitles.com.
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

`npm test` runs 192 Vitest tests in jsdom. No test makes a real network request: every provider response comes from `src/providers/opensubtitles/fixtures.ts` or inline mocks. They cover:
- media detection (JSON-LD, Open Graph, tab title, heading, episode notations, bracketed years, false positives, conflicting and missing metadata, Netflix-style pages);
- the OpenSubtitles client (parameters and headers, search, episodes, pagination, empty results, 401/403/406/410/429/5xx, network errors, malformed JSON, cancellation, host allow-listing, capped download, HTML rejection, redirects, login, token storage, expired sign-in);
- match ranking (exact movie, wrong year, correct/wrong episode, multiple releases, ambiguous titles, missing identifiers);
- the download worker (SRT and WebVTT downloads loading through the shared parser, malformed and non-UTF-8 files, quota errors, navigation during download, sender checks);
- the Search tab UI (manual search, detected-title correction, loading, cancel, empty, errors, setup required, validation, stale responses, loading a result, failures, restoring state after reopening, pagination);
- SRT and VTT parsing (fixtures, BOM, mixed line endings, invalid timestamps, malformed and empty files, overlaps, a 5000-cue file);
- the cue search, checked against a naive scan on 10 000 cues;
- file checks and settings validation;
- message validation and the popup ↔ tab bridge (with a mocked `chrome` API);
- the playback controller (seek, pause, rate, end, offset, overlaps, video selection and replacement, no duplicate listeners);
- the overlay (appearance, no duplicates, cleanup, top-layer ordering).

jsdom has no media playback, Popover API, or fullscreen. Those tests drive fake videos and a simulated top layer, so they check SubLanka's logic, not the browser's rendering.

## What has been verified

| | Status |
| --- | --- |
| Type check, lint, 192 unit tests, production build | Run and passing |
| Sinhala language code `si` ("Sinhalese") | Checked live against `GET /infos/languages` |
| API CORS (`Access-Control-Allow-Origin: *`, all headers allowed) | Checked live |
| Search without a valid key → 403 "You cannot consume this service" | Checked live; mapped to the API-key message |
| `page=1` → 301 redirect | Checked live; SubLanka omits it |
| Popup layout (Subtitles, Search with results, Settings, dark mode) | Checked in Chrome as a plain page with a stubbed `chrome` API and fixture data |
| **Real search results, real downloads, login, download quota headers** | **Not tested.** No API key was available |
| **Loading the extension in Chrome and running the worker end to end** | **Not tested** |

Response fields were taken from the official docs and cross-checked against Bazarr's long-running OpenSubtitles.com provider. The Stoplight docs could not be read as raw text, so field-level details were confirmed indirectly. The first real-key test should check four things:
1. `GET /subtitles` returns `data[].attributes.files[].file_id`;
2. `POST /download` without signing in is accepted (the docs describe an anonymous quota);
3. the download link's host is on `*.opensubtitles.com`;
4. the downloaded file decodes as UTF-8.

### Manual testing with a real key

1. `npm run build`, reload SubLanka in `chrome://extensions`.
2. **Settings → Subtitle provider**: save your API key.
3. Open `npx vite` → `http://localhost:5173/test-page/index.html`, open SubLanka → **Search**.
4. Search _Interstellar_, movie, 2014. Check that results appear with match labels.
5. Click **Load subtitles** on a result. The **Subtitles** tab should show the file with source _OpenSubtitles_, and the clip shows the lines. They will not match the generated test clip's content; this checks the pipeline only.
6. Close the popup right after clicking **Load subtitles**, then reopen it. The Search tab shows the download result.
7. Try a TV search (_Stranger Things_, S1 E3), a title with no Sinhala subtitles, and an invalid key.
8. On the `service_worker` link in `chrome://extensions`, check the worker's console for errors.

## Known limitations

- **Live provider behaviour is unverified** (see above).
- **OpenSubtitles catalogue**: Sinhala coverage is limited. Many titles have no Sinhala subtitles. Sinhala files made for legacy non-Unicode fonts (ASCII text drawn with a special font) would appear as Latin characters; SubLanka does not convert them.
- **Downloads are always converted to SRT** by the provider. Multi-CD subtitles load part 1 only, and the result says so.
- **Anonymous downloads** share a small per-IP daily quota. Sign in for more.
- **The 503 from `/download` with an invalid key** shows as "provider not responding". In practice the key is already rejected (403) at search time.
- **The loaded file lives only in the page's memory.** Closing and reopening the popup keeps it, but reloading or navigating the page clears it. This is deliberate: subtitle files are not stored without a reason. Preferences (offset, appearance) are saved.
- **Navigating while the popup is open** can revoke `activeTab` access; reopen the popup.
- **Iframes:** only videos in the top-level page are found. Players embedded in an iframe (for example a YouTube embed on another site) are reported as unreachable.
- **Streaming sites** (Netflix and others) are untested. SubLanka can only follow a `<video>` element the page exposes. It does not read protected subtitle tracks, intercept encrypted media, or bypass DRM, and never will. A site may also hide, cover, or replace its player in ways SubLanka cannot follow.
- **Fullscreen:**
  - Needs the Popover API (Chrome 114+). Without it, a fullscreen bare `<video>` or `<iframe>` hides the subtitle.
  - A dialog or popover the page opens after the subtitle can cover it until the next fullscreen change.
  - Subtitles are not shown in Picture-in-Picture windows.
- **Positioning:**
  - Watermarks and burned-in text are not detected. If the subtitle covers them, pick a higher position. One position applies to every site.
  - The subtitle follows the video's bounding box, including any letterbox bars. It refits when the page scrolls, the window resizes, the video resizes or fullscreen changes. If a page moves the video without any of those (rare), the subtitle catches up at the next one.
  - If the video is hidden or has no size, the subtitle falls back to the bottom of the window.
  - A video partly scrolled out of view takes its subtitle with it.
  - The positions from Milestone 2 _Bottom_ and _Raised_ no longer exist; a saved one becomes _Medium_. A saved _High_ is kept.
- **WebVTT layout** (cue `line`/`position`/`align` settings, `::cue` styles, regions) is ignored. Of the ASS override tags, only the `{\anN}` position is used; colours, fonts and sizes from `<font>` or `{\...}` tags are dropped. Pinned cues use the same text size as the dialogue. Short credit cues (under a minute, such as an opening "subtitled by" line) are still shown.
- **File picker in the popup:** on some platforms Chrome closes extension popups when a native dialog takes focus. If that happens, the file is not loaded. This has not been verified on every OS.

## Roadmap

- **Milestone 3 (this release):** Sinhala subtitle search and download from OpenSubtitles.com, page metadata detection, tabbed popup.
- **Milestone 4 (planned):**
  - English → Sinhala translation of user-supplied subtitle files;
  - verify and harden the live OpenSubtitles integration with real credentials;
  - decide on a key proxy for a public release;
  - optionally remember the last file per site, with consent;
  - support players inside same-origin iframes.
- Later: per-site compatibility work where technically and legally feasible.
