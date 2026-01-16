import { formatObjectLabel } from "c/lresFieldUtils";

const PARENT_SELECTION_DEBOUNCE_MS = 200;

function scheduleParentSelectionRefresh(component) {
  if (!component?.performCardRecordsRefresh) {
    return;
  }
  if (component._parentSelectionRefreshTimeout) {
    clearTimeout(component._parentSelectionRefreshTimeout);
  }
  // eslint-disable-next-line @lwc/lwc/no-async-operation
  component._parentSelectionRefreshTimeout = setTimeout(() => {
    component._parentSelectionRefreshTimeout = null;
    component.performCardRecordsRefresh().catch(() => {
      // Errors are surfaced by performCardRecordsRefresh.
    });
  }, PARENT_SELECTION_DEBOUNCE_MS);
}

export function handleConfigChange(component) {
  component.filtersDirty = true;
  component._dataModeCache = null;
  component.logDebug("handleConfigChange invoked.", {
    hasRequiredConfig: component.hasRequiredConfig,
    effectiveRecordId: component.effectiveRecordId
  });
  if (!component.hasRequiredConfig) {
    component.clearParentSelectionRefreshDebounce?.();
    component.columns = [];
    component.relatedRecords = [];
    component.selectedSortField = null;
    component.sortDirection = "asc";
    component.filterDefinitions = [];
    component.activeFilterMenuId = null;
    component.isSortMenuOpen = false;
    component.searchValue = "";
    component.unregisterMenuOutsideClick();
  }
  component.errorMessage = undefined;
  component.isLoading = component.hasRequiredConfig;
  if (
    component.dataMode?.reason === "missingRelatedList" &&
    component.parentObjectApiName
  ) {
    component.errorMessage =
      "Child Relationship Name is required when Parent Object API Name is set.";
    component.isLoading = false;
  }
  component.logDebug("handleConfigChange completed.", {
    isLoading: component.isLoading,
    selectedSortField: component.selectedSortField
  });
  component.ensureSortField();
  component.rebuildColumnsWithPicklist();
  const shouldRefresh =
    component.hasRequiredConfig &&
    (!component._suppressNextConfigRefresh ||
      component.shouldAutoRefreshOnConfig());
  if (component._suppressNextConfigRefresh) {
    component._suppressNextConfigRefresh = false;
  }
  if (shouldRefresh) {
    component.performCardRecordsRefresh().catch(() => {
      // Errors are surfaced by performCardRecordsRefresh.
    });
  }
}

export function updateEffectiveRecordId(component) {
  const nextParentId = component._selectedParentRecordIds?.[0] || null;
  const nextId = component._contextRecordId || nextParentId || null;
  if (component.effectiveRecordId === nextId) {
    return;
  }
  component.logDebug("Effective record id updated.", {
    previous: component.effectiveRecordId,
    next: nextId
  });
  component.effectiveRecordId = nextId;
}

export function applySelectedParentRecords(component, values, options = {}) {
  const { suppressRefresh = false } = options;
  const normalized = normalizeParentSelection(component, values);
  const previous = component._selectedParentRecordIds;
  const changed =
    normalized.length !== (previous?.length || 0) ||
    normalized.some((value, index) => value !== previous?.[index]);
  if (!changed) {
    return false;
  }
  component.logDebug("Parent selection updated.", {
    previous,
    next: normalized
  });
  component._selectedParentRecordIds = normalized;
  if (!suppressRefresh) {
    handleParentSelectionChange(component);
  }
  return true;
}

export function resetParentSelection(component) {
  component.logDebug("Resetting parent record selection.");
  applySelectedParentRecords(component, [], { suppressRefresh: true });
  updateEffectiveRecordId(component);
}

export function normalizeParentSelection(component, values) {
  if (!Array.isArray(values)) {
    if (values) {
      return [values];
    }
    return [];
  }
  const seen = new Set();
  const normalized = [];
  values.forEach((value) => {
    if (!value) {
      return;
    }
    const id = String(value);
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  });
  if (!component._defaultToMultipleParentSelection && normalized.length > 1) {
    return normalized.slice(0, 1);
  }
  return normalized;
}

export function handleParentSelectionChange(component) {
  updateEffectiveRecordId(component);
  component._suppressNextConfigRefresh = true;
  handleConfigChange(component);
  if (component.hasRequiredConfig) {
    scheduleParentSelectionRefresh(component);
  }
}

export function handleParentSelectorChange(component, event) {
  const values = Array.isArray(event?.detail?.values)
    ? event.detail.values
    : [];
  applySelectedParentRecords(component, values);
}

export function handleParentOptionsChange(component, event) {
  const detail = event?.detail || {};
  const options = Array.isArray(detail.options) ? detail.options : [];
  const label =
    detail.parentObjectLabel ||
    formatObjectLabel(component.parentObjectApiName) ||
    "Parent Record";
  component.parentObjectLabel = label;
  component.parentLabelById = new Map();
  options.forEach((option) => {
    if (option?.value) {
      component.parentLabelById.set(option.value, option.label || option.value);
    }
  });
}
