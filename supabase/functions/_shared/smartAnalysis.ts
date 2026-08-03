const moneyRegex = /(?:^|\s)([+-]?\d[\d,.\s]*)(?:\s*(IQD|USD|EUR|SAR|AED|دينار|د\.ع|\$))?/giu;
const isoDateRegex = /\b\d{4}-\d{2}-\d{2}\b/;
const slashDateRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const normalizeNumber = (value = "") => {
  const cleaned = String(value).replace(/[,\s]/g, "");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.abs(amount);
};

const normalizeDate = (value = "") => {
  if (!value) return "";
  if (isoDateRegex.test(value)) return value.match(isoDateRegex)?.[0] || "";
  const raw = value.match(slashDateRegex)?.[0];
  if (!raw) return "";
  const parts = raw.split(/[/-]/).map((item) => item.trim());
  if (parts.length !== 3) return "";
  const [a, b, c] = parts;
  const year = c.length === 2 ? `20${c}` : c;
  const month = a.padStart(2, "0");
  const day = b.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const summarizeText = (text = "") => {
  const raw = String(text || "").trim();
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amounts = [...raw.matchAll(moneyRegex)]
    .map((match) => ({
      amount: normalizeNumber(match[1] || ""),
      currency: String(match[2] || "").trim(),
    }))
    .filter((item) => item.amount && item.amount > 0);

  const biggest = amounts.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const merchant = lines.find((line) => !/\d{2,}/.test(line)) || lines[0] || "";
  const dateLine = lines.find((line) => isoDateRegex.test(line) || slashDateRegex.test(line)) || raw;
  const date = normalizeDate(dateLine);
  const currency = biggest?.currency || "";
  const total = biggest?.amount ?? null;

  return {
    merchant,
    total,
    currency,
    date,
    preview: raw.slice(0, 180),
  };
};

export const extractResponseText = (payload: Record<string, unknown>) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: Array<{ type?: string; text?: string }> }).content
      : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
};
