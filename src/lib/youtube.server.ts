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

export async function fetchTranscript(youtubeId: string): Promise<TranscriptSegment[]> {
  const segments = await YoutubeTranscript.fetchTranscript(youtubeId);
  return segments.map((s: { offset?: number; duration?: number; text?: string }) => ({
    offset: typeof s.offset === "number" ? s.offset : 0,
    duration: typeof s.duration === "number" ? s.duration : 0,
    text: (s.text ?? "").replace(/&amp;#39;/g, "'").replace(/&amp;/g, "&"),
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
