/**
 * Tests for dateTimeUtils Lightning Web Component
 * Tests utility functions for date/time formatting with pattern support
 */

jest.mock("@salesforce/i18n/locale", () => ({ default: "en-US" }), {
  virtual: true
});
jest.mock("@salesforce/i18n/timeZone", () => ({ default: "UTC" }), {
  virtual: true
});

import {
  formatValueWithPattern,
  buildDateFormatParts,
  applyDateTimePattern,
  tryFormatDateOrDateTimeString,
  CONNECTOR_LITERAL_PATTERN,
  TIME_TOKEN_CHARS
} from "../lresDateTimeUtils";

// Salesforce i18n modules are mocked via Jest configuration

describe("lresDateTimeUtils", () => {
  // Test constants
  const TEST_DATE = new Date("2023-12-25T14:30:45.123Z");
  const TEST_DATE_STRING = "2023-12-25T14:30:45.123Z";
  const TEST_DATE_ONLY_STRING = "2023-12-25";

  beforeEach(() => {
    // Clear any cached patterns between tests
    jest.clearAllMocks();
  });

  describe("formatValueWithPattern", () => {
    test("should format Date object with basic pattern", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "yyyy-MM-dd HH:mm:ss"
      });
      expect(result).toBe("2023-12-25 14:30:45");
    });

    test("should drop time tokens for date-only fields", () => {
      const result = formatValueWithPattern(TEST_DATE_ONLY_STRING, {
        pattern: "yyyy-MM-dd HH:mm:ss",
        dateOnly: true
      });
      expect(result).toBe("2023-12-25");
    });

    test("should append time tokens for datetime fields when missing", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBe("2023-12-25 2:30 PM");
    });

    test("should format date string with date-only pattern", () => {
      const result = formatValueWithPattern(TEST_DATE_ONLY_STRING, {
        pattern: "MM/dd/yyyy",
        dateOnly: true
      });
      expect(result).toBe("12/25/2023");
    });

    test("should return null for null input", () => {
      const result = formatValueWithPattern(null, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should return null for undefined input", () => {
      const result = formatValueWithPattern(undefined, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should return null for empty string input", () => {
      const result = formatValueWithPattern("", {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should fall back to locale formatting when pattern is missing", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: null
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    test("should handle custom locale and timezone", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "yyyy-MM-dd HH:mm:ss",
        locale: "en-GB",
        timeZone: "Europe/London"
      });
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    test("should trim trailing connectors for dateOnly", () => {
      const result = formatValueWithPattern(TEST_DATE_ONLY_STRING, {
        pattern: "yyyy-MM-dd HH:mm:ss",
        dateOnly: true
      });
      expect(result).toBe("2023-12-25");
    });

    test("should use pattern token cache", () => {
      const cache = new Map();
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "yyyy-MM-dd",
        patternTokenCache: cache
      });
      expect(result).toBe("2023-12-25 2:30 PM");
      expect(cache.size).toBe(2);
    });
  });

  describe("buildDateFormatParts", () => {
    test("should parse ISO date string with dateOnly=true", () => {
      const result = buildDateFormatParts(TEST_DATE_ONLY_STRING, {
        dateOnly: true
      });

      expect(result).toEqual(
        expect.objectContaining({
          year: "2023",
          yearShort: "23",
          month: "12",
          monthNumber: "12",
          day: "25",
          dayNumber: "25",
          hour24: "00",
          hour12: "12",
          hour12NoPad: "12",
          minute: "00",
          second: "00",
          millisecond: "000",
          amPm: ""
        })
      );
    });

    test("should parse Date object", () => {
      const result = buildDateFormatParts(TEST_DATE);

      expect(result).toEqual(
        expect.objectContaining({
          year: "2023",
          yearShort: "23",
          month: "12",
          monthNumber: "12",
          day: "25",
          dayNumber: "25",
          hour24: "14",
          hour12: "02",
          hour12NoPad: "2",
          minute: "30",
          second: "45",
          millisecond: "123",
          amPm: "PM"
        })
      );
    });

    test("should parse date string", () => {
      const result = buildDateFormatParts(TEST_DATE_STRING);

      expect(result).toEqual(
        expect.objectContaining({
          year: "2023",
          hour24: "14",
          minute: "30",
          second: "45"
        })
      );
    });

    test("should return null for null input", () => {
      const result = buildDateFormatParts(null);
      expect(result).toBeNull();
    });

    test("should return null for undefined input", () => {
      const result = buildDateFormatParts(undefined);
      expect(result).toBeNull();
    });

    test("should return null for empty string", () => {
      const result = buildDateFormatParts("");
      expect(result).toBeNull();
    });

    test("should return null for invalid date string", () => {
      const result = buildDateFormatParts("invalid-date");
      expect(result).toBeNull();
    });

    test("should return null for invalid Date object", () => {
      const invalidDate = new Date("invalid");
      const result = buildDateFormatParts(invalidDate);
      expect(result).toBeNull();
    });

    test("should handle custom locale", () => {
      const result = buildDateFormatParts(TEST_DATE, {
        locale: "fr-FR"
      });
      expect(result.monthLong.toLowerCase()).toBe("décembre");
      expect(result.weekdayLong.toLowerCase()).toBe("lundi");
    });

    test("should handle non-Latin locale", () => {
      const result = buildDateFormatParts(TEST_DATE, {
        locale: "ja-JP"
      });
      expect(result.monthLong).toBe("12月");
      expect(result.weekdayLong).toBe("月曜日");
    });

    test("should handle right-to-left locale", () => {
      const result = buildDateFormatParts(TEST_DATE, {
        locale: "ar-EG"
      });
      expect(result.monthLong).toBe("ديسمبر");
      expect(result.weekdayLong).toBe("الاثنين");
    });

    test("should handle custom timezone", () => {
      const result = buildDateFormatParts(TEST_DATE, {
        timeZone: "America/New_York"
      });
      expect(result.timeZoneNameShort).toBe("EST");
      expect(result.timeZoneNameLong).toBe("Eastern Standard Time");
    });

    test("should handle date-only ISO string not matching pattern", () => {
      const result = buildDateFormatParts("25-12-2023", {
        dateOnly: true
      });
      // Should parse as regular date since it doesn't match YYYY-MM-DD pattern
      expect(result).toBeDefined();
    });

    test("should extract month names correctly", () => {
      const result = buildDateFormatParts(TEST_DATE);
      expect(result.monthShort).toBe("Dec");
      expect(result.monthLong).toBe("December");
    });

    test("should extract weekday names correctly", () => {
      const result = buildDateFormatParts(TEST_DATE);
      expect(result.weekdayShort).toBeDefined();
      expect(result.weekdayLong).toBeDefined();
    });

    test("should handle DST spring forward transition", () => {
      const result = buildDateFormatParts("2023-03-12T10:30:00.000Z", {
        timeZone: "America/Los_Angeles"
      });
      expect(result.hour24).toBe("03");
    });

    test("should parse leap day values", () => {
      const result = buildDateFormatParts("2024-02-29T12:00:00.000Z", {
        timeZone: "UTC"
      });
      expect(result.day).toBe("29");
      expect(result.month).toBe("02");
    });

    test("should preserve leading zeros for millisecond precision", () => {
      const result = buildDateFormatParts("2023-12-25T14:30:45.007Z", {
        timeZone: "UTC"
      });
      expect(result.millisecond).toBe("007");
    });
  });

  describe("applyDateTimePattern", () => {
    test("should apply pattern with tokens", () => {
      const parts = {
        year: "2023",
        month: "12",
        day: "25",
        hour24: "14",
        minute: "30",
        second: "45"
      };

      const result = applyDateTimePattern(parts, "yyyy-MM-dd HH:mm:ss");
      expect(result).toBe("2023-12-25 14:30:45");
    });

    test("treats double quotes as literal characters (not literal delimiters)", () => {
      const parts = buildDateFormatParts(TEST_DATE);

      const result = applyDateTimePattern(parts, 'yyyy-MM-dd "at" HH:mm');
      expect(result).toBe('2023-12-25 "PMt" 14:30');
    });

    test("should handle quoted literals", () => {
      const parts = {
        year: "2023",
        month: "12",
        day: "25"
      };

      const result = applyDateTimePattern(parts, "yyyy-MM-dd 'at' HH:mm");
      expect(result).toBe("2023-12-25 at :");
    });

    test("should skip leading connectors for dateOnly", () => {
      const parts = {
        year: "2023",
        month: "12",
        day: "25"
      };

      const result = applyDateTimePattern(parts, "yyyy-MM-dd - HH:mm", {
        dateOnly: true
      });
      expect(result).toBe("2023-12-25");
    });

    test("should return null for null pattern", () => {
      const parts = { year: "2023" };
      const result = applyDateTimePattern(parts, null);
      expect(result).toBeNull();
    });

    test("should return null for null parts", () => {
      const result = applyDateTimePattern(null, "yyyy-MM-dd");
      expect(result).toBeNull();
    });

    test("should return null for empty pattern", () => {
      const parts = { year: "2023" };
      const result = applyDateTimePattern(parts, "");
      expect(result).toBeNull();
    });

    test("should handle pattern with no matching tokens", () => {
      const parts = { year: "2023" };
      const result = applyDateTimePattern(parts, "abc");
      expect(result).toBe("");
    });

    test("should handle pattern composed only of connectors", () => {
      const parts = buildDateFormatParts(TEST_DATE);
      const result = applyDateTimePattern(parts, "---:::   ///,,");
      expect(result).toBe("");
    });

    test("should collapse multiple spaces", () => {
      const parts = {
        year: "2023",
        month: "12",
        day: "25"
      };

      const result = applyDateTimePattern(parts, "yyyy  -  MM  -  dd");
      expect(result).toBe("2023 - 12 - 25");
    });

    test("should use pattern token cache", () => {
      const cache = new Map();
      const parts = { year: "2023" };

      const result = applyDateTimePattern(parts, "yyyy", {
        patternTokenCache: cache
      });

      expect(result).toBe("2023");
      expect(cache.size).toBe(1);
      const cachedTokens = cache.get("yyyy");
      applyDateTimePattern(parts, "yyyy", {
        patternTokenCache: cache
      });
      expect(cache.get("yyyy")).toBe(cachedTokens);
    });

    test("should treat unterminated single quote as literal content", () => {
      const parts = buildDateFormatParts(TEST_DATE);
      const result = applyDateTimePattern(parts, "yyyy-MM-dd 'at");
      expect(result).toBe("2023-12-25 at");
    });
  });

  describe("tryFormatDateOrDateTimeString", () => {
    test("should format ISO date string without time", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25", {
        pattern: "MM/dd/yyyy"
      });
      expect(result).toBe("12/25/2023");
    });

    test("should format ISO datetime string with time", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25T14:30:00Z", {
        pattern: "yyyy-MM-dd HH:mm",
        timeZone: "UTC"
      });
      expect(result).toBe("2023-12-25 14:30");
    });

    test("should format ISO datetime string with space instead of T", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25 14:30:00Z", {
        pattern: "yyyy-MM-dd HH:mm",
        timeZone: "UTC"
      });
      expect(result).toBe("2023-12-25 14:30");
    });

    test("should return null for non-ISO date string", () => {
      const result = tryFormatDateOrDateTimeString("25/12/2023", {
        pattern: "MM/dd/yyyy"
      });
      expect(result).toBeNull();
    });

    test("should return null for null input", () => {
      const result = tryFormatDateOrDateTimeString(null, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should return null for undefined input", () => {
      const result = tryFormatDateOrDateTimeString(undefined, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should return null for empty string", () => {
      const result = tryFormatDateOrDateTimeString("", {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should return null for non-string input", () => {
      const result = tryFormatDateOrDateTimeString(123, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBeNull();
    });

    test("should handle string with whitespace", () => {
      const result = tryFormatDateOrDateTimeString("  2023-12-25  ", {
        pattern: "MM/dd/yyyy"
      });
      expect(result).toBe("12/25/2023");
    });

    test("should detect date-only format correctly", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25", {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBe("2023-12-25");
    });

    test("should detect datetime format correctly", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25T14:30:00Z", {
        pattern: "yyyy-MM-dd HH:mm",
        timeZone: "UTC"
      });
      expect(result).toBe("2023-12-25 14:30");
    });
  });

  describe("Pattern Token Support", () => {
    let parts;

    beforeEach(() => {
      parts = buildDateFormatParts(TEST_DATE);
    });

    test("should support year tokens", () => {
      expect(applyDateTimePattern(parts, "yyyy")).toBe("2023");
      expect(applyDateTimePattern(parts, "yy")).toBe("23");
    });

    test("should support month tokens", () => {
      expect(applyDateTimePattern(parts, "MMMM")).toBe("December");
      expect(applyDateTimePattern(parts, "MMM")).toBe("Dec");
      expect(applyDateTimePattern(parts, "MM")).toBe("12");
      expect(applyDateTimePattern(parts, "M")).toBe("12");
    });

    test("should support day tokens", () => {
      expect(applyDateTimePattern(parts, "dd")).toBe("25");
      expect(applyDateTimePattern(parts, "d")).toBe("25");
    });

    test("should support hour tokens (24-hour)", () => {
      expect(applyDateTimePattern(parts, "HH")).toBe("14");
      expect(applyDateTimePattern(parts, "H")).toBe("14");
    });

    test("should support hour tokens (12-hour)", () => {
      expect(applyDateTimePattern(parts, "hh")).toBe("02");
      expect(applyDateTimePattern(parts, "h")).toBe("2");
    });

    test("should support minute and second tokens", () => {
      expect(applyDateTimePattern(parts, "mm")).toBe("30");
      expect(applyDateTimePattern(parts, "ss")).toBe("45");
    });

    test("should support millisecond token", () => {
      expect(applyDateTimePattern(parts, "SSS")).toBe("123");
    });

    test("should support AM/PM token", () => {
      expect(applyDateTimePattern(parts, "a")).toBe("PM");
    });

    test("should support weekday tokens", () => {
      expect(applyDateTimePattern(parts, "EEE")).toBeDefined();
      expect(applyDateTimePattern(parts, "EEEE")).toBeDefined();
    });

    test("should support timezone tokens", () => {
      expect(applyDateTimePattern(parts, "z")).toBeDefined();
      expect(applyDateTimePattern(parts, "zzzz")).toBeDefined();
    });

    test("should return empty string for unsupported K/k hour tokens", () => {
      expect(applyDateTimePattern(parts, "K")).toBe("");
      expect(applyDateTimePattern(parts, "k")).toBe("");
    });

    test("should return empty string for AM/PM in dateOnly mode", () => {
      const result = applyDateTimePattern(parts, "yyyy-MM-dd a", {
        dateOnly: true
      });
      expect(result).toBe("2023-12-25");
    });
  });

  describe("Constants", () => {
    test("should export CONNECTOR_LITERAL_PATTERN", () => {
      expect(CONNECTOR_LITERAL_PATTERN).toBeDefined();
      expect(CONNECTOR_LITERAL_PATTERN instanceof RegExp).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test("-")).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test("/")).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test(":")).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test(",")).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test(" ")).toBe(true);
      expect(CONNECTOR_LITERAL_PATTERN.test("a")).toBe(false);
    });

    test("should export TIME_TOKEN_CHARS", () => {
      expect(TIME_TOKEN_CHARS).toBeDefined();
      expect(TIME_TOKEN_CHARS instanceof Set).toBe(true);
      expect(TIME_TOKEN_CHARS.has("y")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("M")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("d")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("H")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("h")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("m")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("s")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("S")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("a")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("E")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("z")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("K")).toBe(true);
      expect(TIME_TOKEN_CHARS.has("k")).toBe(true);
    });
  });

  describe("Edge Cases and Integration", () => {
    test("should handle leap year date", () => {
      const leapYearDate = new Date("2024-02-29T12:00:00Z");
      const result = formatValueWithPattern(leapYearDate, {
        pattern: "yyyy-MM-dd"
      });
      expect(result).toBe("2024-02-29 12:00 PM");
    });

    test("should handle end of year date", () => {
      const endOfYearDate = new Date("2023-12-31T23:59:59.999Z");
      const result = formatValueWithPattern(endOfYearDate, {
        pattern: "yyyy-MM-dd HH:mm:ss.SSS"
      });
      expect(result).toBe("2023-12-31 23:59:59.999");
    });

    test("should handle beginning of year date", () => {
      const startOfYearDate = new Date("2023-01-01T00:00:00.000Z");
      const result = formatValueWithPattern(startOfYearDate, {
        pattern: "yyyy-MM-dd HH:mm:ss.SSS"
      });
      expect(result).toBe("2023-01-01 00:00:00.000");
    });

    test("should handle midnight time", () => {
      const midnightDate = new Date("2023-12-25T00:00:00Z");
      const result = formatValueWithPattern(midnightDate, {
        pattern: "HH:mm:ss"
      });
      expect(result).toBe("00:00:00");
    });

    test("should handle noon time", () => {
      const noonDate = new Date("2023-12-25T12:00:00Z");
      const result = formatValueWithPattern(noonDate, {
        pattern: "HH:mm:ss"
      });
      expect(result).toBe("12:00:00");
    });

    test("should handle single-digit values correctly", () => {
      const singleDigitDate = new Date("2023-01-05T09:05:05.005Z");
      const result = formatValueWithPattern(singleDigitDate, {
        pattern: "yyyy-MM-dd HH:mm:ss.SSS"
      });
      expect(result).toBe("2023-01-05 09:05:05.005");
    });

    test("should handle complex pattern with multiple token types", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "EEEE, MMMM dd, yyyy 'at' hh:mm:ss a z"
      });
      expect(result).toBeDefined();
      expect(result).toContain("at");
    });

    test("should handle pattern with only literals", () => {
      const result = applyDateTimePattern(
        { year: "2023" },
        "This is just text",
        { hasFutureTokenOutput: () => false }
      );
      expect(result).toBe("");
    });

    test("should handle pattern with escaped quotes", () => {
      const parts = { year: "2023" };
      const result = applyDateTimePattern(parts, "yyyy 'it''s' yyyy");
      expect(result).toBe("2023 it's 2023");
    });
  });

  describe("Real-world Usage Scenarios", () => {
    test("should format for display in UI", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "MMM dd, yyyy"
      });
      expect(result).toBe("Dec 25, 2023 2:30 PM");
    });

    test("should format for API requests", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
      });
      expect(result).toBe("2023-12-25T14:30:45.123Z");
    });

    test("should format for user-friendly display", () => {
      const result = formatValueWithPattern(TEST_DATE, {
        pattern: "EEEE, MMMM dd, yyyy 'at' hh:mm a"
      });
      expect(result).toBe("Monday, December 25, 2023 at 02:30 PM");
    });

    test("should handle ISO string auto-detection", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25", {
        pattern: "MM/dd/yyyy"
      });
      expect(result).toBe("12/25/2023");
    });

    test("should handle ISO datetime auto-detection", () => {
      const result = tryFormatDateOrDateTimeString("2023-12-25T14:30:00Z", {
        pattern: "MM/dd/yyyy HH:mm",
        timeZone: "UTC"
      });
      expect(result).toBe("12/25/2023 14:30");
    });
  });
});
