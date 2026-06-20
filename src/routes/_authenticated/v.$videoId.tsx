import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/markdown-view";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ChatPanel } from "@/components/chat-panel";
import { getVideo, generateForVideo } from "@/lib/videos.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { UIMessage } from "ai";

export const Route = createFileRoute("/_authenticated/v/$videoId")({
  component: VideoPage,
});

function VideoPage() {
  const { videoId } = Route.useParams();
  const getV = useServerFn(getVideo);
  const generate = useServerFn(generateForVideo);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => getV({ data: { videoId } }),
    refetchInterval: (q) => {
      const status = q.state.data?.video?.status;
      return status === "pending" ? 3000 : false;
    },
  });

  const gen = useMutation({
    mutationFn: () => generate({ data: { videoId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["video", videoId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  // auto-kick generation when status is pending and notes are empty
  useEffect(() => {
    if (!data?.video) return;
    const hasNotes = !!data.notes?.notes_markdown;
    if (!hasNotes && data.video.status !== "failed" && !gen.isPending) {
      gen.mutate();
    }
  }, [data, gen]);

  const [chatMessages, setChatMessages] = useState<UIMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    setChatLoaded(false);
    supabase
      .from("chat_messages")
      .select("id, role, parts, created_at")
      .eq("video_id", videoId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!mounted) return;
        setChatMessages(
          (data ?? []).map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            parts: m.parts as UIMessage["parts"],
          })),
        );
        setChatLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [videoId]);

  if (isLoading || !data) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { video, transcript, notes } = data;
  const isGenerating = video.status === "pending" || gen.isPending;

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start">
        {video.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt={video.title ?? ""}
            className="aspect-video w-full max-w-xs rounded-lg object-cover ring-1 ring-border"
          />
        )}
        <div className="flex-1 space-y-2">
          <Link to="/library" className="text-xs text-muted-foreground hover:text-foreground">
            ← Library
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
          <p className="text-sm text-muted-foreground">{video.channel}</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button asChild size="sm" variant="outline">
              <a href={video.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" /> Watch on YouTube
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => gen.mutate()}
              disabled={gen.isPending}
            >
              {gen.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Regenerate
            </Button>
            {isGenerating && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-500">
                <Loader2 className="size-3 animate-spin" /> Generating notes…
              </span>
            )}
            {video.status === "failed" && video.error && (
              <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs text-destructive">
                {video.error}
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="notes" className="flex flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="obsidian">Obsidian</TabsTrigger>
          <TabsTrigger value="clean">Clean transcript</TabsTrigger>
          <TabsTrigger value="raw">Raw transcript</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4 min-h-[70vh]">
          {notes?.notes_markdown ? (
            <MarkdownEditor
              videoId={videoId}
              kind="notes"
              initial={notes.notes_markdown}
              filename={`${slug(video.title)}-notes.md`}
            />
          ) : (
            <Empty isGenerating={isGenerating} />
          )}
        </TabsContent>
        <TabsContent value="obsidian" className="mt-4 min-h-[70vh]">
          {notes?.obsidian_markdown ? (
            <MarkdownEditor
              videoId={videoId}
              kind="obsidian"
              initial={notes.obsidian_markdown}
              filename={`${slug(video.title)}.md`}
            />
          ) : (
            <Empty isGenerating={isGenerating} />
          )}
        </TabsContent>
        <TabsContent value="clean" className="mt-4 min-h-[70vh]">
          {transcript?.clean_markdown ? (
            <MarkdownEditor
              videoId={videoId}
              kind="clean"
              initial={transcript.clean_markdown}
              filename={`${slug(video.title)}-transcript.md`}
            />
          ) : (
            <Empty isGenerating={isGenerating} />
          )}
        </TabsContent>
        <TabsContent value="raw" className="mt-4 min-h-[70vh]">
          <div className="rounded-md border bg-card p-6">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90">
              {transcript?.raw_text ?? "No transcript available."}
            </pre>
          </div>
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <div className="h-[70vh] overflow-hidden rounded-md border bg-card">
            {chatLoaded ? (
              <ChatPanel videoId={videoId} initialMessages={chatMessages} />
            ) : (
              <div className="grid h-full place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Empty({ isGenerating }: { isGenerating: boolean }) {
  return (
    <div className="grid min-h-[40vh] place-items-center rounded-md border border-dashed bg-card/40 text-sm text-muted-foreground">
      {isGenerating ? (
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Generating…
        </div>
      ) : (
        "Nothing here yet."
      )}
    </div>
  );
}

function slug(s: string | null) {
  return (s ?? "notes")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
