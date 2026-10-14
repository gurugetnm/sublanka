# SubLanka 1.0.0 — Release Checklist

Tick each item before uploading to the Chrome Web Store. Items marked ✅ were verified during the 2026-10-15 audit (see `SECURITY_AUDIT.md`). Everything else needs a person.

## 1. Automated security checks

- [x] ✅ `npm run typecheck`, `npm run lint`, `npm test` (313 passing), `npm run build`: all exit 0
- [x] ✅ `npm audit`: 0 vulnerabilities; `npm audit signatures`: all verified
- [x] ✅ Parser regression tests: hostile 5 MB lines parse in linear time (SL-01), overflowing timestamps are skipped (SL-02)
- [x] ✅ Existing boundary tests: content-script senders rejected by the background, invalid messages rejected, off-site API hosts, links and redirects refused, oversized and HTML downloads refused, keys never sent with file downloads, translation replies of the wrong length discarded, overlay renders `<img onerror>` as text
- [ ] Re-run all of the above on the exact commit you package

## 2. Manual browser tests (not yet done)

Use a **fresh Chrome profile**, `chrome://extensions` → Developer mode → **Load unpacked** → `dist/`.

- [ ] Popup opens with no errors in the popup DevTools console or the service-worker console (`chrome://extensions` → *Inspect views*)
- [ ] On a page that was never opened with the popup, confirm `content.js` is **not** present (DevTools → Sources → Content scripts)
- [ ] `test-page/` (served on `localhost:8765`): load `sample-si.srt` and `sample-si.vtt`; Sinhala renders correctly; sync, offset, position, size and colour all work
- [ ] Load `malformed-si.srt`: warnings shown, the valid cues still play
- [ ] Load a local file whose text is `<img src=x onerror=alert(1)>`: shown as literal text, no dialog
- [ ] Load a 5 MB SRT that is one line of `<` characters: the popup stays responsive (seconds, not minutes)
- [ ] Load a file over 5 MB, a non-UTF-8 file and a `.txt`: each is rejected with a clear message
- [ ] Fullscreen: the overlay stays visible over a fullscreen `<video>` and a fullscreen container; it remains after exiting
- [ ] OpenSubtitles (needs your own API key): search, load a result, the quota message appears; sign in and out; a wrong key shows the key error
- [ ] Translation (needs your own Google key restricted to the Cloud Translation API): consent text shown before sending; translate the eval fixture; cancel, resume, edit and export SRT/VTT
- [ ] Close and reopen the popup mid-download and mid-translation: progress resumes
- [ ] Restart the browser: the session token, search state and translation job are gone; settings and API keys remain
- [ ] `chrome://` pages and the Web Store page: the popup shows "unsupported/unavailable", with no errors
- [ ] Netflix (optional, own account): title detection works or fails gracefully; nothing is sent until **Search**

## 3. API configuration

- [ ] No API keys in the repo or package (verified ✅ for 1.0.0; re-check with `grep -rE "AIza|Bearer " dist/`)
- [ ] OpenSubtitles: the app/consumer is registered under the name *SubLanka* and the `X-User-Agent` `SubLanka v1.0.0` matches their requirements
- [ ] Optional SL-03 fix: with a real key, confirm the search URLs get no 301s, then set `redirect: 'error'` in `callApi` and re-test search, login and download

## 4. Privacy policy (blocking)

- [ ] Write and publish a privacy policy at a stable public URL (for example GitHub Pages or a `PRIVACY.md` rendered on GitHub). Base it on the *Data handling* table in `SECURITY_AUDIT.md`. It must state:
  - what is sent and when: typed titles to TVmaze/Wikidata; search details to OpenSubtitles; subtitle text to Google only after the user clicks Translate
  - that API keys are stored locally in the browser and sent only to their own provider; that passwords are never stored
  - that page metadata is read locally to suggest a title and is sent only if the user searches
  - that there is no analytics, no developer server and no sale or transfer of data
  - links to the OpenSubtitles, Google Cloud and TVmaze/Wikimedia privacy policies
- [ ] Add the policy URL in the Developer Dashboard → *Privacy* tab

## 5. Store permission and data disclosure

- [ ] Single purpose: "Find and display Sinhala subtitles on web videos, with optional English→Sinhala translation"
- [ ] Permission justifications (paste these):
  - `activeTab`: shows subtitles only on the tab where the user opens SubLanka
  - `scripting`: injects SubLanka's packaged overlay script into that tab when the user opens the popup
  - `storage`: saves subtitle appearance settings, the user's own API keys and in-progress downloads/translations
  - host `*.opensubtitles.com`: searches and downloads subtitles from OpenSubtitles
- [ ] Remote code: **No**
- [ ] Data usage: tick *Authentication information*, *Website content* and *User-provided content* (do **not** claim "no data collected"); certify the Limited Use statements

## 6. Provider attribution and terms

- [ ] OpenSubtitles: credit and link stay visible in search results (present); comply with their API terms (quota, no bulk scraping)
- [ ] TVmaze: "Suggestions from TVmaze (CC BY-SA)" with a link stays visible (present)
- [ ] Wikidata credited (present; CC0, not required)
- [ ] Google Cloud Translation: the user supplies their own key and billing; the listing must say translation costs are billed to the user's Google account

## 7. License and IP compliance

- [ ] Add a `LICENSE` file. The public repo currently has none, which means "all rights reserved"
- [ ] Dependency licenses: React, React DOM (MIT) and lucide-react (ISC) are bundled; keep their notices (`npx license-checker --production` or similar)
- [ ] Subtitles are third-party content: SubLanka fetches them for personal display and does not host or redistribute them. Say so in the listing
- [ ] Netflix and other platforms: no logos or trademarks in the icon, screenshots or name. Wording such as "works on many video sites" is fine; do not say "for Netflix" or imply endorsement. The README note that Netflix detection is unverified should match the listing

## 8. Store assets

- [x] ✅ Icons 16, 32, 48 and 128 px present and correctly sized
- [ ] At least one screenshot at 1280×800 or 640×400, taken from the real extension (not mock-ups) and showing no copyrighted video frames you lack rights to
- [ ] Small promo tile 440×280
- [ ] Description matches what the extension actually does (no claims of automatic Netflix integration, offline translation, etc.)

## 9. Final package validation

```sh
npm ci && npm run build
cd dist && zip -r ../sublanka-1.0.0.zip . && cd ..
unzip -l sublanka-1.0.0.zip
```

- [ ] The ZIP contains only `manifest.json`, `popup.html`, `background.js`, `content.js`, `assets/`, `icons/`; no `.map`, `test-page/`, `.env` or `node_modules`
- [ ] `manifest.json` version is `1.0.0` and matches `package.json`; permissions are exactly the four listed in section 5
- [ ] `grep -rE "eval\(|new Function|AIza|Bearer [A-Za-z0-9]" dist/` prints nothing
- [ ] Load the ZIP's contents unpacked one last time and repeat a smoke test (local file + overlay)
