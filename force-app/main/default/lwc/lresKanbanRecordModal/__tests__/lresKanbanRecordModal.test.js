import { createElement } from "lwc";
import KanbanRecordModal from "c/lresKanbanRecordModal";

describe("c-lres-kanban-record-modal", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-record-modal", {
      is: KanbanRecordModal
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("renders close control and keeps modal open on error", async () => {
    const element = buildComponent({
      recordId: "001",
      objectApiName: "Opportunity"
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const form = element.shadowRoot.querySelector("lightning-record-form");
    form.dispatchEvent(
      new CustomEvent("error", {
        detail: { message: "Save failed" },
        bubbles: true,
        cancelable: true
      })
    );

    await Promise.resolve();
    const errorBlock = element.shadowRoot.querySelector(
      ".slds-text-color_error"
    );
    expect(errorBlock).toBeTruthy();
    expect(errorBlock.textContent).toContain("Save failed");
  });
});
