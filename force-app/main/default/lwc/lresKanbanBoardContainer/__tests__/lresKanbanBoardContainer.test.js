import { createElement } from "lwc";
import KanbanBoardContainer from "c/lresKanbanBoardContainer";
import { flushPromises } from "../../lresTestUtils/lresTestUtils";

const sampleColumns = [
  {
    key: "col1",
    label: "Column 1",
    count: 0,
    records: []
  }
];

describe("c-lres-kanban-board-container", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-board-container", {
      is: KanbanBoardContainer
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("shows loading and empty state when appropriate", async () => {
    const element = buildComponent();
    element.isLoading = true;
    element.showEmptyState = true;
    await flushPromises();
    const spinnerWrapper = element.shadowRoot.querySelector(".spinner-wrapper");
    expect(spinnerWrapper).toBeTruthy();

    const empty = element.shadowRoot.querySelector(".slds-text-body_regular");
    expect(empty.textContent).toContain("No related records");
  });

  it("re-dispatches column drop events when valid", async () => {
    const element = buildComponent();
    element.columns = sampleColumns;
    await flushPromises();
    const handler = jest.fn();
    element.addEventListener("columndrop", handler);

    const column = element.shadowRoot.querySelector("c-lres-kanban-column");
    expect(column).not.toBeNull();
    column?.dispatchEvent(
      new CustomEvent("columndrop", {
        detail: { recordId: "1", targetColumnKey: "col1" },
        bubbles: true,
        composed: true
      })
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { recordId: "1", targetColumnKey: "col1" }
      })
    );
  });

  it("renders warning message when provided", async () => {
    const element = buildComponent();
    element.warningMessage = "Summary config warning";
    await flushPromises();

    const warning = element.shadowRoot.querySelector(
      ".slds-text-color_warning"
    );
    expect(warning).toBeTruthy();
    expect(warning.textContent).toContain("Summary config warning");
  });

  it("throttles dragover updates and applies trailing column change", async () => {
    jest.useFakeTimers();
    let now = 0;
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    const element = buildComponent();
    element.columns = [
      { key: "col1", label: "Column 1", count: 0, records: [] },
      { key: "col2", label: "Column 2", count: 0, records: [] }
    ];
    const flush = flushPromises();
    jest.runOnlyPendingTimers();
    await flush;

    const columns = element.shadowRoot.querySelectorAll("c-lres-kanban-column");
    columns[0].dispatchEvent(
      new CustomEvent("columndragover", {
        detail: { columnKey: "col1" },
        bubbles: true,
        composed: true
      })
    );
    const flushAfterFirst = flushPromises();
    jest.runOnlyPendingTimers();
    await flushAfterFirst;
    expect(columns[0].activeDropKey).toBe("col1");

    now = 10;
    columns[1].dispatchEvent(
      new CustomEvent("columndragover", {
        detail: { columnKey: "col2" },
        bubbles: true,
        composed: true
      })
    );
    await Promise.resolve();
    expect(columns[0].activeDropKey).toBe("col1");

    now = 60;
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    expect(columns[0].activeDropKey).toBe("col2");

    nowSpy.mockRestore();
    jest.useRealTimers();
  });
});
