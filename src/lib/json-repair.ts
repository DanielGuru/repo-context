/**
 * Utilities for extracting and repairing JSON from AI model responses.
 *
 * AI models often wrap JSON in markdown code fences, include preamble/postamble text,
 * or produce truncated output. These functions handle those cases.
 */

/**
 * Robustly extracts a JSON object from an AI response that may contain
 * markdown code fences, preamble text, or other wrapping.
 */
export function extractJSON<T = unknown>(raw: string): T {
  let text = raw.trim();

  // Strategy 1: Strip outermost code fences
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*)\n\s*```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Strategy 2: Find first { to last } or first [ to last ]
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    const lastBrace = text.lastIndexOf("}");
    const lastBracket = text.lastIndexOf("]");

    let start = -1, end = -1;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      start = firstBrace;
      end = lastBrace;
    } else if (firstBracket !== -1) {
      start = firstBracket;
      end = lastBracket;
    }

    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  const attempts: (() => string)[] = [
    () => text,
    () => fixJsonNewlines(text),
    () => repairTruncatedJSON(text),
    () => repairTruncatedJSON(fixJsonNewlines(text)),
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt()) as T;
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("Failed to parse AI response as JSON");
}

/**
 * Fixes literal newlines, carriage returns, and tabs that appear
 * inside JSON string values (unescaped). Walks the string character
 * by character tracking whether we are inside a quoted string.
 */
export function fixJsonNewlines(json: string): string {
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      chars.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      chars.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      chars.push(ch);
      continue;
    }

    if (inString && ch === "\n") {
      chars.push("\\n");
      continue;
    }

    if (inString && ch === "\r") {
      continue;
    }

    if (inString && ch === "\t") {
      chars.push("\\t");
      continue;
    }

    chars.push(ch);
  }

  return chars.join("");
}

/**
 * Attempts to repair truncated JSON by closing any open brackets,
 * braces, and strings. Useful when the AI response was cut off
 * mid-output due to token limits.
 */
export function repairTruncatedJSON(json: string): string {
  let text = json.trim();

  if (text.endsWith("}")) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Fall through to repair
    }
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inString) {
    text += '"';
  }

  text = text.replace(/,\s*$/, "");

  while (stack.length > 0) {
    const closer = stack.pop()!;
    if (closer === "]") {
      text = text.replace(/,\s*\{[^}]*$/, "");
      text = text.replace(/,\s*"[^"]*$/, "");
    }
    text += closer;
  }

  return text;
}
