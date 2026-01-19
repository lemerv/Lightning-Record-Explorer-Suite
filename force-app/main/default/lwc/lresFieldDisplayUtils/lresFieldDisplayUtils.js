import CURRENCY from "@salesforce/i18n/currency";
import {
  formatValueWithPattern,
  tryFormatDateOrDateTimeString
} from "c/lresDateTimeUtils";
import {
  formatApiName,
  formatObjectLabel,
  normalizeString
} from "c/lresFieldUtils";
import { sanitizeFieldOutput } from "c/lresOutputUtils";

const DEFAULT_FIELD_PLACEHOLDER = "--";
const DEFAULT_OBJECT_NAME_FIELD = "Name";
const NUMERIC_TYPES = new Set([
  "currency",
  "percent",
  "double",
  "integer",
  "long",
  "number"
]);
const OBJECT_DEFAULT_NAME_FIELD_MAP = {
  Case: "CaseNumber",
  EmailMessage: "Subject",
  Task: "Subject",
  Event: "Subject",
  Order: "OrderNumber",
  Invoice: "InvoiceNumber",
  ContractLineItem: "LineItemNumber",
  CaseMilestone: "MilestoneType",
  OpportunityContactRole: "Contact.Name",
  CampaignMember: "Contact.Name",
  PricebookEntry: "Product2.Name",
  OpportunityLineItem: "Product2.Name",
  AssetRelationship: "Asset.Name",
  KnowledgeArticleVersion: "Title",
  UserRole: "Name",
  Profile: "Name",
  PermissionSetAssignment: "PermissionSet.Name"
};

export function getDefaultDisplayField(component) {
  const objectApiName = component?.cardObjectApiName;
  const objectInfo = component?.objectInfo;
  const mappedField = objectApiName
    ? OBJECT_DEFAULT_NAME_FIELD_MAP[objectApiName]
    : null;
  if (mappedField) {
    const qualified = qualifyFieldName(component, mappedField);
    if (qualified) {
      return qualified;
    }
  }
  if (objectInfo?.nameFields?.length) {
    const qualified = qualifyFieldName(component, objectInfo.nameFields[0]);
    if (qualified) {
      return qualified;
    }
  }
  return qualifyFieldName(component, DEFAULT_OBJECT_NAME_FIELD);
}

export function parseFieldList(component, raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .map((field) => qualifyFieldName(component, field))
    .filter(Boolean);
}

export function qualifyFieldName(component, fieldName) {
  const cardObjectApiName = component?.cardObjectApiName;
  if (!fieldName) {
    return null;
  }
  const trimmed = fieldName.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(".")) {
    if (cardObjectApiName && !trimmed.startsWith(`${cardObjectApiName}.`)) {
      return `${cardObjectApiName}.${trimmed}`;
    }
    return trimmed;
  }
  if (!cardObjectApiName) {
    return null;
  }
  return `${cardObjectApiName}.${trimmed}`;
}

function resolveRecordCacheId(record) {
  if (!record) {
    return null;
  }
  const directId = record.id || record.Id;
  if (directId) {
    return String(directId);
  }
  const fieldId = record?.fields?.Id?.value || record?.fields?.Id?.displayValue;
  return fieldId ? String(fieldId) : null;
}

function resolveFieldCacheKey(component, field) {
  if (!field) {
    return null;
  }
  const normalized = normalizeFieldPath(component, field);
  return normalized || null;
}

export function extractFieldData(component, record, field) {
  const cache = component?._fieldDataCache;
  const recordId = resolveRecordCacheId(record);
  const cacheKey = resolveFieldCacheKey(component, field);
  if (cache && recordId && cacheKey) {
    const recordCache = cache.get(recordId);
    if (recordCache?.has(cacheKey)) {
      return recordCache.get(cacheKey);
    }
  }

  const data = lookupFieldData(component, record, field);
  if (!data) {
    return { raw: null, display: "" };
  }
  const raw = data.value ?? null;
  const initialDisplay = data.displayValue ?? data.value ?? "";
  const display = formatFieldDisplayValue(
    component,
    field,
    raw,
    initialDisplay,
    record
  );
  const result = {
    raw,
    display: display === null || display === undefined ? "" : display
  };
  if (cache && recordId && cacheKey) {
    let recordCache = cache.get(recordId);
    if (!recordCache) {
      recordCache = new Map();
      cache.set(recordId, recordCache);
    }
    recordCache.set(cacheKey, result);
  }
  return result;
}

export function extractFieldValue(component, record, field) {
  const data = extractFieldData(component, record, field);
  const value = sanitizeFieldOutput(data.display || data.raw);
  return value === "" || value === null || value === undefined
    ? DEFAULT_FIELD_PLACEHOLDER
    : value;
}

export function lookupFieldData(component, record, field) {
  if (!field || !record?.fields) {
    return null;
  }
  const candidates = buildFieldCandidateList(component, field);
  for (const candidate of candidates) {
    if (candidate && record.fields[candidate]) {
      return record.fields[candidate];
    }
  }
  return null;
}

export function extractSimpleFieldName(field) {
  if (!field) {
    return "";
  }
  const segments = field.split(".");
  return segments[segments.length - 1];
}

export function buildFieldCandidateList(component, field) {
  if (!field) {
    return [];
  }
  const candidates = new Set();
  const normalized = normalizeFieldPath(component, field);
  candidates.add(normalized);
  const stripped = stripObjectPrefix(component, normalized);
  if (stripped) {
    candidates.add(stripped);
  }
  const relationshipPaths = expandRelationshipPath(stripped);
  relationshipPaths.forEach((path) => candidates.add(path));
  const segments = stripped ? stripped.split(".").filter(Boolean) : [];
  if (segments.length > 1) {
    candidates.add(segments[segments.length - 1]);
  }
  return Array.from(candidates).filter(Boolean);
}

export function normalizeFieldPath(component, field) {
  if (!field) {
    return field;
  }
  const cardObjectApiName = component?.cardObjectApiName;
  if (cardObjectApiName && !field.startsWith(`${cardObjectApiName}.`)) {
    return `${cardObjectApiName}.${field}`;
  }
  return field;
}

export function stripObjectPrefix(component, field) {
  if (!field || !component?.cardObjectApiName) {
    return field;
  }
  const prefix = `${component.cardObjectApiName}.`;
  if (field.startsWith(prefix)) {
    return field.slice(prefix.length);
  }
  return field;
}

export function getParentLabelById(component, recordId) {
  if (!recordId) {
    return null;
  }
  return component?.parentLabelById?.get(recordId) || null;
}

export function expandRelationshipPath(field) {
  if (!field) {
    return [];
  }
  const segments = field.split(".").filter(Boolean);
  const candidates = [];
  for (let i = 0; i < segments.length; i += 1) {
    candidates.push(segments.slice(0, i + 1).join("."));
  }
  return candidates;
}

export function getFieldDisplay(component, record, field) {
  if (!field) {
    return "";
  }
  const data = extractFieldData(component, record, field);
  if (!data) {
    return "";
  }
  const value = data.display || data.raw;
  if (value === null || value === undefined) {
    return "";
  }
  return sanitizeFieldOutput(value);
}

export function getRecordOwnerId(component, record) {
  const data = extractFieldData(component, record, component?.ownerFieldName);
  if (data?.raw !== null && data?.raw !== undefined && data.raw !== "") {
    return String(data.raw);
  }
  if (data?.display) {
    return sanitizeFieldOutput(data.display);
  }
  return "";
}

export function getRecordOwnerLabel(component, record) {
  const fullName = getFieldDisplay(
    component,
    record,
    qualifyFieldName(component, "Owner.Name")
  );
  if (fullName) {
    return fullName;
  }
  const firstName = getFieldDisplay(
    component,
    record,
    qualifyFieldName(component, "Owner.FirstName")
  );
  const lastName = getFieldDisplay(
    component,
    record,
    qualifyFieldName(component, "Owner.LastName")
  );
  const composed = [firstName, lastName].filter(Boolean).join(" ");
  if (composed) {
    return composed.trim();
  }
  return getFieldDisplay(component, record, component?.ownerFieldName);
}

export function getRecordParentLabel(component, record) {
  if (!record) {
    return null;
  }
  const parentInfo = record.parent || null;
  if (parentInfo?.name) {
    return sanitizeFieldOutput(parentInfo.name);
  }
  if (parentInfo?.id) {
    return getParentLabelById(component, parentInfo.id) || parentInfo.id;
  }
  return null;
}

export function coerceIconName(value) {
  if (!value) {
    return null;
  }
  if (value.includes(":")) {
    return value;
  }
  return `utility:${value}`;
}

export function resolveEmoji(value) {
  if (!value) {
    return null;
  }
  const unicodeMatch = /^u\+([0-9a-f]{1,6})$/i.exec(value);
  if (unicodeMatch) {
    try {
      return String.fromCodePoint(parseInt(unicodeMatch[1], 16));
    } catch {
      return null;
    }
  }
  if (/[\p{Emoji}\p{Extended_Pictographic}]/u.test(value)) {
    return value;
  }
  return null;
}

export function getEffectiveSortField(component, defaultField) {
  return (
    component?.sortFieldQualified ||
    defaultField ||
    qualifyFieldName(component, "Name") ||
    qualifyFieldName(component, "Id")
  );
}

export function getFieldMetadata(component, field) {
  const apiName = extractSimpleFieldName(field);
  return component?.objectInfo?.fields?.[apiName] || null;
}

export function getRelationshipFieldMetadata(component, relationshipName) {
  if (!relationshipName || !component?.objectInfo?.fields) {
    return null;
  }
  const target = String(relationshipName).toLowerCase();
  return (
    Object.values(component.objectInfo.fields).find(
      (field) =>
        field?.relationshipName &&
        String(field.relationshipName).toLowerCase() === target
    ) || null
  );
}

export function getRelationshipLabel(component, relationshipName) {
  if (!relationshipName) {
    return null;
  }
  const metadata = getRelationshipFieldMetadata(component, relationshipName);
  if (!metadata) {
    return formatApiName(relationshipName);
  }
  const isCustomRelationship = String(relationshipName)
    .toLowerCase()
    .endsWith("__r");
  if (isCustomRelationship) {
    if (metadata.referenceToInfos?.length) {
      const referenced =
        metadata.referenceToInfos.find((entry) => entry?.label) ||
        metadata.referenceToInfos[0];
      if (referenced?.label) {
        return referenced.label;
      }
    }
    if (metadata.label) {
      return metadata.label;
    }
    const baseName = relationshipName.slice(0, -3);
    return formatObjectLabel(baseName || relationshipName);
  }
  if (metadata.relationshipName) {
    return formatApiName(metadata.relationshipName);
  }
  if (metadata.referenceToInfos?.length) {
    const referenced =
      metadata.referenceToInfos.find((entry) => entry?.label) ||
      metadata.referenceToInfos[0];
    if (referenced?.label) {
      return referenced.label;
    }
  }
  if (metadata.label) {
    return metadata.label;
  }
  return formatApiName(relationshipName);
}

export function getMetadataColumns(component) {
  const fieldName = component?.groupingFieldSimpleName;
  if (!fieldName || !component?.picklistFieldValues) {
    return [];
  }
  const fieldValues = component.picklistFieldValues[fieldName];
  if (!fieldValues || !Array.isArray(fieldValues.values)) {
    return [];
  }
  return fieldValues.values
    .filter(
      (item) =>
        item &&
        item.active !== false &&
        item.value !== null &&
        item.value !== undefined &&
        item.value !== ""
    )
    .map((item) => ({
      key: String(item.value),
      label: item.label,
      rawValue: item.value
    }));
}

export function getFieldLabel(component, field) {
  const strippedFieldPath = stripObjectPrefix(component, field);
  const pathSegments = strippedFieldPath
    ? strippedFieldPath.split(".").filter(Boolean)
    : [];
  if (pathSegments.length > 1) {
    const relationshipLabel =
      getRelationshipLabel(component, pathSegments[0]) ||
      formatApiName(pathSegments[0]);
    const middleLabels = pathSegments
      .slice(1, -1)
      .map((segment) => formatApiName(segment))
      .filter(Boolean);
    const leafLabel = formatApiName(pathSegments[pathSegments.length - 1]);
    return [relationshipLabel, ...middleLabels, leafLabel]
      .filter(Boolean)
      .join(" \u2192 ");
  }
  const apiName = extractSimpleFieldName(field);
  const metadata = component?.objectInfo?.fields?.[apiName];
  if (metadata?.label) {
    return metadata.label;
  }
  return formatApiName(apiName);
}

export function formatFieldDisplayValue(
  component,
  field,
  rawValue,
  displayValue,
  record
) {
  const metadata = getFieldMetadata(component, field);
  if (!metadata) {
    return displayValue;
  }
  const valueToFormat = rawValue ?? displayValue;
  if (
    valueToFormat === null ||
    valueToFormat === undefined ||
    valueToFormat === ""
  ) {
    return displayValue;
  }
  const dataType = metadata.dataType;
  const isDateTime = dataType === "Datetime" || dataType === "DateTime";
  const isDateOnly = dataType === "Date";
  if (isDateTime || isDateOnly) {
    return (
      formatValueWithPattern(valueToFormat, {
        dateOnly: isDateOnly,
        pattern: component?.effectiveDateTimeFormat,
        patternTokenCache: component?.patternTokenCache
      }) ?? displayValue
    );
  }
  const normalizedType =
    typeof dataType === "string" ? dataType.toLowerCase() : "";
  if (!NUMERIC_TYPES.has(normalizedType)) {
    return displayValue;
  }
  if (
    displayValue !== null &&
    displayValue !== undefined &&
    displayValue !== ""
  ) {
    if (
      rawValue === null ||
      rawValue === undefined ||
      normalizeNumericString(displayValue) !== normalizeNumericString(rawValue)
    ) {
      return displayValue;
    }
  }
  const numericValue = coerceNumericValue(valueToFormat);
  if (!Number.isFinite(numericValue)) {
    return displayValue;
  }
  const formatterOptions = {};
  const scale =
    typeof metadata.scale === "number" && metadata.scale >= 0
      ? metadata.scale
      : undefined;
  if (scale !== undefined) {
    formatterOptions.minimumFractionDigits = scale;
    formatterOptions.maximumFractionDigits = scale;
  }
  let normalizedValue = numericValue;
  if (normalizedType === "percent") {
    formatterOptions.style = "percent";
    normalizedValue =
      Math.abs(normalizedValue) > 1 ? normalizedValue / 100 : normalizedValue;
  } else if (normalizedType === "currency") {
    const currencyCode =
      resolveCurrencyCodeFromRecord(record, CURRENCY) || CURRENCY;
    formatterOptions.style = "currency";
    formatterOptions.currency = currencyCode;
    formatterOptions.currencyDisplay = "symbol";
  }
  return new Intl.NumberFormat(undefined, formatterOptions).format(
    normalizedValue
  );
}

/**
 * Formats a field value with optional date/time formatting (metadata-free).
 * Handles arrays recursively and sanitizes output.
 * @param {*} value - The value to format
 * @param {Object} options - Formatting options
 * @param {string} options.pattern - Date/time format pattern
 * @param {Map} options.patternTokenCache - Pattern token cache for performance
 * @returns {string} Formatted value or empty string
 */
export function formatFieldValueWithOptions(
  value,
  { pattern, patternTokenCache } = {}
) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        formatFieldValueWithOptions(item, { pattern, patternTokenCache })
      )
      .filter((item) => item !== "")
      .join(", ");
  }
  const sanitized = normalizeString(sanitizeFieldOutput(String(value))) || "";
  return (
    tryFormatDateOrDateTimeString(sanitized, {
      pattern,
      patternTokenCache
    }) || sanitized
  );
}

function coerceNumericValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  const cleaned = String(rawValue).replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCurrencyCodeFromRecord(record, fallbackCurrencyCode) {
  const isValidCurrencyCode = (value) => {
    if (!value) {
      return false;
    }
    const normalized = String(value).trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) ? normalized : false;
  };
  const field = record?.fields?.CurrencyIsoCode;
  if (!field) {
    return isValidCurrencyCode(fallbackCurrencyCode) || null;
  }
  return (
    isValidCurrencyCode(field.value) ||
    isValidCurrencyCode(field.displayValue) ||
    isValidCurrencyCode(fallbackCurrencyCode) ||
    null
  );
}

function normalizeNumericString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return "";
  }
  return normalized.replace(/,/g, "");
}
