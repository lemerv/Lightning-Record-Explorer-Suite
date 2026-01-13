export function coerceNumericValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  const cleaned = String(rawValue).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function coerceSummaryValue(record, summary, extractFieldData) {
  if (
    !record ||
    !summary?.fieldApiName ||
    typeof extractFieldData !== "function"
  ) {
    return null;
  }
  const data = extractFieldData(record, summary.fieldApiName);
  return coerceNumericValue(data?.raw ?? null);
}

export function resolveCurrencyCode(
  record,
  extractFieldData,
  currencyFieldApiName,
  fallbackCurrencyCode
) {
  if (typeof extractFieldData === "function" && currencyFieldApiName) {
    const data = extractFieldData(record, currencyFieldApiName);
    return data?.raw ?? data?.display ?? fallbackCurrencyCode ?? null;
  }
  const field = record?.fields?.CurrencyIsoCode;
  if (!field) {
    return fallbackCurrencyCode ?? null;
  }
  return field.value || field.displayValue || fallbackCurrencyCode || null;
}

export function formatSummaryValue(summary, value, options = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  let normalizedValue = value;
  const scale =
    typeof summary?.scale === "number" && summary.scale >= 0
      ? summary.scale
      : undefined;
  const formatterOptions = {};
  if (scale !== undefined) {
    formatterOptions.minimumFractionDigits = scale;
    formatterOptions.maximumFractionDigits = scale;
  }
  if (summary?.dataType === "percent") {
    formatterOptions.style = "percent";
    normalizedValue =
      Math.abs(normalizedValue) > 1 ? normalizedValue / 100 : normalizedValue;
  } else if (summary?.dataType === "currency" && options.currencyCode) {
    formatterOptions.style = "currency";
    formatterOptions.currency = options.currencyCode;
  }
  return new Intl.NumberFormat(undefined, formatterOptions).format(
    normalizedValue
  );
}
