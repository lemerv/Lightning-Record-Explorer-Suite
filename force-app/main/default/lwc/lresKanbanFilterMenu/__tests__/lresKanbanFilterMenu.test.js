import { createElement } from "lwc";
import KanbanFilterMenu from "c/lresKanbanFilterMenu";

describe("c-lres-kanban-filter-menu", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (filter) => {
    const element = createElement("c-lres-kanban-filter-menu", {
      is: KanbanFilterMenu
    });
    element.filter = filter;
    document.body.appendChild(element);
    return element;
  };

  it("emits toggle and escape events", () => {
    const filter = {
      id: "status",
      label: "Status",
      buttonClass: "filter-dropdown_button",
      isOpen: true,
      options: []
    };
    const element = buildComponent(filter);
    const toggleHandler = jest.fn();
    const escapeHandler = jest.fn();
    element.addEventListener("filtertoggle", toggleHandler);
    element.addEventListener("filterescapepressed", escapeHandler);

    const toggle = element.shadowRoot.querySelector("button");
    toggle.click();

    const menu = element.shadowRoot.querySelector(".filter-menu");
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(toggleHandler).toHaveBeenCalled();
    expect(toggleHandler.mock.calls[0][0].detail.filterId).toBe("status");
    expect(escapeHandler).toHaveBeenCalled();
  });

  it("emits option toggle events with value and checked state", () => {
    const filter = {
      id: "status",
      label: "Status",
      buttonClass: "filter-dropdown_button",
      isOpen: true,
      options: [
        { value: "New", label: "New", selected: false },
        { value: "Closed", label: "Closed", selected: true }
      ]
    };
    const element = buildComponent(filter);
    const optionHandler = jest.fn();
    element.addEventListener("filteroptiontoggle", optionHandler);

    const checkbox = element.shadowRoot.querySelector("lightning-input");
    checkbox.value = "New";
    checkbox.checked = true;
    checkbox.dispatchEvent(new CustomEvent("change"));

    expect(optionHandler).toHaveBeenCalled();
    expect(optionHandler.mock.calls[0][0].detail).toEqual({
      filterId: "status",
      value: "New",
      checked: true
    });
  });
});
