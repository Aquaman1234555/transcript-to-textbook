import { generateText, type LanguageModel } from "ai";

export type AiModels = {
  /** Fast, cheap model for cleaning, concept maps, expansions. */
  fast: LanguageModel;
  /** Deep reasoning model for academic notes and AP-framework analysis. */
  deep: LanguageModel;
  /** Human-readable name of the active provider, for logs/diagnostics. */
  provider: "gemini" | "lovable";
};

/**
 * Resolve the AI models used across the app.
 *
 * Primary backend is Gemini accessed directly via `GEMINI_API_KEY`, which lets
 * us lean on Gemini's long context window. When that key is absent (e.g. the
 * Lovable-hosted deployment) we fall back to the Lovable AI gateway, which also
 * proxies Gemini models.
 */
export async function getAiModels(): Promise<AiModels> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    return {
      fast: google("gemini-2.5-flash"),
      deep: google("gemini-2.5-pro"),
      provider: "gemini",
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  if (lovableKey) {
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(lovableKey);
    return {
      fast: gateway("google/gemini-3-flash-preview"),
      deep: gateway("google/gemini-2.5-pro"),
      provider: "lovable",
    };
  }

  throw new Error("No AI provider configured. Set GEMINI_API_KEY (preferred) or LOVABLE_API_KEY.");
}

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b/i.test(msg);
}

export type LayerGenerator = {
  provider: AiModels["provider"];
  /** Generate with the fast model. */
  fast: (prompt: string) => Promise<string>;
  /**
   * Generate with the deep model, falling back to the fast model if the deep
   * model is unavailable due to quota (e.g. free-tier Gemini keys have no
   * `gemini-2.5-pro` quota).
   */
  deep: (prompt: string) => Promise<string>;
};

export async function createLayerGenerator(): Promise<LayerGenerator> {
  const { fast, deep, provider } = await getAiModels();
  const run = (model: LanguageModel, prompt: string) =>
    generateText({ model, prompt }).then((r) => r.text);
  return {
    provider,
    fast: (prompt) => run(fast, prompt),
    deep: async (prompt) => {
      try {
        return await run(deep, prompt);
      } catch (e) {
        if (isQuotaError(e) && deep !== fast) return run(fast, prompt);
        throw e;
      }
    },
  };
}
