export function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function normalizePositiveInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

export function normalizeBoolean(value) {
  return value === true || value === "true";
}

export function formatApiName(name) {
  if (!name) {
    return "";
  }
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/__/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatObjectLabel(apiName) {
  const normalized = normalizeString(apiName);
  if (!normalized) {
    return null;
  }
  let baseName = normalized;
  if (baseName.includes(".")) {
    const segments = baseName.split(".");
    baseName = segments[segments.length - 1];
  }
  const suffixes = ["__c", "__mdt", "__pc", "__x", "__b"];
  suffixes.forEach((suffix) => {
    if (baseName.toLowerCase().endsWith(suffix.toLowerCase())) {
      baseName = baseName.slice(0, -suffix.length);
    }
  });
  if (baseName.includes("__")) {
    const parts = baseName.split("__");
    baseName = parts[parts.length - 1];
  }
  return formatApiName(baseName);
}
