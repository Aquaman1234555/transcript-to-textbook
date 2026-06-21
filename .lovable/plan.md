## Goal

When a YouTube video has no captions, automatically download its audio and transcribe it with Lovable AI, then feed the transcript into the existing notes pipeline. Captions stay the fast path.

## Flow (per ingest)

```text
User pastes URL
   │
   ▼
Extract YouTube ID  →  fetch oEmbed (title/thumb)
   │
   ▼
Try captions (existing scraper + youtube-transcript)
   │
   ├── found  ─────────────────────────────► use as transcript (current behavior)
   │
   └── none / disabled
            │
            ▼
       Resolve a direct audio stream URL for the video
            │
            ▼
       Stream audio bytes  →  size + duration guard (≤ 60 min, ≤ 24 MiB)
            │
            ▼
       POST multipart to Lovable AI /v1/audio/transcriptions
       model: openai/gpt-4o-mini-transcribe  (non-streaming, JSON)
            │
            ▼
       Build synthetic [mm:ss] segments from the returned text
            │
            ▼
       Insert into `transcripts` exactly like a caption transcript
            │
            ▼
       Existing generate pipeline (clean → notes → concept map / AP / KE)
```

## What changes

### 1. `src/lib/youtube.server.ts`
- Keep `fetchTranscript` as the captions path.
- Add `resolveAudioStreamUrl(youtubeId)`: parse the watch page's `ytInitialPlayerResponse` (already fetched for caption tracks) to read `streamingData.adaptiveFormats`. Pick the smallest audio-only format (lowest bitrate `audio/mp4` or `audio/webm`) so a 1-hour video fits under the Gateway 25 MiB cap.
- Add `fetchAudioBlob(url, { maxBytes })`: `fetch()` the URL, abort if `Content-Length` exceeds `maxBytes`, return `{ blob, mime }`.
- Export `transcribeAudioWithLovableAI(blob, mime, lovableApiKey)`: multipart POST to `https://ai.gateway.lovable.dev/v1/audio/transcriptions` with `model=openai/gpt-4o-mini-transcribe`. Filename extension derived from MIME (`.m4a`/`.webm`/`.mp3`). Returns the full text plus `usage`.
- Export `textToSyntheticSegments(text)`: split by sentence/length into ~30 s buckets and emit `{ offset, duration, text }` so the existing `segmentsToRawText` + `[mm:ss]` formatting still works downstream.

### 2. `src/lib/videos.functions.ts` — `ingestVideo`
Replace the current "no captions → throw" branch with:

1. Try captions; on success continue.
2. Else call `resolveAudioStreamUrl` → `fetchAudioBlob` (cap 24 MiB) → `transcribeAudioWithLovableAI` using `process.env.LOVABLE_API_KEY`.
3. Convert the returned text into synthetic segments and persist into `transcripts.raw_segments` / `raw_text` exactly as today.
4. Only throw a user-facing error if BOTH paths fail. Error messages:
   - "Audio is too long for transcription (over ~60 min). Try a shorter video."
   - "Couldn't access this video's audio (it may be private, members-only, or age-restricted)."
   - "Audio transcription failed. Please try again."

### 3. UI copy
`src/routes/_authenticated/library.tsx` and `v.$videoId.tsx`: pending toast/state already covers this; just soften the existing "Couldn't fetch captions" copy to "Fetching transcript… (audio transcription may take a minute for longer videos)".

No DB migration. No new dependencies. No new secrets — `LOVABLE_API_KEY` is already provisioned.

## Limits & trade-offs (so you know up front)

- **Length cap ~60 min**: enforced by the Lovable AI Gateway's 25 MiB request body. We pick the lowest-bitrate audio track YouTube offers, which keeps a typical 60 min video under that cap, but a very long or very high-bitrate stream can still trip it — we'll surface a clear "too long" error rather than silently truncate.
- **Audio-transcribed videos have approximate timestamps**: captions give per-line timing; STT gives one block of text. We synthesize evenly-spaced `[mm:ss]` markers (~30 s buckets) so the notes still feel timestamped, but they're estimates, not exact.
- **Cost**: audio transcription uses Lovable AI credits proportional to audio length. A 1 hr video is meaningfully more expensive than the caption path. The Hindi→English translation you already added still happens in the clean-transcript step, so non-English audio is auto-translated.
- **What still won't work**: private / members-only / age-restricted / region-blocked videos (no public audio stream) and live streams. We'll error out with a clear message instead of producing garbage.

## Out of scope

- Chunked transcription of >60 min videos (would need ffmpeg.wasm in the Worker).
- Background job queue / progress bar for long transcriptions — runs inline in the existing ingest server function.
