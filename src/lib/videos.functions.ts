import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { z } from "zod";

const UrlInput = z.object({ url: z.string().min(1).max(500) });
const VideoIdInput = z.object({ videoId: z.string().uuid() });
const NOTE_KINDS = [
  "notes",
  "obsidian",
  "concept_map",
  "ap_analysis",
  "knowledge_expansion",
] as const;

const SaveInput = z.object({
  videoId: z.string().uuid(),
  kind: z.enum(["notes", "obsidian", "concept_map", "ap_analysis", "knowledge_expansion", "clean"]),
  content: z.string().max(500_000),
});

const NOTE_KIND_COLUMN = {
  notes: "notes_markdown",
  obsidian: "obsidian_markdown",
  concept_map: "concept_map_markdown",
  ap_analysis: "ap_analysis_markdown",
  knowledge_expansion: "knowledge_expansion_markdown",
} as const satisfies Record<(typeof NOTE_KINDS)[number], keyof TablesUpdate<"notes">>;

export const ingestVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UrlInput.parse(d))
  .handler(async ({ data, context }) => {
    const {
      extractYoutubeId,
      fetchOEmbed,
      fetchTranscript,
      segmentsToRawText,
    } = await import("./youtube.server");
    const youtubeId = extractYoutubeId(data.url);
    if (!youtubeId) throw new Error("That doesn't look like a YouTube URL.");

    const { data: existing } = await context.supabase
      .from("videos")
      .select("id")
      .eq("user_id", context.userId)
      .eq("youtube_id", youtubeId)
      .maybeSingle();
    if (existing) return { videoId: existing.id };

    const oembed = await fetchOEmbed(youtubeId);

    // fetchTranscript tries: (1) caption scrape, (2) youtube-transcript lib,
    // (3) Gemini native YouTube transcription — works for any public video.
    let segments: Awaited<ReturnType<typeof fetchTranscript>> = [];
    try {
      segments = await fetchTranscript(youtubeId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ingestVideo] transcript failed:", msg);
      if (/quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(msg)) {
        throw new Error("Transcription service is busy. Please try again in a minute.");
      }
      if (/private|members|age.?restrict|region|unavailable/i.test(msg)) {
        throw new Error(
          "Couldn't access this video. It may be private, members-only, age-restricted, or region-blocked.",
        );
      }
      throw new Error("Couldn't transcribe this video. Please try a different one.");
    }


    if (!segments.length) throw new Error("This video has no usable transcript.");

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
      .select(
        "notes_markdown, obsidian_markdown, concept_map_markdown, ap_analysis_markdown, knowledge_expansion_markdown, updated_at",
      )
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
      const patch: TablesUpdate<"notes"> = { [NOTE_KIND_COLUMN[data.kind]]: data.content };
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
    const { createLayerGenerator } = await import("./models.server");
    const {
      CLEAN_TRANSCRIPT_PROMPT,
      NOTES_PROMPT,
      CONCEPT_MAP_PROMPT,
      AP_ANALYSIS_PROMPT,
      KNOWLEDGE_EXPANSION_PROMPT,
    } = await import("./prompts.server");
    const { AP_FRAMEWORK_KNOWLEDGE } = await import("./ap-framework.server");

    const ai = await createLayerGenerator();

    const { data: video, error: vErr } = await context.supabase
      .from("videos")
      .select("id, title, status, user_id")
      .eq("id", data.videoId)
      .eq("user_id", context.userId)
      .single();
    if (vErr || !video) throw new Error("Video not found");
    await context.supabase
      .from("videos")
      .update({ status: "pending", error: null })
      .eq("id", video.id);

    const { data: transcript } = await context.supabase
      .from("transcripts")
      .select("raw_text")
      .eq("video_id", video.id)
      .single();
    if (!transcript?.raw_text) throw new Error("No transcript to process");

    // Gemini has a very large context window, so we can feed long transcripts.
    const rawCapped = transcript.raw_text.slice(0, 500_000);

    try {
      // Skip the separate "clean transcript" pre-pass — it doubled latency
      // for no real quality gain. Feed the raw transcript straight to the
      // notes generator; Gemini handles punctuation/translation inline.
      // Then run every derived layer in parallel on the fast model.
      const notesMd = await ai.fast(NOTES_PROMPT.replace("{TRANSCRIPT}", rawCapped));

      await context.supabase
        .from("notes")
        .update({ notes_markdown: notesMd })
        .eq("video_id", video.id);

      const [cleanMd, conceptMap, apAnalysis, knowledgeExpansion] = await Promise.all([
        ai.fast(CLEAN_TRANSCRIPT_PROMPT.replace("{TRANSCRIPT}", rawCapped)),
        ai.fast(CONCEPT_MAP_PROMPT.replace("{NOTES}", notesMd)),
        ai.deep(
          AP_ANALYSIS_PROMPT.replace("{FRAMEWORK}", AP_FRAMEWORK_KNOWLEDGE).replace(
            "{NOTES}",
            notesMd,
          ),
        ),
        ai.fast(KNOWLEDGE_EXPANSION_PROMPT.replace("{NOTES}", notesMd)),
      ]);

      await Promise.all([
        context.supabase
          .from("transcripts")
          .update({ clean_markdown: cleanMd })
          .eq("video_id", video.id),
        context.supabase
          .from("notes")
          .update({
            concept_map_markdown: conceptMap,
            ap_analysis_markdown: apAnalysis,
            knowledge_expansion_markdown: knowledgeExpansion,
          })
          .eq("video_id", video.id),
      ]);

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
