import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "./markdown-view";
import { Send, Loader2, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "Explain this video in simpler language.",
  "Create 10 flashcards from this video.",
  "Generate 5 multiple-choice questions with answers.",
  "Create a 1-page revision sheet.",
];

export function ChatPanel({ videoId, initialMessages }: { videoId: string; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const transport = new DefaultChatTransport({
    api: "/api/chat",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: { videoId },
  });

  const { messages, sendMessage, status } = useChat({
    id: videoId,
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  async function submit() {
    const text = input.trim();
    if (!text || busy || !token) return;
    setInput("");
    await sendMessage({ text });
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask anything about this video. The AI has the full transcript and notes as context.
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage({ text: s })}
                  disabled={!token}
                  className="rounded-md border bg-card px-3 py-2 text-left text-sm transition hover:bg-accent disabled:opacity-50"
                >
                  <Sparkles className="mr-2 inline size-3.5 text-primary" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground"
                    : "max-w-[95%] rounded-2xl rounded-bl-sm bg-card px-4 py-3 ring-1 ring-border"
                }
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm">{text}</p>
                ) : (
                  <MarkdownView content={text} className="prose-sm" />
                )}
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>
      <div className="border-t bg-background p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about this video…"
            className="max-h-32 min-h-[44px] resize-none"
            disabled={!token}
          />
          <Button onClick={submit} disabled={busy || !input.trim() || !token} size="icon">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
