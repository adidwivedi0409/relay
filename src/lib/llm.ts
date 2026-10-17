// ─────────────────────────────────────────────────────────────────────────────
// Relay — model adapter. Server-only (reads process.env). One small surface:
//   complete()         chat completion across wally / anthropic / openai
//   completeJson()     complete() + extractJson() with one repair pass
//   describeProvider() which provider/model the agents will use
//   verifyProvider()   cheap liveness check (GET /v1/models etc.), cached 60s
//   extractJson()      tolerant JSON extraction from model text
//   parseFiles()       <<<FILE path>>> ... <<<END FILE>>> block parser
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ArtifactFile } from "@/lib/types";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  ms: number;
  usage?: { input?: number; output?: number };
  /** "length" when the model hit maxTokens; callers use this to detect truncation. */
  finishReason?: "stop" | "length" | "other";
}

/** Everything in an LlmResult except the text — what agents hand back to the orchestrator. */
export type LlmMeta = Omit<LlmResult, "text">;

export interface CompleteOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  label?: string;
  /** Per-request timeout. Defaults to 60s. Long builder outputs pass a larger value. */
  timeoutMs?: number;
  /** Override the provider's default model id for this call (e.g. a faster coder model for the Builder). */
  model?: string;
  /** Let reasoning models think (slow). Default false: Relay agents are latency-bound. */
  reasoning?: boolean;
}

export type ProviderName = "wally" | "anthropic" | "openai";

export const NO_PROVIDER_MESSAGE =
  "No model provider configured. Set RUNANYWHERE_API_KEY (Wally) or ANTHROPIC_API_KEY/OPENAI_API_KEY in .env.local";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 2048;
const JSON_SYSTEM_SUFFIX = "Respond with a single JSON object and nothing else.";

const WALLY_DEFAULT_BASE_URL = "https://inference.runanywhere.ai/v1";
const WALLY_DEFAULT_MODEL = "glm-5.3-flash";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
const OPENAI_DEFAULT_MODEL = "gpt-5.2-mini";

// ── module state (survives HMR via globalThis) ──────────────────────────────

interface LlmState {
  clients: Map<string, OpenAI | Anthropic>;
  /** Wally model id actually served, once GET /v1/models has been consulted. */
  wallyResolvedModel: string | null;
  wallyResolution: Promise<string> | null;
  wallyLoggedSubstitution: boolean;
  /** Providers whose API rejected response_format json_object; we stop sending it. */
  jsonModeUnsupported: Set<string>;
  /** Providers that want max_completion_tokens instead of max_tokens (or vice versa). */
  tokenParam: Map<string, "max_tokens" | "max_completion_tokens">;
  /** Providers whose API rejected the GLM-style `thinking` control. */
  thinkingUnsupported: Set<string>;
  /** Providers that rejected a temperature value; we stop sending it. */
  temperatureUnsupported: Set<string>;
  verifyCache: { at: number; key: string; value: VerifyResult } | null;
  verifyInflight: Promise<VerifyResult> | null;
}

const g = globalThis as unknown as { __relayLlm?: LlmState };
const state: LlmState =
  g.__relayLlm ??
  (g.__relayLlm = {
    clients: new Map(),
    wallyResolvedModel: null,
    wallyResolution: null,
    wallyLoggedSubstitution: false,
    jsonModeUnsupported: new Set(),
    tokenParam: new Map(), thinkingUnsupported: new Set(),
    temperatureUnsupported: new Set(),
    verifyCache: null,
    verifyInflight: null,
  });

// ── provider configuration ─────────────────────────────────────────────────

function env(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  baseURL: string | null;
  model: string;
}

function providerConfig(name: ProviderName): ProviderConfig | null {
  switch (name) {
    case "wally": {
      const apiKey = env("RUNANYWHERE_API_KEY");
      if (!apiKey) return null;
      return {
        name,
        apiKey,
        baseURL: env("WALLY_BASE_URL") ?? WALLY_DEFAULT_BASE_URL,
        model: state.wallyResolvedModel ?? env("WALLY_MODEL") ?? WALLY_DEFAULT_MODEL,
      };
    }
    case "anthropic": {
      const apiKey = env("ANTHROPIC_API_KEY");
      if (!apiKey) return null;
      return { name, apiKey, baseURL: env("ANTHROPIC_BASE_URL"), model: env("ANTHROPIC_MODEL") ?? ANTHROPIC_DEFAULT_MODEL };
    }
    case "openai": {
      const apiKey = env("OPENAI_API_KEY");
      if (!apiKey) return null;
      return { name, apiKey, baseURL: env("OPENAI_BASE_URL"), model: env("OPENAI_MODEL") ?? OPENAI_DEFAULT_MODEL };
    }
  }
}

const DEFAULT_ORDER: ProviderName[] = ["wally", "anthropic", "openai"];

/**
 * Providers to try, in order. RELAY_LLM_PROVIDER moves the forced provider to the
 * front; any other configured provider stays behind it as a fallback (fallbacks are
 * always tagged in result.provider, never silent).
 */
function providerOrder(): ProviderConfig[] {
  const forced = env("RELAY_LLM_PROVIDER")?.toLowerCase() ?? null;
  const names: ProviderName[] = [];
  if (forced && (DEFAULT_ORDER as string[]).includes(forced)) names.push(forced as ProviderName);
  else if (forced) console.warn(`[llm] RELAY_LLM_PROVIDER="${forced}" is not one of wally|anthropic|openai; ignoring`);
  for (const n of DEFAULT_ORDER) if (!names.includes(n)) names.push(n);
  return names.map(providerConfig).filter((c): c is ProviderConfig => c !== null);
}

function openaiClient(cfg: ProviderConfig): OpenAI {
  const key = `${cfg.name}:${cfg.baseURL ?? "default"}:${cfg.apiKey.slice(-6)}`;
  const cached = state.clients.get(key);
  if (cached instanceof OpenAI) return cached;
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL ?? undefined,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 0, // we do our own single retry so the budget stays predictable
  });
  state.clients.set(key, client);
  return client;
}

function anthropicClient(cfg: ProviderConfig): Anthropic {
  const key = `${cfg.name}:${cfg.baseURL ?? "default"}:${cfg.apiKey.slice(-6)}`;
  const cached = state.clients.get(key);
  if (cached instanceof Anthropic) return cached;
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL ?? undefined,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
  state.clients.set(key, client);
  return client;
}

// ── public: describe / verify ──────────────────────────────────────────────

export function describeProvider(): { provider: string; model: string; configured: boolean } {
  const [primary] = providerOrder();
  if (!primary) return { provider: "none", model: "none", configured: false };
  return { provider: primary.name, model: primary.model, configured: true };
}

export interface VerifyResult {
  ok: boolean;
  provider: string;
  model: string;
  detail: string;
}

/**
 * Wally: GET /v1/models. If the configured model is not served, pick the first
 * listed id, remember it for every later call, and log the substitution once.
 */
async function resolveWallyModel(cfg: ProviderConfig): Promise<string> {
  if (state.wallyResolvedModel) return state.wallyResolvedModel;
  if (state.wallyResolution) return state.wallyResolution;
  const wanted = env("WALLY_MODEL") ?? WALLY_DEFAULT_MODEL;
  state.wallyResolution = (async () => {
    const client = openaiClient(cfg);
    const page = await client.models.list({ timeout: 15_000 });
    const ids = page.data.map((m) => m.id).filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) throw new Error(`Wally returned an empty model list from ${cfg.baseURL}/models`);
    const chosen = ids.includes(wanted) ? wanted : ids[0];
    if (chosen !== wanted && !state.wallyLoggedSubstitution) {
      state.wallyLoggedSubstitution = true;
      console.warn(`[llm] Wally does not serve "${wanted}"; using "${chosen}" (available: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? ", ..." : ""})`);
    }
    state.wallyResolvedModel = chosen;
    return chosen;
  })();
  try {
    return await state.wallyResolution;
  } finally {
    state.wallyResolution = null;
  }
}

async function doVerify(): Promise<VerifyResult> {
  const [primary] = providerOrder();
  if (!primary) return { ok: false, provider: "none", model: "none", detail: NO_PROVIDER_MESSAGE };
  try {
    switch (primary.name) {
      case "wally": {
        const wanted = env("WALLY_MODEL") ?? WALLY_DEFAULT_MODEL;
        const model = await resolveWallyModel(primary);
        const detail =
          model === wanted
            ? `GET ${primary.baseURL}/models lists "${model}"`
            : `GET ${primary.baseURL}/models does not list "${wanted}"; using first available "${model}"`;
        return { ok: true, provider: "wally", model, detail };
      }
      case "anthropic": {
        const info = await anthropicClient(primary).models.retrieve(primary.model, undefined, { timeout: 15_000 });
        return { ok: true, provider: "anthropic", model: primary.model, detail: `GET /v1/models/${primary.model} ok (${info.display_name})` };
      }
      case "openai": {
        const info = await openaiClient(primary).models.retrieve(primary.model, { timeout: 15_000 });
        return { ok: true, provider: "openai", model: primary.model, detail: `GET /v1/models/${primary.model} ok (owned by ${info.owned_by})` };
      }
    }
  } catch (err) {
    return { ok: false, provider: primary.name, model: primary.model, detail: `${primary.name} check failed: ${errorMessage(err)}` };
  }
}

/** Cheap provider check, cached for 60s and de-duplicated while in flight. */
export async function verifyProvider(): Promise<VerifyResult> {
  const key = providerOrder().map((c) => `${c.name}:${c.model}`).join("|");
  const cached = state.verifyCache;
  if (cached && cached.key === key && Date.now() - cached.at < 60_000) return cached.value;
  if (state.verifyInflight) return state.verifyInflight;
  state.verifyInflight = doVerify()
    .then((value) => {
      state.verifyCache = { at: Date.now(), key, value };
      return value;
    })
    .finally(() => {
      state.verifyInflight = null;
    });
  return state.verifyInflight;
}

// ── public: complete ───────────────────────────────────────────────────────

export async function complete(opts: CompleteOptions): Promise<LlmResult> {
  const providers = providerOrder();
  if (providers.length === 0) throw new Error(NO_PROVIDER_MESSAGE);

  const messages = opts.json ? withJsonInstruction(opts.messages) : opts.messages;
  const failures: string[] = [];

  for (let i = 0; i < providers.length; i++) {
    const cfg = providers[i];
    const label = opts.label ?? "call";
    try {
      const result = await withRetry(() => callProvider(cfg, { ...opts, messages }), `${label}@${cfg.name}`);
      if (i > 0) console.warn(`[llm] ${label}: fell back to ${cfg.name}/${result.model} after ${failures.join("; ")}`);
      console.log(
        `[llm] ${label} via ${result.provider}/${result.model} ${result.ms}ms` +
          (result.usage ? ` in=${result.usage.input ?? "?"} out=${result.usage.output ?? "?"}` : "") +
          (result.finishReason === "length" ? " (truncated)" : ""),
      );
      return result;
    } catch (err) {
      const msg = errorMessage(err);
      failures.push(`${cfg.name}: ${msg}`);
      const next = providers[i + 1];
      if (next) console.warn(`[llm] ${label}: ${cfg.name} failed (${msg}); trying ${next.name}`);
    }
  }
  throw new Error(`All model providers failed — ${failures.join(" | ")}`);
}

/**
 * complete() with json:true, parsed by extractJson(). If the first answer is not
 * parseable, asks the same provider once more to re-emit valid JSON.
 */
export async function completeJson(opts: CompleteOptions): Promise<{ value: unknown; result: LlmResult }> {
  const first = await complete({ ...opts, json: true });
  try {
    return { value: extractJson(first.text), result: first };
  } catch (err) {
    const reason = errorMessage(err);
    console.warn(`[llm] ${opts.label ?? "json"}: unparseable JSON (${reason}); asking for a repair`);
    const repairMessages: ChatMessage[] = [
      ...opts.messages,
      { role: "assistant", content: first.text.slice(0, 16_000) },
      {
        role: "user",
        content: `That reply was not valid JSON (${reason}). Send the same answer again as one valid JSON object only: no prose before or after, no code fences, no trailing commas, no comments.`,
      },
    ];
    const second = await complete({ ...opts, messages: repairMessages, json: true, label: `${opts.label ?? "json"}:repair` });
    return { value: extractJson(second.text), result: { ...second, ms: first.ms + second.ms } };
  }
}

function withJsonInstruction(messages: ChatMessage[]): ChatMessage[] {
  const idx = messages.findIndex((m) => m.role === "system");
  if (idx === -1) return [{ role: "system", content: JSON_SYSTEM_SUFFIX }, ...messages];
  return messages.map((m, i) => (i === idx ? { ...m, content: `${m.content.trimEnd()}\n\n${JSON_SYSTEM_SUFFIX}` } : m));
}

// ── provider calls ─────────────────────────────────────────────────────────

async function callProvider(cfg: ProviderConfig, opts: CompleteOptions): Promise<LlmResult> {
  if (cfg.name === "anthropic") return callAnthropic(cfg, opts);
  if (cfg.name === "wally" && !state.wallyResolvedModel) {
    try {
      cfg = { ...cfg, model: await resolveWallyModel(cfg) };
    } catch (err) {
      console.warn(`[llm] could not list Wally models (${errorMessage(err)}); using configured model "${cfg.model}"`);
    }
  }
  return callOpenAiCompatible(cfg, opts);
}

async function callOpenAiCompatible(cfg: ProviderConfig, opts: CompleteOptions): Promise<LlmResult> {
  const client = openaiClient(cfg);
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  // Native OpenAI's current models only accept max_completion_tokens; most
  // OpenAI-compatible servers only accept max_tokens. Learn per provider on 400.
  let tokenParam = state.tokenParam.get(cfg.name) ?? (cfg.name === "openai" ? "max_completion_tokens" : "max_tokens");
  let useJsonMode = !!opts.json && !state.jsonModeUnsupported.has(cfg.name);
  let sendTemperature = opts.temperature !== undefined && !state.temperatureUnsupported.has(cfg.name);
  // Wally (GLM/DeepSeek/MiMo) models reason for minutes before emitting code unless told not to:
  // measured 109s to first token with thinking on vs ~1s with it off. Disable unless the caller opts in.
  const thinkingUnsupported = (state.thinkingUnsupported ??= new Set<string>()); // state may predate this field across HMR
  let sendThinkingOff = cfg.name === "wally" && !opts.reasoning && !thinkingUnsupported.has(cfg.name);
  const model = opts.model ?? cfg.model;

  for (let attempt = 0; attempt < 4; attempt++) {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { thinking?: { type: "disabled" } } = {
      model,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(tokenParam === "max_tokens" ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }),
      ...(sendTemperature ? { temperature: opts.temperature } : {}),
      ...(useJsonMode ? { response_format: { type: "json_object" as const } } : {}),
      ...(sendThinkingOff ? { thinking: { type: "disabled" as const } } : {}),
    };
    const started = Date.now();
    try {
      const res = await client.chat.completions.create(params, { timeout });
      const choice = res.choices?.[0];
      const raw = choice?.message?.content ?? "";
      const text = stripThink(raw);
      if (!text.trim()) {
        const refusal = (choice?.message as { refusal?: string | null } | undefined)?.refusal;
        throw new Error(refusal ? `model refused: ${refusal}` : `empty completion from ${cfg.name}/${cfg.model} (finish_reason=${choice?.finish_reason ?? "none"})`);
      }
      return {
        text,
        provider: cfg.name,
        model: res.model || model,
        ms: Date.now() - started,
        usage: res.usage ? { input: res.usage.prompt_tokens, output: res.usage.completion_tokens } : undefined,
        finishReason: choice?.finish_reason === "length" ? "length" : choice?.finish_reason === "stop" ? "stop" : "other",
      };
    } catch (err) {
      // Degrade gracefully on parameter rejections (400/422), then rethrow.
      const status = errorStatus(err);
      const msg = errorMessage(err).toLowerCase();
      if (status === 400 || status === 422) {
        if (useJsonMode && /response_format|json_object|json mode|json_schema/.test(msg)) {
          useJsonMode = false;
          state.jsonModeUnsupported.add(cfg.name);
          console.warn(`[llm] ${cfg.name} rejected response_format; retrying without JSON mode`);
          continue;
        }
        if (/max_tokens|max_completion_tokens/.test(msg)) {
          tokenParam = tokenParam === "max_tokens" ? "max_completion_tokens" : "max_tokens";
          state.tokenParam.set(cfg.name, tokenParam);
          console.warn(`[llm] ${cfg.name} rejected token limit param; retrying with ${tokenParam}`);
          continue;
        }
        if (sendThinkingOff && /thinking/.test(msg)) {
          sendThinkingOff = false;
          thinkingUnsupported.add(cfg.name);
          console.warn(`[llm] ${cfg.name} rejected the thinking control; retrying without it`);
          continue;
        }
        if (sendTemperature && /temperature/.test(msg)) {
          sendTemperature = false;
          state.temperatureUnsupported.add(cfg.name);
          console.warn(`[llm] ${cfg.name} rejected temperature; retrying without it`);
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error(`${cfg.name}: exhausted parameter fallbacks for ${cfg.model}`);
}

async function callAnthropic(cfg: ProviderConfig, opts: CompleteOptions): Promise<LlmResult> {
  const client = anthropicClient(cfg);
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  // Anthropic wants strictly alternating user/assistant turns starting with user.
  const turns: Anthropic.Messages.MessageParam[] = [];
  for (const m of opts.messages) {
    if (m.role === "system") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content as string}\n\n${m.content}`;
    } else {
      turns.push({ role: m.role, content: m.content });
    }
  }
  if (turns.length === 0 || turns[0].role !== "user") turns.unshift({ role: "user", content: "Begin." });

  const started = Date.now();
  const res = await client.messages.create(
    {
      model: cfg.model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(system ? { system } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      messages: turns,
    },
    { timeout },
  );
  const raw = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const text = stripThink(raw);
  if (!text.trim()) throw new Error(`empty completion from anthropic/${cfg.model} (stop_reason=${res.stop_reason ?? "none"})`);
  return {
    text,
    provider: "anthropic",
    model: res.model || cfg.model,
    ms: Date.now() - started,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
    finishReason: res.stop_reason === "max_tokens" ? "length" : res.stop_reason === "end_turn" || res.stop_reason === "stop_sequence" ? "stop" : "other",
  };
}

// ── retry / error helpers ──────────────────────────────────────────────────

function errorStatus(err: unknown): number | null {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isRetryable(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 429 || (status !== null && status >= 500)) return true;
  // Connection resets / DNS hiccups: no status, but a network-ish name/message.
  const name = err instanceof Error ? err.name : "";
  const msg = errorMessage(err).toLowerCase();
  return name === "APIConnectionError" || /econnreset|socket hang up|fetch failed|network/.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const delay = 1200 + Math.floor(Math.random() * 900);
    console.warn(`[llm] ${label}: ${errorMessage(err)} — retrying once in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    return await fn();
  }
}

// ── text utilities ─────────────────────────────────────────────────────────

/** Remove <think>…</think> / <thinking>…</thinking> reasoning blocks some open models emit. */
export function stripThink(text: string): string {
  if (!text) return "";
  let out = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  // An unclosed opening tag at the very start: drop the tag, keep the content.
  out = out.replace(/^\s*<think(?:ing)?>/i, "");
  return out.trim();
}

/**
 * Pull the first JSON object/array out of model text. Tolerates ```json fences,
 * leading/trailing prose, <think> blocks, trailing commas and // line comments.
 */
export function extractJson(text: string): unknown {
  let s = stripThink(text ?? "").trim();
  if (!s) throw new Error("empty response");

  const fence = s.match(/```(?:json|JSON|js|javascript)?\s*\n?([\s\S]*?)```/);
  if (fence && /^[\s]*[{[]/.test(fence[1])) s = fence[1].trim();

  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) throw new Error(`no JSON object found in: ${snippet(s)}`);

  const end = findBalancedEnd(s, start);
  const candidate = end === -1 ? s.slice(start) : s.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to cleanup */
  }
  let cleaned = lightJsonCleanup(candidate);
  try {
    return JSON.parse(cleaned);
  } catch {
    /* maybe truncated: close open structures */
  }
  if (end === -1) {
    cleaned = closeOpenStructures(cleaned);
    try {
      return JSON.parse(cleaned);
    } catch {
      /* give up below */
    }
  }
  throw new Error(`could not parse JSON: ${snippet(candidate)}`);
}

function findBalancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lightJsonCleanup(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  // Strip // comments outside strings and normalise smart quotes used as delimiters.
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (ch === "“" || ch === "”") {
      out += '"';
      inString = true;
      continue;
    }
    out += ch;
  }
  // Trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, "$1");
  // Control characters inside strings are illegal; replace raw newlines in strings with \n.
  out = out.replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\r?\n/g, "\\n").replace(/\t/g, "\\t"));
  return out;
}

function closeOpenStructures(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = inString ? `${s}"` : s;
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, "$1");
}

function snippet(s: string, n = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/**
 * Parse the Builder's file-block format into ArtifactFile[]:
 *   <<<FILE index.html>>>        (also tolerates <<<FILE: index.html>>>)
 *   ...content...
 *   <<<END FILE>>>               (a missing END at EOF or before the next FILE is tolerated)
 * Paths are normalised to relative POSIX paths; anything with ".." is dropped.
 */
export function parseFiles(text: string): ArtifactFile[] {
  const src = stripThink(text ?? "");
  const re = /<<<\s*FILE\s*:?\s*([^\n>]+?)\s*>>>[ \t]*\r?\n?([\s\S]*?)(?=<<<\s*END\s*FILE\s*>>>|<<<\s*FILE\b|$)/gi;
  const byPath = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const path = normalizePath(m[1]);
    if (!path) continue;
    let content = m[2].replace(/\s+$/, "");
    content = unwrapFence(content);
    byPath.set(path, `${content}\n`);
  }
  return [...byPath.entries()].map(([path, content]) => ({ path, content }));
}

function normalizePath(raw: string): string | null {
  let p = raw.trim().replace(/^[`'"]+|[`'"]+$/g, "").replace(/:+$/, "").trim();
  p = p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (!p) return null;
  const segments = p.split("/").filter((seg) => seg.length > 0);
  if (segments.length === 0 || segments.some((seg) => seg === "..")) return null;
  return segments.join("/");
}

function unwrapFence(content: string): string {
  const fenced = content.match(/^\s*```[a-zA-Z0-9-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/);
  return fenced ? fenced[1] : content;
}
