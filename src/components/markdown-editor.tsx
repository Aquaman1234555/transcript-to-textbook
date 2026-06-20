import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "./markdown-view";
import { saveContent } from "@/lib/videos.functions";
import { Loader2, Download, Check } from "lucide-react";
import { toast } from "sonner";

type Kind = "notes" | "obsidian" | "concept_map" | "ap_analysis" | "knowledge_expansion" | "clean";

export function MarkdownEditor({
  videoId,
  kind,
  initial,
  filename,
}: {
  videoId: string;
  kind: Kind;
  initial: string;
  filename: string;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const save = useServerFn(saveContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  useEffect(() => {
    setValue(initial);
    lastSaved.current = initial;
  }, [initial, videoId, kind]);

  useEffect(() => {
    if (value === lastSaved.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await save({ data: { videoId, kind, content: value } });
        lastSaved.current = value;
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        setStatus("idle");
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, save, videoId, kind]);

  function download() {
    const blob = new Blob([value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {status === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          )}
          {status === "saved" && (
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <Check className="size-3" /> Saved
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="size-3.5" /> Download .md
        </Button>
      </div>

      <Tabs defaultValue="preview" className="flex flex-1 flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="split">Split</TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="flex-1 overflow-auto rounded-md border bg-card p-6">
          <MarkdownView content={value} />
        </TabsContent>
        <TabsContent value="edit" className="flex-1">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-full min-h-[500px] resize-none font-mono text-sm"
          />
        </TabsContent>
        <TabsContent value="split" className="flex-1">
          <div className="grid h-full grid-cols-2 gap-3">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-full min-h-[500px] resize-none font-mono text-sm"
            />
            <div className="h-full overflow-auto rounded-md border bg-card p-4">
              <MarkdownView content={value} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
