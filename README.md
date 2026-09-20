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

## Develop locally

```bash
npm install
npm run dev
```

## Deploy on Netlify

Use these build settings:

- Build command: `npm run build`
- Publish directory: `dist`

ReelyTidy is a static client-side application. Serve it over HTTPS in production so browser folder access is available.
