import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { chatSystemPrompt } from "@/lib/prompts.server";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);
        const body = (await request.json()) as { videoId?: string; messages?: UIMessage[] };
        if (!body.videoId || !Array.isArray(body.messages)) {
          return new Response("Bad request", { status: 400 });
        }

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          },
        );

        const { data: userResp, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userResp.user) return new Response("Unauthorized", { status: 401 });

        const { data: video } = await supabase
          .from("videos")
          .select("id, title")
          .eq("id", body.videoId)
          .single();
        if (!video) return new Response("Not found", { status: 404 });

        const [{ data: t }, { data: n }] = await Promise.all([
          supabase.from("transcripts").select("clean_markdown, raw_text").eq("video_id", video.id).single(),
          supabase.from("notes").select("notes_markdown").eq("video_id", video.id).single(),
        ]);

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const transcriptText = (t?.clean_markdown || t?.raw_text || "").slice(0, 100_000);
        const notesText = (n?.notes_markdown || "").slice(0, 60_000);
        const system = chatSystemPrompt(video.title ?? "Untitled", transcriptText, notesText);

        const messages = body.messages;
        const userMsg = messages[messages.length - 1];
        if (userMsg?.role === "user") {
          await supabase
            .from("chat_messages")
            .insert({ video_id: video.id, role: "user", parts: userMsg.parts as unknown as object });
        }

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finished }) => {
            const last = finished[finished.length - 1];
            if (last?.role === "assistant") {
              await supabase
                .from("chat_messages")
                .insert({ video_id: video.id, role: "assistant", parts: last.parts as unknown as object });
            }
          },
        });
      },
    },
  },
});
