import { describe, it, expect } from "vitest";
import { extractJSON, fixJsonNewlines, repairTruncatedJSON } from "../src/lib/json-repair.js";

describe("extractJSON", () => {
  it("handles clean JSON", () => {
    const input = '{"index":"hello","facts":[],"decisions":[],"regressions":[]}';
    const result = extractJSON(input);
    expect(result).toEqual({
      index: "hello",
      facts: [],
      decisions: [],
      regressions: [],
    });
  });

  it("strips ```json code fences", () => {
    const input = '```json\n{"key":"value"}\n```';
    const result = extractJSON(input);
    expect(result).toEqual({ key: "value" });
  });

  it("strips ``` code fences without language tag", () => {
    const input = '```\n{"key":"value"}\n```';
    const result = extractJSON(input);
    expect(result).toEqual({ key: "value" });
  });

  it("finds JSON in surrounding text (preamble + postamble)", () => {
    const input = 'Here is the JSON output:\n{"name":"test","count":42}\nHope that helps!';
    const result = extractJSON(input);
    expect(result).toEqual({ name: "test", count: 42 });
  });

  it("handles JSON with leading whitespace", () => {
    const input = '   \n  {"key":"value"}  \n  ';
    const result = extractJSON(input);
    expect(result).toEqual({ key: "value" });
  });

  it("handles nested objects and arrays", () => {
    const input = '{"a":{"b":[1,2,3]},"c":"d"}';
    const result = extractJSON(input);
    expect(result).toEqual({ a: { b: [1, 2, 3] }, c: "d" });
  });

  it("handles JSON with literal newlines in strings via fixJsonNewlines fallback", () => {
    // The value has an actual newline character inside the JSON string
    const input = '{"key":"line1\nline2"}';
    const result = extractJSON(input);
    expect(result).toEqual({ key: "line1\nline2" });
  });

  it("throws on completely invalid input", () => {
    expect(() => extractJSON("this is not json at all")).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => extractJSON("")).toThrow();
  });

  it("handles JSON wrapped in code fences with extra whitespace", () => {
    const input = '```json\n\n  {"key": "value"}\n\n```';
    const result = extractJSON(input);
    expect(result).toEqual({ key: "value" });
  });

  it("throws when multiple JSON objects make extraction ambiguous", () => {
    // extractJSON picks from first { to last }, producing: {"a":1} some text {"b":2}
    // That's not valid JSON, so all parse strategies fail and it throws.
    const input = 'prefix {"a":1} some text {"b":2} suffix';
    expect(() => extractJSON(input)).toThrow();
  });

  it("handles code fences with json object containing arrays", () => {
    const input = `\`\`\`json
{
  "index": "# My Project",
  "facts": [{"filename": "arch.md", "content": "Architecture details"}],
  "decisions": [],
  "regressions": []
}
\`\`\``;
    const result = extractJSON(input);
    expect(result).toEqual({
      index: "# My Project",
      facts: [{ filename: "arch.md", content: "Architecture details" }],
      decisions: [],
      regressions: [],
    });
  });
});

describe("fixJsonNewlines", () => {
  it("replaces literal newlines inside string values with \\n", () => {
    const input = '{"key":"line1\nline2"}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"key":"line1\\nline2"}');
  });

  it("strips carriage returns inside string values", () => {
    const input = '{"key":"line1\r\nline2"}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"key":"line1\\nline2"}');
  });

  it("replaces literal tabs inside string values with \\t", () => {
    const input = '{"key":"col1\tcol2"}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"key":"col1\\tcol2"}');
  });

  it("does not modify newlines outside of strings", () => {
    const input = '{\n  "key": "value"\n}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{\n  "key": "value"\n}');
  });

  it("handles escaped quotes correctly", () => {
    const input = '{"key":"value with \\"quotes\\""}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"key":"value with \\"quotes\\""}');
  });

  it("handles backslash before a regular character", () => {
    const input = '{"path":"C:\\\\Users\\\\test"}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"path":"C:\\\\Users\\\\test"}');
  });

  it("handles empty strings", () => {
    const input = '{"key":""}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"key":""}');
  });

  it("handles multiple strings with newlines", () => {
    const input = '{"a":"line1\nline2","b":"line3\nline4"}';
    const result = fixJsonNewlines(input);
    expect(result).toBe('{"a":"line1\\nline2","b":"line3\\nline4"}');
  });

  it("returns valid JSON after fixing", () => {
    const input = '{"content":"first\nsecond\nthird"}';
    const fixed = fixJsonNewlines(input);
    const parsed = JSON.parse(fixed);
    expect(parsed.content).toBe("first\nsecond\nthird");
  });
});

describe("repairTruncatedJSON", () => {
  it("returns valid JSON unchanged", () => {
    const input = '{"key":"value"}';
    const result = repairTruncatedJSON(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("closes an unclosed object brace", () => {
    const input = '{"key":"value"';
    const result = repairTruncatedJSON(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("closes unclosed array bracket", () => {
    const input = '{"items":[1,2,3';
    const result = repairTruncatedJSON(input);
    const parsed = JSON.parse(result);
    expect(parsed.items).toEqual([1, 2, 3]);
  });

  it("closes unclosed string", () => {
    const input = '{"key":"val';
    const result = repairTruncatedJSON(input);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("val");
  });

  it("removes trailing comma before closing", () => {
    const input = '{"a":1,"b":2,';
    const result = repairTruncatedJSON(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 1, b: 2 });
  });

  it("handles deeply nested truncation", () => {
    const input = '{"a":{"b":{"c":"value"';
    const result = repairTruncatedJSON(input);
    const parsed = JSON.parse(result);
    expect(parsed.a.b.c).toBe("value");
  });

  it("handles truncated array with partial object", () => {
    const input = '{"items":[{"name":"first"},{"name":"sec';
    const result = repairTruncatedJSON(input);
    const parsed = JSON.parse(result);
    // The repair closes the unclosed string and braces, keeping both objects
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].name).toBe("first");
    expect(parsed.items[1].name).toBe("sec");
  });

  it("handles empty object", () => {
    const input = "{}";
    const result = repairTruncatedJSON(input);
    expect(JSON.parse(result)).toEqual({});
  });

  it("handles array at top level (truncated)", () => {
    const input = "[1, 2, 3";
    const result = repairTruncatedJSON(input);
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });
});
