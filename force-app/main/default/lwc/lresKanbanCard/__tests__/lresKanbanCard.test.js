import { createElement } from "lwc";
import KanbanCard from "c/lresKanbanCard";
import {
  createDataTransfer,
  flushPromises
} from "../../lresTestUtils/lresTestUtils";

describe("c-lres-kanban-card", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-card", {
      is: KanbanCard
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("dispatches drag start with payload and sets dataTransfer", async () => {
    const element = buildComponent({
      card: { id: "001", title: "Test", details: [] },
      columnKey: "col1"
    });
    const handler = jest.fn();
    element.addEventListener("carddragstart", handler);

    const dataTransfer = createDataTransfer();
    const dragEvent = new CustomEvent("dragstart", {
      bubbles: true,
      cancelable: true
    });
    dragEvent.dataTransfer = dataTransfer;
    element.shadowRoot.querySelector("article").dispatchEvent(dragEvent);
    await flushPromises();

    expect(dataTransfer.setData).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { recordId: "001", columnKey: "col1" }
      })
    );
  });

  it("prevents drag when disabled", () => {
    const element = buildComponent({
      card: { id: "001", title: "Test", details: [] },
      dragDisabled: true
    });
    const dragEvent = new CustomEvent("dragstart", {
      bubbles: true,
      cancelable: true
    });
    dragEvent.preventDefault = jest.fn();
    element.shadowRoot.querySelector("article").dispatchEvent(dragEvent);
    expect(dragEvent.preventDefault).toHaveBeenCalled();
  });

  it("shows saving state and blocks drag while saving", () => {
    const element = buildComponent({
      card: { id: "001", title: "Test", details: [], isSaving: true }
    });
    const article = element.shadowRoot.querySelector("article");
    expect(article.classList.contains("is-saving")).toBe(true);

    const dragEvent = new CustomEvent("dragstart", {
      bubbles: true,
      cancelable: true
    });
    dragEvent.preventDefault = jest.fn();
    article.dispatchEvent(dragEvent);
    expect(dragEvent.preventDefault).toHaveBeenCalled();
  });

  it("dispatches drag end and title click events", () => {
    const element = buildComponent({
      card: { id: "001", title: "Test", details: [] },
      columnKey: "col1"
    });
    const dragEndHandler = jest.fn();
    const titleHandler = jest.fn();
    element.addEventListener("carddragend", dragEndHandler);
    element.addEventListener("cardtitleclick", titleHandler);

    const dragEndEvent = new CustomEvent("dragend", { bubbles: true });
    element.shadowRoot.querySelector("article").dispatchEvent(dragEndEvent);

    const titleLink = element.shadowRoot.querySelector(
      ".kanban-card_title-link"
    );
    const clickEvent = new CustomEvent("click", {
      bubbles: true,
      cancelable: true
    });
    clickEvent.preventDefault = jest.fn();
    clickEvent.stopPropagation = jest.fn();
    titleLink.dispatchEvent(clickEvent);

    expect(dragEndHandler).toHaveBeenCalled();
    expect(titleHandler).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { recordId: "001" } })
    );
    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(clickEvent.stopPropagation).toHaveBeenCalled();
  });

  describe("Template Rendering", () => {
    it("renders card title correctly", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test Deal", details: [] }
      });

      const titleLink = element.shadowRoot.querySelector(
        ".kanban-card_title-link"
      );
      expect(titleLink.textContent).toBe("Test Deal");
    });

    it("renders card with icon when titleIcon is provided", () => {
      const element = buildComponent({
        card: {
          id: "001",
          title: "Test Deal",
          titleIcon: "standard:account",
          details: []
        }
      });

      const icon = element.shadowRoot.querySelector("lightning-icon");
      expect(icon).toBeTruthy();
      //            expect(icon.getAttribute('icon-name')).toBe('standard:account'); // Note: mock doesn't handle attributes
    });

    it("renders card with emoji when titleEmoji is provided", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test Deal", titleEmoji: "🚀", details: [] }
      });

      const emojiSpan = element.shadowRoot.querySelector(".kanban-field_emoji");
      expect(emojiSpan).toBeTruthy();
      expect(emojiSpan.textContent).toBe("🚀");
    });

    it("renders details section when card has details", () => {
      const details = [
        {
          apiName: "Amount",
          label: "Amount",
          value: "$1000",
          dataType: "currency"
        },
        {
          apiName: "Stage",
          label: "Stage",
          value: "Prospecting",
          dataType: "string"
        }
      ];
      const element = buildComponent({
        card: { id: "001", title: "Test Deal", details }
      });

      const detailsContainer = element.shadowRoot.querySelector(
        ".kanban-card_details"
      );
      expect(detailsContainer).toBeTruthy();

      const fieldComponents = detailsContainer.querySelectorAll(
        "c-lres-kanban-card-field"
      );
      expect(fieldComponents).toHaveLength(2);
    });

    it("does not render details section when details array is empty", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test Deal", details: [] }
      });

      const detailsContainer = element.shadowRoot.querySelector(
        ".kanban-card_details"
      );
      expect(detailsContainer).toBeNull();
    });

    it("renders a new-tab icon that does not trigger the modal click event", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test Deal", details: [] }
      });
      const titleHandler = jest.fn();
      element.addEventListener("cardtitleclick", titleHandler);

      const externalLink = element.shadowRoot.querySelector(
        ".kanban-card_external-link"
      );
      expect(externalLink).toBeTruthy();

      const clickEvent = new CustomEvent("click", {
        bubbles: true,
        cancelable: true
      });
      clickEvent.preventDefault = jest.fn();
      clickEvent.stopPropagation = jest.fn();
      externalLink.dispatchEvent(clickEvent);

      expect(clickEvent.stopPropagation).toHaveBeenCalled();
      expect(titleHandler).not.toHaveBeenCalled();
    });
  });

  describe("Computed Properties and CSS Classes", () => {
    it("adds and removes drag styling class on drag start/end", async () => {
      const element = buildComponent({
        card: { id: "001", title: "Test", details: [] },
        columnKey: "col1"
      });
      const article = element.shadowRoot.querySelector("article");
      const dataTransfer = createDataTransfer();
      const dragEvent = new CustomEvent("dragstart", {
        bubbles: true,
        cancelable: true
      });
      dragEvent.dataTransfer = dataTransfer;
      article.dispatchEvent(dragEvent);
      await flushPromises();
      expect(article.className).toContain("is-dragging");

      const dragEndEvent = new CustomEvent("dragend", { bubbles: true });
      article.dispatchEvent(dragEndEvent);
      expect(article.className).not.toContain("is-dragging");
    });

    it("sets draggable attribute correctly", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test", details: [] },
        dragDisabled: false
      });

      const article = element.shadowRoot.querySelector("article");
      expect(article.getAttribute("draggable")).toBe("true");
    });

    it("sets draggable to false when dragDisabled is true", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test", details: [] },
        dragDisabled: true
      });

      const article = element.shadowRoot.querySelector("article");
      expect(article.getAttribute("draggable")).toBe("false");
    });
  });

  describe("Negative Path Testing", () => {
    it("handles card without title property", () => {
      const element = buildComponent({
        card: { id: "001", details: [] },
        columnKey: "col1"
      });

      const titleLink = element.shadowRoot.querySelector(
        ".kanban-card_title-link"
      );
      expect(titleLink).toBeTruthy();
      expect(titleLink.textContent).toBe(""); // Should render but empty
    });

    it("handles card with undefined card properties", () => {
      const element = buildComponent({
        card: { id: "001", title: undefined, details: undefined },
        columnKey: "col1"
      });

      const titleLink = element.shadowRoot.querySelector(
        ".kanban-card_title-link"
      );
      expect(titleLink).toBeTruthy();

      const detailsContainer = element.shadowRoot.querySelector(
        ".kanban-card_details"
      );
      expect(detailsContainer).toBeNull(); // Undefined details should not render container
    });

    it("handles drag event with no valid card id", () => {
      const element = buildComponent({
        card: { title: "No ID", details: [] },
        columnKey: "col1"
      });

      const dragEvent = new CustomEvent("dragstart", {
        bubbles: true,
        cancelable: true
      });
      dragEvent.dataTransfer = {};
      dragEvent.preventDefault = jest.fn();

      element.shadowRoot.querySelector("article").dispatchEvent(dragEvent);
      expect(dragEvent.preventDefault).toHaveBeenCalled();
    });

    it("handles missing details array", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test" } // no details property
      });

      const detailsContainer = element.shadowRoot.querySelector(
        ".kanban-card_details"
      );
      expect(detailsContainer).toBeNull();
    });

    it("handles missing columnKey", () => {
      const element = buildComponent({
        card: { id: "001", title: "Test", details: [] }
      });

      const article = element.shadowRoot.querySelector("article");
      expect(article.getAttribute("data-column-key")).toBeNull();
    });
  });
});
