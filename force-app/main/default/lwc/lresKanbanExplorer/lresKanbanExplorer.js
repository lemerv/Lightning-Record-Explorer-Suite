import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import CURRENCY from "@salesforce/i18n/currency";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import {
  formatApiName,
  normalizeBoolean,
  normalizePositiveInteger,
  normalizeString,
  formatObjectLabel
} from "c/lresFieldUtils";
import { sanitizeFieldOutput } from "c/lresOutputUtils";
import { BLANK_KEY, buildColumns as buildColumnsUtil } from "./columnBuilder";
import { parseSummaryDefinitions } from "./summaryConfigUtils";
import {
  applySearchValue as applySearchValueInteractions,
  buildFilterDefinitions as buildFilterDefinitionsInteractions,
  closeFilterMenus as closeFilterMenusInteractions,
  closeSortMenu as closeSortMenuInteractions,
  focusElementNextTick as focusElementNextTickInteractions,
  getFilterButtonClass as getFilterButtonClassInteractions,
  getFilterBlueprints as getFilterBlueprintsInteractions,
  getFilterValueKey as getFilterValueKeyInteractions,
  getFilterValueLabel as getFilterValueLabelInteractions,
  getPicklistOrderMap as getPicklistOrderMapInteractions,
  getUiPicklistValues as getUiPicklistValuesInteractions,
  handleClearFilters as handleClearFiltersInteractions,
  handleColumnDrop as handleColumnDropInteractions,
  handleFilterMenuKeydown as handleFilterMenuKeydownInteractions,
  handleFilterOptionToggle as handleFilterOptionToggleInteractions,
  handleManualRefresh as handleManualRefreshInteractions,
  handleParentViewClick as handleParentViewClickInteractions,
  handleSearchInput as handleSearchInputInteractions,
  handleSearchKeyup as handleSearchKeyupInteractions,
  clearDebouncedSearch as clearDebouncedSearchInteractions,
  handleSortDirectionToggle as handleSortDirectionToggleInteractions,
  handleSortMenuClick as handleSortMenuClickInteractions,
  handleSortMenuKeydown as handleSortMenuKeydownInteractions,
  handleSortOptionChange as handleSortOptionChangeInteractions,
  handleTitleClick as handleTitleClickInteractions,
  handleExternalOpen as handleExternalOpenInteractions,
  isAnyMenuOpen as isAnyMenuOpenInteractions,
  navigateToRecord as navigateToRecordInteractions,
  registerMenuOutsideClick as registerMenuOutsideClickInteractions,
  isRecordIncluded as isRecordIncludedInteractions,
  recordMatchesSearch as recordMatchesSearchInteractions,
  setActiveFilterMenu as setActiveFilterMenuInteractions,
  sortFilterOptions as sortFilterOptionsInteractions,
  toggleFilterMenu as toggleFilterMenuInteractions,
  toggleSortMenu as toggleSortMenuInteractions,
  unregisterMenuOutsideClick as unregisterMenuOutsideClickInteractions,
  updateRecordGrouping as updateRecordGroupingInteractions
} from "./boardInteractions";
import {
  applySelectedParentRecords as applySelectedParentRecordsState,
  handleConfigChange as handleConfigChangeState,
  handleParentOptionsChange as handleParentOptionsChangeState,
  handleParentSelectionChange as handleParentSelectionChangeState,
  handleParentSelectorChange as handleParentSelectorChangeState,
  normalizeParentSelection as normalizeParentSelectionState,
  resetParentSelection as resetParentSelectionState,
  updateEffectiveRecordId as updateEffectiveRecordIdState
} from "./configState";
import {
  buildDataFetchRequest as buildDataFetchRequestService,
  executeDataFetch as executeDataFetchService,
  performCardRecordsRefresh as performCardRecordsRefreshService,
  refreshParentlessCardRecords as refreshParentlessCardRecordsService,
  resolveDataMode as resolveDataModeService,
  shouldAutoRefreshOnConfig as shouldAutoRefreshOnConfigService
} from "./dataModeService";
import {
  coerceIconName as coerceIconNameField,
  expandRelationshipPath as expandRelationshipPathField,
  extractFieldData as extractFieldDataField,
  extractFieldValue as extractFieldValueField,
  extractSimpleFieldName as extractSimpleFieldNameField,
  formatFieldDisplayValue as formatFieldDisplayValueField,
  getEffectiveSortField as getEffectiveSortFieldField,
  getFieldDisplay as getFieldDisplayField,
  getFieldLabel as getFieldLabelField,
  getFieldMetadata as getFieldMetadataField,
  getMetadataColumns as getMetadataColumnsField,
  getParentLabelById as getParentLabelByIdField,
  getRecordOwnerId as getRecordOwnerIdField,
  getRecordOwnerLabel as getRecordOwnerLabelField,
  getRecordParentLabel as getRecordParentLabelField,
  getRelationshipLabel as getRelationshipLabelField,
  lookupFieldData as lookupFieldDataField,
  normalizeFieldPath as normalizeFieldPathField,
  parseFieldList as parseFieldListField,
  getDefaultDisplayField as getDefaultDisplayFieldField,
  qualifyFieldName as qualifyFieldNameField,
  resolveEmoji as resolveEmojiField,
  stripObjectPrefix as stripObjectPrefixField,
  buildFieldCandidateList as buildFieldCandidateListField
} from "c/lresFieldDisplayUtils";
import {
  formatError as formatErrorLogger,
  logDebug as logDebugLogger,
  logError as logErrorLogger,
  logInfo as logInfoLogger,
  logWarn as logWarnLogger,
  showErrorToast as showErrorToastLogger,
  showToast as showToastLogger
} from "./loggingUtils";
import {
  coerceSummaryValue as coerceSummaryValueUtil,
  formatSummaryValue as formatSummaryValueUtil,
  resolveCurrencyCode as resolveCurrencyCodeUtil
} from "./summaryValueUtils";
import KanbanRecordModal from "c/lresKanbanRecordModal";
const DEFAULT_EMPTY_LABEL = "No Value";
const MASTER_RECORD_TYPE_ID = "012000000000000AAA";
const DEFAULT_DATETIME_FORMAT = "dd/MM/yyyy h:mm a";
const SUPPORTED_GROUPING_FIELD_TYPES = new Set(["picklist", "string"]);

export default class KanbanExplorer extends NavigationMixin(LightningElement) {
  _contextRecordId;
  _selectedParentRecordIds = [];
  effectiveRecordId = null;
  _cardObjectApiName;
  _cardRecordsWhereClause;
  _cardRecordsOrderByClause;
  _childRelationshipName;
  _groupingFieldApiName;
  _cardFieldApiNames = "";
  _columnSummariesDefinition = "";
  _cardFieldIcons = "";
  _sortFieldApiNames = "";
  _filterFieldApiNames = "";
  _searchFieldApiNames = "";
  _cardRecordsLimit = 200;
  _parentRecordsLimit = 100;
  _boardTitle;
  _emptyGroupLabel;
  _showCardFieldLabels = false;
  _parentObjectApiName;
  _parentRecordsWhereClause;
  _parentRecordsOrderByClause;
  _parentRecordFieldApiNames = "";
  _showParentRecordFieldLabels = false;
  _dateTimeFormat;
  _defaultToMultipleParentSelection = false;
  _suppressNextConfigRefresh = false;

  selectedSortField = null;
  sortDirection = "asc";

  filterDefinitions = [];
  activeFilterMenuId = null;
  isSortMenuOpen = false;
  searchValue = "";

  isLoading = false;
  errorMessage;
  warningMessage;
  columns = [];
  relatedRecords = [];
  summaryDefinitions = [];
  summaryWarnings = [];
  summaryRuntimeWarnings = [];

  objectInfo;
  objectInfoError;
  picklistFieldValues;
  picklistFieldError;

  menuDismissListener;
  hasRecordContext = false;
  parentObjectLabel;
  parentLabelById = new Map();
  manualRefreshInProgress = false;
  _debugLoggingEnabled = true;
  _parentSelectionRefreshTimeout;
  patternTokenCache = new Map();
  _isConnected = false;
  _dataModeCache = null;
  _modalOpen = false;

  shouldAutoRefreshOnConfig() {
    return shouldAutoRefreshOnConfigService(this);
  }

  // Context and data source

  /**
   * Exposes the record id contextualizing the board. When retrieved, this reflects the
   * internally computed `effectiveRecordId`, which accounts for either the provided
   * `recordId` or a parent selection.
   *
   * @returns {string|null} Active record id or `null` when no context is applied.
   */
  @api
  get recordId() {
    return this.effectiveRecordId;
  }

  /**
   * Updates the record context for the board. Setting this clears any parent selection
   * and triggers configuration refreshes so the board renders the correct dataset.
   *
   * @param {string|null} value Salesforce record id to scope the board to, or `null`.
   */
  set recordId(value) {
    const normalized = value ?? null;
    if (this._contextRecordId === normalized) {
      return;
    }
    this.logDebug("recordId setter triggered.", {
      previous: this._contextRecordId,
      next: normalized
    });
    this._contextRecordId = normalized;
    this.hasRecordContext = Boolean(normalized);
    if (this.hasRecordContext) {
      this.applySelectedParentRecords([], { suppressRefresh: true });
      this.parentObjectLabel = null;
      this.parentLabelById = new Map();
    }
    this.updateEffectiveRecordId();
    this.handleConfigChange();
  }

  /**
   * Card object API name whose records populate the board.
   *
   * @returns {string|null} Fully qualified API name or `null` when unset.
   */
  @api
  get cardObjectApiName() {
    return this._cardObjectApiName;
  }

  /**
   * Sets the card object API name and forces picklist metadata plus configuration refreshes.
   *
   * @param {string} value API name (case-insensitive) of the child object.
   */
  set cardObjectApiName(value) {
    const normalized = normalizeString(value);
    if (normalized === this._cardObjectApiName) {
      return;
    }
    this.logDebug("cardObjectApiName changed.", {
      previous: this._cardObjectApiName,
      next: normalized
    });
    this._cardObjectApiName = normalized;
    this.picklistFieldValues = undefined;
    this.handleConfigChange();
  }

  /**
   * Related list API name used when the component runs in record context.
   *
   * @returns {string|null} API name or `null` if none configured.
   */
  @api
  get childRelationshipName() {
    return this._childRelationshipName;
  }

  /**
   * Sets the related list API name and triggers a config refresh to rewire data.
   *
   * @param {string} value Related list API name (e.g., `Opportunities`).
   */
  set childRelationshipName(value) {
    const normalized = normalizeString(value);
    if (normalized === this._childRelationshipName) {
      return;
    }
    this.logDebug("childRelationshipName changed.", {
      previous: this._childRelationshipName,
      next: normalized
    });
    this._childRelationshipName = normalized;
    this.handleConfigChange();
  }

  /**
   * WHERE clause appended to the card records query.
   *
   * @returns {string|null} SOQL expression, or `null` if no additional filter applies.
   */
  @api
  get cardRecordsWhereClause() {
    return this._cardRecordsWhereClause;
  }

  /**
   * Updates the card record filter and rebuilds the board configuration.
   *
   * @param {string} value SOQL-compliant conditional expression.
   */
  set cardRecordsWhereClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._cardRecordsWhereClause) {
      return;
    }
    this.logDebug("cardRecordsWhereClause changed.", {
      previous: this._cardRecordsWhereClause,
      next: normalized
    });
    this._cardRecordsWhereClause = normalized;
    this.handleConfigChange();
  }

  /**
   * ORDER BY clause applied to the initial card records query.
   *
   * @returns {string|null} SOQL ORDER BY expression, or `null` when unset.
   */
  @api
  get cardRecordsOrderByClause() {
    return this._cardRecordsOrderByClause;
  }

  /**
   * Updates the ORDER BY clause used when fetching card records from Apex.
   *
   * @param {string} value SOQL ORDER BY expression without the ORDER BY keyword.
   */
  set cardRecordsOrderByClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._cardRecordsOrderByClause) {
      return;
    }
    this.logDebug("cardRecordsOrderByClause changed.", {
      previous: this._cardRecordsOrderByClause,
      next: normalized
    });
    this._cardRecordsOrderByClause = normalized;
    this.handleConfigChange();
  }

  /**
   * Maximum number of card records retrieved per refresh.
   *
   * @returns {number} Current page size limit.
   */
  @api
  get cardRecordsLimit() {
    return this._cardRecordsLimit;
  }

  /**
   * Sets the retrieval limit for card records (defaults to 200 when invalid).
   *
   * @param {number|string} value Positive integer or stringifiable number.
   */
  set cardRecordsLimit(value) {
    const parsed = normalizePositiveInteger(value, 200);
    if (parsed === this._cardRecordsLimit) {
      return;
    }
    this.logDebug("cardRecordsLimit changed.", {
      previous: this._cardRecordsLimit,
      next: parsed
    });
    this._cardRecordsLimit = parsed;
    this.handleConfigChange();
  }

  // Grouping and column config

  /**
   * API name of the field used to group cards into columns.
   *
   * @returns {string|null} Field API name or `null` until set.
   */
  @api
  get groupingFieldApiName() {
    return this._groupingFieldApiName;
  }

  /**
   * Updates the grouping field, prompting the board to rebuild its columns.
   *
   * @param {string} value Field API name, optionally object-qualified.
   */
  set groupingFieldApiName(value) {
    const normalized = normalizeString(value);
    if (normalized === this._groupingFieldApiName) {
      return;
    }
    this.logDebug("groupingFieldApiName changed.", {
      previous: this._groupingFieldApiName,
      next: normalized
    });
    this._groupingFieldApiName = normalized;
    this.handleConfigChange();
  }

  /**
   * Label applied to the column representing blank grouping values.
   *
   * @returns {string|null} Custom label or `null` to use the default.
   */
  @api
  get emptyGroupLabel() {
    return this._emptyGroupLabel;
  }

  /**
   * Updates the blank grouping label and re-applies it to existing columns.
   *
   * @param {string} value Column label text.
   */
  set emptyGroupLabel(value) {
    if (this._emptyGroupLabel === value) {
      return;
    }
    this.logDebug("emptyGroupLabel changed.", {
      previous: this._emptyGroupLabel,
      next: value
    });
    this._emptyGroupLabel = normalizeString(value);
    this.refreshColumnsWithEmptyLabel();
  }

  /**
   * Comma-delimited list of fields rendered on each card (first entry is title).
   *
   * @returns {string} Raw string input stored for later parsing.
   */
  @api
  get cardFieldApiNames() {
    return this._cardFieldApiNames;
  }

  /**
   * Accepts a comma-delimited field list to control card rendering.
   *
   * @param {string|string[]} value Field API names, optionally provided as an array.
   */
  set cardFieldApiNames(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._cardFieldApiNames) {
      return;
    }
    this.logDebug("cardFieldApiNames changed.", {
      previous: this._cardFieldApiNames,
      next: normalized
    });
    this._cardFieldApiNames = normalized;
    this.handleConfigChange();
  }

  /**
   * Summary definitions configured via Lightning App Builder.
   *
   * @returns {string} Raw summary definition string.
   */
  @api
  get columnSummariesDefinition() {
    return this._columnSummariesDefinition;
  }

  /**
   * Updates the summary definition string and triggers a config refresh.
   *
   * @param {string|string[]} value Summary definition string.
   */
  set columnSummariesDefinition(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._columnSummariesDefinition) {
      return;
    }
    this.logDebug("columnSummariesDefinition changed.", {
      previous: this._columnSummariesDefinition,
      next: normalized
    });
    this._columnSummariesDefinition = normalized;
    this.handleConfigChange();
  }

  /**
   * Comma-delimited list pairing fields to icon metadata.
   *
   * @returns {string} Stored representation of requested icons.
   */
  @api
  get cardFieldIcons() {
    return this._cardFieldIcons;
  }

  /**
   * Updates the icon configuration used when rendering card field values.
   *
   * @param {string|string[]} value Icon descriptor list aligned with `cardFieldApiNames`.
   */
  set cardFieldIcons(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._cardFieldIcons) {
      return;
    }
    this.logDebug("cardFieldIcons changed.", {
      previous: this._cardFieldIcons,
      next: normalized
    });
    this._cardFieldIcons = normalized;
    this.handleConfigChange();
  }

  /**
   * Indicates whether card field labels should render alongside the values.
   *
   * @returns {boolean} True when labels are shown.
   */
  @api
  get showCardFieldLabels() {
    return this._showCardFieldLabels;
  }

  /**
   * Toggles card field labels on or off without forcing a refresh.
   *
   * @param {boolean|string} value Truthy value enables labels.
   */
  set showCardFieldLabels(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._showCardFieldLabels) {
      return;
    }
    this._showCardFieldLabels = normalized;
    this.logDebug("showCardFieldLabels changed.", {
      enabled: this._showCardFieldLabels
    });
  }

  /**
   * Custom date/time pattern applied to formatted values, falling back to
   * `DEFAULT_DATETIME_FORMAT` when undefined.
   *
   * @returns {string|null} Luxon-compatible format string.
   */
  @api
  get dateTimeFormat() {
    return this._dateTimeFormat;
  }

  /**
   * Accepts a date/time format override and rebuilds cached filter data so human-readable
   * strings stay in sync with the new pattern.
   *
   * @param {string} value Format string understood by `Intl.DateTimeFormat`.
   */
  set dateTimeFormat(value) {
    const normalized = normalizeString(value);
    if (normalized === this._dateTimeFormat) {
      return;
    }
    this._dateTimeFormat = normalized;
    this.logDebug("dateTimeFormat changed.", {
      format: this._dateTimeFormat || DEFAULT_DATETIME_FORMAT
    });
    this.patternTokenCache.clear();
    this.buildFilterDefinitions(this.relatedRecords || []);
    this.rebuildColumnsWithPicklist();
  }

  // Sorting and search

  /**
   * Ordered list of fields available for manual sorting.
   *
   * @returns {string} Raw comma-delimited field names.
   */
  @api
  get sortFieldApiNames() {
    return this._sortFieldApiNames;
  }

  /**
   * Defines the fields exposed to the end user for sorting.
   *
   * @param {string|string[]} value Field names (comma-delimited string or array).
   */
  set sortFieldApiNames(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._sortFieldApiNames) {
      return;
    }
    this.logDebug("sortFieldApiNames changed.", {
      previous: this._sortFieldApiNames,
      next: normalized
    });
    this._sortFieldApiNames = normalized;
    this.handleConfigChange();
  }

  /**
   * Field API names used when executing the search input.
   *
   * @returns {string} Comma-delimited list of simple field names.
   */
  @api
  get searchFieldApiNames() {
    return this._searchFieldApiNames;
  }

  /**
   * Sets the fields to scan when the user types into the search bar.
   *
   * @param {string|string[]} value Field names to include in the search scope.
   */
  set searchFieldApiNames(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._searchFieldApiNames) {
      return;
    }
    this.logDebug("searchFieldApiNames changed.", {
      previous: this._searchFieldApiNames,
      next: normalized
    });
    this._searchFieldApiNames = normalized;
    this.handleConfigChange();
  }

  // Filtering

  /**
   * Comma-delimited list describing which fields are filterable.
   *
   * @returns {string} Field list or empty string when no filters are configured.
   */
  @api
  get filterFieldApiNames() {
    return this._filterFieldApiNames;
  }

  /**
   * Updates the set of fields available for on-board filtering.
   *
   * @param {string|string[]} value Field API names.
   */
  set filterFieldApiNames(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._filterFieldApiNames) {
      return;
    }
    this.logDebug("filterFieldApiNames changed.", {
      previous: this._filterFieldApiNames,
      next: normalized
    });
    this._filterFieldApiNames = normalized;
    this.handleConfigChange();
  }

  // Parent context

  /**
   * API name of the parent object when the component runs without direct record context.
   *
   * @returns {string|null} Parent object API name.
   */
  @api
  get parentObjectApiName() {
    return this._parentObjectApiName;
  }

  /**
   * Sets the parent object whose records populate the selector when no record context is
   * present. Clearing or changing this resets parent selections and reloads options.
   *
   * @param {string} value API name of the parent object.
   */
  set parentObjectApiName(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentObjectApiName) {
      return;
    }
    this.logDebug("parentObjectApiName changed.", {
      previous: this._parentObjectApiName,
      next: normalized
    });
    this._parentObjectApiName = normalized;
    this.parentLabelById = new Map();
    this.parentObjectLabel = null;
    this.resetParentSelection();
    this.handleConfigChange();
  }

  /**
   * Optional WHERE clause applied when querying parent records.
   *
   * @returns {string|null} SOQL clause or `null`.
   */
  @api
  get parentRecordsWhereClause() {
    return this._parentRecordsWhereClause;
  }

  /**
   * Applies an additional filter when loading parent records and resets cached options.
   *
   * @param {string} value SOQL WHERE fragment.
   */
  set parentRecordsWhereClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentRecordsWhereClause) {
      return;
    }
    this.logDebug("parentRecordsWhereClause changed.", {
      previous: this._parentRecordsWhereClause,
      next: normalized
    });
    this._parentRecordsWhereClause = normalized;
    this.parentLabelById = new Map();
    this.resetParentSelection();
    this.handleConfigChange();
  }

  /**
   * ORDER BY clause applied when querying parent records.
   *
   * @returns {string|null} SOQL clause or `null`.
   */
  @api
  get parentRecordsOrderByClause() {
    return this._parentRecordsOrderByClause;
  }

  /**
   * Applies ORDER BY when loading parent records.
   *
   * @param {string} value SOQL ORDER BY fragment.
   */
  set parentRecordsOrderByClause(value) {
    const normalized = normalizeString(value);
    if (normalized === this._parentRecordsOrderByClause) {
      return;
    }
    this.logDebug("parentRecordsOrderByClause changed.", {
      previous: this._parentRecordsOrderByClause,
      next: normalized
    });
    this._parentRecordsOrderByClause = normalized;
    this.handleConfigChange();
  }

  /**
   * LIMIT clause applied when querying parent records.
   *
   * @returns {number} Maximum number of parent records to fetch.
   */
  @api
  get parentRecordsLimit() {
    return this._parentRecordsLimit;
  }

  /**
   * Updates the LIMIT used for parent records and triggers reload.
   *
   * @param {number|string} value Positive integer limit (1-200).
   */
  set parentRecordsLimit(value) {
    const parsed = Math.min(normalizePositiveInteger(value, 100), 200);
    if (parsed === this._parentRecordsLimit) {
      return;
    }
    this.logDebug("parentRecordsLimit changed.", {
      previous: this._parentRecordsLimit,
      next: parsed
    });
    this._parentRecordsLimit = parsed;
    this.handleConfigChange();
  }

  /**
   * Comma-delimited parent field list displayed below the selector.
   *
   * @returns {string} Field API names joined by commas.
   */
  @api
  get parentRecordFieldApiNames() {
    return this._parentRecordFieldApiNames;
  }

  /**
   * Sets the parent fields used when building summary rows and triggers a reload of
   * parent options so the additional metadata is available.
   *
   * @param {string|string[]} value Field API names.
   */
  set parentRecordFieldApiNames(value) {
    const normalized =
      value === undefined || value === null ? "" : String(value);
    if (normalized === this._parentRecordFieldApiNames) {
      return;
    }
    this.logDebug("parentRecordFieldApiNames changed.", {
      previous: this._parentRecordFieldApiNames,
      next: normalized
    });
    this._parentRecordFieldApiNames = normalized;
    this.parentLabelById = new Map();
  }

  /**
   * Indicates whether labels should precede parent record summary values.
   *
   * @returns {boolean} True when labels render.
   */
  @api
  get showParentRecordFieldLabels() {
    return this._showParentRecordFieldLabels;
  }

  /**
   * Toggles the label visibility for parent record summaries and rebuilds cached details.
   *
   * @param {boolean|string} value Truthy value enables labels.
   */
  set showParentRecordFieldLabels(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._showParentRecordFieldLabels) {
      return;
    }
    this._showParentRecordFieldLabels = normalized;
    this.logDebug("showParentRecordFieldLabels changed.", {
      enabled: this._showParentRecordFieldLabels
    });
  }

  /**
   * Defaults the parent selector to multi-select mode. When disabled, the selector
   * reverts to a single-select combobox and excess selections are cleared automatically.
   */
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
    this.logDebug("defaultToMultipleParentSelection changed.", {
      enabled: normalized
    });
    if (!normalized) {
      const nextSelection = this._selectedParentRecordIds?.length
        ? [this._selectedParentRecordIds[0]]
        : [];
      this.applySelectedParentRecords(nextSelection);
    }
  }

  // Presentation and diagnostics

  /**
   * Optional override for the board title displayed in the lightning-card header.
   *
   * @returns {string|null} Custom title text.
   */
  @api
  get boardTitle() {
    return this._boardTitle;
  }

  /**
   * Sets the board title text without triggering a data refresh.
   *
   * @param {string} value Title string.
   */
  set boardTitle(value) {
    const normalized = normalizeString(value);
    if (normalized === this._boardTitle) {
      return;
    }
    this.logDebug("boardTitle changed.", {
      previous: this._boardTitle,
      next: normalized
    });
    this._boardTitle = normalized;
  }

  /**
   * Exposes whether verbose debug logging is enabled.
   *
   * @returns {boolean} True when debug statements should be emitted.
   */
  @api
  get debugLogging() {
    return this._debugLoggingEnabled;
  }

  /**
   * Toggles debug logging, allowing builders to increase verbosity without redeploying.
   *
   * @param {boolean|string} value Truthy values enable debug logs.
   */
  set debugLogging(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._debugLoggingEnabled) {
      return;
    }
    this._debugLoggingEnabled = normalized;
    this.logInfo("Debug logging toggled.", { enabled: normalized });
  }

  /**
   * Public imperative method that refreshes related records using the current configuration.
   *
   * @returns {Promise<void>} Resolves once refresh completes (errors are surfaced via toasts).
   */
  @api
  async refresh() {
    try {
      await this.performCardRecordsRefresh();
    } catch {
      // performCardRecordsRefresh already surfaced the error to the UI.
    }
  }

  /**
   * Retrieves related records via Apex using the currently resolved configuration, then
   * synchronizes the wire data so the board reflects the freshest dataset.
   *
   * @returns {Promise<boolean>} Resolves to `true` when Apex returns successfully, otherwise `false`.
   */
  async performCardRecordsRefresh() {
    return performCardRecordsRefreshService(this, {
      defaultCardTitleField: this.defaultDisplayField
    });
  }

  async refreshParentlessCardRecords(fieldList) {
    return refreshParentlessCardRecordsService(this, fieldList, {
      defaultCardTitleField: this.defaultDisplayField
    });
  }

  buildDataFetchRequest(fieldList) {
    return buildDataFetchRequestService(this, fieldList);
  }

  async executeDataFetch(fetchRequest) {
    return executeDataFetchService(this, fetchRequest, {
      defaultCardTitleField: this.defaultDisplayField
    });
  }

  /**
   * Applies a collection of related records to the board, rebuilding columns, filters,
   * and measurement caches so the UI immediately reflects the supplied dataset.
   *
   * @param {Array} records Array of wire/Apex record payloads to render.
   */
  applyCardRecordsSnapshot(records) {
    const dataset = this.normalizeCardRecords(records);
    this.logDebug("Applying related records snapshot.", {
      previousRecordCount: this.relatedRecords?.length || 0,
      nextRecordCount: dataset.length
    });
    this.relatedRecords = dataset;
    const groupingField = this.groupingFieldQualified;
    const cardFields = this.cardFieldsQualified;
    if (!this.validateSnapshotGrouping()) {
      return;
    }
    this.rebuildBoardFromSnapshot(dataset, groupingField, cardFields);
    this.logInfo("Related records snapshot applied to board.", {
      recordCount: this.relatedRecords.length,
      groupingField
    });
  }

  normalizeCardRecords(records) {
    return Array.isArray(records) ? records : [];
  }

  validateSnapshotGrouping() {
    if (this.ensureValidGroupingFieldType()) {
      return true;
    }
    this.logWarn(
      "Skipping snapshot application; grouping field type is unsupported."
    );
    return false;
  }

  rebuildBoardFromSnapshot(records, groupingField, cardFields) {
    this.buildFilterDefinitions(records);
    this.columns = this.buildColumns(records, groupingField, cardFields);
    this.errorMessage = undefined;
  }

  connectedCallback() {
    this._isConnected = true;
    this._dataModeCache = null;
    this.handleConfigChange();
  }

  disconnectedCallback() {
    this.logDebug("Component disconnected. Cleaning up menus and listeners.");
    this.closeSortMenu();
    this.closeFilterMenus();
    this.clearParentSelectionRefreshDebounce();
    clearDebouncedSearchInteractions(this);
  }

  handleConfigChange() {
    this.refreshSummaryDefinitions();
    handleConfigChangeState(this);
  }

  clearParentSelectionRefreshDebounce() {
    if (this._parentSelectionRefreshTimeout) {
      clearTimeout(this._parentSelectionRefreshTimeout);
      this._parentSelectionRefreshTimeout = null;
    }
  }

  updateEffectiveRecordId() {
    updateEffectiveRecordIdState(this);
  }

  applySelectedParentRecords(values, options = {}) {
    return applySelectedParentRecordsState(this, values, options);
  }

  resetParentSelection() {
    return resetParentSelectionState(this);
  }

  normalizeParentSelection(values) {
    return normalizeParentSelectionState(this, values);
  }

  handleParentSelectionChange() {
    return handleParentSelectionChangeState(this);
  }

  handleParentSelectorChange(event) {
    return handleParentSelectorChangeState(this, event);
  }

  handleParentOptionsChange(event) {
    return handleParentOptionsChangeState(this, event);
  }

  /**
   * Handles parent mode change events from the parent selector component.
   * Updates internal state and triggers a full board refresh as specified.
   *
   * @param {CustomEvent} event Event containing defaultToMultipleParentSelection detail
   */
  handleParentModeChange(event) {
    const { defaultToMultipleParentSelection } = event.detail;

    // Update internal state (don't modify the @api property)
    this._defaultToMultipleParentSelection = defaultToMultipleParentSelection;

    // Clear selections on any mode toggle so user must reselect
    this.applySelectedParentRecords([], { suppressRefresh: true });

    // Route through existing config change machinery instead of direct refresh()
    this.handleConfigChange();
  }

  /**
   * Generates normalized column data from the current record snapshot. This includes
   * grouping, sorting, applying metadata ordering, injecting blank columns, and computing
   * per-column counts to drive the board UI.
   *
   * @param {Array} records Related record dataset to partition.
   * @param {string} groupingField Fully-qualified field used to derive column keys.
   * @param {Array<string>} cardFields Fields rendered within each card (used for fallbacks).
   * @returns {Array<Object>} Array of column descriptors (key, label, records, count, etc).
   */
  buildColumns(records, groupingField, cardFields = []) {
    const resolvedCardFields = Array.isArray(cardFields) ? cardFields : [];
    const context = this.resolveColumnContext(
      groupingField,
      resolvedCardFields
    );
    const callbacks = this.buildColumnCallbacks();
    const options = this.buildColumnOptions(records, context, callbacks);
    const columns = buildColumnsUtil(records || [], options);
    this.summaryRuntimeWarnings = columns.flatMap(
      (column) => column.summaryWarnings || []
    );
    this.updateWarningMessage();
    return columns;
  }

  ensureSortField() {
    const options = this.sortFieldOptions;
    if (!options || options.length === 0) {
      this.selectedSortField = null;
      return;
    }
    const hasSelection =
      this.selectedSortField &&
      options.some((option) => option.value === this.selectedSortField);
    if (!hasSelection) {
      this.selectedSortField = options[0].value;
    }
  }

  rebuildColumnsWithPicklist() {
    if (!this.cardObjectApiName || !this.groupingFieldApiName) {
      this.logDebug(
        "Skipping rebuild; missing card object or grouping field.",
        {
          cardObjectApiName: this.cardObjectApiName,
          groupingFieldApiName: this.groupingFieldApiName
        }
      );
      return;
    }
    this.logDebug("Rebuilding columns with picklist metadata.", {
      recordCount: this.relatedRecords?.length || 0,
      groupingField: this.groupingFieldQualified
    });
    this.ensureSortField();
    if (this.relatedRecords) {
      this.buildFilterDefinitions(this.relatedRecords);
    }
    const groupingField = this.groupingFieldQualified;
    if (!groupingField) {
      this.logWarn("Cannot rebuild columns; grouping field failed to qualify.");
      return;
    }
    if (!this.ensureValidGroupingFieldType()) {
      this.logWarn(
        "Grouping field type is not supported. Columns will not be rendered."
      );
      return;
    }
    const cardFields = this.cardFieldsQualified;
    const records = this.relatedRecords || [];
    this.columns = this.buildColumns(records, groupingField, cardFields);
    this.logDebug("Columns rebuilt.", {
      columnCount: this.columns.length,
      groupingField
    });
  }

  @api
  refreshSummaryDefinitions() {
    const { summaries, warnings } = parseSummaryDefinitions(
      this.columnSummariesDefinition
    );

    if (!this.objectInfo) {
      this.summaryDefinitions = summaries.map((summary) => ({
        ...summary,
        fieldApiName: this.qualifyFieldName(summary.fieldApiName)
      }));
      this.summaryWarnings = warnings;
      this.updateWarningMessage();
      return;
    }

    const validSummaries = [];
    const validationWarnings = [];
    const numericTypes = new Set([
      "currency",
      "double",
      "integer",
      "int",
      "percent",
      "number"
    ]);
    const dateTypes = new Set(["date", "datetime"]);
    const booleanTypes = new Set(["boolean"]);

    summaries.forEach((summary) => {
      const qualifiedField = this.qualifyFieldName(summary.fieldApiName);
      if (!qualifiedField) {
        validationWarnings.push(
          `Summary field "${summary.fieldApiName}" is invalid.`
        );
        return;
      }
      const metadata = this.getFieldMetadata(qualifiedField);
      if (!metadata) {
        validationWarnings.push(
          `Summary field "${summary.fieldApiName}" does not exist.`
        );
        return;
      }
      const dataType = normalizeString(metadata.dataType || metadata.type);
      if (!dataType) {
        validationWarnings.push(
          `Summary field "${summary.fieldApiName}" has no supported data type.`
        );
        return;
      }
      const normalizedType = dataType.toLowerCase();
      const summaryType = summary.summaryType;
      const isNumericSummary = summaryType === "SUM" || summaryType === "AVG";
      const isMinMaxSummary = summaryType === "MIN" || summaryType === "MAX";
      const isCountSummary =
        summaryType === "COUNT_TRUE" || summaryType === "COUNT_FALSE";
      if (
        (isNumericSummary && !numericTypes.has(normalizedType)) ||
        (isMinMaxSummary &&
          !numericTypes.has(normalizedType) &&
          !dateTypes.has(normalizedType)) ||
        (isCountSummary && !booleanTypes.has(normalizedType))
      ) {
        validationWarnings.push(
          `Summary field "${summary.fieldApiName}" is not valid for ${summaryType}.`
        );
        return;
      }
      validSummaries.push({
        ...summary,
        fieldApiName: qualifiedField,
        dataType: normalizedType,
        scale: metadata.scale,
        precision: metadata.precision
      });
    });

    this.summaryDefinitions = validSummaries;
    this.summaryWarnings = [...warnings, ...validationWarnings];
    this.updateWarningMessage();
  }

  updateWarningMessage() {
    const warnings = [
      ...(this.summaryWarnings || []),
      ...(this.summaryRuntimeWarnings || [])
    ].filter(Boolean);
    const uniqueWarnings = Array.from(new Set(warnings));
    this.warningMessage = uniqueWarnings.length
      ? uniqueWarnings.join(" ")
      : undefined;
  }

  @wire(getObjectInfo, { objectApiName: "$cardObjectApiName" })
  wiredObjectInfo({ error, data }) {
    if (data) {
      this.objectInfo = data;
      this.objectInfoError = undefined;
      this.logDebug("Object info loaded.", {
        apiName: data.apiName,
        defaultRecordTypeId: data.defaultRecordTypeId
      });
      this.refreshSummaryDefinitions();
      this.rebuildColumnsWithPicklist();
    } else if (error) {
      this.objectInfo = undefined;
      this.objectInfoError = error;
      this.refreshSummaryDefinitions();
      this.logError("Failed to load object info.", error);
    }
  }

  @wire(getPicklistValuesByRecordType, {
    objectApiName: "$cardObjectApiName",
    recordTypeId: "$effectiveRecordTypeId"
  })
  wiredPicklistValues({ error, data }) {
    if (data) {
      this.picklistFieldValues = data.picklistFieldValues;
      this.picklistFieldError = undefined;
      this.logDebug("Picklist values loaded.", {
        fieldCount: Object.keys(this.picklistFieldValues || {}).length,
        recordTypeId: this.effectiveRecordTypeId
      });
      this.rebuildColumnsWithPicklist();
    } else if (error) {
      this.picklistFieldValues = undefined;
      this.picklistFieldError = error;
      this.logError("Failed to load picklist values.", error);
      this.rebuildColumnsWithPicklist();
    }
  }

  get activeParentRecordIds() {
    if (this.hasRecordContext && this._contextRecordId) {
      return [this._contextRecordId];
    }
    return [...(this._selectedParentRecordIds || [])];
  }

  resolveDataMode() {
    return resolveDataModeService(this);
  }

  get dataMode() {
    return this.resolveDataMode();
  }

  get isParentless() {
    return this.dataMode.type === "parentless";
  }

  get hasRequiredConfig() {
    return this.dataMode.ready;
  }

  get shouldAutoRefreshParentless() {
    const mode = this.dataMode;
    return this._isConnected && mode.type === "parentless" && mode.ready;
  }

  get hasCardRecordsWhereClause() {
    return Boolean(this._cardRecordsWhereClause);
  }

  get effectiveDateTimeFormat() {
    return this._dateTimeFormat || DEFAULT_DATETIME_FORMAT;
  }

  get cardFieldsQualified() {
    const fields = this.parseFieldList(this.cardFieldApiNames);
    if (!fields.length && this.cardObjectApiName) {
      const defaultField = this.defaultDisplayField;
      if (defaultField) {
        fields.push(defaultField);
      }
    }
    return fields.filter(Boolean);
  }

  get sortFieldsQualified() {
    return this.uniqueFieldList(
      this.parseFieldList(this.sortFieldApiNames)
    ).filter(Boolean);
  }

  get filterFieldsQualified() {
    return this.uniqueFieldList(
      this.parseFieldList(this.filterFieldApiNames)
    ).filter(Boolean);
  }

  get availableSortFields() {
    const configured = this.sortFieldsQualified;
    if (configured.length) {
      return configured;
    }
    const cardFields = this.cardFieldsQualified;
    if (cardFields.length) {
      return this.uniqueFieldList(cardFields);
    }
    const fallback = this.defaultDisplayField;
    return fallback ? [fallback] : [];
  }

  get groupingFieldQualified() {
    return this.qualifyFieldName(this.groupingFieldApiName);
  }

  get groupingFieldSimpleName() {
    return this.extractSimpleFieldName(this.groupingFieldApiName);
  }

  get sortFieldQualified() {
    const field = this.selectedSortField;
    if (field) {
      if (field.includes(".")) {
        return field;
      }
      return this.qualifyFieldName(field);
    }
    return this.availableSortFields[0] || null;
  }

  get sortFieldOptions() {
    const selected = this.selectedSortField;
    return this.availableSortFields.map((field) => ({
      label: this.getFieldLabel(field),
      value: field,
      selected: field === selected
    }));
  }

  get selectedSortLabel() {
    const selected = this.sortFieldOptions.find(
      (option) => option.value === this.selectedSortField
    );
    return selected ? selected.label : "Sort";
  }

  get sortButtonClass() {
    const base = "filter-dropdown_button sort-dropdown_button";
    return this.isSortMenuOpen
      ? `${base} filter-dropdown_button--active`
      : base;
  }

  get cardFieldIconsList() {
    if (!this._cardFieldIcons) {
      return [];
    }
    return this._cardFieldIcons
      .split(",")
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }

  uniqueFieldList(fields) {
    if (!Array.isArray(fields)) {
      return [];
    }
    const set = new Set();
    const result = [];
    fields.forEach((field) => {
      if (field && !set.has(field)) {
        set.add(field);
        result.push(field);
      }
    });
    return result;
  }

  get filtersAvailable() {
    return this.filterDefinitions.length > 0;
  }

  get searchAvailable() {
    return this.searchFieldsQualified.length > 0;
  }

  get showParentSelector() {
    return !this.hasRecordContext && Boolean(this.parentObjectApiName);
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

  get parentBadgeLabel() {
    const base =
      this.parentObjectLabel || formatObjectLabel(this.parentObjectApiName);
    if (base) {
      return `Parent ${base}`;
    }
    return "Parent";
  }

  get shouldDisplayParentReferenceOnCards() {
    return this.hasMultipleParentSelection;
  }

  get clearFiltersDisabled() {
    const hasFilterSelection = this.filterDefinitions.some(
      (def) => def.selectedValues?.length
    );
    return !hasFilterSelection && !this.searchValue;
  }

  get actionsAvailable() {
    return this.filtersAvailable || (this.sortFieldOptions?.length || 0) > 0;
  }

  get refreshButtonDisabled() {
    return this.manualRefreshInProgress || this.isLoading;
  }

  get ownerFieldName() {
    return this.qualifyFieldName("OwnerId");
  }

  getFilterButtonClass(filterId, hasSelection) {
    return getFilterButtonClassInteractions(this, filterId, hasSelection);
  }

  get filterFieldDependencies() {
    const dependencies = new Set(this.filterFieldsQualified);
    if (dependencies.has(this.ownerFieldName)) {
      [
        this.ownerFieldName,
        this.qualifyFieldName("Owner.Name"),
        this.qualifyFieldName("Owner.FirstName"),
        this.qualifyFieldName("Owner.LastName")
      ].forEach((field) => dependencies.add(field));
    }
    this.searchFieldsQualified.forEach((field) => dependencies.add(field));
    return Array.from(dependencies).filter(Boolean);
  }

  get searchFieldsQualified() {
    const configured = this.uniqueFieldList(
      this.parseFieldList(this.searchFieldApiNames)
    ).filter(Boolean);
    if (configured.length) {
      return configured;
    }
    const fallback = this.defaultDisplayField;
    return fallback ? [fallback] : [];
  }

  parseIconEntry(rawValue) {
    const value = normalizeString(rawValue);
    if (!value) {
      return { iconName: null, emoji: null };
    }
    const emoji = this.resolveEmoji(value);
    if (emoji) {
      return { iconName: null, emoji };
    }
    return { iconName: this.coerceIconName(value), emoji: null };
  }

  get resolvedBoardTitle() {
    if (this.boardTitle) {
      return this.boardTitle;
    }
    if (this.objectInfo?.labelPlural) {
      return `${this.objectInfo.labelPlural} Kanban`;
    }
    return "Related Records Kanban";
  }

  get blankGroupLabel() {
    return this.emptyGroupLabel || DEFAULT_EMPTY_LABEL;
  }

  get sortDirectionIcon() {
    return this.sortDirection === "desc"
      ? "utility:arrowdown"
      : "utility:arrowup";
  }

  get sortDirectionAltText() {
    return this.sortDirection === "desc"
      ? "Switch to ascending sort"
      : "Switch to descending sort";
  }

  get effectiveRecordTypeId() {
    if (!this.objectInfo) {
      return null;
    }
    return this.objectInfo.defaultRecordTypeId || MASTER_RECORD_TYPE_ID;
  }

  get groupingFieldMetadata() {
    const fieldName = this.groupingFieldSimpleName;
    if (!fieldName) {
      return null;
    }
    return this.objectInfo?.fields?.[fieldName] || null;
  }

  get groupingFieldDataType() {
    const metadata = this.groupingFieldMetadata;
    if (!metadata) {
      return null;
    }
    return metadata.dataType || metadata.type || null;
  }

  get isGroupingFieldTypeSupported() {
    const dataType = normalizeString(this.groupingFieldDataType);
    if (!dataType) {
      return true;
    }
    return SUPPORTED_GROUPING_FIELD_TYPES.has(dataType.toLowerCase());
  }

  get isGroupingFieldOptional() {
    const metadata = this.groupingFieldMetadata;
    if (!metadata) {
      return true;
    }
    return !metadata.required;
  }

  ensureGroupingFieldExists() {
    const fieldName = this.groupingFieldSimpleName;
    if (!this.objectInfo || !fieldName) {
      return true;
    }
    if (this.objectInfo.fields?.[fieldName]) {
      return true;
    }
    this.presentGroupingFieldMissingError();
    return false;
  }

  ensureValidGroupingFieldType() {
    if (!this.ensureGroupingFieldExists()) {
      return false;
    }
    if (this.isGroupingFieldTypeSupported) {
      return true;
    }
    this.presentGroupingFieldTypeError();
    return false;
  }

  presentGroupingFieldMissingError() {
    const fieldLabel =
      formatApiName(this.groupingFieldApiName) || "Grouping Field API Name";
    const objectLabel =
      formatApiName(this.cardObjectApiName) || "the card object";
    const message = `Grouping field specified ('${fieldLabel}') is not a field on the '${objectLabel}' object.`;
    this.columns = [];
    this.filterDefinitions = [];
    this.activeFilterMenuId = null;
    this.isSortMenuOpen = false;
    this.unregisterMenuOutsideClick();
    this.errorMessage = message;
    this.isLoading = false;
  }

  presentGroupingFieldTypeError() {
    const requirementMessage =
      "Grouping Field API Name must reference a Picklist or String field.";
    const fieldLabel =
      this.groupingFieldMetadata?.label ||
      this.getFieldLabel(this.groupingFieldQualified) ||
      formatApiName(this.groupingFieldApiName) ||
      "Grouping Field API Name";
    const typeLabel = this.groupingFieldDataType || "an unsupported type";
    this.columns = [];
    this.filterDefinitions = [];
    this.activeFilterMenuId = null;
    this.isSortMenuOpen = false;
    this.unregisterMenuOutsideClick();
    this.errorMessage = `${requirementMessage} ${fieldLabel} is configured as ${typeLabel}.`;
    this.isLoading = false;
  }

  get dataFetchFieldList() {
    this.refreshSummaryDefinitions();
    if (!this.ensureGroupingFieldExists()) {
      return null;
    }
    if (!this.hasRequiredConfig) {
      return null;
    }
    const groupingField = this.groupingFieldQualified;
    if (!groupingField) {
      return null;
    }
    const fields = new Set();
    fields.add(this.qualifyFieldName("Id"));
    fields.add(groupingField);
    this.cardFieldsQualified.forEach((field) => {
      if (field) {
        fields.add(field);
      }
    });
    this.availableSortFields.forEach((field) => {
      if (field) {
        fields.add(field);
      }
    });
    this.filterFieldDependencies.forEach((field) => {
      if (field) {
        fields.add(field);
      }
    });
    (this.summaryDefinitions || []).forEach((summary) => {
      if (summary?.fieldApiName) {
        fields.add(summary.fieldApiName);
      }
      if (summary?.dataType === "currency") {
        const currencyField = this.qualifyFieldName("CurrencyIsoCode");
        if (currencyField) {
          fields.add(currencyField);
        }
      }
    });
    return Array.from(fields);
  }

  get dataFetchPageSize() {
    return this._cardRecordsLimit || 200;
  }

  refreshColumnsWithEmptyLabel() {
    if (!this.columns || !this.columns.length) {
      return;
    }
    this.columns = this.columns.map((column) => {
      if (column.key === BLANK_KEY) {
        return {
          ...column,
          label: this.blankGroupLabel
        };
      }
      return column;
    });
  }

  findColumnByKey(key) {
    if (!key || !Array.isArray(this.columns)) {
      return null;
    }
    return this.columns.find((column) => column.key === key) || null;
  }

  buildFilterDefinitions(records) {
    return buildFilterDefinitionsInteractions(this, records);
  }

  getFilterBlueprints() {
    return getFilterBlueprintsInteractions(this);
  }

  sortFilterOptions(options, field) {
    return sortFilterOptionsInteractions(this, options, field);
  }

  getPicklistOrderMap(field) {
    return getPicklistOrderMapInteractions(this, field);
  }

  getUiPicklistValues(field) {
    return getUiPicklistValuesInteractions(this, field);
  }

  getFilterValueKey(record, blueprint) {
    return getFilterValueKeyInteractions(this, record, blueprint);
  }

  getFilterValueLabel(record, blueprint, fallbackValue) {
    return getFilterValueLabelInteractions(
      this,
      record,
      blueprint,
      fallbackValue
    );
  }

  isRecordIncluded(record) {
    return isRecordIncludedInteractions(this, record);
  }

  recordMatchesSearch(record) {
    return recordMatchesSearchInteractions(this, record);
  }

  handleSortDirectionToggle() {
    return handleSortDirectionToggleInteractions(this);
  }

  handleClearFilters() {
    return handleClearFiltersInteractions(this);
  }

  toggleFilterMenu(event) {
    return toggleFilterMenuInteractions(this, event);
  }

  setActiveFilterMenu(filterId) {
    return setActiveFilterMenuInteractions(this, filterId);
  }

  handleFilterMenuKeydown(event) {
    return handleFilterMenuKeydownInteractions(this, event);
  }

  handleFilterOptionToggle(event) {
    return handleFilterOptionToggleInteractions(this, event);
  }

  closeFilterMenus(skipUnregister = false) {
    return closeFilterMenusInteractions(this, skipUnregister);
  }

  toggleSortMenu(event) {
    return toggleSortMenuInteractions(this, event);
  }

  handleSortMenuClick(event) {
    return handleSortMenuClickInteractions(event);
  }

  handleSortMenuKeydown(event) {
    return handleSortMenuKeydownInteractions(this, event);
  }

  async handleColumnDrop(event) {
    return handleColumnDropInteractions(this, event);
  }

  handleParentViewClick(event) {
    return handleParentViewClickInteractions(this, event);
  }

  handleSortOptionChange(event) {
    return handleSortOptionChangeInteractions(this, event);
  }

  closeSortMenu() {
    return closeSortMenuInteractions(this);
  }

  async handleManualRefresh(event) {
    return handleManualRefreshInteractions(this, event);
  }

  handleSearchInput(event) {
    return handleSearchInputInteractions(this, event);
  }

  handleSearchKeyup(event) {
    return handleSearchKeyupInteractions(this, event);
  }

  applySearchValue(rawValue) {
    return applySearchValueInteractions(this, rawValue);
  }

  get isAnyMenuOpen() {
    return isAnyMenuOpenInteractions(this);
  }

  registerMenuOutsideClick() {
    return registerMenuOutsideClickInteractions(this);
  }

  unregisterMenuOutsideClick() {
    return unregisterMenuOutsideClickInteractions(this);
  }

  handleTitleClick(event) {
    return handleTitleClickInteractions(this, event);
  }

  handleExternalOpen(event) {
    return handleExternalOpenInteractions(this, event);
  }

  navigateToRecord(recordId) {
    return navigateToRecordInteractions(this, recordId);
  }

  async openRecordModal(recordId) {
    if (!recordId) {
      return;
    }
    if (this._modalOpen) {
      this.logDebug("Modal already open; ignoring additional request.", {
        recordId
      });
      return;
    }
    this._modalOpen = true;
    try {
      const headerFieldApiName =
        this.cardFieldsQualified[0] || this.defaultDisplayField;
      this.logDebug("Opening record modal.", {
        recordId,
        cardObjectApiName: this.cardObjectApiName,
        headerFieldApiName
      });
      const result = await KanbanRecordModal.open({
        size: "small",
        recordId,
        objectApiName: this.cardObjectApiName,
        headerFieldApiName,
        debugLogging: this._debugLoggingEnabled
      });
      if (result?.saved) {
        this.logDebug("Modal saved; refreshing board via existing path.", {
          recordId
        });
        await this.performCardRecordsRefresh();
      } else {
        this.logDebug("Modal closed without save.", { recordId });
      }
    } catch (error) {
      this.showErrorToast(error, { title: "Unable to open record" });
      this.logError("Failed to open record modal.", error);
    } finally {
      this._modalOpen = false;
    }
  }

  focusElementNextTick(selector) {
    return focusElementNextTickInteractions(this, selector);
  }

  /**
   * Persists a drag-and-drop change by moving a record from one grouping column to another.
   * The method infers the field/value pair to update, commits via `updateRecord`, and
   * refreshes wire data when necessary.
   *
   * @param {string} recordId Salesforce id of the card being moved.
   * @param {string} sourceColumnKey Identifier for the original column.
   * @param {string} targetColumnKey Identifier for the destination column.
   * @returns {Promise<void>} Resolves once the update (and optional refresh) completes.
   */
  async updateRecordGrouping(recordId, sourceColumnKey, targetColumnKey) {
    return updateRecordGroupingInteractions(this, {
      recordId,
      sourceColumnKey,
      targetColumnKey,
      blankKey: BLANK_KEY
    });
  }

  parseFieldList(raw) {
    return parseFieldListField(this, raw);
  }

  qualifyFieldName(fieldName) {
    return qualifyFieldNameField(this, fieldName);
  }

  getDefaultDisplayField() {
    return getDefaultDisplayFieldField(this);
  }

  get defaultDisplayField() {
    return this.getDefaultDisplayField();
  }

  extractFieldData(record, field) {
    return extractFieldDataField(this, record, field);
  }

  extractFieldValue(record, field) {
    return extractFieldValueField(this, record, field);
  }

  lookupFieldData(record, field) {
    return lookupFieldDataField(this, record, field);
  }

  extractSimpleFieldName(field) {
    return extractSimpleFieldNameField(field);
  }

  buildFieldCandidateList(field) {
    return buildFieldCandidateListField(this, field);
  }

  normalizeFieldPath(field) {
    return normalizeFieldPathField(this, field);
  }

  stripObjectPrefix(field) {
    return stripObjectPrefixField(this, field);
  }

  getParentLabelById(recordId) {
    return getParentLabelByIdField(this, recordId);
  }

  expandRelationshipPath(field) {
    return expandRelationshipPathField(field);
  }

  getFieldDisplay(record, field) {
    return getFieldDisplayField(this, record, field);
  }

  getRecordOwnerId(record) {
    return getRecordOwnerIdField(this, record);
  }

  getRecordOwnerLabel(record) {
    return getRecordOwnerLabelField(this, record);
  }

  getRecordParentLabel(record) {
    return getRecordParentLabelField(this, record);
  }

  coerceIconName(value) {
    return coerceIconNameField(value);
  }

  resolveEmoji(value) {
    return resolveEmojiField(value);
  }

  resolveColumnContext(groupingField, cardFields) {
    const defaultTitleField = this.defaultDisplayField;
    const resolvedCardFields = Array.isArray(cardFields) ? cardFields : [];
    const fallbackSortField = resolvedCardFields[0] || defaultTitleField;
    return {
      groupingField,
      cardFields: resolvedCardFields,
      defaultTitleField,
      blankGroupLabel: this.blankGroupLabel,
      blankKey: BLANK_KEY,
      metadataColumns: this.getMetadataColumns(),
      isGroupingFieldOptional: this.isGroupingFieldOptional,
      sortField: this.getEffectiveSortField(fallbackSortField),
      fallbackSortField,
      sortDirection: this.sortDirection,
      cardFieldIcons: this.cardFieldIconsList,
      dateTimeFormat: this.effectiveDateTimeFormat,
      patternTokenCache: this.patternTokenCache,
      summaryDefinitions: this.summaryDefinitions,
      shouldDisplayParentReferenceOnCards:
        this.shouldDisplayParentReferenceOnCards,
      parentBadgeLabel: this.parentBadgeLabel
    };
  }

  buildColumnCallbacks() {
    const currencyFieldApiName = this.qualifyFieldName("CurrencyIsoCode");
    return {
      isRecordIncluded: (record) => this.isRecordIncluded(record),
      extractFieldData: (record, field) => this.extractFieldData(record, field),
      extractFieldValue: (record, field) =>
        this.extractFieldValue(record, field),
      extractSimpleFieldName: (field) => this.extractSimpleFieldName(field),
      getFieldLabel: (field) => this.getFieldLabel(field),
      parseIconEntry: (value) => this.parseIconEntry(value),
      getRecordParentLabel: (record) => this.getRecordParentLabel(record),
      sanitizeFieldOutput: (value) => sanitizeFieldOutput(value),
      getFieldMetadata: (field) => this.getFieldMetadata(field),
      getUiPicklistValues: (field) => this.getUiPicklistValues(field),
      coerceSummaryValue: (record, summary) =>
        coerceSummaryValueUtil(record, summary, (row, field) =>
          this.extractFieldData(row, field)
        ),
      formatSummaryValue: (summary, value, options = {}) =>
        formatSummaryValueUtil(summary, value, options),
      getSummaryCurrencyCode: (record) =>
        resolveCurrencyCodeUtil(
          record,
          (row, field) => this.extractFieldData(row, field),
          currencyFieldApiName,
          CURRENCY
        ),
      logDebug: (message, detail) => this.logDebug(message, detail),
      logWarn: (message, detail) => this.logWarn(message, detail)
    };
  }

  buildColumnOptions(records, context, callbacks) {
    return {
      ...context,
      ...callbacks
    };
  }

  getEffectiveSortField(defaultField) {
    return getEffectiveSortFieldField(this, defaultField);
  }

  getFieldMetadata(field) {
    return getFieldMetadataField(this, field);
  }

  getRelationshipLabel(relationshipName) {
    return getRelationshipLabelField(this, relationshipName);
  }

  getMetadataColumns() {
    return getMetadataColumnsField(this);
  }

  getFieldLabel(field) {
    return getFieldLabelField(this, field);
  }

  formatFieldDisplayValue(field, rawValue, displayValue) {
    return formatFieldDisplayValueField(this, field, rawValue, displayValue);
  }

  logDebug(message, detail) {
    return logDebugLogger(this, message, detail);
  }

  logInfo(message, detail) {
    return logInfoLogger(this, message, detail);
  }

  logWarn(message, detail) {
    return logWarnLogger(this, message, detail);
  }

  logError(message, detail) {
    return logErrorLogger(this, message, detail);
  }

  showErrorToast(error, options = {}) {
    return showErrorToastLogger(this, error, options);
  }

  showToast(options = {}) {
    return showToastLogger(this, options);
  }

  formatError(error) {
    return formatErrorLogger(this, error);
  }

  get showEmptyState() {
    return (
      !this.errorMessage &&
      !this.isLoading &&
      (!this.columns || this.columns.length === 0)
    );
  }
}
