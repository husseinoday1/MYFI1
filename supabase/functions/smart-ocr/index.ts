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


const IMAGE_PROMPT = (today: string, currency: string, lang: string) => `
You are MYFI's financial-image understanding engine.
Today on the user's phone is ${today || "unknown"}. App currency is ${currency || "unknown"}. UI language is ${lang || "unknown"}.

Analyze the IMAGE AS A FINANCIAL SOURCE, not as generic OCR.
The image may be:
- a paper/shop/restaurant receipt,
- a POS/card slip,
- a screenshot of a bank SMS/push notification,
- a bank app debit/credit screen,
- transfer confirmation,
- salary/deposit notice,
- refund/reversal notice,
- ATM withdrawal/deposit screen,
- bank statement with many rows,
- invoice/bill,
- e-commerce order confirmation,
- purchase order,
- cheque/check,
- screenshot containing no completed transaction.

CORE RULES:
1. First classify sourceType and whether it proves ONE completed financial transaction.
2. NEVER choose a number because it is the largest number.
3. Distinguish money from order numbers, invoice numbers, cheque/check numbers, reference IDs, transaction IDs,
   auth codes, terminal IDs, batch IDs, card/account numbers, SKU/item/product numbers, barcode values, phone numbers,
   quantities, unit prices, loyalty points and balances.
4. Receipt amount priority:
   GRAND TOTAL / TOTAL DUE / AMOUNT DUE / NET TOTAL / PAYABLE / final amount AFTER discounts, taxes and fees.
   Do not use subtotal, tax alone, discount alone, cash tendered, change, previous balance, loyalty points or item totals.
4A. NUMBER-SEPARATOR RULES ARE CRITICAL:
   Interpret comma/dot roles from the complete visible amount format and currency; do not delete punctuation blindly.
   In many Iraqi banking screens IQD is shown with THREE decimal minor digits:
   - "-13,200.000 IQD" means 13,200 IQD, NOT 13,200,000.
   - "2,518,269.000 IQD" means 2,518,269 IQD.
   - "-660.000 IQD" means 660 IQD.
   - "-5,480.000 IQD" means 5,480 IQD.
   Preserve the exact visible amount string in amountEvidence.
   Also understand common international forms such as "1,234.56 USD" and "1.234,56 EUR".
4B. BANK "TRANSACTION DETAILS" SCREENS:
   A screen explicitly showing Transaction type + Transaction date + Amount + Transaction reference
   is strong evidence of a completed/posting transaction unless the screen itself says pending/failed/cancelled.
   Prefer the field labeled "Transaction date" over "Value date" for MYFI's transaction date.
   Examples:
   - Transaction type "POS - Purchase" with a negative amount => expense/outgoing.
   - Transaction type "Salary Domiciliation" with a positive amount => income/incoming, category salary.
   - Transaction type "ATM-POS-Ecom Commission" with a negative amount => expense/outgoing (bank/card fee).
   Account number, transaction reference, card number and ATM authorization number are identifiers, never amounts.

5. Bank notification direction:
   - debited / charged / card purchase / fee / withdrawn / sent / خصم / سحب / شراء / دفع / حوالة صادرة => outgoing.
   - credited / deposited / received / salary / refund / reversal credit / إيداع / إضافة / استلام / راتب / تحويل وارد => incoming.
6. A bank/app message that only shows BALANCE is NOT a transaction.
7. A bank statement or screenshot with multiple transaction rows => multipleTransactions=true.
   Do not silently pick one row. Put up to 8 rows in candidates and leave top-level amount null unless the image clearly highlights one selected transaction.
8. Invoice, bill, order or purchase order is not necessarily paid. If there is no paid/settled/approved/completed evidence,
   set transactionLikely=false even if a total is visible.
9. A cheque/check image has an amount but not necessarily proof that money moved. Do not assume income/expense without completion context.
10. Date:
   choose the actual transaction/receipt/posting date. Never use due date, statement period, card expiry, order reference date
   or screenshot capture metadata as transaction date. If uncertain, dateISO=null.
11. Flow:
   expense = money left the user to an external party.
   income = money arrived from an external party.
   transfer = evidence indicates movement between the user's own accounts/wallets or cash withdrawal/deposit,
              but only use internal direction when the source supports it.
   unknown = cannot safely decide.
12. If currency is not visible, currency=null. Do not invent app currency.
13. overallConfidence must reflect semantic certainty, not OCR confidence only.
14. Preserve important visible text in rawText for validation, but do not copy secrets unnecessarily.
   Mask long card/account numbers where practical in rawText.
15. amountEvidence MUST preserve the exact visible monetary string selected as the transaction amount,
    including sign, commas, dots, and currency, e.g. "-13,200.000 IQD".
16. Return JSON only.

EXAMPLES:
A) "تم خصم 75,000 د.ع من بطاقتكم لدى SUPERMARKET" =>
   bank_notification, transactionLikely=true, expense/outgoing, amount=75000, merchant=SUPERMARKET.
B) "تم إيداع 1,250,000 IQD - Salary" =>
   salary_notice, income/incoming, amount=1250000, category=salary.
C) "Card ending 4432. Purchase USD 24.80 at CAFE. Available balance 900.20" =>
   card_purchase_alert, expense, amount=24.80. 900.20 is balance, not transaction.
D) Restaurant receipt: SUBTOTAL 18, TAX 2, DISCOUNT 5, GRAND TOTAL 15 =>
   amount=15.
E) "Order #3500 - Paid USD 25" =>
   amount=25; referenceNumbers contains order=3500.
F) Invoice total 500 with "Due 30/08/2026", no paid indicator =>
   transactionLikely=false, amount may be 500 but flow=unknown, dateRole=due and dateISO must not become transaction date.
G) Bank statement with 12 rows =>
   multipleTransactions=true and top-level amount=null unless one row is clearly selected.
H) "Refund credited 12.50 USD" =>
   income/incoming, amount=12.50.
I) ATM cash withdrawal 100,000 IQD =>
   sourceType=cash_withdrawal, flow=transfer, direction=unknown unless both sides are explicit.
J) Screenshot showing only "Current balance 3,000,000 IQD" =>
   transactionLikely=false and amount=null.
K) Bank Transaction details:
   Transaction type "POS - Purchase", Transaction date "05/08/2026",
   Amount "-13,200.000 IQD", Transaction reference "FT2621706165" =>
   bank_app_screen, transactionLikely=true, expense/outgoing, amount=13200,
   amountEvidence="-13,200.000 IQD", reference is NOT amount.
L) Bank Transaction details:
   Transaction type "Salary Domiciliation", Amount "2,518,269.000 IQD" =>
   bank_app_screen, income/incoming, amount=2518269, category=salary.
M) Bank Transaction details:
   Transaction type "ATM-POS-Ecom Commission", Amount "-660.000 IQD" =>
   bank_app_screen, expense/outgoing, amount=660.
N) Bank POS purchase, Amount "-5,480.000 IQD" =>
   bank_app_screen, expense/outgoing, amount=5480.
`;


const callOpenAiVision = async ({
  key, model, prompt, base64, mimeType,
}: {
  key: string; model: string; prompt: string; base64: string; mimeType: string;
}) => {
  const body = {
    model,
    input: [{ role: "user", content: [
      { type: "input_text", text: prompt },
      { type: "input_image", image_url: `data:${mimeType};base64,${base64}`, detail: "high" },
    ] }],
    text: {
      format: {
        type: "json_schema",
        name: "myfi_financial_image",
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
    const fallbackBody = { ...body, text: undefined };
    response = await fetchWithRetry("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(fallbackBody),
    });
  }

  return response;
};

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

  const today = String(formData.get("today") || "");
  const currency = String(formData.get("currency") || "");
  const lang = String(formData.get("lang") || "");
  const prompt = IMAGE_PROMPT(today, currency, lang);

  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const mimeType = file.type || "image/jpeg";

  if (geminiApiKey) {
    const requestedModel = Deno.env.get("GEMINI_VISION_MODEL") || "gemini-3.1-flash-lite";
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
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 1400,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (upstream.ok) {
        const raw = extractGeminiText(await upstream.json());
        const parsed = extractJsonObject(raw);
        if (!parsed) return json({ error: "The image could not be converted into structured financial data." }, 422);
        const analysis = normalizeAnalysis(parsed);
        return json({
          text: analysisText(analysis),
          provider: "gemini",
          model: geminiModel,
          mimeType,
          analysis,
        });
      }
      lastUpstream = upstream;
    }

    return upstreamError(lastUpstream as Response);
  }

  const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4.1-mini";
  const upstream = await callOpenAiVision({
    key: openAiApiKey as string,
    model,
    prompt,
    base64,
    mimeType,
  });
  if (!upstream.ok) return upstreamError(upstream);

  const raw = extractResponseText(await upstream.json());
  const parsed = extractJsonObject(raw);
  if (!parsed) return json({ error: "The image could not be converted into structured financial data." }, 422);
  const analysis = normalizeAnalysis(parsed);
  return json({
    text: analysisText(analysis),
    provider: "openai",
    model,
    mimeType,
    analysis,
  });
});

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    return authenticatedFetch(request);
  },
};
