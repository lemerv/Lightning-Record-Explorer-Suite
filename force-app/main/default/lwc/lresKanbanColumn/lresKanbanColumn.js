import { LightningElement, api } from "lwc";

export default class KanbanColumn extends LightningElement {
  @api column = { key: null, label: "", count: 0, records: [] };
  @api columnSectionStyle;
  @api columnBodyStyle;
  @api showCardFieldLabels = false;
  @api draggedRecordId;
  @api dragDisabled = false;
  @api activeDropKey;

  get columnKey() {
    return this.column?.key;
  }

  get columnLabel() {
    return this.column?.label ?? "";
  }

  get columnCount() {
    const count = this.column?.count;
    return typeof count === "number" ? count : "";
  }

  get columnRecords() {
    return Array.isArray(this.column?.records) ? this.column.records : [];
  }

  get columnSummaries() {
    return Array.isArray(this.column?.summaries) ? this.column.summaries : [];
  }

  get hasSummaries() {
    return this.columnSummaries.length > 0;
  }

  get sectionClass() {
    return `kanban-column${this.activeDrop ? " is-drop-target" : ""}`;
  }

  get activeDrop() {
    return (
      this.activeDropKey &&
      this.columnKey &&
      this.activeDropKey === this.columnKey
    );
  }

  get bodyClass() {
    return "kanban-column_body slds-scrollable_y";
  }

  handleDragOver(event) {
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    if (dataTransfer) {
      dataTransfer.dropEffect = "move";
    }
    this.dispatchColumnEvent("columndragover");
  }

  handleDragEnter(event) {
    event.preventDefault();
    this.dispatchColumnEvent("columndragenter");
  }

  handleDragLeave(event) {
    const container = this.template.querySelector("section");
    const related = event.relatedTarget;
    const isLeaving = !related || !container || !container.contains(related);
    if (isLeaving) {
      this.dispatchColumnEvent("columndragleave");
    }
  }

  handleDrop(event) {
    event.preventDefault();
    const payload = event.dataTransfer?.getData("text/plain");
    let data;
    if (payload) {
      try {
        data = JSON.parse(payload);
      } catch {
        data = { recordId: payload };
      }
    }
    if (!data?.recordId) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("columndrop", {
        detail: {
          recordId: data.recordId,
          sourceColumnKey: data.columnKey,
          targetColumnKey: this.columnKey
        },
        bubbles: true,
        composed: true
      })
    );
  }

  dispatchColumnEvent(name) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail: { columnKey: this.columnKey },
        bubbles: true,
        composed: true
      })
    );
  }

  handleCardExternalLink(event) {
    event?.stopPropagation?.();
    this.dispatchEvent(
      new CustomEvent("cardopenexternallink", {
        detail: event.detail,
        bubbles: true,
        composed: true
      })
    );
  }
}
