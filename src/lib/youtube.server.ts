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
  // Force JSON3 for easier parsing
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

export async function fetchTranscript(youtubeId: string): Promise<TranscriptSegment[]> {
  // Primary: scrape any available caption track (manual or auto-generated, any language).
  try {
    const tracks = await listCaptionTracks(youtubeId);
    const track = pickTrack(tracks);
    if (track) {
      const segs = await fetchTrackSegments(track);
      if (segs.length) return segs;
    }
  } catch {
    // fall through to legacy lib
  }
  // Fallback: legacy library (helps for some edge cases).
  const segments = await YoutubeTranscript.fetchTranscript(youtubeId);
  return segments.map((s: { offset?: number; duration?: number; text?: string }) => ({
    offset: typeof s.offset === "number" ? s.offset : 0,
    duration: typeof s.duration === "number" ? s.duration : 0,
    text: decodeHtml(s.text ?? ""),
  }));
}

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
