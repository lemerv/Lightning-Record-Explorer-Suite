import { createElement } from "lwc";
import KanbanBoardActions from "c/lresKanbanBoardActions";

describe("c-lres-kanban-board-actions", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-board-actions", {
      is: KanbanBoardActions
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("dispatches search events from lightning input", () => {
    const element = buildComponent({ searchAvailable: true });
    const handler = jest.fn();
    element.addEventListener("searchinput", handler);

    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "abc";
    input.dispatchEvent(new CustomEvent("input", { detail: { value: "abc" } }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.value).toBe("abc");
  });

  it("falls back to change when input has not fired", () => {
    const element = buildComponent({ searchAvailable: true });
    const handler = jest.fn();
    element.addEventListener("searchinput", handler);

    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "xyz";
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "xyz" } })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.value).toBe("xyz");
  });

  it("ignores change when input already dispatched the same value", () => {
    const element = buildComponent({ searchAvailable: true });
    const handler = jest.fn();
    element.addEventListener("searchinput", handler);

    const input = element.shadowRoot.querySelector("lightning-input");
    input.value = "abc";
    input.dispatchEvent(new CustomEvent("input", { detail: { value: "abc" } }));
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "abc" } })
    );

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("dispatches sort option and direction events", () => {
    const element = buildComponent({
      sortFieldOptions: [{ label: "Name", value: "Name", selected: true }],
      isSortMenuOpen: true
    });
    const sortOptionHandler = jest.fn();
    const sortDirectionHandler = jest.fn();
    element.addEventListener("sortoptionchange", sortOptionHandler);
    element.addEventListener("sortdirectiontoggle", sortDirectionHandler);

    const option = element.shadowRoot.querySelector("lightning-input");
    option.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Name" } })
    );

    const direction = element.shadowRoot.querySelector(
      "lightning-button-icon.board-actions_direction"
    );
    direction.dispatchEvent(new CustomEvent("click"));

    expect(sortOptionHandler).toHaveBeenCalled();
    expect(sortOptionHandler.mock.calls[0][0].detail.value).toBe("Name");
    expect(sortDirectionHandler).toHaveBeenCalled();
  });

  it("dispatches manual refresh and clear filter events", () => {
    const element = buildComponent({
      filtersAvailable: true,
      filterDefinitions: [{ id: "status" }],
      clearFiltersDisabled: false,
      searchAvailable: false,
      sortFieldOptions: [{ label: "Name", value: "Name" }]
    });
    const clearHandler = jest.fn();
    const refreshHandler = jest.fn();
    element.addEventListener("clearfilters", clearHandler);
    element.addEventListener("manualrefresh", refreshHandler);

    const clearButton = element.shadowRoot.querySelector(
      ".board-actions_clear"
    );
    clearButton.click();

    const refreshButton = element.shadowRoot.querySelector(
      ".board-actions_refresh"
    );
    refreshButton.dispatchEvent(new CustomEvent("click"));

    expect(clearHandler).toHaveBeenCalled();
    expect(refreshHandler).toHaveBeenCalled();
  });
});
