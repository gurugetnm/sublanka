# SubLanka — Pre-Release Security Audit

- **Version audited:** 1.0.0 (`main` @ `b67e400` plus the uncommitted fixes listed below)
- **Date:** 2026-10-15
- **Scope:** all of `src/`, `public/manifest.json`, `vite.config.ts`, `package.json` / `package-lock.json`, the built `dist/`, and the full git history (searched for secrets).

## Executive summary

**Overall posture: good.** The codebase was clearly written with its trust boundaries in mind. Content scripts are injected only on demand (`activeTab` + `scripting`), host access is limited to `*.opensubtitles.com`, there is no remote code, no `eval`, no HTML sinks, every runtime message is checked at runtime, provider responses are treated as untrusted, downloads are size-capped and host-pinned, and API keys are supplied by the user, never bundled.

The audit found **one Medium** issue: catastrophic regex backtracking in the subtitle parser, which a hostile OpenSubtitles upload could trigger to freeze the service worker. It found **one Low** robustness issue: an overflowing timestamp made a whole file unloadable. **Both are fixed and have regression tests.** One Low network-hardening gap is documented but not changed, because fixing it needs a live check against the OpenSubtitles API. One Chrome Web Store policy gap is open: **there is no privacy policy**.

**Tools used:** manual code review; `tsc`; ESLint (typescript-eslint strict); Vitest; `npm audit`; `npm audit signatures`; `npm outdated`; `npm ls`; grep-based secret and sink scans over the source tree, `dist/` and `git log --all -p`; a parser fuzz/timing harness (local, synthetic input only). No third-party scanners were installed.

**Not verified:**
- The extension was not loaded into a real Chrome profile for this audit. Popup, injection, fullscreen overlay and playback sync were not exercised live; the jsdom tests cover them.
- No requests were sent to OpenSubtitles, Google, TVmaze or Wikidata. All network behaviour was checked with mocked `fetch`.
- The Netflix selectors are unverified on the live site (the README already says so).

## Attack surface

| Input | Trust | Reaches |
|---|---|---|
| Local `.srt`/`.vtt` file chosen by the user | untrusted content | popup parser → content script overlay; to Google only after explicit Translate + consent |
| OpenSubtitles search JSON and download file (uploaded by anyone) | untrusted | `mapper.ts` validation → popup (React text); file → **service-worker parser** → content script |
| TVmaze / Wikidata suggestion JSON | untrusted | `titleSearch.ts` validation → popup (React text, poster `<img>` pinned to `https://static.tvmaze.com`) |
| Google Translate response | untrusted | `mapTranslations` (count/type checked) → plain text cues |
| Web page DOM / metadata (any site the user opens the popup on) | untrusted | content script `detectMedia` → popup form (pre-fill only, never sent without a click) |
| `chrome.runtime` messages | extension-internal only (no `externally_connectable`, no `onMessageExternal`) | background accepts only `sender.id === runtime.id && !sender.tab`; content script validates with `isSubLankaMessage` |
| `chrome.storage` | extension-written | `parseSettings`, `parseSession`, `isDownloadStatus` re-validate on read |

Privileged operations: `chrome.scripting.executeScript` (fixed file `content.js`, active tab only), fetches to four fixed HTTPS hosts plus OpenSubtitles download links, and storage of two user API keys and an OpenSubtitles session token.

## Findings

| ID | Severity | Location | Status |
|---|---|---|---|
| SL-01 | **Medium** | `src/subtitles/cueBlocks.ts` `MARKUP`, `ASS_ALIGN` | **Fixed** |
| SL-02 | Low | `src/subtitles/cueBlocks.ts` `parseTimingLine` | **Fixed** |
| SL-03 | Low | `src/providers/opensubtitles/client.ts` `callApi` | Open (documented) |
| SL-04 | Informational | `opensubtitles/index.ts`, `googleTranslate.ts` key storage | Accepted |
| SL-05 | Informational | `src/content/subtitleOverlay.ts` open shadow root | Accepted |
| SL-06 | Policy | Store listing / repo | Open: **no privacy policy** |

### SL-01 — Quadratic regex backtracking in cue markup stripping (Medium, fixed)

- **Description:** `MARKUP = /<[^>\n]*>|\{\\[^}\n]*\}/g` and `ASS_ALIGN = /\{[^}\n]*\\an([1-9])/` rescanned from every `<` or `{` to the end of the line when no closing `>` or `}` existed. That makes them O(n²) per line.
- **Evidence (measured before the fix):** one line of `<`: 20 KB → 152 ms, 40 KB → 601 ms, 80 KB → 2,423 ms. The same curve held for `{\` and `{`. The 5 MB limit allows a single line about 64× longer, which extrapolates to hours. A 5 MB run did not finish within 5 minutes.
- **Attack scenario:** an attacker uploads a 5 MB `.srt` to OpenSubtitles with one long line of `<`. A user who clicks **Load** on that result makes the **background service worker** parse it (`downloadSubtitle.ts` → `readSubtitleFile`). The worker spins, downloads and translation jobs stall, and the popup hangs. A local file would hang the popup the same way. Impact is availability only; no code runs.
- **Remediation:** the tag bodies now also exclude their own opener (`[^<>\n]`, `[^{}\n]`), so each scan stops at the next `<` or `{` and total work is linear. Real tags never contain their own opener, so valid output is unchanged; the existing markup and `{\anN}` tests still pass.
- **Verification:** new tests in `srtParser.test.ts` parse a full 5 MB hostile line for each of the three patterns in under 2 s, and check that the following cue still parses. Each currently runs in a few milliseconds.
- **Residual risk:** none known in the parser. Other regexes on untrusted text were timed (whitespace splits, timing lines with long tails or huge digit runs, entities, episode patterns) and were linear.

### SL-02 — Overflowing timestamp rejected the whole file (Low, fixed)

- **Description:** the hour field is `\d+`. Over about 309 digits it parses to `Infinity`, which produced a cue with `endTime: Infinity`. `isSubtitleCue` (correctly) requires a finite end, so the content script dropped the **entire** `load-track` message, and the user saw a misleading "page did not respond" error.
- **Attack scenario:** one crafted cue in a provider file makes an otherwise good subtitle unloadable. This is a nuisance, not a breach.
- **Remediation:** `parseTimingLine` returns `null` when the end time is not finite, so the cue is skipped with a warning like any other invalid timestamp.
- **Verification:** new test `skips a cue whose timestamp overflows to Infinity…`. It **fails against the original file** and passes now.

### SL-03 — API-key headers are checked after redirects are followed (Low, open)

- **Description:** `callApi` sends `Api-Key` (and `Authorization: Bearer` when signed in) with the default `redirect: 'follow'`, and only then checks `response.url` with `isProviderUrl`. If an `opensubtitles.com` API host ever answered with a cross-origin redirect, the follow-up request could carry the custom `Api-Key` header to that host before the check ran.
- **Mitigations already present:** the API host is pinned to `https://*.opensubtitles.com` before sending, including the host `/login` returns. Fetch strips `Authorization` on cross-origin redirects in current Chrome. A foreign host would also have to pass a CORS preflight for the custom header. Download links get no credentials at all (`fetchSubtitleFile`).
- **Exploitability:** this needs OpenSubtitles itself to redirect off-site (a compromise or misconfiguration). The only value at risk is the user's OpenSubtitles API key.
- **Why not changed:** the client deliberately follows OpenSubtitles' documented same-host 301s (parameter normalisation). Switching to `redirect: 'error'` could break search, and that cannot be checked without a live API key.
- **Proposed fix:** verify with a real key that sorted, lowercase requests get no redirects, then set `redirect: 'error'` on `callApi` (or at least on the `POST /login` and `POST /download` calls, which should never redirect).

### SL-04 — User API keys stored in `chrome.storage.local` (Informational, accepted)

The OpenSubtitles and Google Cloud Translation keys are entered by the user and stored unencrypted in `chrome.storage.local`, which persists on disk and is readable by the extension's content-script context. Web pages cannot read it, because content scripts run in an isolated world, and SubLanka's content script never reads these keys. `setAccessLevel` cannot restrict `local` without also blocking the settings the content script needs. The OpenSubtitles session token is correctly kept in `chrome.storage.session` (memory only, trusted contexts only), and the password is never stored. This is the standard model for bring-your-own-key extensions. Users should restrict their Google key to the Cloud Translation API (the Settings help text already links to the setup guide).

### SL-05 — Overlay uses an open shadow root (Informational, accepted)

`subtitleOverlay.ts` attaches `mode: 'open'`, and `findHost()` uses `document.querySelector`. The host page can therefore read the subtitle line currently on screen, or plant its own `<sublanka-overlay>` element to receive that text. Text is written only through `textContent`, so this cannot escalate into script execution. The page can already see what it displays. No change.

### SL-06 — No privacy policy (Chrome Web Store policy, open)

SubLanka handles user data under Chrome Web Store definitions: authentication information (two API keys, OpenSubtitles username/password passing through), user-provided content (subtitle text sent to Google on request), and website content (page titles and metadata read locally, then sent as a search query only when the user clicks Search). The Store requires a privacy policy URL and matching data-use disclosures for this. The README describes the data flows accurately, but no standalone policy exists. **This blocks Store submission**; it is not a code risk. See `RELEASE_CHECKLIST.md`.

## Areas reviewed with no findings

- **Permissions:** see the table below. There are no content scripts in the manifest, no `tabs`, `<all_urls>`, `web_accessible_resources` or `externally_connectable`.
- **CSP / Manifest V3:** no `content_security_policy` key, so the strict MV3 default applies. No `eval`, `new Function`, remote `import()`, `importScripts` or inline scripts in source or `dist/`. `dist/popup.html` loads only packaged `/assets/*`. No source maps are emitted. `dist/` contains only the manifest, icons, `popup.html`, `background.js`, `content.js` and `assets/`; no tests, fixtures, `.env` or `test-page/`.
- **Secrets:** none in the tree, `dist/` or any commit. `git log --all -p` showed two `tmdbApiKey` values in a since-deleted test (`036fec1`). Both were checked without printing them: one is the literal sequential placeholder `0123…cdef`, the other a fake `eyJ….token`. No `import.meta.env` / `VITE_*` use. Keys are never logged, never placed in URLs (Google uses the `X-Goog-Api-Key` header), and requests use `credentials: 'omit'`.
- **XSS / DOM:** no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` or `dangerouslySetInnerHTML` anywhere. The overlay uses `textContent` only (tested with `<img onerror>`). The popup renders through React. The only dynamic `href` is `result.pageUrl`, pinned to `https://*.opensubtitles.com`, and the only dynamic `<img src>` is pinned to `https://static.tvmaze.com`. Export uses a Blob URL plus `download`.
- **Messaging:** the background rejects content-script and foreign senders (tested). The content script accepts only allowlisted, shape-checked messages; cue arrays are validated element by element. Tab messages target `frameId: 0`. The download path re-checks that the tab URL is unchanged before injecting.
- **Network:** four fixed HTTPS endpoints, plus OpenSubtitles links pinned by `isProviderUrl`. Every call has a timeout (10–30 s, 90 s overall per download). Downloads are capped at 5 MB both by `Content-Length` and while streaming, and HTML, JSON, script and media content types are rejected. Translation retries are bounded (4 attempts, exponential backoff) and jobs are capped at 5,000 cues / 300K characters. No backend proxy exists, so there is no SSRF surface.
- **Archives:** not applicable. Downloads request `sub_format: 'srt'`, and there is no ZIP code or dependency.
- **Subtitle input:** extension and size are checked before reading, strict UTF-8 decoding is used (`fatal: true`), the BOM is stripped, CR/LF is normalised, and malformed, negative, reversed, empty and overlapping cues are handled (existing tests). Sinhala text is preserved (fixture tests).
- **Dependencies:** `npm audit`: 0 vulnerabilities (all and `--omit=dev`). `npm audit signatures`: 227/227 verified. All 273 lockfile entries resolve from `registry.npmjs.org`. No dependency has an install script. Runtime dependencies are only `react`, `react-dom` and `lucide-react`. Outdated: patch updates for `react`/`react-dom` 19.3.1 and `lucide-react` 1.57.0 (none security-relevant), and `typescript` 7 (major, dev-only, not adopted).

## Permissions justification

| Permission | Needed for | Verdict |
|---|---|---|
| `activeTab` | Temporary access to the tab where the user opened the popup; no standing access to any site | Required, minimal |
| `scripting` | Injecting the packaged `content.js` into that tab on demand | Required |
| `storage` | Appearance and offset settings, user API keys (`local`); session token, download and translation progress (`session`) | Required |
| `https://*.opensubtitles.com/*` | Search, download-link and file requests from the service worker | Required; narrowest host that covers VIP API hosts and download CDN subdomains |
| (none) for TVmaze, Wikidata, Google | These APIs answer CORS for `chrome-extension://` origins | Correctly omitted |

## Data handling

| Data | Source | Purpose | Stored | Retention | Sent to | Deletion |
|---|---|---|---|---|---|---|
| Typed title / year / season / episode | user | subtitle search, suggestions | `storage.session` (last search form and results) | until browser closes | OpenSubtitles (on Search); TVmaze/Wikidata (title text only, as typed, ≥3 chars) | overwritten by next search; close browser |
| Detected title from page metadata | current page | pre-fill form | popup memory | popup lifetime | nowhere unless the user clicks Search | automatic |
| Page URL | `chrome.tabs` | check the page did not change during a download | not stored | request lifetime | nowhere | — |
| Local subtitle file | user | display | content-script memory | until page reload | nowhere unless the user starts a translation | reload page |
| Downloaded subtitle | OpenSubtitles | display | content-script memory | until page reload | — | reload page |
| Subtitle text for translation | user file | EN→SI translation | `storage.session` job | until browser closes or **Clear** | Google Cloud Translation, text only, after explicit consent | Clear / close browser |
| OpenSubtitles API key | user | API auth | `storage.local` | until removed | OpenSubtitles | Settings → remove |
| Google API key | user | API auth | `storage.local` | until removed | Google | Settings → remove |
| OpenSubtitles username / token | user / provider | VIP and quota | `storage.session` | until browser closes | OpenSubtitles | Sign out |
| Password | user | `/login` only | **never stored** | — | OpenSubtitles (HTTPS) | — |
| Download status | extension | progress UI | `storage.session` | until browser closes | — | automatic |
| Debug logs | — | — | none (no `console.*` calls in `src/`) | — | — | — |

SubLanka does collect and transmit user data (the items above), so the listing must **not** say "collects no data". It has no analytics, telemetry or developer-run server.

## Security checklist

| Area | Status | Note |
|---|---|---|
| Permissions | Pass | minimal; see table |
| CSP | Pass | MV3 default, no overrides |
| Secrets | Pass | none in tree, `dist/` or history |
| Subtitle upload | Pass | after SL-01 and SL-02 fixes |
| Archive processing | N/A | no archive support |
| XSS | Pass | no HTML sinks; URL schemes pinned |
| Messaging | Pass | sender and shape checks, tested |
| External APIs | Pass with note | SL-03 open (Low) |
| Privacy | **Fail** (policy) | data flows are sound; privacy policy missing (SL-06) |
| Dependencies | Pass | 0 advisories, signatures verified |
| Manifest V3 | Pass | |
| Production bundle | Pass | no maps, fixtures or secrets; version 1.0.0; icons 16/32/48/128 present at correct sizes |
| Chrome Web Store policies | **Fail** | privacy policy, data-use disclosure and store assets outstanding |
| Real-browser dynamic test | **Not tested** | see `RELEASE_CHECKLIST.md` |

## Validation results (after fixes)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc`) | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 20 files, **313/313 passed** (309 before + 4 new) |
| `npm run build` | exit 0 |
| `npm audit` | 0 vulnerabilities |
| `npm audit signatures` | 227 packages verified |

## Changes made (uncommitted)

- `src/subtitles/cueBlocks.ts`: linear-time `MARKUP` and `ASS_ALIGN` (SL-01); non-finite end times rejected (SL-02).
- `src/subtitles/srtParser.test.ts`: 3 hostile-line performance tests and 1 overflow test.
- `docs/security/SECURITY_AUDIT.md`, `docs/security/RELEASE_CHECKLIST.md`.

## Release recommendation

**NO-GO**, for Chrome Web Store submission today. This is a policy and verification gate, not a security one: no Critical or High findings remain, and the code is ready security-wise.

It moves to **GO** once these are done:
1. Publish a privacy policy and complete the Store data-use disclosures (SL-06).
2. Run the manual real-browser checks in `RELEASE_CHECKLIST.md` on a fresh profile with the built `dist/`.

SL-03 can ship as a documented Low, with the fix scheduled once it can be checked against the live API.
