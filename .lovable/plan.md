# YouTube Learning Notes — v1 Plan

Stack: TanStack Start + Lovable Cloud (Postgres/auth) + Lovable AI Gateway (Gemini). Transcripts via free YouTube captions only.

## Scope

In: URL input → metadata → raw + cleaned transcript → detailed AI notes → markdown editor with auto-save → Obsidian-formatted export (.md) → chat Q&A over transcript/notes → per-user history.

Out (v2): Whisper fallback, PDF/DOCX export, Obsidian vault zip, per-section regenerate, flashcards/MCQ presets (chat can still do these on demand).

## User flow

1. Sign in (email/password + Google).
2. Home: paste YouTube URL → server fetches oEmbed metadata (title, channel, thumbnail) + captions.
3. Show video card + 3 tabs while processing: **Raw transcript**, **Clean transcript**, **Notes**. Each streams in.
4. Library sidebar lists prior videos. Click → opens detail page.
5. Detail page (`/v/$videoId`): tabs for Raw / Clean / Notes / Obsidian / Chat. Notes + Clean tabs are editable (markdown editor, debounced auto-save). Export button downloads `.md`.

## Pages / routes

- `/` — landing + URL input (signed-out shows sign-in CTA).
- `/auth` — managed sign-in.
- `/_authenticated/library` — list of videos.
- `/_authenticated/v/$videoId` — tabs + editor + chat panel.

## Data model (Lovable Cloud)

- `videos`: id, user_id, youtube_id, url, title, channel, thumbnail_url, duration_seconds, status (`pending|ready|failed`), error, created_at.
- `transcripts`: video_id PK, raw_text, raw_segments (jsonb: [{start,end,text}]), clean_markdown.
- `notes`: video_id PK, notes_markdown, obsidian_markdown, updated_at.
- `chat_messages`: id, video_id, role, parts (jsonb), created_at.

RLS: all tables scoped to `auth.uid() = user_id` (videos), or via `video_id → videos.user_id` for the rest. Standard grants for `authenticated` + `service_role`.

## Server functions (`src/lib/*.functions.ts`)

- `ingestVideo({ url })` — auth-gated. Parses youtube id, fetches oEmbed, fetches captions (`youtube-transcript` npm package), inserts `videos` row + raw transcript, kicks off `generateForVideo`.
- `generateForVideo({ videoId })` — auth-gated. Streams two Gemini calls sequentially using `streamText`/`generateText`:
  1. Clean transcript (fix punctuation, paragraphs, speaker labels when inferable, preserve `[mm:ss]` markers).
  2. Detailed notes (long-form, structured per spec: Overview, Key Concepts, Detailed Breakdown, Terminology table, Examples, Relationships, Takeaways, Reflection Questions, Further Research). System prompt enforces depth ("textbook-chapter quality, not a summary").
  3. Obsidian variant (post-pass: add `#tags`, `[[wikilinks]]`, callouts, optional mermaid concept map).
  Saves all three to DB.
- `saveNotes({ videoId, notes_markdown })`, `saveCleanTranscript(...)` — debounced auto-save from editor.
- `listVideos()`, `getVideo({ videoId })` — library + detail loaders.
- `deleteVideo({ videoId })`.

## Server route

- `src/routes/api/chat.ts` — AI SDK streaming chat. POST body includes `videoId` + `messages`. Handler verifies bearer (`requireSupabaseAuth`-equivalent inside handler), loads transcript + notes for that video as system context, streams Gemini reply, persists user + assistant messages in `onFinish`.

## Models

Default `google/gemini-3-flash-preview` for clean transcript, chat, and Obsidian pass. Use `google/gemini-2.5-pro` for the detailed-notes pass (depth matters; long context for 2h videos). Gracefully surface 402/429.

## Frontend details

- Editor: `@uiw/react-md-editor` (or textarea + `react-markdown` preview) — simple, no heavy WYSIWYG. Debounced 1s auto-save via server fn.
- Markdown render: `react-markdown` + `remark-gfm` for tables; `mermaid` for Obsidian mermaid blocks.
- Chat: AI Elements composition per chat-ui-composition; one conversation per video (no separate thread list); messages persisted in DB and restored on load.
- Export: client builds Blob from `obsidian_markdown` → download as `{title}.md`.
- Design: dark default with light toggle; minimal Obsidian/Linear-inspired; sidebar with library list; reading-width content column.

## Dependencies to add

`youtube-transcript`, `ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `react-markdown`, `remark-gfm`, `@uiw/react-md-editor`, `mermaid`, `zod` (already present likely).

## Security / guardrails

- Validate URL with zod, extract 11-char video id, reject non-YouTube.
- Cap transcript size sent to model (chunk + map-reduce if > ~150k tokens; v1: hard cap with warning).
- Surface caption-unavailable error cleanly ("This video has no captions; Whisper fallback is on the roadmap").
- No service-role usage in app code paths; all reads/writes via authenticated client and RLS.

## Out of scope reminder

PDF/DOCX export, per-section regenerate, flashcards/MCQ buttons, Obsidian vault zip, Whisper fallback — defer to v2.
