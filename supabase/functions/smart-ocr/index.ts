import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const fetchWithRetry = async (url: string, init: RequestInit, attempts = 3) => {
  let response: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, init);
    // Quota errors need a different model, not repeated requests to the same one.
    if (response.ok || response.status === 429 || ![500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await new Promise(resolve => setTimeout(resolve, 400 * (2 ** attempt)));
  }
  return response as Response;
};

const upstreamError = async (response: Response) => {
  let code = "";
  try {
    const payload = await response.json();
    code = String(payload?.error?.status || payload?.error?.code || payload?.error?.type || "");
  } catch {
    // The upstream response may not be JSON.
  }
  if (["insufficient_quota", "RESOURCE_EXHAUSTED", "429"].includes(code)) {
    return json({ error: "AI analysis is temporarily unavailable.", code }, 503);
  }
  if (code === "UNAVAILABLE") return json({ error: "AI analysis is temporarily unavailable.", code }, 503);
  return json({ error: "Image analysis provider is temporarily unavailable.", code: code || "upstream_error" }, 502);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const extractResponseText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: Array<{ type?: string; text?: string }> }).content
      : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
};

const extractGeminiText = (payload: Record<string, unknown>) => {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates.flatMap(candidate => {
    const content = (candidate as { content?: { parts?: unknown[] } })?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts.map(part => String((part as { text?: string })?.text || "")).filter(Boolean);
  }).join("\n").trim();
};

const summarizeText = (text = "") => {
  const raw = String(text || "").trim();
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return { merchant: lines.find(line => !/\d{2,}/.test(line)) || lines[0] || "", preview: raw.slice(0, 180) };
};

const DEFAULT_PROMPT = [
  "You are a precise financial receipt analyst for a budgeting app.",
  "Read the entire receipt and distinguish GRAND TOTAL or TOTAL DUE from subtotal, tax, discount, cash received, change, card number, invoice number, and item quantities.",
  "Return these normalized lines first when visible: MERCHANT: ..., TOTAL: number currency, DATE: YYYY-MM-DD, CATEGORY: food|transport|rent|health|clothes|entertainment|other.",
  "After them add RECEIPT TEXT: followed by the important visible receipt lines in reading order.",
  "Never use subtotal, tax, cash tendered, or change as TOTAL.",
  "Preserve decimal values and Arabic or English merchant names accurately.",
  "Keep Arabic text in Arabic and English text in English.",
  "Do not explain the image and do not add commentary.",
].join(" ");

const authenticatedFetch = withSupabase({ auth: "user" }, async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("Gemini API Key");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!geminiApiKey && !openAiApiKey) return json({ error: "No analysis provider is configured." }, 500);

  let formData: FormData;
  try { formData = await request.formData(); } catch { return json({ error: "Invalid multipart form data." }, 400); }
  const file = formData.get("file");
  if (!(file instanceof File)) return json({ error: "A file field is required." }, 400);
  if (!String(file.type || "").startsWith("image/")) return json({ error: "Uploaded file must be an image." }, 400);
  if (file.size > 12 * 1024 * 1024) return json({ error: "Image exceeds the 12 MB limit." }, 413);

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4.1-mini";
  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);

  if (geminiApiKey) {
    const requestedModel = Deno.env.get("GEMINI_VISION_MODEL") || "gemini-3.1-flash-lite";
    const geminiModels = [...new Set([requestedModel, "gemini-3-flash-preview"])];
    let lastUpstream: Response | null = null;

    for (const geminiModel of geminiModels) {
      const upstream = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": geminiApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: Deno.env.get("GEMINI_VISION_PROMPT") || DEFAULT_PROMPT },
            { inline_data: { mime_type: file.type || "image/jpeg", data: base64 } },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 640 },
        }),
      });
      if (upstream.ok) {
        const text = extractGeminiText(await upstream.json());
        if (!text) return json({ error: "No readable text was found in the image." }, 422);
        return json({ text, provider: "gemini", model: geminiModel, mimeType: file.type || "image/jpeg", analysis: summarizeText(text) });
      }
      lastUpstream = upstream;
    }

    return upstreamError(lastUpstream as Response);
  }

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [
        { type: "input_text", text: Deno.env.get("OPENAI_VISION_PROMPT") || DEFAULT_PROMPT },
        { type: "input_image", image_url: `data:${file.type || "image/jpeg"};base64,${base64}`, detail: "high" },
      ] }],
    }),
  });
  if (!upstream.ok) return upstreamError(upstream);

  const text = extractResponseText(await upstream.json());
  if (!text) return json({ error: "No readable text was found in the image." }, 422);
  return json({ text, provider: "openai", model, mimeType: file.type || "image/jpeg", analysis: summarizeText(text) });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedFetch(request);
  },
};
