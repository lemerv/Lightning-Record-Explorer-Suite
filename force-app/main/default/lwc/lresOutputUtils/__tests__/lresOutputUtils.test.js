import { sanitizeFieldOutput } from "../lresOutputUtils";

describe("outputUtils", () => {
  it("returns non-strings unchanged", () => {
    expect(sanitizeFieldOutput(null)).toBeNull();
    expect(sanitizeFieldOutput(undefined)).toBeUndefined();
    expect(sanitizeFieldOutput(5)).toBe(5);
  });

  it("replaces html breaks, decodes entities, and normalizes newlines", () => {
    const input = "Line&nbsp;1<br>Line 2<br/>Line 3\r\nLine 4";
    const result = sanitizeFieldOutput(input);
    expect(result).toBe("Line\u00a01\nLine 2\nLine 3\nLine 4");
  });
});
