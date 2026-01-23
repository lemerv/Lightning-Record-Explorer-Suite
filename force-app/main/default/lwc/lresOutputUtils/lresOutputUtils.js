let domParser;

function ensureDomParser() {
  if (!domParser && typeof DOMParser !== "undefined") {
    domParser = new DOMParser();
  }
  return domParser;
}

export function sanitizeFieldOutput(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const withBreaks = replaceHtmlBreaks(value);
  const decoded = decodeHtmlEntities(withBreaks);
  return normalizeLineBreaks(decoded);
}

function replaceHtmlBreaks(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/<\s*br\s*\/?>/gi, "\n");
}

function decodeHtmlEntities(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  if (!/[&<]/.test(value)) {
    return value;
  }
  try {
    const parser = ensureDomParser();
    if (!parser) {
      return value;
    }
    const doc = parser.parseFromString(value, "text/html");
    return doc?.body?.textContent || value;
  } catch {
    return value;
  }
}

function normalizeLineBreaks(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\r\n/g, "\n");
}
