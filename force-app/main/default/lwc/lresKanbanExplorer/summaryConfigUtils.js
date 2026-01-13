const SUMMARY_TYPES = new Set(["SUM", "AVG", "MIN", "MAX"]);
const MAX_SUMMARIES = 3;

export function parseSummaryDefinitions(rawValue) {
  const summaries = [];
  const warnings = [];
  const raw =
    rawValue === undefined || rawValue === null ? "" : String(rawValue);
  if (!raw.trim()) {
    return { summaries, warnings };
  }

  const entries = raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    let normalized = entry;
    if (normalized.startsWith("[") && normalized.endsWith("]")) {
      normalized = normalized.slice(1, -1).trim();
    }

    const parts = normalized.split("|").map((part) => part.trim());
    if (parts.length < 3) {
      warnings.push(`Invalid summary entry: "${entry}"`);
      continue;
    }

    const fieldApiName = parts[0];
    const summaryTypeRaw = parts[1];
    const label = parts.slice(2).join("|").trim();

    if (!fieldApiName || !summaryTypeRaw || !label) {
      warnings.push(`Invalid summary entry: "${entry}"`);
      continue;
    }

    const summaryType = summaryTypeRaw.toUpperCase();
    if (!SUMMARY_TYPES.has(summaryType)) {
      warnings.push(
        `Unsupported summary type "${summaryTypeRaw}" in "${entry}"`
      );
      continue;
    }

    summaries.push({ fieldApiName, summaryType, label });
    if (summaries.length === MAX_SUMMARIES) {
      if (entries.length > MAX_SUMMARIES) {
        warnings.push("Only the first 3 summaries are used.");
      }
      break;
    }
  }

  return { summaries, warnings };
}

export function normalizeSummaryType(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toUpperCase();
  return SUMMARY_TYPES.has(normalized) ? normalized : null;
}

export const SUPPORTED_SUMMARY_TYPES = Array.from(SUMMARY_TYPES);
