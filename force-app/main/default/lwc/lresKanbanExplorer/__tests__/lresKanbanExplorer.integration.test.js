import { createElement } from "lwc";
import KanbanExplorer from "c/lresKanbanExplorer";
import fetchRelatedCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchRelatedCardRecords";
import fetchParentlessCardRecords from "@salesforce/apex/LRES_KanbanCardRecordsController.fetchParentlessCardRecords";
import { updateRecord } from "lightning/uiRecordApi";
import {
  getObjectInfo,
  getPicklistValuesByRecordType
} from "lightning/uiObjectInfoApi";
import {
  flushPromises,
  settleComponent,
  buildWireRecordsFromRaw
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

describe("c-lres-kanban-explorer integration", () => {
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
    element.debugLogging = false;
    element.cardObjectApiName = "Opportunity";
    element.groupingFieldApiName = "Status__c";
    element.cardFieldApiNames = "Name,Stage__c";
    element.childRelationshipName = "Opportunities";
    element.searchFieldApiNames = "Name";
    document.body.appendChild(element);
    return element;
  };

  const emitMetadata = () => {
    getObjectInfo.emit({
      apiName: "Opportunity",
      defaultRecordTypeId: "012000000000000AAA",
      fields: {
        Status__c: { label: "Status", dataType: "Picklist" },
        Name: { label: "Name", dataType: "String" },
        Stage__c: { label: "Stage", dataType: "String" }
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

  const baseRecords = buildWireRecordsFromRaw(
    [
      {
        id: "001",
        fields: {
          Id: "001",
          Status__c: "Open",
          Name: "Deal 1",
          Stage__c: "Prospecting"
        }
      },
      {
        id: "002",
        fields: {
          Id: "002",
          Status__c: "Closed",
          Name: "Deal 2",
          Stage__c: "Closed Won"
        }
      }
    ],
    "Opportunity"
  );

  const movedRecords = buildWireRecordsFromRaw(
    [
      {
        id: "001",
        fields: {
          Id: "001",
          Status__c: "Closed",
          Name: "Deal 1",
          Stage__c: "Prospecting"
        }
      },
      {
        id: "002",
        fields: {
          Id: "002",
          Status__c: "Closed",
          Name: "Deal 2",
          Stage__c: "Closed Won"
        }
      }
    ],
    "Opportunity"
  );

  it("supports end-to-end drag and drop workflow with state sync", async () => {
    fetchRelatedCardRecords.mockResolvedValue(baseRecords);
    const element = buildComponent();
    element.recordId = "001";
    emitMetadata();
    await settleComponent(5);

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(
      container.columns.find((col) => col.key === "Open").records
    ).toHaveLength(1);

    updateRecord.mockResolvedValue({});
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
    expect(fetchRelatedCardRecords).toHaveBeenCalledTimes(2);
  });

  it("loads records automatically in parentless mode", async () => {
    fetchParentlessCardRecords.mockResolvedValue([
      {
        id: "010",
        fields: {
          "Opportunity.Id": { value: "010" },
          "Opportunity.Status__c": { value: "Open" },
          "Opportunity.Name": { value: "Parentless Deal" }
        }
      }
    ]);
    const element = buildComponent();
    emitMetadata();
    await settleComponent(2);

    expect(fetchParentlessCardRecords).toHaveBeenCalled();
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    const openColumn = container.columns.find((col) => col.key === "Open");
    expect(openColumn.records).toHaveLength(1);
  });

  it("loads records in parentless mode without childRelationshipName", async () => {
    fetchParentlessCardRecords.mockResolvedValue([
      {
        id: "020",
        fields: {
          "Opportunity.Id": { value: "020" },
          "Opportunity.Status__c": { value: "Open" },
          "Opportunity.Name": { value: "Parentless Deal 2" }
        }
      }
    ]);
    const element = createElement("c-lres-kanban-explorer", {
      is: KanbanExplorer
    });
    element.debugLogging = false;
    element.cardObjectApiName = "Opportunity";
    element.groupingFieldApiName = "Status__c";
    element.cardFieldApiNames = "Name,Stage__c";
    element.searchFieldApiNames = "Name";
    document.body.appendChild(element);

    emitMetadata();
    await settleComponent(2);

    expect(fetchParentlessCardRecords).toHaveBeenCalled();
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    const openColumn = container.columns.find((col) => col.key === "Open");
    expect(openColumn.records).toHaveLength(1);
  });

  it("propagates debug logging to the parent selector", async () => {
    fetchRelatedCardRecords.mockResolvedValue(baseRecords);
    const element = buildComponent();
    element.debugLogging = true;
    element.parentObjectApiName = "Account";
    emitMetadata();
    await settleComponent(2);

    const parentSelector = element.shadowRoot.querySelector(
      "c-lres-kanban-parent-selector"
    );
    expect(parentSelector).not.toBeNull();
    expect(parentSelector.debugLogging).toBe(true);
  });

  it("updates when parent selection changes and applies new Apex data", async () => {
    const updatedRecords = buildWireRecordsFromRaw(
      [
        {
          id: "003",
          fields: {
            Id: "003",
            Status__c: "Closed",
            Name: "Deal 3",
            Stage__c: "Closed Won"
          }
        }
      ],
      "Opportunity"
    );
    fetchRelatedCardRecords.mockResolvedValueOnce(updatedRecords);

    const element = buildComponent();
    element.parentObjectApiName = "Account";
    emitMetadata();
    await settleComponent(2);

    const parentSelector = element.shadowRoot.querySelector(
      "c-lres-kanban-parent-selector"
    );
    expect(parentSelector).not.toBeNull();
    const beforeCalls = fetchRelatedCardRecords.mock.calls.length;
    jest.useFakeTimers();
    parentSelector.dispatchEvent(
      new CustomEvent("parentselectionchange", {
        detail: { values: ["parent1"] },
        bubbles: true,
        composed: true
      })
    );
    jest.advanceTimersByTime(250);
    jest.useRealTimers();
    await settleComponent(2);

    expect(fetchRelatedCardRecords.mock.calls.length).toBeGreaterThan(
      beforeCalls
    );
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(
      container.columns.find((col) => col.key === "Closed").records
    ).toHaveLength(1);
  });

  it("supports multi-parent selection with debounced Apex refresh", async () => {
    const multiRecords = buildWireRecordsFromRaw(
      [
        {
          id: "010",
          fields: {
            Id: "010",
            Status__c: "Open",
            Name: "Multi Deal",
            Stage__c: "Prospecting"
          }
        }
      ],
      "Opportunity"
    );
    fetchRelatedCardRecords.mockResolvedValueOnce(multiRecords);

    const element = buildComponent();
    element.defaultToMultipleParentSelection = true;
    element.parentObjectApiName = "Account";
    emitMetadata();
    await settleComponent(3);

    const parentSelector = element.shadowRoot.querySelector(
      "c-lres-kanban-parent-selector"
    );
    expect(parentSelector).not.toBeNull();
    const beforeCalls = fetchRelatedCardRecords.mock.calls.length;
    jest.useFakeTimers();
    parentSelector.dispatchEvent(
      new CustomEvent("parentselectionchange", {
        detail: { values: ["p1", "p2"] },
        bubbles: true,
        composed: true
      })
    );
    jest.advanceTimersByTime(250);
    jest.useRealTimers();
    await settleComponent(2);

    expect(fetchRelatedCardRecords.mock.calls.length).toBeGreaterThan(
      beforeCalls
    );
    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(
      container.columns.find((col) => col.key === "Open").records
    ).toHaveLength(1);
  });

  it("moves a card into the target column after drag and refresh", async () => {
    fetchRelatedCardRecords
      .mockResolvedValueOnce(baseRecords)
      .mockResolvedValueOnce(movedRecords);
    const element = buildComponent();
    element.recordId = "001";
    emitMetadata();
    await settleComponent(4);

    const container = element.shadowRoot.querySelector(
      "c-lres-kanban-board-container"
    );
    expect(
      container.columns.find((col) => col.key === "Open").records
    ).toHaveLength(1);
    expect(
      container.columns.find((col) => col.key === "Closed").records
    ).toHaveLength(1);

    let resolveUpdate;
    updateRecord.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
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

    const openColumn = container.columns.find((col) => col.key === "Open");
    const closedColumn = container.columns.find((col) => col.key === "Closed");
    expect(openColumn.records).toHaveLength(0);
    expect(closedColumn.records).toHaveLength(2);
    expect(closedColumn.count).toBe(1);
    const movedCard = closedColumn.records[closedColumn.records.length - 1];
    expect(movedCard.id).toBe("001");
    expect(movedCard.isSaving).toBe(true);

    resolveUpdate({});
    await flushPromises();

    expect(updateRecord).toHaveBeenCalledWith({
      fields: { Id: "001", Status__c: "Closed" }
    });
    expect(fetchRelatedCardRecords).toHaveBeenCalledTimes(2);
  });
});
