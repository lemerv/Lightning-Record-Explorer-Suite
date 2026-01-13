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
});
