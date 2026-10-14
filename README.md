# SubLanka

A Sinhala-first Chrome extension for finding, translating, and displaying synchronized Sinhala subtitles over web video.

> **Status: Milestone 4 (English → Sinhala translation).** Upload an English `.srt`/`.vtt` file in the new **Translate** tab and SubLanka machine-translates it into Sinhala with Google Cloud Translation, keeping every cue's timing. You can preview and edit the result, play it on the page, and download it as SRT or WebVTT. Translation needs your own Google Cloud API key (see [Translation setup](#translation-setup)). Search (Milestone 3) and local playback still work as before.
>
> **Live Google translation has not been tested with a real key yet**, and neither have live OpenSubtitles searching and downloading. The client follows the documented API and is covered by mocked tests; see [What has been verified](#what-has-been-verified).

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
  - subtitle searches and downloads go to opensubtitles.com, and only when you search or load a result. They send just the title, year, season and episode, or the IMDb id of a TV series you picked. They never send the page URL or contents;
  - title suggestions send only the text you type in the title field: movies to wikidata.org, TV series to api.tvmaze.com. Series thumbnails load from static.tvmaze.com;
  - no video is uploaded and no streaming traffic is read;
  - there are no remote scripts, analytics, trackers or ads.
- **Demo subtitle**: the Milestone 1 fixed sample line, kept under _Developer tools_ for debugging.

- **Sinhala subtitle search** (Milestone 3): search OpenSubtitles.com by title, type (movie or TV episode), optional year, and season/episode. See [Subtitle discovery](#subtitle-discovery).
- **Title suggestions**: as you type a title, real movies (from Wikidata) or TV series (from TVmaze, with posters) appear with their year and type. Picking one fills the form. Free, with no account or API key. See [Title suggestions](#title-suggestions).
- **English → Sinhala translation** (Milestone 4): translate a local English subtitle file, review and edit it, apply it to the video, and export it. See [Translation](#translation).
- **Popup tabs**: _Subtitles_ (player, loaded track, timing), _Search_, _Translate_ and _Settings_ (position, appearance, subtitle provider, translation, developer tools).

### Not implemented yet

- Translating a subtitle that is already loaded on the page, or one found through Search. Search only finds Sinhala files, so translation starts from a local English file.
- On-device (offline) translation
- Translation style options (formal, literal); Google's v2 API has none
- Remembering a subtitle file after the page reloads

## Subtitle discovery

### Workflow

1. Open a page with a video and click the SubLanka icon. Open the **Search** tab.
2. SubLanka checks the page's public metadata, and on Netflix the player's visible title, for a movie or episode. If it finds one, it says how sure it is and where the title came from (for example _Possible match from the tab title: Stranger Things · S01E03_). High and medium confidence guesses pre-fill an empty form; a low-confidence guess is only offered with a **Use** button. If nothing is found, it says so and offers **Check again**. It never claims a detection it did not make, and never picks a title suggestion for you.
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

1. **JSON-LD structured data**: schema.org `Movie` (name, year) and `TVEpisode` (series, season, episode, episode name), including `@graph` lists. A `TVSeries` (for example a Netflix title page) gives the series name only, and only when no episode is listed.
2. **Netflix player title** (on `https://www.netflix.com/watch/<id>` only): the player's visible label (`[data-uia="video-title"]`, e.g. _Stranger Things · S1:E3 · Chapter Three_) or the pause overlay (_You're watching…_).
3. **Open Graph tags**: `og:title` when `og:type` is `video.movie` or `video.episode`, plus `video:release_date`.
4. **The tab title**, then **the page's first `<h1>`**.

Every detection has a confidence level:
- **High**: a dedicated source (structured data, Open Graph, Netflix player) names a movie with its year, or a series with season and episode. Shown as _Detected from…_.
- **Medium**: a dedicated source with partial details (a Netflix movie has no year; a limited series shows only `E3`), or free text with a year or an episode code. Shown as _Possible match from…_.
- **Low**: a bare free-text title such as a tab title `Arrival`. Shown as _Unsure guess from…_, never pre-filled.

To search by IMDb id, pick the title from the autocomplete; detection itself never selects one.

Free-text titles are parsed as follows:
- Episode notation is recognised as `S01E03`, Netflix's `S1:E3`, `Season 1 Episode 3`, `Season 1: Ep. 3` or `1x03`. Other numbers are never read as episodes, so `1920x1080`, `4x4` and `Apollo 13` are safe.
- A year is read only when bracketed, as in `Interstellar (2014)`, so `Blade Runner 2049` and `1917` keep their titles.
- The site name (`og:site_name` or the host name) is removed.
- When structured data and the tab title disagree, structured data wins.

Detection runs when you open the popup. On a Netflix watch page it also:
- retries for up to about 4 seconds (8 tries, 500 ms apart), because the title renders late;
- after the popup has injected the content script once, re-reads the page every 2 seconds and remembers the last title seen for the current URL, so the popup can still answer after the controls hide. A timer is used instead of a MutationObserver, since the player changes its DOM constantly;
- forgets that title when the URL changes (Netflix's client-side navigation, such as autoplaying the next episode), and drops a pending answer if you navigate during the retries.

The result stays in the page and the popup and is never sent anywhere until you click **Search**. No extra permissions are needed: the existing `activeTab` + `scripting` injection covers Netflix like any other site.

**Limitations**:
- Many sites expose no title at all. A page whose title only names the site detects nothing, and you type the title.
- Netflix's watch page is titled just "Netflix", with no sharing tags, structured data or heading. The only title is the player label, which Netflix shows only while the controls are visible or after a pause. If the controls were hidden the whole time, move the pointer over the video and click **Check again**. The Netflix selectors come from Netflix's current markup and have **not been verified on the live site**; Netflix may change them at any time, and the manual search keeps working when that happens.
- The Netflix numeric id in the URL is Netflix's own. It is never treated as an IMDb or TMDB id. SubLanka reads no Netflix APIs, network traffic or protected streams.
- Netflix movie labels carry no year, so movie detections stay at medium confidence. Add the year, or pick the title from the autocomplete, to tell remakes apart.
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
├── mediaDetection.ts         # page metadata / Netflix player label → DetectedMedia with confidence
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
| `GET /subtitles` | `languages=si`, `query` (lowercase), `type=movie\|episode`, optional `year`, `season_number`, `episode_number`, `page`. When a picked suggestion has an IMDb id, `imdb_id` (movie) or `parent_imdb_id` (series) replaces `query` and `year`. Parameters are sent in alphabetical order, as the docs ask. `page=1` is left out because the API answers it with a 301 redirect (verified live). |
| `POST /download` | `{ file_id, sub_format: "srt" }` returns a temporary `link`, `file_name` and `remaining`. Each call counts against the download quota. |
| `GET <link>` | The file itself. No API key or token is sent. |
| `POST /login` | Optional. `{ username, password }` returns `token` and `base_url`. |

Every API request carries `Api-Key` and `X-User-Agent: SubLanka v1.0.0`. The docs ask for a `User-Agent` naming the app, and browsers do not let extensions set `User-Agent`; the API accepts `X-User-Agent` instead. A signed-in request also carries `Authorization: Bearer <token>`.

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

## Title suggestions

The **Search** tab's title field suggests real titles from free, public, keyless APIs:

| Mode | Source | Licence and limits |
| --- | --- | --- |
| **TV episode** | [TVmaze](https://www.tvmaze.com/api) `GET https://api.tvmaze.com/search/shows?q=` | Data [CC BY-SA 4.0](https://www.tvmaze.com/api#licensing), with attribution and a link required. At least 20 calls per 10 s per IP, then HTTP 429. No key. |
| **Movie** | [Wikidata](https://www.wikidata.org/) `wbsearchentities` prefix search | Data [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing), no attribution required (SubLanka credits it anyway). Wikimedia asks clients to identify themselves and avoid bursts; SubLanka sends `Api-User-Agent: SubLanka/<version> (repo URL)`. No key. |

No backend, database, API key or new permission is involved. Both APIs answer cross-origin requests from any origin (checked live with a `chrome-extension://` origin), and thumbnails are plain `<img>` loads, so `host_permissions` still lists only `*.opensubtitles.com`.

**Why these sources:** TMDB, OMDb and similar movie APIs need an account and an API key (and a paid or commercial licence for commercial use). IMDb's suggestion endpoint is unofficial and not licensed for reuse. Wikidata's film data is CC0 and needs no key. Its prefix search is the engine behind Wikidata's own autocomplete.

### Behaviour

- Suggestions start after 3 characters, 350 ms after you stop typing. Each new keystroke cancels the pending request (`AbortController`). A late answer for older text is never shown.
- Answers are cached for 5 minutes (50 queries) while the popup is open, which also keeps SubLanka well inside the sources' rate limits.
- Up to 6 results are shown. Each has the title, the year (_Year unknown_ when the source has none) and _Movie_ or _TV series_, plus a TVmaze poster thumbnail for series. Movies, and series without an image, show an icon. Every response is validated, and malformed items are skipped. Thumbnails are only loaded from `https://static.tvmaze.com`.
- **Movies:** Wikidata returns all kinds of items, so only those whose English description names a film (_"2014 film by Christopher Nolan"_) are kept. Film series, franchises and characters are dropped. The year is the leading year of that description; if there is none, it is left blank and never guessed.
- Mouse: click a suggestion. Keyboard: **↓**/**↑** move through the list (wrapping around), **Enter** picks, **Esc** closes. The field is an ARIA 1.2 combobox with a listbox. Browser autofill is off (`autocomplete="off"`) so its list does not cover SubLanka's.
- The **×** button clears the title, the year and the selection.
- Loading, _no matching titles_ and errors (rate limit, offline, source down) appear inside the dropdown. Each one says you can still search with the title as typed. Suggestions only fill the form: manual entry always works, and no mock or placeholder titles exist anywhere in the app.
- The dropdown footer credits its source: _Suggestions from TVmaze (CC BY-SA)_ or _Suggestions from Wikidata (CC0)_, each with a link.

### What a selection does

- **Movie**: fills the title and the release year. A line under the field shows _Selected movie from Wikidata · 2014_.
- **TV series**: fills the series name and premiere year, and keeps TVmaze's IMDb id for the show when it lists one. **Season and Episode keep their values** and are never guessed. The premiere year is the series' year, not the episode's, so it is **not** sent with an episode search.
- Nothing is searched or downloaded until you click **Search**, and you still choose the result to load.
- **No stale selections:** typing in the title, switching Movie/TV episode, clearing, or using a detected title drops the selection. A selection is only used while the field still shows exactly the picked title. A saved form whose selection no longer matches (or one saved by the earlier TMDB-based version) is restored without it.

### OpenSubtitles matching

- **TV series with an IMDb id** (from TVmaze's `externals.imdb`, e.g. `tt4574334`): searched with OpenSubtitles' documented `parent_imdb_id=4574334` plus `season_number`/`episode_number`. If that finds nothing, SubLanka searches again once by title.
- **Movies, and series without an IMDb id**: searched by title (plus the year for movies), exactly as for a typed title.
- **Show more results** continues whichever search produced the list.

## Translation

### Workflow

1. Open SubLanka and choose the **Translate** tab. The badge says _Google Cloud Translation ready_ or _Setup required_.
2. Click **Choose an English .srt or .vtt file**. The file is read and parsed on your device with the same parser as the Subtitles tab, and the popup shows its subtitle and character counts. Nothing is sent yet.
3. Read the notice: the subtitle text goes to Google Cloud Translation with your own key, and Google may bill your project. The first time, the button reads **Agree and translate to Sinhala**. Clicking it is the consent, and it is remembered.
4. The job runs in the background worker. The popup shows _Translating 320 / 1,200 subtitles · 26% complete_. These counts include only batches Google has actually returned. There is no timer-driven progress.
5. **Cancel translation** stops it. Finished batches are kept, and the message says how many. **Resume translation** sends only the subtitles still missing.
6. When it finishes, check the preview: cue number, timestamps, English and Sinhala, 20 per page. **Edit** opens one cue in a text box. Saved edits are trimmed, use LF line breaks, have Unicode NFC normalization and lose control characters. They are always shown as plain text, never as HTML.
7. **Apply Sinhala subtitles** loads the result into the page through the normal `load-track` message as a _Machine translated_ track. If a track is already loaded, the popup says it will be replaced. Your timing offset, position, appearance, fullscreen behaviour and the playing video are not touched.
8. **SRT**, **VTT** and **Review** download `name.si.srt`, `name.si.vtt` and `name.si.review.txt` (timing, English and Sinhala side by side, for checking). A trailing `.en`/`.eng`/`.english` is dropped from the name. **Translate another file** discards the job and your edits.

### Architecture

```
popup Translate tab ──parse file locally──▶ cues
popup ──sublanka:translation {start|resume|cancel|edit|clear|get}──▶ background worker
background worker ──POST /language/translate/v2 (128 lines / 5,000 chars per batch)──▶ translation.googleapis.com
background worker ──job + progress after every batch──▶ chrome.storage.session ──onChanged──▶ popup
popup ──load-track (source: translated)──▶ content.js (existing PlaybackController)
```

```
src/translation/
├── types.ts            # TranslationProvider: maxSegments, maxChars, isConfigured(), translate(texts, signal)
├── googleTranslate.ts  # Google Cloud Translation v2 adapter, key storage, error mapping, response validation
├── translationJob.ts   # batching, retries, cancel/resume, job state in the worker, input limits
└── subtitleExport.ts   # SRT / WebVTT / review-file writers, safe file names
```

- **Cue mapping**: each cue's full text (all its lines) is one segment. Google returns exactly one translation per segment, in order. A reply with the wrong count, or an empty or non-string line, is rejected and none of it is used. Cues are never joined with delimiters, so a model cannot shift lines onto the wrong cue. Context therefore stops at the cue: a sentence split across two cues is translated as two pieces.
- **Timing**: only text is sent. Translated cues are the original cue objects (index, start, end, `{\anN}` position) with a new `text`, so order, gaps and overlaps are exactly as parsed.
- **Batching**: up to 128 segments and 5,000 characters per request (Google's documented limit and its recommended size). One job runs at a time, and a second **Start** is refused.
- **Retries**: rate limits (429), 5xx, timeouts (30 s) and network errors retry after 1 s, 2 s and 4 s, then the job fails with a message. Invalid key, disabled API, quota exhausted and invalid responses are not retried. `Retry-After` is not read, because Google's CORS response does not expose it.
- **Repeated lines** ("What?", "Yes.") are sent once per job. A resumed job reuses lines it has already translated. There is no persistent cache: nothing is stored beyond the current job, so no terms question arises about keeping Google's output.
- **Limits**: 5,000 cues, 300,000 characters (about US$6 at list price), 1,000 characters per cue.
- **Errors shown**: setup required, invalid or restricted key, Cloud Translation API or billing not enabled, rate limit, quota exhausted, network failure, timeout, provider unavailable, unmatched response, and partial completion (kept and resumable).

### Popup and worker lifecycle

- The job lives in the worker, so closing the popup does not stop it. A reopened popup reads the job from `chrome.storage.session` and follows its progress.
- A storage write after every batch also keeps the MV3 worker alive while it works. If Chrome stops the worker anyway (browser sleep, extension reload, a very long stall), the job stays stored as _running_. The next popup sees that no worker is running it and shows _interrupted_ with **Resume**. Finished batches are kept, and nothing is sent twice.
- A late reply after **Cancel** is discarded, and a reply is applied only to cues that are still empty.
- The job is in memory-only session storage. It survives tab navigation and popup closes, but not closing the browser. Edits are part of the job. Download the files to keep them.
- Applying needs a page with the content script, as for local files. Navigating the tab does not affect the job.

## Translation setup

Google Cloud Translation needs a Google Cloud project with billing enabled.

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project and enable billing.
2. Enable the **Cloud Translation API** ([setup guide](https://docs.cloud.google.com/translate/docs/setup)).
3. Under **APIs & Services → Credentials**, create an **API key** and restrict it to the Cloud Translation API.
4. In SubLanka, open **Settings → Translation**, paste the key and click **Save**.

How the key is handled:
- **Never bundled.** The extension has no `.env` file and no `VITE_*` variable; a value built into an extension is readable by anyone who installs it. Each user brings their own key. It is stored in `chrome.storage.local` on that device and sent only to `translation.googleapis.com`, in the `X-Goog-Api-Key` header (not the URL). **Remove key** deletes it.
- No service-account JSON is ever used. A key restricted to one API is the credential Google offers for this kind of client.
- **Public release:** shipping a shared key would need a small server proxy that holds the key, enforces input limits and per-user rate limits, and forwards only translation calls. That proxy is **not built**. It is unnecessary while each user supplies their own key.

**Cost and quotas** (Google's terms, checked October 2026; see [pricing](https://cloud.google.com/translate/pricing) and [quotas](https://docs.cloud.google.com/translate/quotas)):
- NMT text translation: the first 500,000 characters per month are free (as a monthly credit), then US$20 per million characters. Billing must be enabled even for the free tier.
- A feature film's subtitles are usually 30,000 to 60,000 characters. The Translate tab shows the count before you start.
- Default quota: 6,000,000 characters per minute per project. SubLanka sends batches one at a time.

### Privacy

- Only subtitle text is sent, and only after you click Translate. No timings, file names, video, audio, page URL or browsing data are sent.
- Google states that text sent to Cloud Translation is held in memory only to translate it, and is not used to train its models ([data usage](https://docs.cloud.google.com/translate/data-usage)).
- No analytics. Dialogue is never logged. The job is kept in memory-only session storage until you clear it or close the browser.

### Translation quality

Translations come from Google's general NMT model with no style options. The v2 API offers none, so the popup shows none. Passing tests prove the mapping, timing and export, **not** that the Sinhala is good. Expect problems with idioms, slang, names and tone. Formality and pronouns (ඔයා / ඔබ) will be uneven. Real quality needs review by Sinhala speakers.

`test-page/fixtures/translation-eval-en.srt` is a small, original, copyright-free review set covering:
- simple conversation;
- questions;
- emotional dialogue;
- idioms ("a piece of cake", "beat around the bush");
- slang;
- two speakers in one cue;
- proper nouns (Nimal, Kumari, Kandy, Galle);
- a long two-line sentence;
- overlapping and repeated cues.

Translate it, download **Review**, and have a Sinhala speaker check each line. No BLEU, chrF or other score has been measured.

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

A module background service worker (`background.js`) handles downloads and translation jobs. Translation needs no extra permission: Google allows CORS from extension origins.

## Project structure

```
sublanka/
├── public/manifest.json, icons/     # MV3 manifest (v1.0.0) and icons, copied to dist/
├── popup.html                       # popup entry
├── src/
│   ├── subtitles/                   # pure parsing + search (popup side)
│   │   ├── types.ts                 # SubtitleCue, ParsedSubtitles, SubtitleParseError
│   │   ├── cueBlocks.ts             # shared block splitting, timestamps, text cleanup
│   │   ├── srtParser.ts, vttParser.ts
│   │   ├── subtitleFile.ts          # extension, size and UTF-8 checks
│   │   └── subtitleSearch.ts        # cue index + binary search for active cues
│   ├── background/                  # service worker: downloads (Milestone 3) and translation jobs (Milestone 4)
│   ├── translation/                 # provider interface, Google adapter, batch job, SRT/VTT export (Milestone 4)
│   ├── discovery/                   # media detection, match ranking (Milestone 3)
│   ├── providers/                   # provider-neutral types + OpenSubtitles adapter (Milestone 3)
│   ├── metadata/titleSearch.ts      # TVmaze (TV) + Wikidata (movies) title search: validation, cache
│   ├── content/
│   │   ├── index.ts                 # one-time setup, message + storage listeners
│   │   ├── playbackController.ts    # track, video binding, sync loop
│   │   ├── mediaWatcher.ts          # detection retries, Netflix title memory, navigation reset
│   │   ├── videoCandidates.ts       # video detection and ranking
│   │   ├── subtitleOverlay.ts       # Shadow DOM overlay, top-layer fullscreen handling
│   │   └── styles.css               # overlay + appearance styles
│   ├── popup/
│   │   ├── App.tsx                  # tabs, state, file import, settings
│   │   ├── tabBridge.ts             # chrome.tabs / chrome.scripting / worker calls
│   │   ├── searchState.ts           # search form validation + session persistence
│   │   └── components/              # tabs, search panel, title autocomplete (TitleField), result cards, provider settings, cards
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
3. Click **Load unpacked** and select the `dist/` folder. If you are upgrading from an earlier version, click the reload icon on the SubLanka card instead. Version 1.0.0 asks for no new permissions.
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

`npm test` runs 309 Vitest tests in jsdom. No test makes a real network request: every provider response comes from `src/providers/opensubtitles/fixtures.ts` or inline mocks. They cover:
- media detection (JSON-LD, Open Graph, tab title, heading, episode notations, bracketed years, false positives, conflicting and missing metadata, confidence levels, Netflix watch URLs, player labels, pause overlay, limited series, missing and Netflix-only labels);
- the media watcher (late-rendered titles, bounded retries, remembering a title after the controls hide, client-side navigation, cancelling on navigation, ordinary pages);
- the OpenSubtitles client (parameters and headers, search, episodes, pagination, empty results, 401/403/406/410/429/5xx, network errors, malformed JSON, cancellation, host allow-listing, capped download, HTML rejection, redirects, login, token storage, expired sign-in);
- match ranking (exact movie, wrong year, correct/wrong episode, multiple releases, ambiguous titles, missing identifiers);
- the download worker (SRT and WebVTT downloads loading through the shared parser, malformed and non-UTF-8 files, quota errors, navigation during download, sender checks);
- title suggestions, with mocked `fetch` and a mocked `searchTitles`, never a live call:
  - the client: TVmaze and Wikidata request shapes (only the typed title sent, `Api-User-Agent`), caching, 429/5xx, offline and network errors, cancellation, unreadable responses and Wikidata error bodies, malformed/duplicate items, off-site thumbnails, IMDb id parsing, film-only filtering, years never invented, the 8-result limit;
  - the Search tab: the 350 ms debounce and 3-character minimum, movie and TV suggestions, mouse and keyboard selection (↓ ↑ Enter Esc), year filling, season/episode kept, no first-air year in episode searches, empty results, rate-limit errors with manual search still working, cancelled and out-of-order lookups, editing/clearing/switching type dropping the selection, missing-poster fallback, no key needed, the `parent_imdb_id` OpenSubtitles query and its title fallback, discarding stale and old TMDB-era saved selections;
- the Search tab UI (manual search, detected-title correction, loading, cancel, empty, errors, setup required, validation, stale responses, loading a result, failures, restoring state after reopening, pagination);
- SRT and VTT parsing (fixtures, BOM, mixed line endings, invalid timestamps, malformed and empty files, overlaps, a 5000-cue file);
- the cue search, checked against a naive scan on 10 000 cues;
- file checks and settings validation;
- message validation and the popup ↔ tab bridge (with a mocked `chrome` API);
- the playback controller (seek, pause, rate, end, offset, overlaps, video selection and replacement, no duplicate listeners);
- the overlay (appearance, no duplicates, cleanup, top-layer ordering);
- translation (Milestone 4), using a deterministic fake provider and mocked `fetch`, never a real key:
  - the Google adapter: request shape, key sent in a header, the real invalid-key response, disabled API, rate limit, quota, 5xx, network failure, cancellation;
  - responses with too few or too many lines, empty or non-string lines, which are rejected rather than guessed;
  - batching by segment and character limits, a 1,200-cue file, repeated lines sent once, backoff on transient errors, no retry on key/quota/validation errors, partial failure keeping finished batches, late replies after cancel;
  - the worker job: completion, duplicate-start refusal, cancel and resume (only missing cues are sent), an interrupted worker, failures, edits, oversized input, clearing;
  - export: SRT and WebVTT round-trip through the existing parsers with identical timing, overlaps, multiline cues, Sinhala, HTML-like text, `-->` in text, pinned positions, safe filenames;
  - the Translate tab: setup required, local upload with nothing sent before consent, unsupported files, live progress, cancel, resume, preview, editing (HTML stays plain text), applying through `load-track`, SRT/VTT downloads, worker errors.

jsdom has no media playback, Popover API, or fullscreen. Those tests drive fake videos and a simulated top layer, so they check SubLanka's logic, not the browser's rendering.

## What has been verified

| | Status |
| --- | --- |
| Type check, lint, 281 unit tests, production build | Run and passing |
| Google Translation v2 endpoint, request/response fields, 128 strings per request, 100 KB request cap, `en`/`si` NMT support | From the official docs |
| Google CORS for `chrome-extension://` origins with `X-Goog-Api-Key`; invalid-key error shape (`400`, `API_KEY_INVALID`) | Checked live with curl and a fake key |
| **Real English → Sinhala translations** | **Not tested.** No Google Cloud key was available. Whether `format: text` keeps line breaks inside a cue is unverified |
| Sinhala language code `si` ("Sinhalese") | Checked live against `GET /infos/languages` |
| API CORS (`Access-Control-Allow-Origin: *`, all headers allowed) | Checked live |
| Search without a valid key → 403 "You cannot consume this service" | Checked live; mapped to the API-key message |
| `page=1` → 301 redirect | Checked live; SubLanka omits it |
| Popup layout (Subtitles, Search with results, Settings, dark mode) | Checked in Chrome as a plain page with a stubbed `chrome` API and fixture data |
| **Real search results, real downloads, login, download quota headers** | **Not tested.** No API key was available |
| **Loading the extension in Chrome and running the worker end to end** | **Not tested** |
| TVmaze and Wikidata CORS for `chrome-extension://` origins (`Api-User-Agent` allowed); response shapes; Wikidata film filtering for _interst_, _toy sto_, _spirited_, _avengers end_, _the matr_, _oppenh_ | Checked live with curl |
| OpenSubtitles `imdb_id` / `parent_imdb_id` search parameters | From the OpenSubtitles API docs as cited by third-party guides; not checked with a real key |
| **Suggestions inside the real extension popup, real IMDb-id OpenSubtitles searches** | **Not tested** |

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

### Manual testing of title suggestions

No key is needed.

1. `npm run build`, reload SubLanka, open **Search**.
2. **Movie**: type `interst`. _Interstellar · 2014 · Movie_ should appear. Pick it with the mouse; the year becomes 2014 and _Selected movie from Wikidata · 2014_ appears. Click **Search**.
3. **TV episode**: set Season 1, Episode 3, then type `stranger`. Use **↓** and **Enter** to pick _Stranger Things · 2016 · TV series_ (with a poster). Season and episode stay 1 and 3. Click **Search**; on the popup's Network panel the OpenSubtitles request should carry `parent_imdb_id=4574334`.
4. Type one more letter after selecting. The _Selected_ line disappears. Try **Esc**, the **×** button, and switching Movie/TV.
5. Go offline (DevTools → Network → Offline) and type. The dropdown says you are offline, and **Search** still sends the typed title.

### Manual testing of Netflix detection

Needs a Netflix account. Nothing here has been verified on the live site yet.

1. `npm run build`, reload SubLanka, and open an episode at `https://www.netflix.com/watch/<id>`.
2. Move the pointer over the video so the controls show, then open SubLanka → **Search**. Expect _Detected from the video player title: <Series> · S01E03_, with the form pre-filled.
3. Let the controls hide, close and reopen the popup. The same title should still appear (remembered for this URL).
4. Skip to the next episode (or let it autoplay). Reopen the popup: the old episode must **not** appear. Show the controls and the new episode should.
5. Open a movie. Expect _Possible match from the video player title: <Movie>_ with no year.
6. Pause for about 10 seconds until _You're watching_ appears, then open the popup: the overlay should be read.
7. With the controls hidden on a fresh tab, open the popup. Within about 4 seconds it should say nothing was found and offer **Check again**. Hover the video and click it.
8. If any step finds nothing, inspect the player label in DevTools and compare it with the selectors in `src/discovery/mediaDetection.ts` (`fromNetflixPlayer`).
9. Check that subtitle loading, sync, timing, appearance, position and fullscreen still work on Netflix as before.

### Manual testing of translation with a real key

1. **Settings → Translation**: save a Google Cloud Translation API key.
2. **Translate**: choose `test-page/fixtures/translation-eval-en.srt` and click **Agree and translate to Sinhala**. Progress should reach 11 / 11.
3. Check that cue 2's two lines are still two lines, cues 10 and 11 overlap, and the names stay recognisable.
4. Start again and close the popup mid-way, then reopen it. The job should still be running or done. Try **Cancel**, then **Resume**.
5. Edit a cue, then **Apply Sinhala subtitles** on the test page. The overlay should show your edit at the cue's original time. Change the offset and appearance to confirm they still apply.
6. Download SRT and VTT, and load each one in the **Subtitles** tab.
7. Try an invalid key and a key for a project without the API enabled.

## Known limitations

- **Live provider behaviour is unverified** (see above), for both OpenSubtitles and Google Cloud Translation.
- **Translation**: machine output that has not been reviewed by a human. Context ends at each cue. Only one job runs at a time. The job and its edits last until the browser closes. Only local English files can be translated. Google bills the user's own project.
- **Title suggestions:**
  - TVmaze matches whole words fuzzily, so a partial word may miss: `strang` does not find _Stranger Things_, but `stranger` does. SubLanka shows TVmaze's order unchanged.
  - Wikidata movie suggestions depend on community-written English descriptions. A film without a description naming it a film, or without a year in it, is skipped or shown as _Year unknown_. Popular titles can crowd films out of the 50 items checked (`parasi` finds no film, `parasite` does).
  - Movies have no poster thumbnails. Wikidata images are rarely posters, and posters are usually copyrighted.
  - Movies are searched on OpenSubtitles by title and year, not by id. Wikidata's IMDb id would need a second request per suggestion.
  - Results are English titles, so typing a Sinhala title finds nothing.
  - A TV selection never sets the season or episode.
  - The sources' rate limits are per IP. Very fast typing on a shared network could briefly hit TVmaze's 429; the dropdown says so and manual search still works.
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

- **Milestone 3:** Sinhala subtitle search and download from OpenSubtitles.com, page metadata detection, tabbed popup.
- **Milestone 4 (this release):** English → Sinhala translation of local subtitle files with Google Cloud Translation, preview and editing, SRT/WebVTT export.
- **Milestone 5 (proposed):**
  - verify live translation and OpenSubtitles with real keys, and have Sinhala speakers review the evaluation set;
  - a key proxy for a public release (translation and OpenSubtitles);
  - translating the track already loaded on the page;
  - verify and harden the live OpenSubtitles integration with real credentials;
  - decide on a key proxy for a public release;
  - optionally remember the last file per site, with consent;
  - support players inside same-origin iframes.
- Later: per-site compatibility work where technically and legally feasible.
