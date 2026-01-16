import { NavigationMixin } from "lightning/navigation";
import { updateRecord } from "lightning/uiRecordApi";
import { buildFilterDefinitions as buildFilterDefinitionsUtil } from "./filterUtils";
import { sanitizeFieldOutput } from "c/lresOutputUtils";

export function buildFilterDefinitions(component, records) {
  if (component.filtersDirty === false) {
    syncFilterDefinitions(component);
    component.logDebug("Filter definitions skipped; filters are clean.", {
      filterCount: component.filterDefinitions?.length || 0
    });
    return;
  }
  const { definitions, activeFilterMenuId, shouldCloseMenus } =
    buildFilterDefinitionsUtil({
      records: records || [],
      blueprints: getFilterBlueprints(component),
      existingDefinitions: component.filterDefinitions,
      activeFilterMenuId: component.activeFilterMenuId,
      getFilterValueKey: (record, blueprint) =>
        getFilterValueKey(component, record, blueprint),
      getFilterValueLabel: (record, blueprint, fallback) =>
        getFilterValueLabel(component, record, blueprint, fallback),
      sortFilterOptions: (options, field) =>
        sortFilterOptions(component, options, field),
      getFilterButtonClass: (id, hasSelection) =>
        getFilterButtonClass(component, id, hasSelection),
      isSortMenuOpen: component.isSortMenuOpen,
      logDebug: (message, detail) => component.logDebug(message, detail)
    });
  component.filterDefinitions = definitions;
  component.activeFilterMenuId = activeFilterMenuId;
  if (shouldCloseMenus) {
    component.unregisterMenuOutsideClick();
  }
  component.filtersDirty = false;
  component.logDebug("Filter definitions rebuilt.", {
    filterCount: component.filterDefinitions.length
  });
}

function syncFilterDefinitions(component) {
  const activeFilterMenuId = component.activeFilterMenuId;
  let activeMenuExists = false;
  const definitions = (component.filterDefinitions || []).map((def) => {
    const options = Array.isArray(def.options) ? def.options : [];
    const optionValues = new Set(options.map((option) => option.value));
    const selectedValues = (def.selectedValues || []).filter((value) =>
      optionValues.has(value)
    );
    const hasSelection = selectedValues.length > 0;
    const isOpen = def.id === activeFilterMenuId;
    if (isOpen) {
      activeMenuExists = true;
    }
    return {
      ...def,
      selectedValues,
      options: options.map((option) => ({
        ...option,
        selected: selectedValues.includes(option.value)
      })),
      isOpen,
      buttonClass: getFilterButtonClass(component, def.id, hasSelection)
    };
  });

  component.filterDefinitions = definitions;
  component.activeFilterMenuId = activeMenuExists ? activeFilterMenuId : null;
  if (!component.activeFilterMenuId && !component.isSortMenuOpen) {
    component.unregisterMenuOutsideClick();
  }
}

export function getFilterBlueprints(component) {
  const uniqueFields = component.filterFieldsQualified;
  return uniqueFields.map((field) => {
    const isOwner = field === component.ownerFieldName;
    return {
      id: field,
      field,
      label: isOwner ? "Owner" : component.getFieldLabel(field),
      type: isOwner ? "owner" : "field"
    };
  });
}

export function sortFilterOptions(component, options, field) {
  if (!options || !options.length) {
    return [];
  }
  const orderMap = getPicklistOrderMap(component, field);
  const sorted = Array.from(options);
  if (!orderMap) {
    return sorted.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }
  const fallbackIndex = orderMap.size;
  return sorted.sort((a, b) => {
    const aIndex = orderMap.has(a.value)
      ? orderMap.get(a.value)
      : fallbackIndex;
    const bIndex = orderMap.has(b.value)
      ? orderMap.get(b.value)
      : fallbackIndex;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function getPicklistOrderMap(component, field) {
  if (!field) {
    return null;
  }
  const simpleName = component.extractSimpleFieldName(field);
  if (!simpleName) {
    return null;
  }
  const metadata = component.objectInfo?.fields?.[simpleName];
  if (
    !metadata ||
    (metadata.dataType !== "Picklist" &&
      metadata.dataType !== "Multipicklist" &&
      metadata.dataType !== "MultiselectPicklist")
  ) {
    return null;
  }
  const picklistData = component.picklistFieldValues?.[simpleName];
  const values = picklistData?.values;
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const map = new Map();
  values.forEach((item, index) => {
    if (item && item.value !== null && item.value !== undefined) {
      map.set(String(item.value), index);
    }
  });
  return map;
}

export function getUiPicklistValues(component, field) {
  if (!field) {
    return null;
  }
  const simpleName = component.extractSimpleFieldName(field);
  if (!simpleName || !component.picklistFieldValues) {
    return null;
  }
  const picklistData = component.picklistFieldValues[simpleName];
  return picklistData?.values || null;
}

export function getFilterValueKey(component, record, blueprint) {
  if (blueprint.type === "owner") {
    return component.getRecordOwnerId(record);
  }
  const data = component.extractFieldData(record, blueprint.field);
  if (!data) {
    return "";
  }
  if (data.raw !== null && data.raw !== undefined && data.raw !== "") {
    return String(data.raw);
  }
  if (
    data.display !== null &&
    data.display !== undefined &&
    data.display !== ""
  ) {
    return sanitizeFieldOutput(data.display);
  }
  return "";
}

export function getFilterValueLabel(
  component,
  record,
  blueprint,
  fallbackValue
) {
  if (blueprint.type === "owner") {
    return component.getRecordOwnerLabel(record) || fallbackValue;
  }
  const data = component.extractFieldData(record, blueprint.field);
  if (!data) {
    return fallbackValue;
  }
  const display =
    data.display !== null && data.display !== undefined
      ? data.display
      : data.raw;
  if (display === null || display === undefined || display === "") {
    return fallbackValue;
  }
  return sanitizeFieldOutput(display);
}

export function isRecordIncluded(component, record) {
  const passesFilters = component.filterDefinitions.every((def) => {
    if (!def.selectedValues?.length) {
      return true;
    }
    const value = getFilterValueKey(component, record, def);
    return def.selectedValues.includes(value);
  });
  if (!passesFilters) {
    return false;
  }
  return recordMatchesSearch(component, record);
}

export function recordMatchesSearch(component, record) {
  if (!component.searchValue) {
    return true;
  }
  if (!component.searchFieldsQualified.length) {
    return true;
  }
  const searchLower = component.searchValue.toLowerCase();
  return component.searchFieldsQualified.some((field) => {
    const value = component.getFieldDisplay(record, field);
    return value && value.toLowerCase().includes(searchLower);
  });
}

export function handleSortDirectionToggle(component) {
  const nextDirection = component.sortDirection === "desc" ? "asc" : "desc";
  component.logDebug("Sort direction toggled.", {
    previous: component.sortDirection,
    next: nextDirection
  });
  component.sortDirection = nextDirection;
  component.rebuildColumnsWithPicklist();
}

export function handleClearFilters(component) {
  if (component.clearFiltersDisabled) {
    return;
  }
  component.logInfo("Clearing filters and search.");
  component.filterDefinitions = component.filterDefinitions.map((def) => ({
    ...def,
    selectedValues: [],
    options: (def.options || []).map((option) => ({
      ...option,
      selected: false
    })),
    isOpen: false,
    buttonClass: getFilterButtonClass(component, def.id, false)
  }));
  component.searchValue = "";
  component.closeFilterMenus();
  component.rebuildColumnsWithPicklist();
}

export function toggleFilterMenu(component, event) {
  event?.stopPropagation?.();
  const filterId =
    event.detail?.filterId || event.currentTarget?.dataset?.filterId;
  const nextId = component.activeFilterMenuId === filterId ? null : filterId;
  component.logDebug("Filter menu toggle requested.", { filterId, nextId });
  setActiveFilterMenu(component, nextId);
}

export function setActiveFilterMenu(component, filterId) {
  if (filterId) {
    component.closeSortMenu();
  }
  component.logDebug("Setting active filter menu.", { filterId });
  component.activeFilterMenuId = filterId;
  component.filterDefinitions = component.filterDefinitions.map((def) => ({
    ...def,
    isOpen: def.id === filterId
  }));
  if (filterId) {
    component.registerMenuOutsideClick();
    component.focusElementNextTick(
      `.filter-menu[data-filter-id="${filterId}"]`
    );
  } else if (!isAnyMenuOpen(component)) {
    component.unregisterMenuOutsideClick();
  }
}

export function handleFilterMenuKeydown(component, event) {
  event?.stopPropagation?.();
  component.logDebug("Escape pressed inside filter menu.");
  component.closeFilterMenus();
}

export function handleFilterOptionToggle(component, event) {
  event?.stopPropagation?.();
  const { filterId, value, checked } = event.detail || {};
  if (!filterId || value === undefined) {
    return;
  }
  component.logDebug("Filter option toggled.", {
    filterId,
    value,
    isChecked: checked
  });
  updateFilterSelection(component, filterId, value, checked);
  component.rebuildColumnsWithPicklist();
}

export function updateFilterSelection(component, filterId, value, isSelected) {
  component.logDebug("Updating filter selection.", {
    filterId,
    value,
    isSelected
  });
  component.filterDefinitions = component.filterDefinitions.map((def) => {
    if (def.id !== filterId) {
      return def;
    }
    const selection = new Set(def.selectedValues || []);
    if (isSelected) {
      selection.add(value);
    } else {
      selection.delete(value);
    }
    const selectedValues = Array.from(selection);
    const options = (def.options || []).map((option) => ({
      ...option,
      selected: selectedValues.includes(option.value)
    }));
    return {
      ...def,
      selectedValues,
      options,
      buttonClass: getFilterButtonClass(
        component,
        def.id,
        selectedValues.length > 0
      )
    };
  });
}

export function closeFilterMenus(component, skipUnregister = false) {
  component.logDebug("Closing filter menus.", { skipUnregister });
  component.activeFilterMenuId = null;
  component.filterDefinitions = component.filterDefinitions.map((def) => {
    const hasSelection = (def.selectedValues || []).length > 0;
    return {
      ...def,
      isOpen: false,
      buttonClass: getFilterButtonClass(component, def.id, hasSelection)
    };
  });
  if (!skipUnregister && !component.isSortMenuOpen) {
    component.unregisterMenuOutsideClick();
  }
}

export function toggleSortMenu(component, event) {
  event.stopPropagation();
  const willOpen = !component.isSortMenuOpen;
  if (willOpen) {
    component.closeFilterMenus(true);
    component.isSortMenuOpen = true;
    component.logDebug("Opening sort menu.");
    component.registerMenuOutsideClick();
    component.focusElementNextTick(".sort-menu");
  } else {
    component.closeSortMenu();
  }
}

export function handleSortMenuClick(event) {
  event.stopPropagation();
}

export function handleSortMenuKeydown(component, event) {
  const key = event.detail?.key || event.key;
  if (key === "Escape") {
    event.preventDefault?.();
    component.logDebug("Escape pressed inside sort menu.");
    component.closeSortMenu();
  }
}

export async function handleColumnDrop(component, event) {
  if (component.isLoading) {
    return;
  }
  const { recordId, sourceColumnKey, targetColumnKey } = event.detail || {};
  if (!recordId || !targetColumnKey) {
    return;
  }
  component.logDebug("Drop received.", {
    recordId,
    sourceColumnKey,
    targetColumnKey
  });
  await updateRecordGrouping(component, {
    recordId,
    sourceColumnKey,
    targetColumnKey,
    blankKey: event?.detail?.blankKey
  });
}

export function handleParentViewClick(component, event) {
  const recordId = event?.detail?.recordId;
  if (!recordId) {
    event?.preventDefault?.();
    return;
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  component.logDebug("Parent summary view clicked.", {
    parentSelection: recordId
  });
  component.navigateToRecord(recordId);
}

export function handleExternalOpen(component, event) {
  event?.preventDefault?.();
  const recordId =
    event?.detail?.recordId || event.currentTarget?.dataset?.recordId;
  if (!recordId) {
    return;
  }
  component.logDebug("External record open requested.", { recordId });
  component.navigateToRecord(recordId);
}

export function handleSortOptionChange(component, event) {
  event.stopPropagation();
  const value =
    event.detail?.value ??
    event.target?.value ??
    event.target?.dataset?.sortValue;
  if (!value) {
    return;
  }
  if (component.selectedSortField !== value) {
    component.logDebug("Sort option changed.", {
      previous: component.selectedSortField,
      next: value
    });
    component.selectedSortField = value;
    component.rebuildColumnsWithPicklist();
  }
  component.closeSortMenu();
}

export function closeSortMenu(component) {
  if (!component.isSortMenuOpen) {
    return;
  }
  component.isSortMenuOpen = false;
  component.logDebug("Closing sort menu.");
  if (!component.filterDefinitions.some((def) => def.isOpen)) {
    component.unregisterMenuOutsideClick();
  }
}

export async function handleManualRefresh(component, event) {
  event?.preventDefault();
  event?.stopPropagation();

  const shouldRefreshParentOptions = Boolean(
    !component.hasRecordContext && component.parentObjectApiName
  );
  const shouldRefreshRecords = component.hasRequiredConfig;
  const refreshTasks = [];
  component.logDebug("Manual refresh pre-check.", {
    hasParentRefresh: shouldRefreshParentOptions,
    refreshRecords: shouldRefreshRecords
  });
  let refreshedRecords = false;
  let parentRefreshSucceeded = false;

  if (shouldRefreshRecords) {
    refreshTasks.push(
      (async () => {
        refreshedRecords = await component.performCardRecordsRefresh();
      })()
    );
  }

  if (shouldRefreshParentOptions) {
    const parentSelector = component.template?.querySelector(
      "c-lres-kanban-parent-selector"
    );
    if (parentSelector?.refreshOptions) {
      refreshTasks.push(
        (async () => {
          parentRefreshSucceeded = await parentSelector.refreshOptions();
        })()
      );
    }
  }

  if (!refreshTasks.length) {
    component.logWarn(
      "Refresh button clicked but no refreshable data sources were found."
    );
    component.showToast({
      title: "Nothing to refresh",
      message: "Configure the board to enable refresh.",
      variant: "info"
    });
    return;
  }

  component.manualRefreshInProgress = true;
  component.logInfo("Refresh button clicked.", {
    refreshRecords: shouldRefreshRecords,
    refreshParentOptions: shouldRefreshParentOptions
  });
  component.logDebug("Manual refresh task count.", {
    taskCount: refreshTasks.length
  });

  try {
    await Promise.all(refreshTasks);
    if (
      (refreshedRecords || parentRefreshSucceeded) &&
      !component.errorMessage
    ) {
      const message = refreshedRecords
        ? parentRefreshSucceeded
          ? "Board and parent options updated."
          : "Board updated."
        : "Parent options updated.";
      component.showToast({
        title: "Refresh complete",
        message,
        variant: "success"
      });
    }
  } catch (error) {
    component.logError("Manual refresh encountered an error.", error);
    component.showErrorToast(error, { title: "Refresh failed" });
  } finally {
    component.manualRefreshInProgress = false;
  }
}

export function handleSearchInput(component, event) {
  const value = event?.detail?.value ?? event.target?.value ?? "";
  const debounced = getSearchDebounceHandler(component);
  debounced(value);
}

export function applySearchValue(component, rawValue) {
  const normalized = normalizeSearchValue(rawValue);
  applyNormalizedSearchValue(component, normalized);
}

export function getSearchDebounceHandler(component, delayMs = 200) {
  if (!component._searchDebounceHandler) {
    component._searchDebounceHandler = createSearchDebounceHandler(
      component,
      delayMs
    );
  }
  return component._searchDebounceHandler;
}

export function clearDebouncedSearch(component) {
  if (component._searchDebounceHandler?.cancel) {
    component._searchDebounceHandler.cancel();
  }
  component._searchDebounceHandler = null;
}

export function isAnyMenuOpen(component) {
  return (
    component.isSortMenuOpen ||
    component.filterDefinitions.some((def) => def.isOpen)
  );
}

export function registerMenuOutsideClick(component) {
  if (component.menuDismissListener) {
    return;
  }
  component.menuDismissListener = (event) => {
    const container = component.template?.querySelector(
      "c-lres-kanban-board-actions"
    );
    let isInside = false;
    if (container) {
      if (typeof event.composedPath === "function") {
        try {
          const path = event.composedPath();
          if (path && typeof path[Symbol.iterator] === "function") {
            for (const node of path) {
              if (node === container) {
                isInside = true;
                break;
              }
            }
          }
        } catch (pathError) {
          component.logWarn(
            "Unable to evaluate composed path for outside click.",
            pathError
          );
        }
      }
    }
    if (!isInside) {
      component.logDebug("Outside click detected. Closing open menus.");
      component.closeSortMenu();
      component.closeFilterMenus(true);
      component.unregisterMenuOutsideClick();
    }
  };
  window.addEventListener("click", component.menuDismissListener);
}

export function unregisterMenuOutsideClick(component) {
  if (component.menuDismissListener) {
    component.logDebug("Unregistering outside click listener.");
    window.removeEventListener("click", component.menuDismissListener);
    component.menuDismissListener = null;
  }
}

export function handleTitleClick(component, event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const recordId =
    event?.detail?.recordId || event.currentTarget?.dataset?.recordId;
  if (!recordId) {
    return;
  }
  component.logDebug("Card title clicked.", { recordId });
  component.openRecordModal(recordId);
}

export function navigateToRecord(component, recordId) {
  if (!recordId) {
    return;
  }
  try {
    component[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: {
        recordId,
        actionName: "view"
      }
    });
    component.logDebug("Navigation requested.", { recordId });
  } catch (error) {
    component.showErrorToast(error, { title: "Navigation failed" });
    component.logError("Navigation failed.", error);
  }
}

export function focusElementNextTick(component, selector) {
  if (!selector) {
    return;
  }
  Promise.resolve().then(() => {
    if (!component.isConnected) {
      return;
    }
    const element = component.template?.querySelector(selector);
    if (element?.focus) {
      element.focus();
      return;
    }
    const boardActions = component.template?.querySelector(
      "c-lres-kanban-board-actions"
    );
    boardActions?.focusWithin?.(selector);
  });
}

export function createSearchDebounceHandler(component, delayMs = 200) {
  let timeoutId = null;
  const wrapper = (rawValue) => {
    const normalized = normalizeSearchValue(rawValue);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    timeoutId = setTimeout(() => {
      timeoutId = null;
      applyNormalizedSearchValue(component, normalized);
    }, delayMs);
  };
  wrapper.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return wrapper;
}

function normalizeSearchValue(rawValue) {
  return rawValue ? rawValue.toString().trim() : "";
}

function applyNormalizedSearchValue(component, normalized) {
  if (normalized === component.searchValue) {
    return;
  }
  component.logDebug("Search value updated.", {
    previous: component.searchValue,
    next: normalized
  });
  component.searchValue = normalized;
  component.rebuildColumnsWithPicklist();
}

export async function updateRecordGrouping(
  component,
  { recordId, sourceColumnKey, targetColumnKey, blankKey }
) {
  if (!recordId || !targetColumnKey || targetColumnKey === sourceColumnKey) {
    return;
  }
  const targetColumn = component.findColumnByKey(targetColumnKey);
  const groupingField = component.groupingFieldSimpleName;
  if (!targetColumn || !groupingField) {
    return;
  }

  const newValue =
    targetColumn.key === (blankKey || null)
      ? null
      : targetColumn.rawValue !== undefined
        ? targetColumn.rawValue
        : targetColumn.key;

  const fields = {
    Id: recordId
  };
  fields[groupingField] =
    newValue === null || newValue === undefined ? null : String(newValue);

  component.isLoading = true;
  if (component._debugLoggingEnabled) {
    console.log("[KanbanExplorer][Debug] updateRecordGrouping", {
      recordId,
      sourceColumnKey,
      targetColumnKey,
      newValue,
      mode: component.isParentless ? "parentless" : "parent"
    });
  }
  component.logInfo("Updating record grouping.", {
    recordId,
    sourceColumnKey,
    targetColumnKey,
    newValue
  });

  try {
    await updateRecord({ fields });
    await component.performCardRecordsRefresh();
    component.logInfo("Record grouping updated.", {
      recordId,
      targetColumnKey,
      newValue
    });
  } catch (error) {
    component.isLoading = false;
    component.showErrorToast(error, { title: "Unable to update record" });
    component.logError("Record update failed.", error);
  } finally {
    // Ensure the spinner clears even if the refresh was skipped or failed silently.
    if (component.isLoading) {
      component.isLoading = false;
    }
  }
}

export function applySearchAndFilters(component, records) {
  buildFilterDefinitions(component, records);
  component.rebuildColumnsWithPicklist();
}

export function getFilterButtonClass(component, filterId, hasSelection) {
  const baseClass = "filter-dropdown_button";
  const isOpen = component.activeFilterMenuId === filterId;
  if (isOpen || hasSelection) {
    return `${baseClass} filter-dropdown_button--active`;
  }
  return baseClass;
}
