import { createElement } from "lwc";
import KanbanExplorer from "c/lresKanbanExplorer";
import fetchRelatedCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchRelatedCardRecords";
import fetchParentlessCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchParentlessCardRecords";
import { updateRecord } from "lightning/uiRecordApi";
import { buildFilterDefinitions as buildFilterDefinitionsInteractions } from "../boardInteractions";
import {
  handleSearchInput as handleSearchInputInteractions,
  handleSortDirectionToggle as handleSortDirectionToggleInteractions,
  handleFilterOptionToggle as handleFilterOptionToggleInteractions
} from "../boardInteractions";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import {
  flushPromises,
  settleComponent,
  buildWireRecord
} from "../../lresTestUtils/lresTestUtils";

jest.mock(
  "@salesforce/apex/LRES_KanbanCardRecordsController.fetchRelatedCardRecords",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/LRES_KanbanCardRecordsController.fetchParentlessCardRecords",
  () => ({
    default: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "lightning/uiRecordApi",
  () => ({
    updateRecord: jest.fn()
  }),
  { virtual: true }
);

jest.mock("lightning/uiObjectInfoApi", () => {
  const { createLdsTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
  return {
    getObjectInfo: createLdsTestWireAdapter(),
    getPicklistValuesByRecordType: createLdsTestWireAdapter()
  };
});

jest.mock("c/lresKanbanRecordModal", () => ({
  __esModule: true,
  default: {
    open: jest.fn()
  }
}));

describe("c-lres-kanban-explorer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    fetchRelatedCardRecords.mockReset();
    fetchParentlessCardRecords.mockReset();
    updateRecord.mockReset();
  });

  const buildComponent = () => {
    const element = createElement("c-lres-kanban-explorer", {
      is: KanbanExplorer
    });
    element.logDebug = jest.fn();
    element.debugLogging = false;
    element.cardObjectApiName = "Opportunity";
    element.groupingFieldApiName = "Status__c";
    element.cardFieldApiNames = "Name";
    element.searchFieldApiNames = "Name";
    element.filterFieldApiNames = "Status__c";
    element.childRelationshipName = "Opportunities";
    element.recordId = "001";
    document.body.appendChild(element);
    return element;
  };

  const buildParentlessComponent = () => {
    const element = createElement("c-lres-kanban-explorer", {
      is: KanbanExplorer
    });
    element.debugLogging = false;
    element.cardObjectApiName = "Opportunity";
    element.groupingFieldApiName = "Status__c";
    element.cardFieldApiNames = "Name";
    element.searchFieldApiNames = "Name";
    element.filterFieldApiNames = "Status__c";
    element.childRelationshipName = "Opportunities";
    element.parentObjectApiName = "";
    document.body.appendChild(element);
    return element;
  };

  const baseApexRecords = [
    buildWireRecord({
      id: "001",
      fields: {
        "Opportunity.Id": { value: "001" },
        "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
        "Opportunity.Name": { value: "First Deal", displayValue: "First Deal" }
      }
    }),
    buildWireRecord({
      id: "002",
      fields: {
        "Opportunity.Id": { value: "002" },
        "Opportunity.Status__c": { value: "Closed", displayValue: "Closed" },
        "Opportunity.Name": {
          value: "Second Deal",
          displayValue: "Second Deal"
        }
      }
    })
  ];

  const emitMetadata = () => {
    getObjectInfo.emit({
      apiName: "Opportunity",
      defaultRecordTypeId: "012000000000000AAA",
      fields: {
        Status__c: { label: "Status", dataType: "Picklist", required: false },
        Name: { label: "Name", dataType: "String" },
        Amount: { label: "Amount", dataType: "Currency", scale: 2 },
        CurrencyIsoCode: { label: "Currency", dataType: "String" },
        AccountId: {
          label: "Account Name",
          dataType: "Reference",
          relationshipName: "Account",
          referenceToInfos: [{ apiName: "Account", label: "Account" }]
        },
        CreatedById: {
          label: "Created By ID",
          dataType: "Reference",
          relationshipName: "CreatedBy",
          referenceToInfos: [{ apiName: "User", label: "User" }]
        }
      }
    });
    getPicklistValuesByRecordType.emit({
      picklistFieldValues: {
        Status__c: {
          values: [
            { value: "Open", label: "Open" },
            { value: "Closed", label: "Closed" }
          ]
        }
      }
    });
  };

  it("includes summary fields in data fetch list and surfaces warnings", async () => {
    const element = buildComponent();
    emitMetadata();
    await settleComponent(2);

    element.columnSummariesDefinition = "[Amount|SUM|Total];[BadField|SUM|Bad]";
    await flushPromises();
    element.cardObjectApiName = "Opportunity";
    element.groupingFieldApiName = "Status__c";
    element.refreshSummaryDefinitions();
    element._dataModeCache = {
      type: "parent",
      ready: true,
      reason: null,
      parentIds: ["001"]
    };
    fetchRelatedCardRecords.mockClear();
    fetchRelatedCardRecords.mockResolvedValue([]);
    await element.refresh();

    expect(fetchRelatedCardRecords).toHaveBeenCalled();
    const callArgs = fetchRelatedCardRecords.mock.calls[0][0];
    expect(callArgs.fieldApiNames).toEqual(
      expect.arrayContaining([
        "Opportunity.Amount",
        "Opportunity.CurrencyIsoCode"
      ])
    );

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(container.warningMessage).toContain("BadField");
  });

  it("surfaces mixed currency warnings in the board container", async () => {
    const records = [
      buildWireRecord({
        id: "001",
        fields: {
          "Opportunity.Id": { value: "001" },
          "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
          "Opportunity.Name": { value: "Deal A", displayValue: "Deal A" },
          "Opportunity.Amount": { value: 10, displayValue: "10" },
          "Opportunity.CurrencyIsoCode": { value: "USD", displayValue: "USD" }
        }
      }),
      buildWireRecord({
        id: "002",
        fields: {
          "Opportunity.Id": { value: "002" },
          "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
          "Opportunity.Name": { value: "Deal B", displayValue: "Deal B" },
          "Opportunity.Amount": { value: 20, displayValue: "20" },
          "Opportunity.CurrencyIsoCode": { value: "EUR", displayValue: "EUR" }
        }
      })
    ];
    fetchRelatedCardRecords.mockResolvedValue(records);

    const element = buildComponent();
    element.columnSummariesDefinition = "[Amount|SUM|Total]";
    let rafCallback;
    const originalRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = (callback) => {
      rafCallback = callback;
      return 1;
    };
    emitMetadata();
    await settleComponent(4);

    if (typeof rafCallback === "function") {
      rafCallback();
      await flushPromises();
    }

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(container.warningMessage).toContain("multiple currencies");
    const openColumn = container.columns.find((col) => col.key === "Open");
    expect(openColumn.summaries[0].value).toBe("Mixed currencies");
    global.requestAnimationFrame = originalRaf;
  });

  it("builds columns from Apex data and filters by search input", async () => {
    fetchRelatedCardRecords.mockResolvedValue(baseApexRecords);
    const element = buildComponent();
    emitMetadata();
    await settleComponent(4);

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(container.columns.length).toBeGreaterThanOrEqual(2);
    const openColumn = container.columns.find((col) => col.key === "Open");
    expect(openColumn.records).toHaveLength(1);

    const actions = element.shadowRoot.querySelector(
      "c-lres-kanban-board-actions"
    );
    actions.dispatchEvent(
      new CustomEvent("searchinput", {
        detail: { value: "First" },
        bubbles: true,
        composed: true
      })
    );
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    await new Promise((resolve) => setTimeout(resolve, 220));
    await flushPromises();
    const filteredOpen = container.columns.find((col) => col.key === "Open");
    expect(filteredOpen.records).toHaveLength(1);
    const closedColumn = container.columns.find((col) => col.key === "Closed");
    expect(closedColumn.records).toHaveLength(0);
  });

  it("debounces search input with trailing-only updates", () => {
    jest.useFakeTimers();
    const component = {
      searchValue: "",
      logDebug: jest.fn(),
      scheduleRebuildColumnsWithPicklist: jest.fn()
    };

    handleSearchInputInteractions(component, { detail: { value: "first" } });

    expect(component.searchValue).toBe("");
    expect(component.scheduleRebuildColumnsWithPicklist).not.toHaveBeenCalled();

    handleSearchInputInteractions(component, { detail: { value: "second" } });
    expect(component.scheduleRebuildColumnsWithPicklist).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(component.searchValue).toBe("second");
    expect(component.scheduleRebuildColumnsWithPicklist).toHaveBeenCalledTimes(
      1
    );
    jest.useRealTimers();
  });

  it("schedules a rebuild when sort direction toggles", () => {
    const component = {
      sortDirection: "asc",
      logDebug: jest.fn(),
      scheduleUserRebuildColumnsWithPicklist: jest.fn()
    };

    handleSortDirectionToggleInteractions(component);

    expect(component.sortDirection).toBe("desc");
    expect(
      component.scheduleUserRebuildColumnsWithPicklist
    ).toHaveBeenCalledTimes(1);
  });

  it("schedules a rebuild when a filter option toggles", () => {
    const component = {
      logDebug: jest.fn(),
      filterDefinitions: [
        {
          id: "Status__c",
          selectedValues: [],
          options: [{ value: "Open", selected: false }]
        }
      ],
      scheduleUserRebuildColumnsWithPicklist: jest.fn()
    };

    handleFilterOptionToggleInteractions(component, {
      detail: { filterId: "Status__c", value: "Open", checked: true }
    });

    expect(component.filterDefinitions[0].selectedValues).toEqual(["Open"]);
    expect(
      component.scheduleUserRebuildColumnsWithPicklist
    ).toHaveBeenCalledTimes(1);
  });

  it("shows inline error when parent object is set without child relationship", async () => {
    const element = createElement("c-lres-kanban-explorer", {
      is: KanbanExplorer
    });
    element.debugLogging = false;
    element.cardObjectApiName = "Account";
    element.groupingFieldApiName = "Status__c";
    element.parentObjectApiName = "Account";
    document.body.appendChild(element);

    await flushPromises();

    expect(fetchRelatedCardRecords).not.toHaveBeenCalled();
    expect(fetchParentlessCardRecords).not.toHaveBeenCalled();
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(container.errorMessage).toBe(
      "Child Relationship Name is required when Parent Object API Name is set."
    );
  });

  it("auto-refreshes when parent object api name is blank", async () => {
    fetchParentlessCardRecords.mockResolvedValue([
      {
        id: "001",
        fields: {
          "Opportunity.Id": { value: "001" },
          "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
          "Opportunity.Name": {
            value: "Parentless Deal",
            displayValue: "Parentless Deal"
          }
        }
      }
    ]);
    const element = buildParentlessComponent();
    emitMetadata();

    await settleComponent(2);

    expect(fetchParentlessCardRecords).toHaveBeenCalled();
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    const openColumn = container.columns.find((col) => col.key === "Open");
    expect(openColumn.records).toHaveLength(1);
  });

  it("updates record grouping on drop and refreshes Apex data", async () => {
    fetchRelatedCardRecords.mockResolvedValue(baseApexRecords);
    const element = buildComponent();
    emitMetadata();
    await settleComponent(2);

    updateRecord.mockResolvedValue({});

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    container.dispatchEvent(
      new CustomEvent("columndrop", {
        detail: {
          recordId: "001",
          sourceColumnKey: "Open",
          targetColumnKey: "Closed"
        },
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    expect(updateRecord).toHaveBeenCalledWith({
      fields: { Id: "001", Status__c: "Closed" }
    });
    expect(fetchRelatedCardRecords.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("uses Apex refresh when card where clause is active", async () => {
    fetchRelatedCardRecords
      .mockResolvedValueOnce(baseApexRecords)
      .mockResolvedValueOnce([]);
    const element = buildComponent();
    element.cardRecordsWhereClause = "Name LIKE '%Deal%'";
    emitMetadata();
    await settleComponent(2);

    const beforeRefreshCalls = fetchRelatedCardRecords.mock.calls.length;
    await element.refresh();
    expect(fetchRelatedCardRecords.mock.calls.length).toBeGreaterThan(
      beforeRefreshCalls
    );
  });

  it("formats lookup relationship labels for card fields", async () => {
    const records = [
      buildWireRecord({
        id: "001",
        fields: {
          "Opportunity.Id": { value: "001" },
          "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
          "Opportunity.Name": {
            value: "First Deal",
            displayValue: "First Deal"
          },
          "Opportunity.Account.Name": { value: "Acme", displayValue: "Acme" },
          "Opportunity.CreatedBy.Username": {
            value: "creator",
            displayValue: "creator"
          }
        }
      })
    ];
    fetchRelatedCardRecords.mockResolvedValue(records);
    const element = buildComponent();
    element.cardFieldApiNames = "Name,Account.Name,CreatedBy.Username";
    emitMetadata();
    await settleComponent(4);

    const cardDetails = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    ).columns[0].records[0].details;
    const labels = cardDetails.map((detail) => detail.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Account → Name", "Created By → Username"])
    );
  });

  it("prefers validation errors and omits boilerplate text", () => {
    const element = buildComponent();
    element.logDebug = jest.fn();
    const error = {
      body: {
        message:
          "An error occurred while trying to update the record. Please try again.",
        output: {
          fieldErrors: {
            Status__c: [{ message: "Cannot change Status once Closed." }]
          },
          errors: [],
          pageErrors: []
        },
        statusText: "Bad Request"
      }
    };

    const formatted = KanbanExplorer.prototype.formatError.call(element, error);
    expect(formatted).toBe("Cannot change Status once Closed.");
  });

  it("joins multiple validation messages on new lines", () => {
    const element = buildComponent();
    element.logDebug = jest.fn();
    const error = {
      body: {
        output: {
          errors: [{ message: "First issue" }, { message: "Second issue" }]
        }
      },
      statusText: "Bad Request"
    };

    const formatted = KanbanExplorer.prototype.formatError.call(element, error);
    expect(formatted).toBe("First issue\nSecond issue");
  });

  it("clears filters and search input", async () => {
    const element = buildComponent();
    element.logInfo = jest.fn();
    element.closeFilterMenus = jest.fn();
    element.rebuildColumnsWithPicklist = jest.fn();

    // Set up search value directly
    element.searchValue = "Test Search";

    // Set up mock filter definitions manually
    element.filterDefinitions = [
      {
        id: "Status__c",
        field: "Status__c",
        label: "Status",
        selectedValues: ["Open", "Closed"],
        options: [
          { value: "Open", label: "Open", selected: true },
          { value: "Closed", label: "Closed", selected: true }
        ],
        isOpen: false,
        buttonClass: "filter-dropdown_button filter-dropdown_button--active"
      }
    ];

    // Call the clear filters method on the component instance
    KanbanExplorer.prototype.handleClearFilters.call(element);
    await flushPromises();

    // Verify search value is cleared
    expect(element.searchValue).toBe("");

    // Verify filter selections are cleared
    const clearedFilter = element.filterDefinitions[0];
    expect(clearedFilter.selectedValues).toEqual([]);
    expect(
      clearedFilter.options.every((option) => option.selected === false)
    ).toBe(true);
    expect(clearedFilter.buttonClass).toBe("filter-dropdown_button");
  });

  it("syncs filter UI state when filters are clean", () => {
    const component = {
      logDebug: jest.fn(),
      filtersDirty: false,
      isSortMenuOpen: false,
      activeFilterMenuId: "Missing",
      filterDefinitions: [
        {
          id: "Status__c",
          field: "Status__c",
          label: "Status",
          selectedValues: ["Open", "Stale"],
          options: [
            { value: "Open", label: "Open", selected: false },
            { value: "Closed", label: "Closed", selected: true }
          ],
          isOpen: true,
          buttonClass: "filter-dropdown_button"
        }
      ],
      unregisterMenuOutsideClick: jest.fn()
    };

    buildFilterDefinitionsInteractions(component, []);

    const syncedFilter = component.filterDefinitions[0];
    expect(component.activeFilterMenuId).toBeNull();
    expect(syncedFilter.isOpen).toBe(false);
    expect(syncedFilter.selectedValues).toEqual(["Open"]);
    expect(syncedFilter.options).toEqual([
      { value: "Open", label: "Open", selected: true },
      { value: "Closed", label: "Closed", selected: false }
    ]);
    expect(syncedFilter.buttonClass).toBe(
      "filter-dropdown_button filter-dropdown_button--active"
    );
    expect(component.unregisterMenuOutsideClick).toHaveBeenCalled();
  });

  it("defers summary calculations and fills placeholders after render", async () => {
    const records = [
      buildWireRecord({
        id: "001",
        fields: {
          "Opportunity.Id": { value: "001" },
          "Opportunity.Status__c": { value: "Open", displayValue: "Open" },
          "Opportunity.Name": {
            value: "First Deal",
            displayValue: "First Deal"
          },
          "Opportunity.Amount": { value: 100, displayValue: "100" },
          "Opportunity.CurrencyIsoCode": {
            value: "USD",
            displayValue: "USD"
          }
        }
      })
    ];
    fetchRelatedCardRecords.mockResolvedValue(records);

    const element = buildComponent();
    element.columnSummariesDefinition = "[Amount|SUM|Total]";
    let rafCallback;
    const originalRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = (callback) => {
      rafCallback = callback;
      return 1;
    };
    emitMetadata();
    await settleComponent(4);

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    const openColumn = container.columns.find((col) => col.key === "Open");
    const placeholder = openColumn.summaries[0];
    expect(placeholder.isLoading).toBe(true);

    if (typeof rafCallback === "function") {
      rafCallback();
      await flushPromises();
    }

    const updatedColumn = container.columns.find((col) => col.key === "Open");
    const summary = updatedColumn.summaries[0];
    expect(summary.isLoading).not.toBe(true);
    expect(summary.value).toContain("100");
    global.requestAnimationFrame = originalRaf;
  });
});
