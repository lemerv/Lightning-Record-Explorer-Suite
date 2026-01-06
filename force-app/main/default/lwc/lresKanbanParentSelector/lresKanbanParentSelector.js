import { LightningElement, api, wire } from "lwc";
import fetchParentRecords from "@salesforce/apex/LRES_KanbanParentRecordsController.fetchParentRecords";
import {
  formatObjectLabel,
  normalizeBoolean,
  normalizePositiveInteger,
  normalizeString
} from "c/lresFieldUtils";
import { parseError, showErrorToast } from "c/lresErrorHandler";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import {
  getFieldLabel as getFieldLabelField,
  formatFieldValueWithOptions
} from "c/lresFieldDisplayUtils";

const DEFAULT_PARENT_LABEL = "Parent Record";
const DEFAULT_DATETIME_FORMAT = "dd/MM/yyyy h:mm a";
const MIN_MENU_WIDTH_CH = 32;
const MENU_PADDING_BUFFER_CH = 6;
const DEFAULT_MENU_STYLE = `min-width: ${MIN_MENU_WIDTH_CH}ch; width: ${MIN_MENU_WIDTH_CH}ch;`;
const DEFAULT_PARENT_LIMIT = 100;
const MAX_PARENT_LIMIT = 200;

export default class KanbanParentSelector extends LightningElement {
  searchInputValue = "";
  searchTerm = "";

  _parentObjectApiName;
  _parentRecordsWhereClause;
  _parentRecordsOrderByClause;
  _parentRecordFieldApiNames;
  _selectedParentRecordIds = [];
  _parentRecordsLimit = DEFAULT_PARENT_LIMIT;
  _dateTimeFormat;
  _showParentRecordFieldLabels = false;
  _defaultToMultipleParentSelection = false;

  // Runtime override (falls back to builder value when undefined)
  _runtimeMode = undefined;

  // New internal runtime state
  _isToggling = false;

  parentRecordsLoading = false;
  parentRecordError;
  parentObjectLabel;
  parentSelectorMenuStyle = DEFAULT_MENU_STYLE;
  isParentSelectorMenuOpen = false;

  parentModeOptions = [
    { label: "1", value: "single" },
    { label: "∞", value: "multi" }
  ];
  _debugLoggingEnabled = false;

  optionData = [];
  filteredOptionData = [];
  parentRecordDetails = new Map();
  selectedValueSet = new Set();
  patternTokenCache = new Map();
  parentRecordsRequestId = 0;
  parentMenuDismissListener;
  parentObjectInfo;
  parentObjectInfoError;
  debouncedApplySearch;

  constructor() {
    super();
    this.debouncedApplySearch = this.buildSearchDebounce();
  }

  @wire(getObjectInfo, { objectApiName: "$parentObjectApiName" })
  wiredParentObjectInfo({ data, error }) {
    this.parentObjectInfo = data || null;
    this.parentObjectInfoError = error || null;
    this.parentRecordDetails = this.buildParentRecordDetails(
      this.optionData || []
    );
  }

  disconnectedCallback() {
    this.unregisterParentMenuOutsideClick();
    this.debouncedApplySearch?.cancel?.();
  }

  @api
  get parentObjectApiName() {
    return this._parentObjectApiName;
  }

  set parentObjectApiName(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentObjectApiName) {
      return;
    }
    this._parentObjectApiName = normalized;
    this.handleConfigChange();
  }

  @api
  get parentRecordsWhereClause() {
    return this._parentRecordsWhereClause;
  }

  set parentRecordsWhereClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentRecordsWhereClause) {
      return;
    }
    this._parentRecordsWhereClause = normalized;
    this.handleConfigChange();
  }

  @api
  get parentRecordsOrderByClause() {
    return this._parentRecordsOrderByClause;
  }

  set parentRecordsOrderByClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentRecordsOrderByClause) {
      return;
    }
    this._parentRecordsOrderByClause = normalized;
    this.handleConfigChange();
  }

  @api
  get debugLogging() {
    return this._debugLoggingEnabled;
  }

  set debugLogging(value) {
    this._debugLoggingEnabled = normalizeBoolean(value);
  }

  @api
  get parentRecordsLimit() {
    return this._parentRecordsLimit;
  }

  set parentRecordsLimit(value) {
    const parsed = Math.min(
      normalizePositiveInteger(value, DEFAULT_PARENT_LIMIT),
      MAX_PARENT_LIMIT
    );
    if (parsed === this._parentRecordsLimit) {
      return;
    }
    this._parentRecordsLimit = parsed;
    this.handleConfigChange();
  }

  @api
  get parentRecordFieldApiNames() {
    return this._parentRecordFieldApiNames;
  }

  set parentRecordFieldApiNames(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentRecordFieldApiNames) {
      return;
    }
    this._parentRecordFieldApiNames = normalized;
    this.handleConfigChange();
  }

  @api
  get showParentRecordFieldLabels() {
    return this._showParentRecordFieldLabels;
  }

  set showParentRecordFieldLabels(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._showParentRecordFieldLabels) {
      return;
    }
    this._showParentRecordFieldLabels = normalized;
    this.parentRecordDetails = this.buildParentRecordDetails(
      this.optionData || []
    );
  }

  @api
  get defaultToMultipleParentSelection() {
    return this._defaultToMultipleParentSelection;
  }

  set defaultToMultipleParentSelection(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._defaultToMultipleParentSelection) {
      return;
    }
    this._defaultToMultipleParentSelection = normalized;
    // Only use builder value if no runtime override exists
    if (this._runtimeMode === undefined) {
      this._runtimeMode = normalized;
    }
    this.enforceSelectionConstraints();
  }

  @api
  get selectedParentRecordIds() {
    return this._selectedParentRecordIds;
  }

  set selectedParentRecordIds(value) {
    const normalized = this.normalizeSelection(value);
    const changed =
      normalized.length !== this._selectedParentRecordIds.length ||
      normalized.some(
        (item, index) => item !== this._selectedParentRecordIds[index]
      );
    this._selectedParentRecordIds = normalized;
    this.selectedValueSet = new Set(normalized);
    if (changed) {
      this.enforceSelectionConstraints();
    }
  }

  @api
  get dateTimeFormat() {
    return this._dateTimeFormat;
  }

  set dateTimeFormat(value) {
    this._dateTimeFormat = normalizeString(value);
  }

  get effectiveDateTimeFormat() {
    return this._dateTimeFormat || DEFAULT_DATETIME_FORMAT;
  }

  handleConfigChange() {
    this.closeParentSelectorMenu();
    if (!this.parentObjectApiName) {
      this.resetParentOptions();
      this.dispatchParentOptionsChange();
      return;
    }
    this.loadParentRecordOptions();
  }

  resetParentOptions() {
    this.optionData = [];
    this.filteredOptionData = [];
    this.parentRecordDetails = new Map();
    this.searchInputValue = "";
    this.searchTerm = "";
    this.parentObjectLabel = null;
    this.parentSelectorMenuStyle = DEFAULT_MENU_STYLE;
    this.parentRecordError = undefined;
    this.parentRecordsLoading = false;
    this.debouncedApplySearch?.cancel?.();
  }

  @api
  async refreshOptions() {
    await this.loadParentRecordOptions();
    return !this.parentRecordError;
  }

  async loadParentRecordOptions() {
    this.parentRecordsRequestId += 1;
    const requestId = this.parentRecordsRequestId;
    if (!this.parentObjectApiName) {
      this.resetParentOptions();
      this.dispatchParentOptionsChange();
      return;
    }
    this.parentRecordsLoading = true;
    this.parentRecordError = undefined;
    try {
      const data = await fetchParentRecords({
        objectApiName: this.parentObjectApiName,
        whereClause: this.parentRecordsWhereClause,
        orderByClause: this.parentRecordsOrderByClause,
        fieldApiNames: this.parentRecordFieldApiNames,
        limitSize: this.parentRecordsLimit,
        debugWhereErrors: this._debugLoggingEnabled
      });
      if (requestId !== this.parentRecordsRequestId) {
        return;
      }
      const normalized = this.normalizeParentOptions(data);
      this.optionData = normalized;
      this.filteredOptionData = normalized;
      this.parentObjectLabel = this.resolveParentObjectLabel(normalized);
      this.parentRecordDetails = this.buildParentRecordDetails(normalized);
      this.parentSelectorMenuStyle = this.computeMenuStyle(normalized);
      this.parentRecordsLoading = false;
      this.parentRecordError = undefined;
      this.syncSearchStateAfterOptionsChange();
      this.enforceSelectionConstraints();
      this.dispatchParentOptionsChange();
    } catch (error) {
      if (requestId !== this.parentRecordsRequestId) {
        return;
      }
      this.resetParentOptions();
      this.parentObjectLabel =
        formatObjectLabel(this.parentObjectApiName) || DEFAULT_PARENT_LABEL;
      this.parentRecordError = parseError(error).message;
      this.syncSearchStateAfterOptionsChange();
      this.dispatchParentOptionsChange();
    }
  }

  normalizeParentOptions(data) {
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((item) => ({
      label: item?.label || item?.id,
      value: item?.id,
      subtitle: item?.subtitle,
      fields: item?.fields || {},
      fieldLabels: item?.fieldLabels || {}
    }));
  }

  resolveParentObjectLabel(options) {
    if (options && options.length > 0) {
      const subtitle = options[0]?.subtitle;
      if (subtitle) {
        return subtitle;
      }
    }
    return formatObjectLabel(this.parentObjectApiName) || DEFAULT_PARENT_LABEL;
  }

  buildParentRecordDetails(options) {
    const details = new Map();
    const fieldList = this.parentRecordFieldList;
    if (!fieldList.length) {
      return details;
    }
    options.forEach((option) => {
      if (!option?.value) {
        return;
      }
      const values = fieldList
        .map((fieldName, index) => {
          const rawValue = option.fields?.[fieldName];
          const formattedValue = this.formatParentFieldValue(rawValue);
          if (!formattedValue) {
            return null;
          }
          const entry = {
            key: `${option.value}:${fieldName}:${index}`,
            value: formattedValue
          };
          if (this._showParentRecordFieldLabels) {
            const label = this.getParentFieldLabel(fieldName);
            if (label) {
              entry.label = label;
            }
          }
          return entry;
        })
        .filter(Boolean);
      if (values.length) {
        details.set(option.value, values);
      }
    });
    return details;
  }

  computeMenuStyle(options) {
    const longest = (options || []).reduce((max, option) => {
      const length = option?.label?.length || 0;
      return length > max ? length : max;
    }, 0);
    const computedWidth = Math.max(
      longest + MENU_PADDING_BUFFER_CH,
      MIN_MENU_WIDTH_CH
    );
    return `min-width: ${MIN_MENU_WIDTH_CH}ch; width: ${computedWidth}ch;`;
  }

  get parentRecordFieldList() {
    if (!this._parentRecordFieldApiNames) {
      return [];
    }
    return this._parentRecordFieldApiNames
      .split(",")
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }

  normalizeSelection(values) {
    if (!Array.isArray(values)) {
      if (values) {
        return [String(values)];
      }
      return [];
    }
    const normalized = [];
    const seen = new Set();
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
    return normalized;
  }

  enforceSelectionConstraints() {
    const selection = this._selectedParentRecordIds || [];
    let nextValues = selection;

    // Clear all selections when switching to single mode with multiple selections
    if (!this._defaultToMultipleParentSelection && selection.length > 1) {
      nextValues = [];
    }

    const validValues = new Set(
      (this.optionData || []).map((option) => option.value)
    );
    const filtered = nextValues.filter((value) => validValues.has(value));
    const changed =
      filtered.length !== this._selectedParentRecordIds.length ||
      filtered.some(
        (value, index) => value !== this._selectedParentRecordIds[index]
      );
    if (changed) {
      this.dispatchParentSelectionChange(filtered);
    } else {
      this.selectedValueSet = new Set(filtered);
    }
  }

  dispatchParentSelectionChange(values) {
    this.dispatchEvent(
      new CustomEvent("parentselectionchange", {
        detail: { values },
        bubbles: true,
        composed: true
      })
    );
  }

  dispatchParentOptionsChange() {
    const options = (this.optionData || []).map((option) => ({
      value: option.value,
      label: option.label
    }));
    this.dispatchEvent(
      new CustomEvent("parentoptionschange", {
        detail: {
          parentObjectLabel: this.parentObjectLabel || DEFAULT_PARENT_LABEL,
          options
        },
        bubbles: true,
        composed: true
      })
    );
  }

  get parentSelectorLabel() {
    return (
      this.parentObjectLabel ||
      formatObjectLabel(this.parentObjectApiName) ||
      DEFAULT_PARENT_LABEL
    );
  }

  get parentSelectorPlaceholder() {
    const label = this.parentSelectorLabel;
    if (this.parentRecordsLoading) {
      return `Loading ${label} records...`;
    }
    if (this.optionData.length > 0) {
      return `Select ${label}`;
    }
    return `No ${label} records available`;
  }

  get parentSelectorButtonLabel() {
    if (this.parentRecordsLoading) {
      return "Loading parents...";
    }
    if (!this.hasParentSelection) {
      return this.parentSelectorPlaceholder;
    }
    if (this.hasMultipleParentSelection) {
      return `${this.parentSelectionCount} ${this.parentSelectorLabelPlural} Selected`;
    }
    return (
      this.getParentLabelById(this.parentSelectionValue) ||
      this.parentSelectorPlaceholder
    );
  }

  get parentSelectorButtonClass() {
    const baseClass =
      "slds-combobox__input slds-combobox__input-value slds-input_faux parent-selector_button";
    return this.isParentSelectorMenuOpen
      ? `${baseClass} slds-has-focus`
      : baseClass;
  }

  get parentSelectorComboboxClass() {
    const baseClass =
      "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
    return this.isParentSelectorMenuOpen
      ? `${baseClass} slds-is-open`
      : baseClass;
  }

  get parentSelectorDisabled() {
    return this.parentRecordsLoading || this.optionData.length === 0;
  }

  get parentSelectorLabelPlural() {
    if (this.parentObjectLabel) {
      return `${this.parentObjectLabel}s`;
    }
    const label =
      formatObjectLabel(this.parentObjectApiName) || DEFAULT_PARENT_LABEL;
    return `${label}s`;
  }

  get shouldShowSearchInput() {
    return (this.optionData?.length || 0) > 25;
  }

  get visibleOptionData() {
    if (this.shouldShowSearchInput) {
      return this.filteredOptionData || [];
    }
    return this.optionData || [];
  }

  get parentOptionViewData() {
    const selection = this.selectedValueSet;
    return (this.visibleOptionData || []).map((option) => ({
      value: option.value,
      label: option.label,
      selected: selection.has(option.value)
    }));
  }

  get parentSelectionValue() {
    return this._selectedParentRecordIds?.[0] || null;
  }

  get parentSelectionCount() {
    return this._selectedParentRecordIds?.length || 0;
  }

  get hasParentSelection() {
    return this.parentSelectionCount > 0;
  }

  get hasMultipleParentSelection() {
    return (
      this._defaultToMultipleParentSelection && this.parentSelectionCount > 1
    );
  }

  get showParentRecordSummaryRow() {
    return this.hasParentSelection;
  }

  get parentRecordSummaryItems() {
    if (this.hasMultipleParentSelection) {
      return [];
    }
    const selected = this.parentSelectionValue;
    if (!selected) {
      return [];
    }
    return this.parentRecordDetails.get(selected) || [];
  }

  get parentRecordSummaryHasValues() {
    return this.parentRecordSummaryItems.length > 0;
  }

  // Enhanced computed properties for radio button toggle
  get parentSelectionMode() {
    return this._runtimeMode !== undefined
      ? this._runtimeMode
        ? "multi"
        : "single"
      : this._defaultToMultipleParentSelection
        ? "multi"
        : "single";
  }

  get currentModeLabel() {
    return this._runtimeMode !== undefined
      ? this._runtimeMode
        ? "Multiple"
        : "Single"
      : this._defaultToMultipleParentSelection
        ? "Multiple"
        : "Single";
  }

  get parentModeOptionView() {
    const current = this.parentSelectionMode;
    return this.parentModeOptions.map((opt) => ({
      ...opt,
      selected: opt.value === current,
      inputId: `parent-mode-${opt.value}`
    }));
  }

  // Enhanced event handler with async state and accessibility
  async handleParentModeChange(event) {
    // Prevent rapid toggles during operations
    if (this._isToggling) return;

    const newMode = event.target?.value;
    if (!newMode || (newMode !== "single" && newMode !== "multi")) {
      if (this._debugLoggingEnabled) {
        console.warn("Invalid mode value received", { newMode });
      }
      return;
    }
    const allowMultiple = newMode === "multi";

    try {
      this._isToggling = true;

      // Set runtime override (don't modify @api property)
      this._runtimeMode = allowMultiple;

      // Announce change to screen readers
      this.announceModeChange(allowMultiple);

      // Dispatch to parent
      this.dispatchEvent(
        new CustomEvent("parentmodechange", {
          detail: {
            defaultToMultipleParentSelection: allowMultiple
          },
          bubbles: true,
          composed: true
        })
      );

      // Focus will be managed by the browser automatically
    } catch (error) {
      // Handle error and potentially rollback
      this.handleToggleError(error);
    } finally {
      this._isToggling = false;
    }
  }

  announceModeChange(allowMultiple) {
    const modeText = allowMultiple
      ? "multiple parent selection"
      : "single parent selection";
    const announcement = `Switching to ${modeText} mode`;

    // Use ARIA live region for announcement
    const liveRegion = this.template.querySelector("#mode-live-region");
    if (liveRegion) {
      liveRegion.textContent = announcement;
    }
  }

  handleToggleError(error) {
    if (this._debugLoggingEnabled) {
      console.error("Mode toggle failed", error);
    }

    showErrorToast(
      this,
      error || {
        message: "Could not switch parent selection mode. Please try again."
      },
      {
        title: "Mode Change Failed",
        message: "Could not switch parent selection mode. Please try again."
      }
    );
  }

  toggleParentSelectorMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.parentSelectorDisabled) {
      return;
    }
    if (this.isParentSelectorMenuOpen) {
      this.closeParentSelectorMenu();
    } else {
      this.openParentSelectorMenu();
    }
  }

  openParentSelectorMenu() {
    if (this.isParentSelectorMenuOpen) {
      return;
    }
    this.isParentSelectorMenuOpen = true;
    this.registerParentMenuOutsideClick();
  }

  closeParentSelectorMenu() {
    if (!this.isParentSelectorMenuOpen) {
      return;
    }
    this.isParentSelectorMenuOpen = false;
    this.unregisterParentMenuOutsideClick();
  }

  registerParentMenuOutsideClick() {
    if (this.parentMenuDismissListener) {
      return;
    }
    this.parentMenuDismissListener = (event) => {
      const container = this.template?.querySelector(
        ".parent-selector_dropdown"
      );
      if (!container) {
        this.closeParentSelectorMenu();
        return;
      }
      let isInside = false;
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
        } catch {
          isInside = false;
        }
      }
      if (!isInside) {
        this.closeParentSelectorMenu();
      }
    };
    window.addEventListener("click", this.parentMenuDismissListener);
  }

  unregisterParentMenuOutsideClick() {
    if (this.parentMenuDismissListener) {
      window.removeEventListener("click", this.parentMenuDismissListener);
      this.parentMenuDismissListener = null;
    }
  }

  handleParentMenuClick(event) {
    event.stopPropagation();
  }

  handleParentOptionRowClick(event) {
    event.stopPropagation();
    // If the direct target is the lightning-input, let its change handler run
    if (event.target?.tagName === "LIGHTNING-INPUT") {
      return;
    }
    const value = event.currentTarget?.dataset?.value;
    if (!value) {
      return;
    }
    if (this._defaultToMultipleParentSelection) {
      const selection = new Set(this._selectedParentRecordIds || []);
      if (selection.has(value)) {
        selection.delete(value);
      } else {
        selection.add(value);
      }
      this.dispatchParentSelectionChange(Array.from(selection));
    } else {
      if (this.parentSelectionValue !== value) {
        this.dispatchParentSelectionChange([value]);
      }
      this.closeParentSelectorMenu();
    }
  }

  handleParentOptionToggle(event) {
    event.stopPropagation();
    const value = event.target?.dataset?.value;
    if (!value) {
      return;
    }
    const checked = event.target.checked;
    const selection = new Set(this._selectedParentRecordIds || []);
    if (checked) {
      selection.add(value);
    } else {
      selection.delete(value);
    }
    this.dispatchParentSelectionChange(Array.from(selection));
  }

  handleParentSelectAll(event) {
    event.stopPropagation();
    if (!this._defaultToMultipleParentSelection || !this.optionData.length) {
      return;
    }
    const allValues = this.optionData
      .map((option) => option.value)
      .filter(Boolean);
    this.dispatchParentSelectionChange(allValues);
  }

  handleParentSelectionClear(event) {
    event.stopPropagation();
    if (!this.hasParentSelection) {
      return;
    }
    this.dispatchParentSelectionChange([]);
  }

  handleParentSingleOptionSelect(event) {
    event.stopPropagation();
    const value = event.target?.dataset?.value;
    if (!value) {
      return;
    }
    if (this.parentSelectionValue !== value) {
      this.dispatchParentSelectionChange([value]);
    }
    this.closeParentSelectorMenu();
  }

  handleParentViewClick(event) {
    if (!this.parentSelectionValue || this.hasMultipleParentSelection) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("parentrecordview", {
        detail: { recordId: this.parentSelectionValue },
        bubbles: true,
        composed: true
      })
    );
  }

  formatParentFieldValue(value) {
    return formatFieldValueWithOptions(value, {
      pattern: this.effectiveDateTimeFormat,
      patternTokenCache: this.patternTokenCache
    });
  }

  getParentFieldLabel(fieldPath) {
    if (!fieldPath) {
      return null;
    }
    try {
      return getFieldLabelField(
        {
          objectInfo: this.parentObjectInfo,
          cardObjectApiName: this.parentObjectApiName
        },
        fieldPath
      );
    } catch {
      return null;
    }
  }

  getParentLabelById(recordId) {
    const match = (this.optionData || []).find(
      (option) => option.value === recordId
    );
    return match?.label || null;
  }

  handleSearchInput(event) {
    this.searchInputValue = event?.target?.value || "";
    this.debouncedApplySearch?.(this.searchInputValue);
  }

  applySearchFilter(searchValue) {
    const normalized = normalizeString(searchValue) || "";
    this.searchTerm = normalized;
    this.filteredOptionData = this.filterOptions(
      this.optionData || [],
      this.searchTerm
    );
  }

  filterOptions(options, term) {
    if (!options || !options.length) {
      return [];
    }
    if (!term) {
      return options;
    }
    const lower = term.toLowerCase();
    return options.filter((option) => {
      const label = normalizeString(option?.label) || "";
      const subtitle = normalizeString(option?.subtitle) || "";
      return (
        label.toLowerCase().includes(lower) ||
        subtitle.toLowerCase().includes(lower)
      );
    });
  }

  syncSearchStateAfterOptionsChange() {
    if (!this.shouldShowSearchInput) {
      this.searchInputValue = "";
      this.searchTerm = "";
      this.filteredOptionData = this.optionData || [];
      this.debouncedApplySearch?.cancel?.();
      return;
    }
    this.filteredOptionData = this.filterOptions(
      this.optionData || [],
      this.searchTerm
    );
  }

  buildSearchDebounce(delayMs = 200) {
    return debounce((value) => this.applySearchFilter(value), delayMs);
  }
}

/* eslint-disable @lwc/lwc/no-async-operation */
function debounce(fn, delayMs = 200) {
  let timeoutId = null;
  let pendingArgs = null;
  const wrapper = (...args) => {
    const shouldInvokeImmediately = timeoutId === null;
    pendingArgs = args;
    if (shouldInvokeImmediately) {
      fn(...pendingArgs);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!shouldInvokeImmediately && pendingArgs) {
        fn(...pendingArgs);
      }
      pendingArgs = null;
    }, delayMs);
  };
  wrapper.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingArgs = null;
  };
  return wrapper;
}
/* eslint-enable @lwc/lwc/no-async-operation */
