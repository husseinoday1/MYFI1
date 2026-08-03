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
    // A quota response will not recover within seconds; let the caller switch
    // models immediately instead of making the user wait through retries.
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
  return json({ error: "Voice transcription provider is temporarily unavailable.", code: code || "upstream_error" }, 502);
};

const summarizeText = (text = "") => {
  const raw = String(text || "").trim();
  return { preview: raw.slice(0, 180) };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const extractGeminiText = (payload: Record<string, unknown>) => {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates.flatMap(candidate => {
    const content = (candidate as { content?: { parts?: unknown[] } })?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts.map(part => String((part as { text?: string })?.text || "")).filter(Boolean);
  }).join("\n").trim();
};

const DEFAULT_PROMPT = [
  "This is a short finance note for a personal budgeting app.",
  "Transcribe Arabic and English accurately.",
  "Preserve numbers, currency words, and merchant names carefully.",
].join(" ");

const authenticatedFetch = withSupabase({ auth: "user" }, async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("Gemini API Key");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!geminiApiKey && !openAiApiKey) return json({ error: "No transcription provider is configured." }, 500);

  let formData: FormData;
  try { formData = await request.formData(); } catch { return json({ error: "Invalid multipart form data." }, 400); }
  const file = formData.get("file");
  if (!(file instanceof File)) return json({ error: "A file field is required." }, 400);
  if (!String(file.type || "").startsWith("audio/")) return json({ error: "Uploaded file must be audio." }, 400);
  if (file.size > 25 * 1024 * 1024) return json({ error: "Audio exceeds the 25 MB limit." }, 413);

  if (geminiApiKey) {
    const bytes = await file.arrayBuffer();
    const geminiMimeType = ["audio/m4a", "audio/x-m4a"].includes(file.type)
      ? "audio/mp4"
      : (file.type || "audio/mp4");
    const requestedModel = Deno.env.get("GEMINI_TRANSCRIBE_MODEL") || "gemini-3.1-flash-lite";
    const geminiModels = [...new Set([requestedModel, "gemini-3-flash-preview"])];
    let lastUpstream: Response | null = null;

    for (const geminiModel of geminiModels) {
      const upstream = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": geminiApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: `${Deno.env.get("GEMINI_TRANSCRIBE_PROMPT") || DEFAULT_PROMPT}\nReturn only the transcription without commentary.` },
            { inline_data: { mime_type: geminiMimeType, data: arrayBufferToBase64(bytes) } },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        }),
      });
      if (upstream.ok) {
        const text = extractGeminiText(await upstream.json());
        if (!text) return json({ error: "No speech was detected in the recording." }, 422);
        return json({ text, provider: "gemini", model: geminiModel, mimeType: geminiMimeType, analysis: summarizeText(text) });
      }
      lastUpstream = upstream;
    }

    return upstreamError(lastUpstream as Response);
  }

  const model = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "voice.m4a");
  upstreamForm.append("model", model);
  upstreamForm.append("response_format", "json");
  upstreamForm.append("prompt", Deno.env.get("OPENAI_TRANSCRIBE_PROMPT") || DEFAULT_PROMPT);

  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey}` },
    body: upstreamForm,
  });
  if (!upstream.ok) return upstreamError(upstream);

  const payload = await upstream.json();
  const text = String(payload?.text || "").trim();
  if (!text) return json({ error: "No speech was detected in the recording." }, 422);
  return json({ text, provider: "openai", model, mimeType: file.type || "audio/m4a", analysis: summarizeText(text) });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedFetch(request);
  },
};
