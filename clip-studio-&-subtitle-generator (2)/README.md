# Clip Studio & Subtitle Generator

The original editor and layout are preserved. MP4 export now muxes the actual decoded, trimmed audio into H.264 video with an AAC audio track. See [FIXES_AND_TESTING.md](FIXES_AND_TESTING.md) for the repair details and verification results.

## Run locally

Requirements: Node.js 22.12 or newer (Node 24 recommended), Python 3.10 or newer, and FFmpeg **with ffprobe**, H.264 (`libx264`), and MP3 (`libmp3lame`) support. Run commands from this project folder.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local`. Add your Gemini API key if you want transcription, translation, captions, or generated voiceovers. Uploads, editing, and audio/video export work without that key.
3. Confirm `ffmpeg -version`, `ffprobe -version`, and `python3 --version` work in your terminal. On Windows, use `python --version` and set the executable paths in `.env.local` if necessary.
4. Run `npm run dev` and open `http://localhost:3000`.

For a production build, run `npm run build`, then `npm start` with `NODE_ENV=production` set in the server environment. Keep the Node backend running; serving only the `dist` folder cannot perform extraction, AI calls, or MP4 conversion.

The optional Dockerfile includes Python, FFmpeg, and ffprobe:

```sh
docker build -t clip-studio .
docker run --rm -p 3000:3000 --env-file .env.local -v clip-studio-data:/app/data clip-studio
```

The container definition is provided for deployment convenience; a Docker build was not run in the repair environment. Google AI Studio/Cloud Run also needs these server tools, outbound YouTube access, and the configured environment variables.

## YouTube audio and backgrounds

Paste a YouTube video URL, enter start/end timestamps, and click Pull Audio. The server uses the bundled `bin/yt-dlp` with FFmpeg; the browser decodes that audio for both preview and export. Timestamps support seconds, `MM:SS`, and `HH:MM:SS`, including fractions. Selecting the same video at a different range downloads a different segment.

For a YouTube video background, the server downloads the actual selected video segment and serves it from the app origin. It does not substitute a thumbnail or an iframe for exportable media.

YouTube extraction depends on the video being accessible from your server. Private, removed, region-restricted, or authentication-required videos may fail. If needed, configure `YOUTUBE_COOKIES_FILE` with a server-side cookies file, or upload the audio/video file. `YT_DLP_PATH` can point to an installed, updated yt-dlp executable instead of the bundled version. Never place cookies or API keys in frontend code.

## Canva

Uploaded Canva PNG/JPG/MP4 exports work through the normal background upload control without an API connection. The separate background editor also works without credentials.

For the API connection, configure a Canva Connect integration with `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET`. Set `APP_URL` to the app's public origin and register the exact callback, normally `https://your-app.example/auth/callback`, in Canva. The app requests `design:content:read`, `design:meta:read`, and `profile:read` scopes and uses OAuth with PKCE. You can also connect with a valid access token that has these scopes. API designs are exported through Canva export jobs; thumbnails are only previews.

Connection failures and expired/invalid tokens are reported. Canva account permissions, export eligibility, and your integration configuration must be checked with your real account.

## n8n

1. Create and authenticate the social platform credentials in your n8n instance.
2. In the app, map each desired account to its n8n credential name and enable it.
3. Paste the **production** webhook URL of your activated workflow. Configure a matching authentication header if required, then test the webhook.
4. Export the current clip before sending it. Changing the clip invalidates its export selection; export the updated clip again.

The downloaded JSON is a **starter workflow**: it receives the payload, splits target accounts, and downloads the rendered MP4. Add the authenticated platform publishing nodes and, for scheduled requests, a Wait/scheduling step using `body.schedule.scheduledTime`. The built-in receiver is only a payload test and cannot publish posts.

The payload includes `body.clip.videoMp4Url`, the caption/hashtags, `body.targetAccounts`, and the requested schedule. Set `APP_URL` to an origin reachable by n8n; `localhost` on your computer is not reachable by a separate cloud instance. Exports have stable per-clip URLs rather than a shared latest-file URL. An accepted webhook is reported as **accepted by n8n**; check the actual n8n execution and platform response for publication status.

## Data and practical limits

`data/` stores integration settings and exported MP4 files. Set `CLIP_STUDIO_DATA_DIR` to persistent storage on a hosted service; ephemeral container storage is lost when an instance is replaced. Exported files remain available until you remove them. YouTube segment caches live in the system temporary directory unless `CLIP_STUDIO_CACHE_DIR` is configured.

This remains a single-user editor. Shared hosting needs access control in front of the app; the existing project has no user accounts or per-user media separation.

The server accepts at most 60 minutes per requested clip, 100 MB of prepared WAV audio, and 200 MB of browser-recorded video. Long/high-resolution clips can reach these upload limits and consume substantial browser memory. 4K output is encoded at the selected dimensions, with canvas rendering capped at a 2560-pixel longest edge before server upscaling. AI requests also depend on your model's input limits and quota. Generated cue/word timings should be reviewed against the audio.

## Checks

```sh
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

Tests use generated tones and images, local mock webhooks, and controlled YouTube/AI responses. They do not send posts, use your accounts, or prove live third-party access. To use an existing Chromium binary, set `BROWSER_EXECUTABLE_PATH` for the browser check.
