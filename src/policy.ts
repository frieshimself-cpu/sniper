/**
 * enforce() — the last thing every string touches before a reader sees it.
 *
 * Rules (docs/RULES_OF_ENGAGEMENT.md):
 *   - handles only; no legal names, no personal details
 *   - the word "illegal" never appears
 *
 * This is pattern-based and deliberately blunt. It will over-redact before it
 * under-redacts. Anything it cannot prove safe gets replaced, not softened.
 */

export const REDACTED = "[redacted]";

/** Words that never appear, with the replacement used. */
export const FORBIDDEN_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\billegally\b/gi, "unlawfully"],
  [/\billegality\b/gi, "unlawfulness"],
  [/\billegal\b/gi, "unlawful"],
];

/** Personal-detail patterns. Each is replaced wholesale with REDACTED. */
export const PERSONAL_PATTERNS: ReadonlyArray<RegExp> = [
  // email addresses (requires a dot in the domain, so @handles survive)
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  // phone numbers: +1 (555) 123-4567, 555-123-4567, 555.123.4567
  /\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  // US social security style numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // street addresses: 221 Baker Street, 10 Downing St.
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b\.?/g,
  // explicit identity disclosures: "real name: John Smith", "aka Jane Doe", "doxxed as ..."
  /\b(?:real name|legal name|full name|true name|aka|a\.k\.a\.|also known as|doxx?(?:ed)?(?:\s+as)?|born|lives in|located in|works at|employed by)\s*[:=-]?\s*[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3}/g,
  // IP addresses
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
];

/** Normalise a handle to the form the site uses: "@name", lowercase. */
export function normalizeHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  return "@" + h.replace(/[^a-z0-9_.]/g, "");
}

/** Apply the policy to one string. Idempotent. */
export function enforce(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  for (const re of PERSONAL_PATTERNS) {
    re.lastIndex = 0;
    s = s.replace(re, REDACTED);
  }
  for (const [re, replacement] of FORBIDDEN_WORDS) {
    re.lastIndex = 0;
    s = s.replace(re, (m) => matchCase(m, replacement));
  }
  return s;
}

/** Walk any JSON-ish value and enforce every string in it. Keys are left alone. */
export function enforceDeep<T>(value: T): T {
  if (typeof value === "string") return enforce(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => enforceDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = enforceDeep(v);
    }
    return out as T;
  }
  return value;
}

/** Return the list of rule violations in a string, for tests and CI. Empty = clean. */
export function violations(input: string): string[] {
  const out: string[] = [];
  for (const [re] of FORBIDDEN_WORDS) {
    re.lastIndex = 0;
    if (re.test(input)) out.push(`forbidden word: ${re.source}`);
  }
  for (const re of PERSONAL_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(input)) out.push(`personal detail: ${re.source.slice(0, 40)}`);
  }
  return out;
}

function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
