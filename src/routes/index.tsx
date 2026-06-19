import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ingestVideo } from "@/lib/videos.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Youtube, Sparkles, FileText, Boxes, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scriba — Turn YouTube lectures into study notes" },
      {
        name: "description",
        content:
          "Paste any YouTube URL and get a clean transcript, detailed AI study notes, Obsidian export, and a tutor that knows the video.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const ingest = useServerFn(ingestVideo);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    if (!signedIn) {
      navigate({ to: "/auth", search: { redirect: "/" } });
      return;
    }
    setLoading(true);
    try {
      const { videoId } = await ingest({ data: { url: url.trim() } });
      navigate({ to: "/v/$videoId", params: { videoId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't process that video");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              S
            </span>
            Scriba
          </Link>
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/library">My Library</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-24 pb-16">
        <div className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3 text-primary" />
            Textbook-quality notes from any lecture
          </div>
          <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-6xl">
            Paste a YouTube URL.
            <br />
            <span className="text-primary">Get a study guide.</span>
          </h1>
          <p className="mx-auto max-w-xl text-pretty text-base text-muted-foreground">
            Scriba turns long videos into clean transcripts, deep AI notes, and Obsidian-ready
            markdown — then lets you ask the video questions.
          </p>
        </div>

        <form onSubmit={submit} className="mx-auto mt-10 flex max-w-2xl gap-2">
          <div className="relative flex-1">
            <Youtube className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="h-12 pl-10 text-base"
            />
          </div>
          <Button type="submit" size="lg" disabled={loading} className="h-12 px-6">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Generate"}
          </Button>
        </form>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Works with any YouTube video that has captions enabled.
        </p>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileText, title: "Clean transcript", desc: "Punctuation, paragraphs, speakers." },
            { icon: Sparkles, title: "Detailed notes", desc: "Textbook depth, not a summary." },
            { icon: Boxes, title: "Obsidian export", desc: "Tags, wikilinks, callouts, mermaid." },
            { icon: MessageSquare, title: "Chat with video", desc: "Quizzes, flashcards, deep dives." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-4">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-3 text-sm font-medium">{f.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
