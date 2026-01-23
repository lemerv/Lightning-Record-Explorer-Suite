import { createElement } from "lwc";
import KanbanCardField from "c/lresKanbanCardField";

describe("c-lres-kanban-card-field", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-kanban-card-field", {
      is: KanbanCardField
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("renders parent badge layout when flagged", () => {
    const element = buildComponent({
      detail: {
        label: "Parent",
        value: "Account 1",
        isParentBadge: true,
        className: "custom-class"
      }
    });
    const badge = element.shadowRoot.querySelector(".kanban-card_parent-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain("Account 1");
    expect(element.shadowRoot.querySelector("div").className).toContain(
      "custom-class"
    );
  });

  it("renders label and value when not a parent badge", () => {
    const element = buildComponent({
      detail: { label: "Status", value: "New" },
      showLabel: true
    });
    const label = element.shadowRoot.querySelector(".kanban-card_field-label");
    const value = element.shadowRoot.querySelector(".kanban-card_field-value");
    expect(label.textContent).toContain("Status");
    expect(value.textContent).toContain("New");
  });
});
