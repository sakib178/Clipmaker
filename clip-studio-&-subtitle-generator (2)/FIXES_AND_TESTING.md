# Repair and verification — 5 October 2026

## Silent export

The old canvas recording contained video only. Audio upload failures were swallowed, the server tried to re-download YouTube audio before using an available client WAV, and missing audio was replaced with a silent AAC track. A failed MP4 conversion could also be presented as a successful export by renaming the raw WebM data.

The repaired export prepares a WAV from the same decoded audio used for preview, with the selected trim, stereo channels, and volume. The server uses that WAV first, validates it, explicitly muxes it with H.264 video as AAC, and validates the output tracks and duration. Missing/expired audio and failed conversions report errors. Cancellation cleans up the recording and temporary audio upload. Export URLs identify an individual saved clip.

The original server's silent-success behavior was reproduced with a missing audio token and a video-only recording. The repaired server rejects that request. Successful repaired browser exports were decoded with FFmpeg and checked for audible samples, rather than relying on an audio-track label.

## Other repairs

- Replaced the unreliable third-party YouTube download fallback with direct yt-dlp/FFmpeg extraction, exact timestamp cache keys, shared concurrent downloads, validation, and atomic cache writes. Video backgrounds use actual video media. Old audio caches must cover the full selected range.
- Removed iframe/placeholder audio being reported as a successful pull, silent substitutes for undecodable uploads, stale asynchronous source overwrites, and trim ranges wrapping to time zero.
- Preserved stereo for export and combined both channels for transcription. Removed the hidden 120-second transcription truncation.
- Corrected timestamp parsing/rounding, subtitle timing editing, numeric and multiline SRT/VTT imports, and subtitle downloads being clipped/rebased to the trimmed MP4 timeline.
- Shifted generated transcript cues to the selected trim start. Missing keys or AI failures preserve existing captions and show an error rather than inventing transcriptions/translations.
- Honored selected output dimensions and frame rate, restored actual background video seeking, and improved poster/gradient/visualizer rendering and media error reporting.
- Replaced simulated Canva connection success with verified tokens, real PKCE OAuth, token refresh, and actual export jobs. Limited popup messages to the app origin and kept server credentials out of integration status responses.
- Made n8n require an exported current clip and a real workflow URL. Failed delivery no longer reports publication. Successful delivery means accepted by n8n; actual publication is determined by the configured workflow. Fixed the starter JSON's payload paths and clarified its required publishing/scheduling steps.
- Corrected incompatible dependency declarations and startup scripts, added a reproducible npm lockfile, loaded environment configuration before dependent modules, and persisted integration settings outside the temporary directory. Removed the obsolete Bun lockfile; npm is the documented package manager.

The editor's layout and editing controls remain in place. Status messages were corrected where they previously reported work that had not succeeded.

## Results

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed |
| TypeScript `npm run lint` | Passed |
| Production `npm run build` | Passed |
| Regression suite | 17 passed, 0 failed |
| Chromium browser suite | 16 passed, 0 failed |

Verified on Linux with Node 24, Python 3, FFmpeg/ffprobe, and headless Chromium. The suites are included under `tests/`.

Regression checks cover URL/timestamp parsing; subtitle import and trim alignment; invalid uploads; missing/expired audio; audible stereo AAC and H.264; dimensions, FPS, and duration; client-audio priority and single volume application; 4K/60 FPS encoding; fractional range caches; a controlled downloader process producing actual media; AI configuration failures; forged Canva callbacks; n8n failure/success responses and scheduling validation; and audio-engine slicing/source races.

Browser checks cover upload/preview; subtitle import/editing; AI failure preservation; trim and background uploads; audible Turbo and Standard MP4 downloads; conversion failures; export cancellation; fractional YouTube import using controlled real WAV bytes; transcript trim offsets; failed YouTube pulls; the separate background editor; Canva configuration errors; n8n JSON download/configuration errors; mobile width; and uncaught browser errors.

## External checks still required

Live YouTube extraction could not be verified from this environment: the network attempt timed out. Tests validate the downloader adapter and real media processing with controlled sources, not YouTube availability or anti-bot behavior on your hosting provider.

No Gemini key, Canva account, or production n8n credentials were supplied. Live transcription/translation/TTS, Canva authorization/exports, and actual social publication therefore remain account-dependent checks. Test fixtures and local webhooks verified their app-side contracts and error handling. The optional Dockerfile was not built here.

Use the README setup instructions, then perform a live check with a video accessible from your server and your configured integrations. AI word timings remain estimates that should be reviewed. See the README for upload limits, persistence, and the existing single-user hosting model.
