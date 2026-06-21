import { generateText, type LanguageModel } from "ai";

export type AiModels = {
  fast: LanguageModel;
  deep: LanguageModel;
  provider: "gemini" | "lovable";
};

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.GEMINI_API_KEY?.trim();
  if (base) keys.push(base);
  for (let i = 1; i <= 9; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (key) keys.push(key);
  }
  return [...new Set(keys)];
}

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|payment|invalid.?auth|credential|\b429\b|\b403\b/i.test(msg);
}

export async function getAiModels(): Promise<AiModels> {
  const geminiKeys = getGeminiKeys();
  if (geminiKeys.length > 0) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: geminiKeys[0] });
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

  throw new Error("No AI provider configured. Set GEMINI_API_KEY_1 through GEMINI_API_KEY_9.");
}

async function runWithKey(
  modelName: "gemini-2.5-flash" | "gemini-2.5-pro",
  apiKey: string,
  prompt: string,
): Promise<string> {
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const google = createGoogleGenerativeAI({ apiKey });
  const { text } = await generateText({ model: google(modelName), prompt });
  return text;
}

async function runWithRotation(
  modelName: "gemini-2.5-flash" | "gemini-2.5-pro",
  prompt: string,
): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error("No Gemini API keys configured.");
  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      console.log(`[AI] Trying Gemini key ${i + 1}/${keys.length}`);
      return await runWithKey(modelName, keys[i], prompt);
    } catch (e) {
      lastError = e;
      if (isQuotaError(e)) {
        console.warn(`[AI] Key ${i + 1} quota exceeded, rotating to next key...`);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

export type LayerGenerator = {
  provider: AiModels["provider"];
  fast: (prompt: string) => Promise<string>;
  deep: (prompt: string) => Promise<string>;
};

export async function createLayerGenerator(): Promise<LayerGenerator> {
  const { provider } = await getAiModels();
  const geminiKeys = getGeminiKeys();

  if (geminiKeys.length > 0) {
    return {
      provider,
      fast: (prompt) => runWithRotation("gemini-2.5-flash", prompt),
      deep: async (prompt) => {
        try {
          return await runWithRotation("gemini-2.5-pro", prompt);
        } catch (e) {
          if (isQuotaError(e)) {
            console.warn("[AI] All keys exhausted for pro model, falling back to flash...");
            return runWithRotation("gemini-2.5-flash", prompt);
          }
          throw e;
        }
      },
    };
  }

  const { fast, deep } = await getAiModels();
  const run = (model: LanguageModel, prompt: string) =>
    generateText({ model, prompt }).then((r) => r.text);
  return {
    provider,
    fast: (prompt) => run(fast, prompt),
    deep: async (prompt) => {
      try {
        return await run(deep, prompt);
      } catch (e) {
        if (isQuotaError(e)) return run(fast, prompt);
        throw e;
      }
    },
  };
}
