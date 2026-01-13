export const BLANK_KEY = "__KANBAN_BLANK__";

export function buildColumns(records = [], options = {}) {
  const {
    groupingField,
    cardFields = [],
    defaultTitleField = null,
    blankGroupLabel = "No Value",
    blankKey = BLANK_KEY,
    metadataColumns = [],
    isGroupingFieldOptional = false,
    sortField,
    fallbackSortField,
    sortDirection = "asc",
    isRecordIncluded = () => true,
    extractFieldData = () => ({ raw: null, display: "" }),
    extractFieldValue = () => "",
    extractSimpleFieldName = () => "",
    getFieldLabel = () => "",
    parseIconEntry = () => ({ iconName: null, emoji: null }),
    cardFieldIcons = [],
    shouldDisplayParentReferenceOnCards = false,
    getRecordParentLabel = () => null,
    getRecordUrl = () => null,
    parentBadgeLabel = "Parent",
    sanitizeFieldOutput = (value) => value,
    getFieldMetadata = () => null,
    getUiPicklistValues,
    dateTimeFormat,
    patternTokenCache,
    summaryDefinitions = [],
    coerceSummaryValue = () => null,
    formatSummaryValue = () => "",
    getSummaryCurrencyCode = () => null,
    logDebug = () => {},
    logWarn = () => {}
  } = options;

  if (!groupingField) {
    logWarn("buildColumns invoked without a grouping field.");
    return [];
  }

  const fieldsToUse =
    Array.isArray(cardFields) && cardFields.length
      ? cardFields
      : [defaultTitleField];
  const titleField = fieldsToUse[0];

  logDebug("Building columns from dataset.", {
    recordCount: records?.length || 0,
    groupingField,
    cardFieldCount: cardFields?.length || 0
  });

  const lanes = new Map();

  records.forEach((record) => {
    if (!isRecordIncluded(record)) {
      return;
    }
    const groupingData = extractFieldData(record, groupingField) || {
      raw: null,
      display: ""
    };
    const rawValue = groupingData.raw;
    const displayValue = groupingData.display || blankGroupLabel;
    const normalizedRawValue =
      rawValue !== null && rawValue !== undefined && rawValue !== ""
        ? rawValue
        : null;
    const laneKey =
      normalizedRawValue !== null ? String(normalizedRawValue) : blankKey;

    if (!lanes.has(laneKey)) {
      lanes.set(laneKey, {
        key: laneKey,
        label:
          laneKey === blankKey
            ? blankGroupLabel
            : displayValue || String(normalizedRawValue ?? ""),
        rawValue: normalizedRawValue,
        entries: []
      });
    }

    const lane = lanes.get(laneKey);
    const card = buildCard(record, {
      titleField,
      cardFields: fieldsToUse,
      cardFieldIcons,
      parseIconEntry,
      extractFieldValue,
      extractSimpleFieldName,
      getFieldLabel,
      getRecordUrl,
      shouldDisplayParentReferenceOnCards,
      getRecordParentLabel,
      parentBadgeLabel
    });
    lane.entries.push({
      record,
      card
    });
  });

  const sortOptions = {
    primaryField: sortField || fallbackSortField || titleField,
    fallbackField: fallbackSortField || titleField,
    direction: sortDirection,
    extractFieldData,
    sanitizeFieldOutput,
    getFieldMetadata,
    getUiPicklistValues
  };

  lanes.forEach((lane) => {
    const entries = lane.entries || [];
    const sortedEntries = sortEntries(entries, sortOptions);
    lane.entries = sortedEntries;
    lane.records = sortedEntries.map((entry) => entry.card);
    const { summaries, warnings } = buildLaneSummaries(sortedEntries, {
      summaryDefinitions,
      coerceSummaryValue,
      formatSummaryValue,
      getSummaryCurrencyCode,
      columnLabel: lane.label,
      dateTimeFormat,
      patternTokenCache
    });
    lane.summaries = summaries;
    lane.summaryWarnings = warnings;
  });

  const orderedKeys = [];
  const usedKeys = new Set();
  (metadataColumns || []).forEach((columnDef) => {
    const laneKey = columnDef.key;
    let lane = lanes.get(laneKey);
    if (!lane) {
      lane = {
        key: laneKey,
        label: columnDef.label,
        rawValue: columnDef.rawValue,
        entries: [],
        records: []
      };
      lanes.set(laneKey, lane);
    } else {
      lane.label = columnDef.label;
      lane.rawValue = columnDef.rawValue;
      lane.entries = lane.entries || [];
      lane.records = lane.records || [];
    }
    orderedKeys.push(laneKey);
    usedKeys.add(laneKey);
  });

  const hasBlankRecords = lanes.has(blankKey);
  const shouldIncludeBlankColumn = hasBlankRecords || isGroupingFieldOptional;

  if (shouldIncludeBlankColumn) {
    let blankLane = lanes.get(blankKey);
    if (!blankLane) {
      blankLane = {
        key: blankKey,
        entries: [],
        records: []
      };
      lanes.set(blankKey, blankLane);
    }
    blankLane.label = blankGroupLabel;
    blankLane.rawValue = null;
    if (!usedKeys.has(blankKey)) {
      orderedKeys.push(blankKey);
      usedKeys.add(blankKey);
    }
  }

  const orderedColumns = orderedKeys.map((key) => {
    const lane = lanes.get(key);
    return {
      key: lane.key,
      label: lane.label,
      rawValue: lane.rawValue,
      records: lane.records,
      count: lane.records.length,
      summaries: lane.summaries || [],
      summaryWarnings: lane.summaryWarnings || []
    };
  });

  const remainingColumns = Array.from(lanes.entries())
    .filter(([key]) => !usedKeys.has(key))
    .map(([, lane]) => ({
      key: lane.key,
      label: lane.label,
      rawValue: lane.rawValue,
      records: lane.records,
      count: lane.records.length,
      summaries: lane.summaries || [],
      summaryWarnings: lane.summaryWarnings || []
    }))
    .sort((a, b) => {
      const aLabel = a.label || "";
      const bLabel = b.label || "";
      return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
    });

  const columns = [...orderedColumns, ...remainingColumns];
  logDebug("Column build complete.", { columnCount: columns.length });
  return columns;
}

function buildLaneSummaries(entries, options = {}) {
  const {
    summaryDefinitions = [],
    coerceSummaryValue = () => null,
    formatSummaryValue = () => "",
    getSummaryCurrencyCode = () => null,
    columnLabel,
    dateTimeFormat,
    patternTokenCache
  } = options;

  if (!Array.isArray(summaryDefinitions) || summaryDefinitions.length === 0) {
    return { summaries: [], warnings: [] };
  }

  const summaries = [];
  const warnings = [];
  summaryDefinitions.forEach((summary) => {
    const summaryKey = [
      summary.fieldApiName || "",
      summary.summaryType || "",
      summary.label || ""
    ].join("|");
    if (summary.dataType === "currency") {
      const currencyCodes = new Set(
        entries
          .map((entry) => getSummaryCurrencyCode(entry.record))
          .map((value) => (typeof value === "string" ? value : value?.code))
          .filter((value) => value)
      );
      if (currencyCodes.size > 1) {
        const resolvedLabel = columnLabel || "this column";
        warnings.push(
          `Summary "${summary.label}" is blocked for "${resolvedLabel}" because multiple currencies are present.`
        );
        summaries.push({
          key: summaryKey,
          label: summary.label,
          value: "Mixed currencies"
        });
        return;
      }
    }
    const values = entries
      .map((entry) => coerceSummaryValue(entry.record, summary))
      .filter((value) => value !== null && value !== undefined);
    if (!values.length) {
      summaries.push({
        key: summaryKey,
        label: summary.label,
        value: formatSummaryValue(summary, null)
      });
      return;
    }
    let result = null;
    if (summary.summaryType === "COUNT_TRUE") {
      result = values.filter((value) => value === true).length;
    } else if (summary.summaryType === "COUNT_FALSE") {
      result = values.filter((value) => value === false).length;
    } else if (
      summary.summaryType === "MIN" &&
      (summary.dataType === "date" || summary.dataType === "datetime")
    ) {
      let best = null;
      let bestTime = null;
      values.forEach((value) => {
        const time = new Date(value).getTime();
        if (Number.isNaN(time)) {
          return;
        }
        if (bestTime === null || time < bestTime) {
          bestTime = time;
          best = value;
        }
      });
      result = best;
    } else if (
      summary.summaryType === "MAX" &&
      (summary.dataType === "date" || summary.dataType === "datetime")
    ) {
      let best = null;
      let bestTime = null;
      values.forEach((value) => {
        const time = new Date(value).getTime();
        if (Number.isNaN(time)) {
          return;
        }
        if (bestTime === null || time > bestTime) {
          bestTime = time;
          best = value;
        }
      });
      result = best;
    } else if (summary.summaryType === "SUM") {
      result = values.reduce((total, value) => total + value, 0);
    } else if (summary.summaryType === "AVG") {
      const total = values.reduce((sum, value) => sum + value, 0);
      result = total / values.length;
    } else if (summary.summaryType === "MIN") {
      result = Math.min(...values);
    } else if (summary.summaryType === "MAX") {
      result = Math.max(...values);
    }
    let currencyCode = null;
    let useNarrowCurrencySymbol = false;
    if (summary.dataType === "currency") {
      const resolvedCurrency =
        entries
          .map((entry) => getSummaryCurrencyCode(entry.record))
          .find((value) => value) || null;
      if (resolvedCurrency) {
        if (typeof resolvedCurrency === "string") {
          currencyCode = resolvedCurrency;
        } else {
          currencyCode = resolvedCurrency.code;
          useNarrowCurrencySymbol = Boolean(resolvedCurrency.isFallback);
        }
      }
    }
    summaries.push({
      key: summaryKey,
      label: summary.label,
      value: formatSummaryValue(summary, result, {
        currencyCode,
        useNarrowCurrencySymbol,
        dateTimeFormat,
        patternTokenCache
      })
    });
  });

  return { summaries, warnings };
}

export function buildCard(record, options = {}) {
  const {
    titleField,
    cardFields = [],
    cardFieldIcons = [],
    parseIconEntry = () => ({ iconName: null, emoji: null }),
    extractFieldValue = () => "",
    extractSimpleFieldName = () => "",
    getFieldLabel = () => "",
    getRecordUrl = () => null,
    shouldDisplayParentReferenceOnCards = false,
    getRecordParentLabel = () => null,
    parentBadgeLabel = "Parent"
  } = options;

  const icons = Array.isArray(cardFieldIcons) ? cardFieldIcons : [];
  const titleIconMeta = parseIconEntry(icons[0]);
  const details = (cardFields || []).slice(1).map((field, index) => {
    const iconMeta = parseIconEntry(icons[index + 1]);
    return {
      apiName: extractSimpleFieldName(field),
      label: getFieldLabel(field),
      value: extractFieldValue(record, field),
      iconName: iconMeta.iconName,
      iconEmoji: iconMeta.emoji,
      className: "kanban-card_field"
    };
  });

  if (shouldDisplayParentReferenceOnCards) {
    const parentLabel = getRecordParentLabel(record);
    if (parentLabel) {
      details.push({
        apiName: "__parentReference",
        label: parentBadgeLabel,
        value: parentLabel,
        iconName: null,
        iconEmoji: null,
        isParentBadge: true,
        className: "kanban-card_field kanban-card_field--parent"
      });
    }
  }

  return {
    id: record?.id,
    title: extractFieldValue(record, titleField),
    titleIcon: titleIconMeta.iconName,
    titleEmoji: titleIconMeta.emoji,
    details,
    recordUrl: getRecordUrl(record)
  };
}

function sortEntries(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const { primaryField, fallbackField, direction = "asc" } = options;
  const primary = primaryField || fallbackField;
  const fallback =
    fallbackField && fallbackField !== primary ? fallbackField : null;
  const isDescending = direction === "desc";
  return [...entries].sort((entryA, entryB) => {
    const first = isDescending ? entryB : entryA;
    const second = isDescending ? entryA : entryB;
    let result = compareRecordsForSort(
      first.record,
      second.record,
      primary,
      options
    );
    if (result === 0 && fallback) {
      result = compareRecordsForSort(
        first.record,
        second.record,
        fallback,
        options
      );
    }
    return result;
  });
}

function compareRecordsForSort(recordA, recordB, field, options = {}) {
  if (!field) {
    return 0;
  }
  const comparator = getFieldComparator(field, options);
  if (comparator) {
    return comparator(recordA, recordB);
  }
  const valueA = getSortValue(recordA, field, options);
  const valueB = getSortValue(recordB, field, options);
  return compareSortValues(valueA, valueB);
}

function getSortValue(record, field, options = {}) {
  if (!record || !field) {
    return null;
  }
  const data = options.extractFieldData?.(record, field);
  if (data?.raw !== null && data?.raw !== undefined && data.raw !== "") {
    return data.raw;
  }
  if (data?.display !== null && data?.display !== undefined) {
    return options.sanitizeFieldOutput?.(data.display);
  }
  return null;
}

function compareSortValues(a, b) {
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty && bEmpty) {
    return 0;
  }
  if (aEmpty) {
    return 1;
  }
  if (bEmpty) {
    return -1;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const aString = String(a).toLowerCase();
  const bString = String(b).toLowerCase();
  return aString.localeCompare(bString, undefined, { sensitivity: "base" });
}

function isEmptySortValue(value) {
  return value === null || value === undefined || value === "";
}

function getFieldComparator(field, options = {}) {
  const metadata = options.getFieldMetadata?.(field);
  if (metadata?.dataType === "Picklist") {
    const resolver = getPicklistOrderResolver(field, metadata, options);
    if (resolver) {
      return (recordA, recordB) => {
        const valueA = getSortValue(recordA, field, options);
        const valueB = getSortValue(recordB, field, options);
        const indexA = resolver(valueA);
        const indexB = resolver(valueB);
        if (indexA === indexB) {
          return compareSortValues(valueA, valueB);
        }
        return indexA - indexB;
      };
    }
  }
  return null;
}

function getPicklistOrderResolver(field, metadata, options = {}) {
  const order = [];
  if (metadata?.picklistValues?.length) {
    metadata.picklistValues.forEach((item) => {
      if (item && item.value !== undefined && item.value !== null) {
        order.push(String(item.value));
      }
    });
  }
  if (!order.length && typeof options.getUiPicklistValues === "function") {
    const uiValues = options.getUiPicklistValues(field);
    if (Array.isArray(uiValues)) {
      uiValues.forEach((item) => {
        if (item && item.value !== undefined && item.value !== null) {
          order.push(String(item.value));
        }
      });
    }
  }
  if (!order.length) {
    return null;
  }
  const orderMap = new Map();
  order.forEach((value, index) => {
    if (!orderMap.has(value)) {
      orderMap.set(value, index);
    }
  });
  const fallbackIndex = orderMap.size + 1;
  return (value) => {
    if (value === null || value === undefined || value === "") {
      return fallbackIndex;
    }
    const key = String(value);
    return orderMap.has(key) ? orderMap.get(key) : fallbackIndex;
  };
}
