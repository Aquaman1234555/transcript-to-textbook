import { generateText, type LanguageModel } from "ai";
export type AiModels = {
  fast: LanguageModel;
  deep: LanguageModel;
  provider: "gemini" | "lovable";
};
// ─── Key Helpers ─────────────────────────────────────────────────────────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  // Accept GEMINI_API_KEY, GEMINI_API_KEY_1..9, and any GEMINI*_API_KEY
  // variant (GEMINII_API_KEY, GEMINIII_API_KEY, ...).
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (/^GEMINI[I]*_API_KEY(_\d+)?$/i.test(name)) {
      const v = value.trim();
      if (v) keys.push(v);
    }
  }
  return [...new Set(keys)];
}
function getGroqKey(): string | undefined {
  for (const [name, value] of Object.entries(process.env)) {
    if (/^GROQ_API_KEY$/i.test(name) && value?.trim()) return value.trim();
  }
  return undefined;
}

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|payment|invalid.?auth|credential|\b429\b|\b403\b/i.test(msg);
}
// ─── Gemini Runner ────────────────────────────────────────────────────────────
async function runGemini(
  modelName: "gemini-2.5-flash" | "gemini-2.5-pro",
  apiKey: string,
  prompt: string,
): Promise<string> {
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const google = createGoogleGenerativeAI({ apiKey });
  const { text } = await generateText({ model: google(modelName), prompt });
  return text;
}
async function runGeminiWithRotation(
  modelName: "gemini-2.5-flash" | "gemini-2.5-pro",
  prompt: string,
): Promise<string> {
  const keys = getGeminiKeys();
  let lastError: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      console.log(`[AI] Gemini key ${i + 1}/${keys.length} → ${modelName}`);
      return await runGemini(modelName, keys[i], prompt);
    } catch (e) {
      lastError = e;
      if (isQuotaError(e)) {
        console.warn(`[AI] Gemini key ${i + 1} quota exceeded, rotating...`);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
// ─── Groq Runner (FREE - 6000 req/day) ───────────────────────────────────────
async function runGroq(prompt: string, useFast: boolean): Promise<string> {
  const groqKey = getGroqKey();
  if (!groqKey) throw new Error("No GROQ_API_KEY configured.");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const groq = createOpenAICompatible({
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: groqKey,
  });
  // Fast: llama-3.1-8b-instant | Deep: llama-3.3-70b-versatile
  const model = useFast ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
  console.log(`[AI] Groq fallback → ${model}`);
  const { text } = await generateText({ model: groq(model), prompt });
  return text;
}
// ─── DeepSeek Runner (FREE $2 credits on signup) ─────────────────────────────
async function runDeepSeek(prompt: string, useFast: boolean): Promise<string> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!deepseekKey) throw new Error("No DEEPSEEK_API_KEY configured.");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const deepseek = createOpenAICompatible({
    name: "deepseek",
    baseURL: "https://api.deepseek.com",
    apiKey: deepseekKey,
  });
  // Fast: deepseek-chat (V3) | Deep: deepseek-reasoner (R1)
  const model = useFast ? "deepseek-chat" : "deepseek-reasoner";
  console.log(`[AI] DeepSeek fallback → ${model}`);
  const { text } = await generateText({ model: deepseek(model), prompt });
  return text;
}
// ─── Master Runner with full provider chain ───────────────────────────────────
async function runWithProviderChain(prompt: string, useFast: boolean): Promise<string> {
  const geminiModel = useFast ? "gemini-2.5-flash" : "gemini-2.5-pro";
  // 1️⃣ Try all Gemini keys first
  const geminiKeys = getGeminiKeys();
  if (geminiKeys.length > 0) {
    try {
      return await runGeminiWithRotation(geminiModel, prompt);
    } catch (e) {
      if (isQuotaError(e)) {
        console.warn("[AI] All Gemini keys exhausted. Trying Groq...");
      } else {
        throw e;
      }
    }
  }
  // 2️⃣ Try Groq (free)
  if (getGroqKey()) {
    try {
      return await runGroq(prompt, useFast);
    } catch (e) {
      if (isQuotaError(e)) {
        console.warn("[AI] Groq quota exceeded. Trying DeepSeek...");
      } else {
        console.warn("[AI] Groq failed. Trying DeepSeek...", e);
      }
    }
  }
  // 3️⃣ Try DeepSeek (free credits)
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    try {
      return await runDeepSeek(prompt, useFast);
    } catch (e) {
      console.warn("[AI] DeepSeek failed.", e);
    }
  }
  // 4️⃣ Lovable gateway as final fallback
  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  if (lovableKey) {
    console.warn("[AI] All free providers exhausted. Using Lovable gateway...");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = useFast
      ? gateway("google/gemini-3-flash-preview")
      : gateway("google/gemini-2.5-pro");
    const { text } = await generateText({ model, prompt });
    return text;
  }
  throw new Error(
    "All AI providers exhausted or unconfigured. Add GEMINI_API_KEY_1, GROQ_API_KEY, or DEEPSEEK_API_KEY in Lovable secrets.",
  );
}
// ─── Public API ───────────────────────────────────────────────────────────────
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
  throw new Error("No AI provider configured.");
}
export type LayerGenerator = {
  provider: AiModels["provider"];
  fast: (prompt: string) => Promise<string>;
  deep: (prompt: string) => Promise<string>;
};
export async function createLayerGenerator(): Promise<LayerGenerator> {
  const { provider } = await getAiModels();
  return {
    provider,
    fast: (prompt) => runWithProviderChain(prompt, true),
    deep: (prompt) => runWithProviderChain(prompt, false),
  };
}
