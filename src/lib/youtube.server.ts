import { YoutubeTranscript } from "youtube-transcript";

export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  // 11-char id directly
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
      if (idx >= 0 && parts[idx + 1] && /^[\w-]{11}$/.test(parts[idx + 1])) {
        return parts[idx + 1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type OEmbed = {
  title: string;
  author_name: string;
  thumbnail_url: string;
};

export async function fetchOEmbed(youtubeId: string): Promise<OEmbed | null> {
  const r = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`,
  );
  if (!r.ok) return null;
  return (await r.json()) as OEmbed;
}

export type TranscriptSegment = { offset: number; duration: number; text: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;#39;|&#39;/g, "'")
    .replace(/&amp;quot;|&quot;/g, '"')
    .replace(/&amp;lt;|&lt;/g, "<")
    .replace(/&amp;gt;|&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "");
}

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string; name?: { simpleText?: string } };

async function listCaptionTracks(youtubeId: string): Promise<CaptionTrack[]> {
  const r = await fetch(`https://www.youtube.com/watch?v=${youtubeId}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!r.ok) return [];
  const html = await r.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) return [];
  try {
    return JSON.parse(m[1]) as CaptionTrack[];
  } catch {
    return [];
  }
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  // Prefer manual (no kind) over ASR; prefer English then anything.
  const manual = tracks.filter((t) => t.kind !== "asr");
  const pool = manual.length ? manual : tracks;
  return pool.find((t) => t.languageCode?.startsWith("en")) ?? pool[0];
}

async function fetchTrackSegments(track: CaptionTrack): Promise<TranscriptSegment[]> {
  const url = new URL(track.baseUrl);
  url.searchParams.set("fmt", "json3");
  const r = await fetch(url.toString(), { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const data = (await r.json()) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
  const out: TranscriptSegment[] = [];
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\n+/g, " ").trim();
    if (!text) continue;
    out.push({
      offset: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 0) / 1000,
      text: decodeHtml(text),
    });
  }
  return out;
}

// ─── Collect all configured Gemini keys ────────────────────────────────────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  // Accept GEMINI_API_KEY, GEMINI_API_KEY_1..9, and any GEMINI*_API_KEY
  // variant (GEMINII_API_KEY, GEMINIII_API_KEY, ...).
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (/^GEMINI[I]*_API_KEY(_\d+)?$/i.test(name)) {
      const v = value.trim();
      if (v) keys.push(v);
    }
  }
  return [...new Set(keys)];
}


/**
 * Gemini natively understands YouTube video URLs.
 * It can watch the video and transcribe it directly — no audio download needed.
 * This works on edge servers as it is a single HTTP POST request.
 */
async function transcribeViaGemini(youtubeId: string, apiKey: string): Promise<TranscriptSegment[]> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  console.log(`[Transcript] Sending YouTube URL to Gemini for transcription: ${youtubeUrl}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Please transcribe ALL spoken words in this YouTube video accurately. " +
                  "Output ONLY a valid JSON array of objects. Each object must have exactly these keys: " +
                  "'offset' (start time in seconds as a number), " +
                  "'duration' (segment length in seconds as a number), " +
                  "'text' (the spoken words as a string). " +
                  "Do NOT wrap in markdown code blocks. Output raw JSON only.",
              },
              {
                fileData: {
                  mimeType: "video/mp4",
                  fileUri: youtubeUrl,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "text/plain",
        },
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

  const parsed = JSON.parse(cleanJson);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Gemini returned empty transcript array.");
  }

  return parsed.map((seg: Record<string, unknown>) => ({
    offset: Number(seg.offset) || 0,
    duration: Number(seg.duration) || 0,
    text: String(seg.text || "").trim(),
  }));
}

/**
 * Try transcribing via Gemini, rotating through all available API keys.
 */
async function transcribeViaGeminiWithRotation(youtubeId: string): Promise<TranscriptSegment[]> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error("No Gemini API keys configured for transcription.");

  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      console.log(`[Transcript] Trying Gemini key ${i + 1}/${keys.length} for video transcription`);
      return await transcribeViaGemini(youtubeId, keys[i]);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/quota|rate.?limit|RESOURCE_EXHAUSTED|429|403|invalid.?key/i.test(msg)) {
        console.warn(`[Transcript] Key ${i + 1} failed (quota/auth), trying next...`);
        continue;
      }
      console.warn(`[Transcript] Key ${i + 1} failed: ${msg}, trying next...`);
    }
  }
  throw lastError;
}

// ─── Groq Whisper fallback (audio download → STT) ─────────────────────────────
function getGroqKey(): string | undefined {
  for (const [name, value] of Object.entries(process.env)) {
    if (/^GROQ_API_KEY$/i.test(name) && value?.trim()) return value.trim();
  }
  return undefined;
}

// Public Piped instances that expose a JSON streams API with direct audio URLs.
// We try them in order — if one is down we move on.
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.r4fo.com",
];

type PipedAudioStream = { url: string; mimeType?: string; bitrate?: number };
type PipedStreams = { audioStreams?: PipedAudioStream[] };

async function fetchAudioUrl(youtubeId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const r = await fetch(`${base}/streams/${youtubeId}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const data = (await r.json()) as PipedStreams;
      const streams = (data.audioStreams ?? []).filter((s) => s.url);
      if (!streams.length) continue;
      // Pick the lowest-bitrate audio stream → smaller file, faster STT.
      streams.sort((a, b) => (a.bitrate ?? 1e9) - (b.bitrate ?? 1e9));
      return streams[0].url;
    } catch {
      continue;
    }
  }
  return null;
}

async function transcribeViaGroqWhisper(youtubeId: string): Promise<TranscriptSegment[]> {
  const groqKey = getGroqKey();
  if (!groqKey) throw new Error("No GROQ_API_KEY configured for Whisper fallback.");

  const audioUrl = await fetchAudioUrl(youtubeId);
  if (!audioUrl) throw new Error("Couldn't locate an audio stream for this video.");

  console.log(`[Transcript] Downloading audio for Whisper STT...`);
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(45_000) });
  if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);

  // Groq Whisper hard limit is 25MB. Bail out before buffering more.
  const contentLength = Number(audioRes.headers.get("content-length") ?? 0);
  if (contentLength > 24 * 1024 * 1024) {
    throw new Error("This video's audio is too large for Whisper transcription.");
  }
  const audioBlob = await audioRes.blob();
  if (audioBlob.size > 24 * 1024 * 1024) {
    throw new Error("This video's audio is too large for Whisper transcription.");
  }

  const form = new FormData();
  form.append("file", audioBlob, "audio.m4a");
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");

  console.log(`[Transcript] Sending ${(audioBlob.size / 1024 / 1024).toFixed(1)}MB to Groq Whisper...`);
  const stt = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!stt.ok) {
    const errBody = await stt.text();
    throw new Error(`Groq Whisper error ${stt.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await stt.json()) as {
    text?: string;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
  };

  if (data.segments?.length) {
    return data.segments
      .map((s) => ({
        offset: s.start ?? 0,
        duration: (s.end ?? 0) - (s.start ?? 0),
        text: (s.text ?? "").trim(),
      }))
      .filter((s) => s.text);
  }
  // Fallback: single big segment.
  if (data.text?.trim()) {
    return [{ offset: 0, duration: 0, text: data.text.trim() }];
  }
  throw new Error("Groq Whisper returned an empty transcript.");
}

// ─── Main fetchTranscript ──────────────────────────────────────────────────────

export async function fetchTranscript(youtubeId: string): Promise<TranscriptSegment[]> {
  // ── Step 1: Scrape caption tracks (manual + auto-generated, any language) ──
  try {
    const tracks = await listCaptionTracks(youtubeId);
    const track = pickTrack(tracks);
    if (track) {
      const segs = await fetchTrackSegments(track);
      if (segs.length) {
        console.log(`[Transcript] Found ${segs.length} caption segments via YouTube scrape`);
        return segs;
      }
    }
  } catch {
    // fall through
  }

  // ── Step 2: Legacy youtube-transcript library ──────────────────────────────
  try {
    const segments = await YoutubeTranscript.fetchTranscript(youtubeId);
    if (segments.length) {
      console.log(`[Transcript] Found ${segments.length} segments via youtube-transcript lib`);
      return segments.map((s: { offset?: number; duration?: number; text?: string }) => ({
        offset: typeof s.offset === "number" ? s.offset : 0,
        duration: typeof s.duration === "number" ? s.duration : 0,
        text: decodeHtml(s.text ?? ""),
      }));
    }
  } catch {
    // fall through
  }

  // ── Step 3: Gemini native YouTube transcription (no captions needed) ───────
  try {
    const segs = await transcribeViaGeminiWithRotation(youtubeId);
    if (segs.length) return segs;
  } catch (e) {
    console.warn(`[Transcript] Gemini transcription failed: ${e instanceof Error ? e.message : e}`);
  }

  // ── Step 4: Groq Whisper STT on the raw audio (final fallback) ─────────────
  console.log(`[Transcript] Falling back to Groq Whisper for ${youtubeId}...`);
  return await transcribeViaGroqWhisper(youtubeId);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function segmentsToRawText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const ms = typeof s.offset === "number" && s.offset > 100000 ? s.offset / 1000 : s.offset;
      return `[${formatTimestamp(ms)}] ${s.text}`;
    })
    .join("\n");
}
