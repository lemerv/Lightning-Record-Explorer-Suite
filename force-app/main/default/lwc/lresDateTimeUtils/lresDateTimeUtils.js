import LOCALE from "@salesforce/i18n/locale";
import TIME_ZONE from "@salesforce/i18n/timeZone";

const DEFAULT_LOCALE = LOCALE || "en-US";
const DEFAULT_TIME_ZONE = TIME_ZONE || "UTC";
export const CONNECTOR_LITERAL_PATTERN = /^[\s:,/-]+$/;
export const TIME_TOKEN_CHARS = new Set([
  "H",
  "h",
  "K",
  "k",
  "m",
  "s",
  "S",
  "a",
  "y",
  "M",
  "d",
  "E",
  "z"
]);

export function formatValueWithPattern(
  value,
  {
    dateOnly = false,
    pattern,
    patternTokenCache,
    locale = DEFAULT_LOCALE,
    timeZone = DEFAULT_TIME_ZONE
  } = {}
) {
  if (!pattern) {
    return formatValueWithLocale(value, { dateOnly, locale, timeZone });
  }
  const parts = buildDateFormatParts(value, { dateOnly, locale, timeZone });
  if (!parts) {
    return null;
  }
  const formatted = applyDateTimePattern(parts, pattern, {
    dateOnly,
    patternTokenCache
  });
  if (!formatted) {
    return null;
  }
  if (dateOnly) {
    return formatted.replace(/[-:/,\s]+$/, "").trim();
  }
  return formatted;
}

export function formatValueWithLocale(
  value,
  {
    dateOnly = false,
    locale = DEFAULT_LOCALE,
    timeZone = DEFAULT_TIME_ZONE
  } = {}
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const dateObj = parseDateValue(value, { dateOnly });
  if (!dateObj || Number.isNaN(dateObj.getTime())) {
    return null;
  }
  const resolvedTimeZone = dateOnly ? "UTC" : timeZone;
  const options = dateOnly
    ? { dateStyle: "short", timeZone: resolvedTimeZone }
    : { dateStyle: "short", timeStyle: "short", timeZone: resolvedTimeZone };
  return new Intl.DateTimeFormat(locale, options).format(dateObj);
}

export function buildDateFormatParts(
  value,
  {
    dateOnly = false,
    locale = DEFAULT_LOCALE,
    timeZone = DEFAULT_TIME_ZONE
  } = {}
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (dateOnly && typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const [, year, month, day] = match;
      const baseDate = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day))
      );
      return {
        year,
        yearShort: year.slice(-2),
        month,
        monthNumber: String(Number(month)),
        day,
        dayNumber: String(Number(day)),
        hour24: "00",
        hour12: "12",
        hour12NoPad: "12",
        minute: "00",
        second: "00",
        millisecond: "000",
        amPm: "",
        monthShort: new Intl.DateTimeFormat(locale, {
          month: "short",
          timeZone: "UTC"
        }).format(baseDate),
        monthLong: new Intl.DateTimeFormat(locale, {
          month: "long",
          timeZone: "UTC"
        }).format(baseDate),
        weekdayShort: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          timeZone: "UTC"
        }).format(baseDate),
        weekdayLong: new Intl.DateTimeFormat(locale, {
          weekday: "long",
          timeZone: "UTC"
        }).format(baseDate),
        timeZoneNameShort: "",
        timeZoneNameLong: ""
      };
    }
  }

  const dateObj = parseDateValue(value, { dateOnly });
  if (Number.isNaN(dateObj.getTime())) {
    return null;
  }

  const baseFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const baseParts = {};
  baseFormatter.formatToParts(dateObj).forEach((part) => {
    if (part.type !== "literal") {
      baseParts[part.type] = part.value;
    }
  });

  const twelveHourFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    hour12: true
  });
  let hour12 = "12";
  let hour12NoPad = "12";
  twelveHourFormatter.formatToParts(dateObj).forEach((part) => {
    if (part.type === "hour") {
      hour12 = part.value.padStart(2, "0");
      hour12NoPad = String(Number(part.value));
    }
    if (part.type === "dayPeriod") {
      baseParts.amPm = part.value;
    }
  });

  const timeZoneFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "short"
  });
  const longTimeZoneFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "long"
  });

  const shortZone = timeZoneFormatter
    .formatToParts(dateObj)
    .find((part) => part.type === "timeZoneName");
  const longZone = longTimeZoneFormatter
    .formatToParts(dateObj)
    .find((part) => part.type === "timeZoneName");

  return {
    year: baseParts.year,
    yearShort: baseParts.year ? baseParts.year.slice(-2) : "",
    month: baseParts.month,
    monthNumber: baseParts.month ? String(Number(baseParts.month)) : "",
    day: baseParts.day,
    dayNumber: baseParts.day ? String(Number(baseParts.day)) : "",
    hour24: baseParts.hour,
    hour12,
    hour12NoPad,
    minute: baseParts.minute,
    second: baseParts.second,
    millisecond: String(dateObj.getMilliseconds()).padStart(3, "0"),
    amPm: baseParts.amPm || (dateObj.getHours() >= 12 ? "PM" : "AM"),
    monthShort: new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone
    }).format(dateObj),
    monthLong: new Intl.DateTimeFormat(locale, {
      month: "long",
      timeZone
    }).format(dateObj),
    weekdayShort: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone
    }).format(dateObj),
    weekdayLong: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      timeZone
    }).format(dateObj),
    timeZoneNameShort: shortZone?.value || "",
    timeZoneNameLong: longZone?.value || ""
  };
}

export function applyDateTimePattern(
  parts,
  pattern,
  { dateOnly = false, patternTokenCache } = {}
) {
  if (!pattern || !parts) {
    return null;
  }
  const tokens = getPatternTokens(pattern, patternTokenCache);
  if (!tokens.length) {
    return null;
  }
  let result = "";
  let hasOutput = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === "literal") {
      const futureOutput = hasFutureTokenOutput(tokens, i + 1, parts, {
        dateOnly
      });
      const shouldInclude = futureOutput || hasOutput;
      if (!shouldInclude) {
        continue;
      }
      if (
        !futureOutput &&
        dateOnly &&
        CONNECTOR_LITERAL_PATTERN.test(token.value)
      ) {
        continue;
      }
      result += token.value;
      continue;
    }
    const value = getTokenFormattedValue(token.value, parts, { dateOnly });
    if (value) {
      result += value;
      hasOutput = true;
    }
  }
  return result.trim().replace(/\s{2,}/g, " ");
}

export function tryFormatDateOrDateTimeString(value, options = {}) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/i.test(trimmed)) {
    const hasTime = /\d{2}:\d{2}/.test(trimmed);
    return formatValueWithPattern(trimmed, { ...options, dateOnly: !hasTime });
  }
  return null;
}

function parseDateValue(value, { dateOnly } = {}) {
  if (value instanceof Date) {
    return value;
  }
  if (dateOnly && typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const [, year, month, day] = match;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }
  return new Date(value);
}

function getPatternTokens(pattern, patternTokenCache) {
  const cache = patternTokenCache || new Map();
  if (cache.has(pattern)) {
    return cache.get(pattern);
  }
  const tokens = [];
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "'") {
      let literal = "";
      i += 1;
      while (i < pattern.length) {
        const current = pattern[i];
        if (current === "'") {
          if (pattern[i + 1] === "'") {
            literal += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        literal += current;
        i += 1;
      }
      if (literal) {
        tokens.push({ type: "literal", value: literal });
      }
      continue;
    }
    if (TIME_TOKEN_CHARS.has(char)) {
      let sequence = char;
      i += 1;
      while (i < pattern.length && pattern[i] === char) {
        sequence += char;
        i += 1;
      }
      tokens.push({ type: "token", value: sequence });
      continue;
    }
    tokens.push({ type: "literal", value: char });
    i += 1;
  }
  cache.set(pattern, tokens);
  return tokens;
}

function hasFutureTokenOutput(
  tokens,
  startIndex,
  parts,
  { dateOnly = false } = {}
) {
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== "token") {
      continue;
    }
    const value = getTokenFormattedValue(token.value, parts, { dateOnly });
    if (value) {
      return true;
    }
  }
  return false;
}

function getTokenFormattedValue(token, parts, { dateOnly = false } = {}) {
  switch (token) {
    case "yyyy":
      return parts.year;
    case "yy":
      return parts.yearShort;
    case "MMMM":
      return parts.monthLong;
    case "MMM":
      return parts.monthShort;
    case "MM":
      return parts.month;
    case "M":
      return parts.monthNumber;
    case "dd":
      return parts.day;
    case "d":
      return parts.dayNumber;
    case "HH":
      return parts.hour24;
    case "H":
      return parts.hour24 ? String(Number(parts.hour24)) : "";
    case "hh":
      return parts.hour12;
    case "h":
      return parts.hour12NoPad;
    case "mm":
      return parts.minute;
    case "ss":
      return parts.second;
    case "SSS":
      return parts.millisecond;
    case "a":
      return dateOnly ? "" : parts.amPm;
    case "EEE":
      return parts.weekdayShort;
    case "EEEE":
      return parts.weekdayLong;
    case "z":
      return parts.timeZoneNameShort;
    case "zzzz":
      return parts.timeZoneNameLong;
    default:
      return "";
  }
}
