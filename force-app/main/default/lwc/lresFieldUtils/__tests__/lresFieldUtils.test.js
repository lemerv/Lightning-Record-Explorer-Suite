import {
  normalizeString,
  normalizePositiveInteger,
  normalizeBoolean,
  formatApiName,
  formatObjectLabel
} from "../lresFieldUtils";

describe("fieldUtils", () => {
  describe("normalizeString", () => {
    it("trims whitespace and returns null for empty values", () => {
      expect(normalizeString("  Hello ")).toBe("Hello");
      expect(normalizeString("   ")).toBeNull();
      expect(normalizeString(undefined)).toBeNull();
      expect(normalizeString(null)).toBeNull();
    });
  });

  describe("normalizePositiveInteger", () => {
    it("returns parsed integer when valid or falls back", () => {
      expect(normalizePositiveInteger("5", 2)).toBe(5);
      expect(normalizePositiveInteger(10, 2)).toBe(10);
      expect(normalizePositiveInteger("not-a-number", 2)).toBe(2);
      expect(normalizePositiveInteger(-3, 4)).toBe(4);
    });
  });

  describe("normalizeBoolean", () => {
    it('returns true only for true or "true"', () => {
      expect(normalizeBoolean(true)).toBe(true);
      expect(normalizeBoolean("true")).toBe(true);
      expect(normalizeBoolean(false)).toBe(false);
      expect(normalizeBoolean("FALSE")).toBe(false);
      expect(normalizeBoolean("")).toBe(false);
    });
  });

  describe("formatApiName", () => {
    it("converts camel and namespace separators into spaced labels", () => {
      expect(formatApiName("TestField__c")).toBe("Test Field c");
      expect(formatApiName("SomeLongApiName")).toBe("Some Long Api Name");
      expect(formatApiName("")).toBe("");
    });
  });

  describe("formatObjectLabel", () => {
    it("normalizes object api names and removes suffixes", () => {
      expect(formatObjectLabel("Namespace__CustomObject__c")).toBe(
        "Custom Object"
      );
      expect(formatObjectLabel("Account")).toBe("Account");
      expect(formatObjectLabel(null)).toBeNull();
    });
  });
});
