import { LightningElement, api } from "lwc";

export default class KanbanFilterMenu extends LightningElement {
  @api filter;

  get filterId() {
    return this.filter?.id;
  }

  get buttonClass() {
    return this.filter?.buttonClass;
  }

  get options() {
    return this.filter?.options || [];
  }

  get isOpen() {
    return this.filter?.isOpen;
  }

  handleToggleClick(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("filtertoggle", {
        detail: { filterId: this.filterId },
        bubbles: true,
        composed: true
      })
    );
  }

  handleMenuClick(event) {
    event.stopPropagation();
  }

  handleMenuKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent("filterescapepressed", {
          detail: { filterId: this.filterId },
          bubbles: true,
          composed: true
        })
      );
    }
  }

  handleOptionChange(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("filteroptiontoggle", {
        detail: {
          filterId: this.filterId,
          value: event.target?.value,
          checked: event.target?.checked
        },
        bubbles: true,
        composed: true
      })
    );
  }
}
