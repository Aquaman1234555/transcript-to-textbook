import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

let initialized = false;

/**
 * Renders a Mermaid diagram on the client. During SSR (and before hydration) it
 * shows the raw definition so the content is never lost.
 */
export function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
            fontFamily: "inherit",
          });
          initialized = true;
        }
        const { svg } = await mermaid.render(`mermaid-${id}`, chart.trim());
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render diagram");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="my-4 space-y-2">
        <p className="text-xs text-destructive">Couldn&apos;t render diagram: {error}</p>
        <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{chart}</pre>
      </div>
    );
  }

  if (svg) {
    return (
      <div
        ref={containerRef}
        className={cn("mermaid-diagram my-4 flex justify-center overflow-auto", className)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <pre className={cn("my-4 overflow-auto rounded-md bg-muted p-3 text-xs", className)}>
      {chart}
    </pre>
  );
}
