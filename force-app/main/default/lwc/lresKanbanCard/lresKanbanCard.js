import { LightningElement, api } from "lwc";

export default class KanbanCard extends LightningElement {
  @api card = { details: [] };
  @api columnKey;
  @api showCardFieldLabels = false;
  @api dragDisabled = false;

  get titleIcon() {
    return this.card?.titleIcon;
  }

  get titleEmoji() {
    return this.card?.titleEmoji;
  }

  get cardTitle() {
    return this.card?.title ?? "";
  }

  get cardDetails() {
    return Array.isArray(this.card?.details) ? this.card.details : [];
  }

  get hasDetails() {
    return this.cardDetails.length > 0;
  }

  get cardId() {
    return this.card?.id;
  }

  get cardClass() {
    return this.isSaving ? "kanban-card is-saving" : "kanban-card";
  }

  get isDraggable() {
    return !this.dragDisabled && !this.isSaving;
  }

  get isSaving() {
    return Boolean(this.card?.isSaving);
  }

  handleDragStart(event) {
    if (!this.isDraggable) {
      event.preventDefault();
      return;
    }
    const recordId = this.cardId;
    if (!recordId) {
      event.preventDefault();
      return;
    }
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.effectAllowed = "move";
      dataTransfer.dropEffect = "move";
      dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          recordId,
          columnKey: this.columnKey
        })
      );
    }
    this.dispatchEvent(
      new CustomEvent("carddragstart", {
        detail: { recordId, columnKey: this.columnKey },
        bubbles: true,
        composed: true
      })
    );
    event.currentTarget?.classList.add("is-dragging");
  }

  handleDragEnd() {
    const target = this.template.querySelector("article");
    target?.classList.remove("is-dragging");
    const recordId = this.cardId;
    if (!recordId) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("carddragend", {
        detail: { recordId },
        bubbles: true,
        composed: true
      })
    );
  }

  handleTitleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const recordId = this.cardId;
    if (!recordId) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("cardtitleclick", {
        detail: { recordId },
        bubbles: true,
        composed: true
      })
    );
  }

  handleExternalClick(event) {
    // Prevent the modal trigger when opening in a new tab.
    event?.stopPropagation?.();
    event?.preventDefault?.();
    const recordId = this.cardId;
    if (!recordId) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("cardopenexternallink", {
        detail: { recordId },
        bubbles: true,
        composed: true
      })
    );
  }
}
