import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ingestVideo, listVideos, deleteVideo } from "@/lib/videos.functions";
import { toast } from "sonner";
import { Loader2, Trash2, Youtube } from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const list = useServerFn(listVideos);
  const ingest = useServerFn(ingestVideo);
  const del = useServerFn(deleteVideo);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: videos } = useQuery({
    queryKey: ["videos"],
    queryFn: () => list(),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      const { videoId } = await ingest({ data: { url: url.trim() } });
      qc.invalidateQueries({ queryKey: ["videos"] });
      navigate({ to: "/v/$videoId", params: { videoId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this video and its notes?")) return;
    try {
      await del({ data: { videoId: id } });
      qc.invalidateQueries({ queryKey: ["videos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your library</h1>
          <p className="text-sm text-muted-foreground">
            Paste a YouTube link to generate notes, or open a previous one.
          </p>
        </div>

        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="h-11 pl-10"
            />
          </div>
          <Button type="submit" disabled={loading} className="h-11 px-5">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Generate"}
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos?.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed bg-card/40 py-16 text-center text-sm text-muted-foreground">
              No videos yet. Paste one above to start.
            </div>
          )}
          {videos?.map((v) => (
            <div key={v.id} className="group relative overflow-hidden rounded-xl border bg-card">
              <Link
                to="/v/$videoId"
                params={{ videoId: v.id }}
                className="block"
              >
                {v.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumbnail_url}
                    alt={v.title ?? "thumbnail"}
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={v.status} />
                    <span className="text-xs text-muted-foreground">{v.channel}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-medium">{v.title ?? "Untitled"}</h3>
                </div>
              </Link>
              <button
                onClick={() => remove(v.id)}
                className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-500",
    ready: "bg-emerald-500/15 text-emerald-500",
    failed: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
