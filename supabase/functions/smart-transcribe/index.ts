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
  } catch {}
  if (["insufficient_quota", "RESOURCE_EXHAUSTED", "429"].includes(code)) {
    return json({ error: "AI analysis is temporarily unavailable.", code }, 503);
  }
  return json({ error: "Voice analysis provider is temporarily unavailable.", code: code || "upstream_error" }, 502);
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


const SOURCE_TYPES = [
  "receipt", "bank_notification", "bank_app_screen", "bank_statement",
  "bank_transfer_confirmation", "card_purchase_alert", "cash_withdrawal",
  "cash_deposit", "refund_notice", "invoice", "bill", "pos_slip",
  "ecommerce_order", "purchase_order", "cheque", "salary_notice",
  "fee_notice", "screenshot", "other"
] as const;

const CATEGORY_VALUES = [
  "food", "transport", "rent", "health", "clothes", "entertainment",
  "salary", "transfer", "other"
] as const;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceType: { type: "string", enum: SOURCE_TYPES },
    transactionLikely: { type: "boolean" },
    multipleTransactions: { type: "boolean" },
    flow: { type: "string", enum: ["expense", "income", "transfer", "unknown"] },
    direction: { type: "string", enum: ["outgoing", "incoming", "internal", "unknown"] },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    dateISO: { type: ["string", "null"] },
    dateRole: {
      type: "string",
      enum: ["transaction", "receipt", "posting", "message", "due", "statement", "unknown"]
    },
    title: { type: ["string", "null"] },
    merchant: { type: ["string", "null"] },
    counterparty: { type: ["string", "null"] },
    category: { type: ["string", "null"], enum: [...CATEGORY_VALUES, null] },
    walletHint: { type: ["string", "null"] },
    accountHint: { type: ["string", "null"] },
    fromWalletHint: { type: ["string", "null"] },
    toWalletHint: { type: ["string", "null"] },
    amountEvidence: { type: ["string", "null"] },
    amountConfidence: { type: "number", minimum: 0, maximum: 1 },
    dateConfidence: { type: "number", minimum: 0, maximum: 1 },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    referenceNumbers: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string" },
          value: { type: "string" }
        },
        required: ["kind", "value"]
      }
    },
    candidates: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          amount: { type: ["number", "null"] },
          flow: { type: "string", enum: ["expense", "income", "transfer", "unknown"] },
          dateISO: { type: ["string", "null"] },
          title: { type: ["string", "null"] }
        },
        required: ["amount", "flow", "dateISO", "title"]
      }
    },
    warnings: {
      type: "array",
      maxItems: 12,
      items: { type: "string" }
    },
    rawText: { type: "string" },
    transcript: { type: "string" }
  },
  required: [
    "sourceType", "transactionLikely", "multipleTransactions", "flow", "direction",
    "amount", "currency", "dateISO", "dateRole", "title", "merchant", "counterparty",
    "category", "walletHint", "accountHint", "fromWalletHint", "toWalletHint",
    "amountEvidence", "amountConfidence", "dateConfidence", "overallConfidence",
    "referenceNumbers", "candidates", "warnings", "rawText", "transcript"
  ]
};

const clamp01 = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
};

const normalizeAnalysis = (value: Record<string, unknown> = {}) => ({
  sourceType: SOURCE_TYPES.includes(value.sourceType as typeof SOURCE_TYPES[number])
    ? value.sourceType
    : "other",
  transactionLikely: value.transactionLikely === true,
  multipleTransactions: value.multipleTransactions === true,
  flow: ["expense", "income", "transfer", "unknown"].includes(String(value.flow || ""))
    ? String(value.flow)
    : "unknown",
  direction: ["outgoing", "incoming", "internal", "unknown"].includes(String(value.direction || ""))
    ? String(value.direction)
    : "unknown",
  amount: Number.isFinite(Number(value.amount)) && Number(value.amount) > 0 ? Math.abs(Number(value.amount)) : null,
  currency: value.currency ? String(value.currency).toUpperCase().slice(0, 12) : null,
  dateISO: /^\d{4}-\d{2}-\d{2}$/.test(String(value.dateISO || "")) ? String(value.dateISO) : null,
  dateRole: ["transaction", "receipt", "posting", "message", "due", "statement", "unknown"].includes(String(value.dateRole || ""))
    ? String(value.dateRole)
    : "unknown",
  title: value.title ? String(value.title).slice(0, 120) : null,
  merchant: value.merchant ? String(value.merchant).slice(0, 120) : null,
  counterparty: value.counterparty ? String(value.counterparty).slice(0, 120) : null,
  category: CATEGORY_VALUES.includes(value.category as typeof CATEGORY_VALUES[number])
    ? value.category
    : null,
  walletHint: value.walletHint ? String(value.walletHint).slice(0, 100) : null,
  accountHint: value.accountHint ? String(value.accountHint).slice(0, 100) : null,
  fromWalletHint: value.fromWalletHint ? String(value.fromWalletHint).slice(0, 100) : null,
  toWalletHint: value.toWalletHint ? String(value.toWalletHint).slice(0, 100) : null,
  amountEvidence: value.amountEvidence ? String(value.amountEvidence).slice(0, 160) : null,
  amountConfidence: clamp01(value.amountConfidence),
  dateConfidence: clamp01(value.dateConfidence),
  overallConfidence: clamp01(value.overallConfidence),
  referenceNumbers: Array.isArray(value.referenceNumbers)
    ? value.referenceNumbers.slice(0, 12).map(item => ({
        kind: String((item as Record<string, unknown>)?.kind || "reference").slice(0, 50),
        value: String((item as Record<string, unknown>)?.value || "").slice(0, 100),
      })).filter(item => item.value)
    : [],
  candidates: Array.isArray(value.candidates)
    ? value.candidates.slice(0, 8).map(item => {
        const row = item as Record<string, unknown>;
        return {
          amount: Number.isFinite(Number(row.amount)) && Number(row.amount) > 0 ? Math.abs(Number(row.amount)) : null,
          flow: ["expense", "income", "transfer", "unknown"].includes(String(row.flow || ""))
            ? String(row.flow)
            : "unknown",
          dateISO: /^\d{4}-\d{2}-\d{2}$/.test(String(row.dateISO || "")) ? String(row.dateISO) : null,
          title: row.title ? String(row.title).slice(0, 120) : null,
        };
      })
    : [],
  warnings: Array.isArray(value.warnings)
    ? value.warnings.slice(0, 12).map(item => String(item).slice(0, 160))
    : [],
  rawText: String(value.rawText || "").slice(0, 6000),
  transcript: String(value.transcript || "").slice(0, 6000),
});

const extractJsonObject = (source = "") => {
  const text = String(source || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch {}
    }
  }
  return null;
};

const analysisText = (analysis: ReturnType<typeof normalizeAnalysis>) => [
  analysis.merchant ? `MERCHANT: ${analysis.merchant}` : null,
  analysis.amount ? `TOTAL: ${analysis.amount}${analysis.currency ? ` ${analysis.currency}` : ""}` : null,
  analysis.dateISO ? `DATE: ${analysis.dateISO}` : null,
  analysis.category ? `CATEGORY: ${analysis.category}` : null,
  analysis.rawText ? `SOURCE TEXT:\n${analysis.rawText}` : null,
  analysis.transcript ? `TRANSCRIPT:\n${analysis.transcript}` : null,
].filter(Boolean).join("\n");


const VOICE_PROMPT = (today: string, currency: string, lang: string, transcriptHint = "") => `
You are MYFI's financial-voice understanding engine.
Today on the user's phone is ${today || "unknown"}. App currency is ${currency || "unknown"}. UI language is ${lang || "unknown"}.
${transcriptHint ? `A speech-to-text transcript is provided below. Analyze it semantically and correct number-word interpretation when needed:\n${transcriptHint}` : ""}

Understand Iraqi Arabic, Modern Standard Arabic and English finance speech.
Return BOTH an accurate transcript and structured financial meaning.

TRANSCRIPTION RULE:
- Preserve the speaker's number wording as faithfully as possible in transcript.
- Do not replace an Iraqi word-number phrase with unrelated digits.
- If speech recognition normalizes words into digits, still infer the intended financial amount from the whole utterance.

NUMBER LANGUAGE RULES:
- "ألف ونص" = 1500
- "مليون ونص" = 1500000
- "مليون وربع" = 1250000
- "نص مليون" = 500000
- "ربع مليون" = 250000
- "ثلث مليون" ≈ 333333.333333
- "ثلاثة ونص" = 3.5
- "ثلاثة وربع" = 3.25
- "ثلاثة إلا ربع" = 2.75
- "مليون إلا ربع" = 750000
- "خمسة آلاف وسبعمية وخمسين" = 5750
- "مية وخمسة وعشرين ألف" = 125000
- Iraqi variants like "ثلاث تالاف", "ميتين", "الفين", "احدعش", "اثنعش", "ثلاثطعش" must be understood.
- "one and a half thousand" = 1500
- "half a million" = 500000
- "two and a quarter" = 2.25
- "one point five million" = 1500000
- "twenty-five hundred" = 2500
- Preserve decimal monetary values exactly when spoken.

CONTEXT RULES:
1. Distinguish AMOUNT from identifiers.
   "رقم الطلب ثلاثة آلاف ودفعت خمسين دولار" => order/reference=3000, amount=50.
   "invoice number 1250, I paid 80 dollars" => reference=1250, amount=80.
2. Detect direction from meaning:
   دفعت/اشتريت/سددت/صرفت/ارسلت => usually expense/outgoing.
   استلمت/قبضت/راتب/ايداع/حولولي => usually income/incoming.
   "حولت من محفظة X إلى محفظة Y" => transfer/internal when both sides are explicit.
3. Relative dates:
   اليوم=today, أمس/yesterday=today-1, قبل يومين=today-2.
   If the date phrase is uncertain, dateISO=null.
4. Wallet hints:
   preserve spoken names such as Cash, Visa, الرشيد, الرافدين, زين كاش without inventing a wallet.
5. Category examples:
   قهوة/مطعم/غداء => food; بنزين/تكسي => transport; إيجار => rent; دواء/صيدلية => health; راتب => salary.
6. If more than one plausible monetary amount is mentioned and the sentence does not clearly say which is the transaction amount,
   do not guess. Put candidates and lower confidence.
7. Do not convert phone/order/reference/account numbers into money simply because they are large.
8. Return JSON only.

FEW-SHOT EXAMPLES:
"دفعت مليون ونص إيجار من الكاش أمس"
=> expense, amount 1500000, rent, walletHint cash, date yesterday.

"استلمت نص مليون من علي اليوم"
=> income, amount 500000, counterparty Ali.

"حولت مية وخمسة وعشرين ألف من الرشيد إلى الكاش"
=> transfer/internal, amount 125000, fromWalletHint الرشيد, toWalletHint cash.

"اشتريت قهوة باثنعش ونص"
=> expense, amount 12.5, food.

"دفعت ثلاثة آلاف وسبعمية وخمسين دينار"
=> expense, amount 3750.

"دفعت مليون إلا ربع"
=> expense, amount 750000.

"رقم الطلب ثلاثة آلاف ودفعت خمسين دولار"
=> expense, amount 50, reference order=3000.

"I paid one and a half thousand for rent"
=> expense, amount 1500, rent.

"I received half a million salary today"
=> income, amount 500000, salary.

"Order number twenty-five hundred; I paid eighty dollars"
=> expense, amount 80, reference order=2500.

"اشتريت تيبس ب 500 دينار"
=> expense, amount 500.

"بطيخ بألف ونص"
=> expense, amount 1500. The Arabic ب-prefix is a price cue.

"استلمت راتبي ب 3582000 وربع"
=> income. Keep the transcript wording and interpret the fraction conservatively;
   if the original audio's scale is ambiguous after transcription normalization, lower confidence rather than inventing a scale.
`;


const transcriptionPrompt = [
  "Transcribe the finance note accurately in Arabic, Iraqi Arabic, or English.",
  "Preserve spoken number words exactly as heard, including fractions such as half, quarter, third, نص, ربع, ثلث.",
  "Preserve currency names, wallet/bank names, merchant names, relative dates, and reference-number phrases.",
  "Do not silently turn an order/reference number into a transaction amount.",
].join(" ");

const analyzeOpenAiTranscript = async ({
  key, model, transcript, today, currency, lang,
}: {
  key: string; model: string; transcript: string; today: string; currency: string; lang: string;
}) => {
  const prompt = VOICE_PROMPT(today, currency, lang, transcript);
  const body = {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    text: {
      format: {
        type: "json_schema",
        name: "myfi_financial_voice",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  };

  let response = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status === 400) {
    response = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, text: undefined }),
    });
  }

  return response;
};

const authenticatedFetch = withSupabase({ auth: "user" }, async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("Gemini API Key");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!geminiApiKey && !openAiApiKey) return json({ error: "No voice analysis provider is configured." }, 500);

  let formData: FormData;
  try { formData = await request.formData(); } catch { return json({ error: "Invalid multipart form data." }, 400); }

  const file = formData.get("file");
  if (!(file instanceof File)) return json({ error: "A file field is required." }, 400);
  if (!String(file.type || "").startsWith("audio/")) return json({ error: "Uploaded file must be audio." }, 400);
  if (file.size > 25 * 1024 * 1024) return json({ error: "Audio exceeds the 25 MB limit." }, 413);

  const today = String(formData.get("today") || "");
  const currency = String(formData.get("currency") || "");
  const lang = String(formData.get("lang") || "");

  if (geminiApiKey) {
    const bytes = await file.arrayBuffer();
    const geminiMimeType = ["audio/m4a", "audio/x-m4a"].includes(file.type)
      ? "audio/mp4"
      : (file.type || "audio/mp4");
    const requestedModel = Deno.env.get("GEMINI_TRANSCRIBE_MODEL") || "gemini-3.1-flash-lite";
    const geminiModels = [...new Set([requestedModel, "gemini-3-flash-preview"])];
    let lastUpstream: Response | null = null;

    for (const geminiModel of geminiModels) {
      const upstream = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": geminiApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { text: VOICE_PROMPT(today, currency, lang) },
              { inline_data: { mime_type: geminiMimeType, data: arrayBufferToBase64(bytes) } },
            ] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 1500,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (upstream.ok) {
        const raw = extractGeminiText(await upstream.json());
        const parsed = extractJsonObject(raw);
        if (!parsed) return json({ error: "The recording could not be converted into structured financial data." }, 422);
        const analysis = normalizeAnalysis(parsed);
        const text = analysis.transcript || analysisText(analysis);
        if (!text) return json({ error: "No speech was detected in the recording." }, 422);
        return json({
          text,
          transcript: analysis.transcript || text,
          provider: "gemini",
          model: geminiModel,
          mimeType: geminiMimeType,
          analysis,
        });
      }

      lastUpstream = upstream;
    }

    return upstreamError(lastUpstream as Response);
  }

  const transcribeModel = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "voice.m4a");
  upstreamForm.append("model", transcribeModel);
  upstreamForm.append("response_format", "json");
  upstreamForm.append("prompt", Deno.env.get("OPENAI_TRANSCRIBE_PROMPT") || transcriptionPrompt);

  const transcriptionResponse = await fetchWithRetry("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey}` },
    body: upstreamForm,
  });

  if (!transcriptionResponse.ok) return upstreamError(transcriptionResponse);

  const transcriptionPayload = await transcriptionResponse.json();
  const transcript = String(transcriptionPayload?.text || "").trim();
  if (!transcript) return json({ error: "No speech was detected in the recording." }, 422);

  const analyzerModel = Deno.env.get("OPENAI_VOICE_ANALYSIS_MODEL")
    || Deno.env.get("OPENAI_VISION_MODEL")
    || "gpt-4.1-mini";

  const analysisResponse = await analyzeOpenAiTranscript({
    key: openAiApiKey as string,
    model: analyzerModel,
    transcript,
    today,
    currency,
    lang,
  });

  if (!analysisResponse.ok) return upstreamError(analysisResponse);

  const raw = extractResponseText(await analysisResponse.json());
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return json({
      text: transcript,
      transcript,
      provider: "openai",
      model: transcribeModel,
      mimeType: file.type || "audio/m4a",
      analysis: normalizeAnalysis({
        sourceType: "other",
        transactionLikely: true,
        multipleTransactions: false,
        flow: "unknown",
        direction: "unknown",
        amount: null,
        currency: null,
        dateISO: null,
        dateRole: "unknown",
        title: null,
        merchant: null,
        counterparty: null,
        category: null,
        walletHint: null,
        accountHint: null,
        fromWalletHint: null,
        toWalletHint: null,
        amountEvidence: null,
        amountConfidence: 0,
        dateConfidence: 0,
        overallConfidence: 0.25,
        referenceNumbers: [],
        candidates: [],
        warnings: ["structured_voice_analysis_failed"],
        rawText: "",
        transcript,
      }),
    });
  }

  const analysis = normalizeAnalysis({ ...parsed, transcript });
  return json({
    text: transcript,
    transcript,
    provider: "openai",
    model: `${transcribeModel} + ${analyzerModel}`,
    mimeType: file.type || "audio/m4a",
    analysis,
  });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedFetch(request);
  },
};
