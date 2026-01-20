import { LightningElement, api } from "lwc";
import { normalizeBoolean } from "c/lresFieldUtils";
import {
  resolveSpacerHeights,
  resolveVirtualWindow
} from "./virtualizationUtils";

const INITIAL_MEASURE_COUNT = 10;
const VIRTUAL_BUFFER = 5;

export default class KanbanColumn extends LightningElement {
  _column = { key: null, label: "", count: 0, records: [] };
  _enableVirtualization = false;
  _cardDisplayConfigKey;
  _rowHeight = null;
  _visibleStartIndex = 0;
  _visibleEndIndex = 0;
  _scrollRafId = null;
  _pendingScrollTop = null;

  @api
  get column() {
    return this._column;
  }

  set column(value) {
    this._column =
      value && typeof value === "object"
        ? value
        : { key: null, label: "", count: 0, records: [] };
    this.syncVirtualWindow();
  }

  @api columnSectionStyle;
  @api columnBodyStyle;
  @api showCardFieldLabels = false;
  @api dragDisabled = false;
  @api activeDropKey;
  @api
  get enableVirtualization() {
    return this._enableVirtualization;
  }

  set enableVirtualization(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._enableVirtualization) {
      return;
    }
    this._enableVirtualization = normalized;
    this.resetVirtualizationState();
  }

  @api
  get cardDisplayConfigKey() {
    return this._cardDisplayConfigKey;
  }

  set cardDisplayConfigKey(value) {
    if (value === this._cardDisplayConfigKey) {
      return;
    }
    this._cardDisplayConfigKey = value;
    this.resetVirtualizationState();
  }

  get columnKey() {
    return this._column?.key;
  }

  get columnLabel() {
    return this._column?.label ?? "";
  }

  get columnCount() {
    const count = this._column?.count;
    return typeof count === "number" ? count : "";
  }

  get columnRecords() {
    return Array.isArray(this._column?.records) ? this._column.records : [];
  }

  get columnSummaries() {
    return Array.isArray(this._column?.summaries) ? this._column.summaries : [];
  }

  get displaySummaries() {
    const summaries = this.columnSummaries;
    if (summaries.length === 0) {
      return summaries;
    }
    if (this.columnCount > 0) {
      return summaries;
    }
    return summaries.map((summary) => ({
      ...summary,
      value: "-",
      isLoading: false
    }));
  }

  get hasSummaries() {
    return this.displaySummaries.length > 0;
  }

  get totalRecordCount() {
    return this.columnRecords.length;
  }

  get useVirtualization() {
    return this._enableVirtualization && this.totalRecordCount > 0;
  }

  get isWindowed() {
    return this.useVirtualization && this._rowHeight;
  }

  get visibleRecords() {
    if (!this.useVirtualization) {
      return this.columnRecords;
    }
    if (!this._rowHeight) {
      return this.columnRecords.slice(0, INITIAL_MEASURE_COUNT);
    }
    return this.columnRecords.slice(
      this._visibleStartIndex,
      this._visibleEndIndex
    );
  }

  get topSpacerStyle() {
    if (!this.isWindowed) {
      return "";
    }
    const { top } = resolveSpacerHeights({
      rowHeight: this._rowHeight,
      startIndex: this._visibleStartIndex,
      endIndex: this._visibleEndIndex,
      total: this.totalRecordCount
    });
    return `height: ${top}px;`;
  }

  get bottomSpacerStyle() {
    if (!this.isWindowed) {
      return "";
    }
    const { bottom } = resolveSpacerHeights({
      rowHeight: this._rowHeight,
      startIndex: this._visibleStartIndex,
      endIndex: this._visibleEndIndex,
      total: this.totalRecordCount
    });
    return `height: ${bottom}px;`;
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

  renderedCallback() {
    if (!this.useVirtualization || this._rowHeight) {
      return;
    }
    const body = this.template.querySelector(".kanban-column_body");
    const card = body?.querySelector("c-lres-kanban-card");
    if (!body || !card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    if (!rect || !rect.height) {
      return;
    }
    const styles = getComputedStyle(body);
    const gapValue = parseFloat(styles?.rowGap || styles?.gap || "0");
    const gap = Number.isFinite(gapValue) ? gapValue : 0;
    const rowHeight = rect.height + gap;
    if (!rowHeight) {
      return;
    }
    this._rowHeight = rowHeight;
    this.updateWindowRange(body.scrollTop, body.clientHeight);
  }

  handleBodyScroll(event) {
    if (!this.useVirtualization || !this._rowHeight) {
      return;
    }
    const target = event.currentTarget;
    if (!target) {
      return;
    }
    const scrollTop = target.scrollTop || 0;
    if (typeof requestAnimationFrame === "function") {
      this._pendingScrollTop = scrollTop;
      if (this._scrollRafId) {
        return;
      }
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      this._scrollRafId = requestAnimationFrame(() => {
        this._scrollRafId = null;
        const pending = this._pendingScrollTop ?? scrollTop;
        this._pendingScrollTop = null;
        this.updateWindowRange(pending, target.clientHeight);
      });
      return;
    }
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.updateWindowRange(scrollTop, target.clientHeight);
    }, 0);
  }

  updateWindowRange(scrollTop, viewportHeight) {
    if (!this._rowHeight || !this.useVirtualization) {
      return;
    }
    const totalCount = this.totalRecordCount;
    const { start, end } = resolveVirtualWindow({
      scrollTop,
      viewportHeight,
      rowHeight: this._rowHeight,
      totalCount,
      buffer: VIRTUAL_BUFFER
    });
    if (start === this._visibleStartIndex && end === this._visibleEndIndex) {
      return;
    }
    this._visibleStartIndex = start;
    this._visibleEndIndex = end;
  }

  resetVirtualizationState() {
    if (this._scrollRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this._scrollRafId);
    }
    this._rowHeight = null;
    this._visibleStartIndex = 0;
    this._visibleEndIndex = 0;
    this._pendingScrollTop = null;
    this._scrollRafId = null;
  }

  syncVirtualWindow() {
    if (!this.useVirtualization || !this._rowHeight) {
      this._visibleStartIndex = 0;
      this._visibleEndIndex = 0;
      return;
    }
    const body = this.template.querySelector(".kanban-column_body");
    this.updateWindowRange(body?.scrollTop || 0, body?.clientHeight || 0);
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
