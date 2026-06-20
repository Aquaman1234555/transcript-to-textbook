import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const UrlInput = z.object({ url: z.string().min(1).max(500) });
const VideoIdInput = z.object({ videoId: z.string().uuid() });
const SaveInput = z.object({
  videoId: z.string().uuid(),
  kind: z.enum(["notes", "obsidian", "clean"]),
  content: z.string().max(500_000),
});

export const ingestVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UrlInput.parse(d))
  .handler(async ({ data, context }) => {
    const { extractYoutubeId, fetchOEmbed, fetchTranscript, segmentsToRawText } = await import(
      "./youtube.server"
    );
    const youtubeId = extractYoutubeId(data.url);
    if (!youtubeId) throw new Error("That doesn't look like a YouTube URL.");

    // dedupe per user
    const { data: existing } = await context.supabase
      .from("videos")
      .select("id")
      .eq("user_id", context.userId)
      .eq("youtube_id", youtubeId)
      .maybeSingle();
    if (existing) return { videoId: existing.id };

    const oembed = await fetchOEmbed(youtubeId);

    let segments;
    try {
      segments = await fetchTranscript(youtubeId);
    } catch {
      throw new Error(
        "Couldn't fetch captions for this video. Captions may be disabled by the creator. (Audio transcription is on the roadmap.)",
      );
    }
    if (!segments.length) throw new Error("This video has no captions available.");

    const rawText = segmentsToRawText(segments);

    const { data: video, error } = await context.supabase
      .from("videos")
      .insert({
        user_id: context.userId,
        youtube_id: youtubeId,
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
        title: oembed?.title ?? "Untitled video",
        channel: oembed?.author_name ?? null,
        thumbnail_url: oembed?.thumbnail_url ?? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !video) throw new Error(error?.message ?? "Failed to create video");

    const { error: tErr } = await context.supabase.from("transcripts").insert({
      video_id: video.id,
      raw_text: rawText,
      raw_segments: segments,
    });
    if (tErr) throw new Error(tErr.message);

    await context.supabase
      .from("notes")
      .insert({ video_id: video.id, notes_markdown: "", obsidian_markdown: "" });

    return { videoId: video.id };
  });

export const listVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("videos")
      .select("id, youtube_id, title, channel, thumbnail_url, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: video, error } = await context.supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .eq("user_id", context.userId)
      .single();
    if (error || !video) throw new Error("Video not found");

    const { data: transcript } = await context.supabase
      .from("transcripts")
      .select("raw_text, clean_markdown")
      .eq("video_id", video.id)
      .maybeSingle();
    const { data: notes } = await context.supabase
      .from("notes")
      .select("notes_markdown, obsidian_markdown, updated_at")
      .eq("video_id", video.id)
      .maybeSingle();

    return { video, transcript, notes };
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("videos")
      .delete()
      .eq("id", data.videoId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.kind === "clean") {
      const { error } = await context.supabase
        .from("transcripts")
        .update({ clean_markdown: data.content })
        .eq("video_id", data.videoId);
      if (error) throw new Error(error.message);
    } else {
      const patch =
        data.kind === "notes"
          ? { notes_markdown: data.content }
          : { obsidian_markdown: data.content };
      const { error } = await context.supabase
        .from("notes")
        .update(patch)
        .eq("video_id", data.videoId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const generateForVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VideoIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { CLEAN_TRANSCRIPT_PROMPT, NOTES_PROMPT, OBSIDIAN_PROMPT } = await import(
      "./prompts.server"
    );

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: video, error: vErr } = await context.supabase
      .from("videos")
      .select("id, title, status, user_id")
      .eq("id", data.videoId)
      .eq("user_id", context.userId)
      .single();
    if (vErr || !video) throw new Error("Video not found");
    await context.supabase.from("videos").update({ status: "pending", error: null }).eq("id", video.id);

    const { data: transcript } = await context.supabase
      .from("transcripts")
      .select("raw_text")
      .eq("video_id", video.id)
      .single();
    if (!transcript?.raw_text) throw new Error("No transcript to process");

    // cap to ~120k chars to stay within model limits
    const rawCapped = transcript.raw_text.slice(0, 120_000);

    const gateway = createLovableAiGatewayProvider(key);
    const fastModel = gateway("google/gemini-3-flash-preview");
    const deepModel = gateway("google/gemini-2.5-pro");

    try {
      // 1. clean transcript
      const cleanRes = await generateText({
        model: fastModel,
        prompt: CLEAN_TRANSCRIPT_PROMPT.replace("{TRANSCRIPT}", rawCapped),
      });
      const cleanMd = cleanRes.text;
      await context.supabase
        .from("transcripts")
        .update({ clean_markdown: cleanMd })
        .eq("video_id", video.id);

      // 2. detailed notes (uses clean transcript if shorter)
      const notesSource = cleanMd.length < rawCapped.length ? cleanMd : rawCapped;
      const notesRes = await generateText({
        model: deepModel,
        prompt: NOTES_PROMPT.replace("{TRANSCRIPT}", notesSource),
      });
      const notesMd = notesRes.text;

      // 3. obsidian variant
      const obsRes = await generateText({
        model: fastModel,
        prompt: OBSIDIAN_PROMPT.replace("{NOTES}", notesMd),
      });
      const obsidianMd = obsRes.text;

      await context.supabase
        .from("notes")
        .update({ notes_markdown: notesMd, obsidian_markdown: obsidianMd })
        .eq("video_id", video.id);

      await context.supabase
        .from("videos")
        .update({ status: "ready", error: null })
        .eq("id", video.id);

      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      await context.supabase
        .from("videos")
        .update({ status: "failed", error: msg })
        .eq("id", video.id);
      throw e;
    }
  });
