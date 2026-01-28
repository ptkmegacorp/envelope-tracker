export const IMB_MIN_LEN = 10;
export const IMB_MAX_LEN = 80;
const IMB_ALLOWED_RE = /^[A-Za-z0-9._\-\/\s]+$/;

export function normalizeImbs(input = []) {
  const seen = new Set();
  const results = [];

  for (const raw of input) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    results.push(value);
  }

  return results;
}

export function validateImb(imb) {
  const trimmed = String(imb ?? "").trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length < IMB_MIN_LEN || trimmed.length > IMB_MAX_LEN) {
    return { ok: false, reason: "length" };
  }
  if (!IMB_ALLOWED_RE.test(trimmed)) {
    return { ok: false, reason: "charset" };
  }
  return { ok: true };
}

export function parseImbs(rawText) {
  if (!rawText) return [];
  const chunks = rawText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,;]/));
  return chunks.map((value) => value.trim()).filter(Boolean);
}

export function summarizeWarnings(imbs) {
  const warnings = [];
  for (const imb of imbs) {
    const result = validateImb(imb);
    if (!result.ok) {
      if (result.reason === "length") {
        warnings.push(`${imb} (length ${imb.length})`);
      } else if (result.reason === "charset") {
        warnings.push(`${imb} (unsupported characters)`);
      }
    }
  }
  return warnings;
}
