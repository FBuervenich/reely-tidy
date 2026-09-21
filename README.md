# 🎬🧹 ReelyTidy

ReelyTidy is a private, browser-based media organizer. It scans a folder of movies and TV shows, looks up metadata with [TMDB](https://www.themoviedb.org/), and creates a reviewable rename and move plan before changing any files.
**No installation required:** open ReelyTidy in a supported browser and use it right away. It runs directly in current Chromium-based browsers, with no desktop app or server to install.

## Highlight

- Runs fully in your browser.
- Keeps media files on your device; there is no ReelyTidy backend or tracking.
- Looks up movie, series, season, and episode metadata directly from TMDB.
- Provides a preview before files are moved.
- Supports configurable folder and file-name presets for movies and TV shows.
- Carries matching sidecar files, such as subtitles, along with video files.

## Requirements

- A current Chromium-based browser (Chrome, Edge, Brave, Opera, Vivaldi, Arc, Helium, or Chromium).
- The app must run in a secure context, such as `http://localhost` or HTTPS.
- A [TMDB API Read Access Token](https://developer.themoviedb.org/docs/getting-started) for metadata lookups.

Firefox and Safari do not currently provide the File System Access API needed to select folders and move files.

## Use the app

1. Open **Settings** and paste your TMDB API Read Access Token.
2. Optionally adjust the destination root folder and naming preset.
3. Choose a media folder and scan it. This produces a preview only.
4. Review, edit, or exclude planned destinations.
5. Select **Move now** to apply the approved plan.

The TMDB token and settings are stored only in your browser. Original empty source folders may remain after moving files and can be removed manually.

## Recognition and review

The parser combines filenames, series/season folders, neighboring files, and explicit TMDB or IMDb IDs. Matching `movie.nfo`, `tvshow.nfo`, and movie-specific NFO files can provide IDs. NFO reads are limited to 1 MB. Season 00, combined episodes (`S01E01E02`, `S01E01-E02`), and air dates are supported. Numeric files inside season folders remain pending until their episode numbers are verified or explicitly corrected.

TMDB lookup first resolves IDs, then searches titles with and without a year, and finally tries folder or alternative interpretations. The five highest-ranked candidates are checked against original/alternative titles and season metadata. Exact titles score 65, matching years add 25, verified IDs add 100, and existing episodes add 20. A match is automatic only with strong evidence, no contradictions, and a lead of at least 20 points. These are explainable heuristics, not calibrated probabilities.

The preview distinguishes **Unverified filename suggestion**, **Metadata match**, and **User confirmed**. Use **Change match** or **Search / choose match** for free-text search, `tmdb:123` or `tt1234567`, and episode corrections. Confirmed series choices apply to the matching group and are saved locally; automatic matches are not saved as user decisions. **Use filename / forget saved match** removes the saved choice. Legacy automatic assignments are intentionally not reused.

Season data and identical requests are shared during a scan, with at most four network requests in flight. Missing episodes require review. Network failures leave episodes explicitly unvalidated; they do not prove that an episode is missing. Date-based and folder-inferred episode numbers require validation before execution. Explicit filename suggestions remain usable and visibly unverified.

Each sidecar belongs to the longest matching video stem. Tied stems require a video choice or **Leave sidecar in place**. Scene tags preserve audio punctuation such as `DDP5.1`; the release group is rendered separately and is not included in `{sceneTags}`.

## Develop locally

```bash
npm install
npm run dev

npm test
npm run check
npm run build
```

Tests run with **Vitest**, provided by Vite Plus. `npm test` runs the suite once; `npm run test:watch` reruns affected tests during development. The suites cover recognition and scan workflows, NFO context, TMDB request behavior, and manual review/sidecar conflicts. Filesystem access, browser storage, and TMDB responses are simulated; unexpected network requests fail the test. No token or real media files are required.

## Deploy on Netlify

Use these build settings:

- Build command: `npm run build`
- Publish directory: `dist`

ReelyTidy is a static client-side application. Serve it over HTTPS in production so browser folder access is available.
