import { createElement } from "lwc";
import KanbanColumn from "c/lresKanbanColumn";
import {
  createDataTransfer,
  flushPromises
} from "../../lresTestUtils/lresTestUtils";

describe("c-lres-kanban-column", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-column", {
      is: KanbanColumn
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("applies drop target styling when active", () => {
    const element = buildComponent({
      column: { key: "A", label: "A", count: 1, records: [] },
      activeDropKey: "A"
    });
    const section = element.shadowRoot.querySelector("section");
    expect(section.className).toContain("is-drop-target");
  });

  it("emits drag over/enter/leave events with column key", () => {
    const element = buildComponent({
      column: { key: "A", label: "A", count: 1, records: [] }
    });
    const overHandler = jest.fn();
    const enterHandler = jest.fn();
    const leaveHandler = jest.fn();
    element.addEventListener("columndragover", overHandler);
    element.addEventListener("columndragenter", enterHandler);
    element.addEventListener("columndragleave", leaveHandler);

    const section = element.shadowRoot.querySelector("section");
    section.dispatchEvent(new CustomEvent("dragover", { bubbles: true }));
    section.dispatchEvent(new CustomEvent("dragenter", { bubbles: true }));
    section.dispatchEvent(
      new CustomEvent("dragleave", {
        bubbles: true,
        relatedTarget: null
      })
    );

    expect(overHandler).toHaveBeenCalled();
    expect(enterHandler).toHaveBeenCalled();
    expect(leaveHandler).toHaveBeenCalled();
  });

  it("parses drop payload and emits columndrop with record id and keys", () => {
    const element = buildComponent({
      column: { key: "Target", label: "Target", count: 0, records: [] }
    });
    const dropHandler = jest.fn();
    element.addEventListener("columndrop", dropHandler);

    const dataTransfer = createDataTransfer();
    dataTransfer.getData = jest.fn(() =>
      JSON.stringify({ recordId: "1", columnKey: "Source" })
    );
    const dropEvent = new CustomEvent("drop", {
      bubbles: true,
      cancelable: true
    });
    dropEvent.dataTransfer = dataTransfer;
    element.shadowRoot.querySelector("section").dispatchEvent(dropEvent);

    expect(dropHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          recordId: "1",
          sourceColumnKey: "Source",
          targetColumnKey: "Target"
        }
      })
    );
  });

  describe("Template Rendering", () => {
    it("renders column label and count correctly", () => {
      const element = buildComponent({
        column: { key: "A", label: "Open Opportunities", count: 5, records: [] }
      });

      const titleElement = element.shadowRoot.querySelector(
        ".kanban-column_title"
      );
      const countElement = element.shadowRoot.querySelector(
        ".kanban-column_count"
      );

      expect(titleElement.textContent).toBe("Open Opportunities");
      expect(countElement.textContent).toBe("5");
    });

    it("renders correct number of kanban cards", () => {
      const records = [
        { id: "1", title: "Card 1", details: [] },
        { id: "2", title: "Card 2", details: [] },
        { id: "3", title: "Card 3", details: [] }
      ];
      const element = buildComponent({
        column: { key: "A", label: "A", count: 3, records }
      });

      const cardElements =
        element.shadowRoot.querySelectorAll("c-lres-kanban-card");
      expect(cardElements).toHaveLength(3);
    });

    it("renders column summaries below the header row", () => {
      const element = buildComponent({
        column: {
          key: "A",
          label: "Open",
          count: 2,
          records: [],
          summaries: [
            { key: "Amount|SUM|Total", label: "Total", value: "30" },
            { key: "Amount|AVG|Average", label: "Average", value: "15" }
          ]
        }
      });

      const summaryRows = element.shadowRoot.querySelectorAll(
        ".kanban-column_summary-row"
      );
      expect(summaryRows).toHaveLength(2);
      expect(
        summaryRows[0].querySelector(".kanban-column_summary-label").textContent
      ).toBe("Total");
      expect(
        summaryRows[0].querySelector(".kanban-column_summary-value").textContent
      ).toBe("30");
      expect(
        summaryRows[1].querySelector(".kanban-column_summary-label").textContent
      ).toBe("Average");
    });

    it("sets data attributes on section", () => {
      const element = buildComponent({
        column: { key: "TestKey", label: "Test", count: 1, records: [] }
      });

      const section = element.shadowRoot.querySelector("section");
      expect(section.getAttribute("data-column-key")).toBe("TestKey");
    });

    it("applies custom styles when provided", () => {
      const element = buildComponent({
        column: { key: "A", label: "A", count: 1, records: [] },
        columnSectionStyle: "background-color: red;",
        columnBodyStyle: "max-height: 300px;"
      });

      const section = element.shadowRoot.querySelector("section");
      const body = element.shadowRoot.querySelector(".kanban-column_body");

      expect(section.getAttribute("style")).toBe("background-color: red;");
      expect(body.getAttribute("style")).toBe("max-height: 300px;");
    });
  });

  describe("Computed Properties and CSS Classes", () => {
    it("does not apply drop target styling when not active", () => {
      const element = buildComponent({
        column: { key: "A", label: "A", count: 1, records: [] },
        activeDropKey: "B"
      });

      const section = element.shadowRoot.querySelector("section");
      expect(section.className).not.toContain("is-drop-target");
    });

    it("returns correct body class", () => {
      const element = buildComponent({
        column: { key: "A", label: "A", count: 1, records: [] }
      });

      const body = element.shadowRoot.querySelector(".kanban-column_body");
      expect(body.className).toContain("kanban-column_body");
      expect(body.className).toContain("slds-scrollable_y");
    });
  });

  describe("Virtualization", () => {
    const originalGetBoundingClientRect =
      Element.prototype.getBoundingClientRect;
    const originalGetComputedStyle = window.getComputedStyle;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalWindowRequestAnimationFrame = window.requestAnimationFrame;

    afterEach(() => {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      window.getComputedStyle = originalGetComputedStyle;
      global.requestAnimationFrame = originalRequestAnimationFrame;
      window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    });

    it("renders the initial slice before measuring row height", async () => {
      const records = Array.from({ length: 15 }, (_, index) => ({
        id: String(index + 1),
        title: `Card ${index + 1}`,
        details: []
      }));
      const element = buildComponent({
        column: { key: "A", label: "A", count: 15, records },
        enableVirtualization: true
      });
      await flushPromises();

      const cardElements =
        element.shadowRoot.querySelectorAll("c-lres-kanban-card");
      expect(cardElements).toHaveLength(10);
    });

    it("updates the windowed slice on scroll after measuring height", async () => {
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        height: 20,
        width: 100,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }));
      window.getComputedStyle = jest.fn(() => ({
        rowGap: "12px",
        gap: "12px"
      }));
      const rafHandler = (callback) => {
        callback();
        return 1;
      };
      global.requestAnimationFrame = rafHandler;
      window.requestAnimationFrame = rafHandler;

      const records = Array.from({ length: 30 }, (_, index) => ({
        id: String(index + 1),
        title: `Card ${index + 1}`,
        details: []
      }));
      const element = buildComponent({
        column: { key: "A", label: "A", count: 30, records },
        enableVirtualization: true
      });
      await flushPromises();

      const body = element.shadowRoot.querySelector(".kanban-column_body");
      Object.defineProperty(body, "clientHeight", {
        value: 240,
        configurable: true
      });
      await flushPromises();

      const spacers = element.shadowRoot.querySelectorAll(
        ".kanban-column_spacer"
      );
      expect(spacers).toHaveLength(2);

      body.scrollTop = 320;
      element.column = { ...element.column, records };
      await flushPromises();

      const cardElements =
        element.shadowRoot.querySelectorAll("c-lres-kanban-card");
      expect(cardElements[0].card.id).toBe("6");
    });
  });

  describe("Negative Path Testing", () => {
    it("handles drop with invalid JSON payload", () => {
      const element = buildComponent({
        column: { key: "Target", label: "Target", count: 0, records: [] }
      });

      const dropHandler = jest.fn();
      element.addEventListener("columndrop", dropHandler);

      const dataTransfer = createDataTransfer();
      dataTransfer.getData = jest.fn(() => "invalid JSON");
      const dropEvent = new CustomEvent("drop", {
        bubbles: true,
        cancelable: true
      });
      dropEvent.dataTransfer = dataTransfer;
      element.shadowRoot.querySelector("section").dispatchEvent(dropEvent);

      expect(dropHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            recordId: "invalid JSON",
            sourceColumnKey: undefined,
            targetColumnKey: "Target"
          }
        })
      );
    });

    it("handles drip without column", () => {
      const element = buildComponent({
        // missing column
      });

      const dropHandler = jest.fn();
      element.addEventListener("columndrop", dropHandler);

      const dataTransfer = createDataTransfer();
      dataTransfer.getData = jest.fn(() =>
        JSON.stringify({ recordId: "1", columnKey: "Source" })
      );
      const dropEvent = new CustomEvent("drop", {
        bubbles: true,
        cancelable: true
      });
      dropEvent.dataTransfer = dataTransfer;

      // This should not crash
      element.shadowRoot.querySelector("section").dispatchEvent(dropEvent);
      expect(dropHandler).toHaveBeenCalled();
    });

    it("handles drag leave with related target inside container", () => {
      const element = buildComponent({
        column: { key: "A", label: "A", count: 1, records: [] }
      });

      const leaveHandler = jest.fn();
      element.addEventListener("columndragleave", leaveHandler);

      const section = element.shadowRoot.querySelector("section");
      const leaveEvent = new CustomEvent("dragleave", { bubbles: true });
      Object.defineProperty(leaveEvent, "relatedTarget", {
        value: section
      });
      section.dispatchEvent(leaveEvent);

      // Should not emit since relatedTarget is inside
      expect(leaveHandler).not.toHaveBeenCalled();
    });
  });
});
