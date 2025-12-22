import { LightningElement, api } from "lwc";

export default class HierarchyCard extends LightningElement {
  @api card = { details: [] };
  @api columnKey;
  @api showCardFieldLabels = false;
  @api enableTextWrap = false;
  @api draggedRecordId;
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

  get titleLinkClass() {
    return `hierarchy-card_title-link${
      this.enableTextWrap ? " is-wrap" : " is-truncate"
    }`;
  }

  get cardClass() {
    return `hierarchy-card${this.isDragging ? " is-dragging" : ""}`;
  }

  get isDragging() {
    return this.cardId && this.cardId === this.draggedRecordId;
  }

  get isDraggable() {
    return !this.dragDisabled;
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
  }

  handleDragEnd() {
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
