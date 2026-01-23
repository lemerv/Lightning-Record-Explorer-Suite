import { LightningElement, api } from "lwc";
import { normalizeBoolean } from "c/lresFieldUtils";

const DEFAULT_BOARD_HEIGHT = 1000;
const HEADER_BUFFER = 110;
const DRAG_OVER_THROTTLE_MS = 50;

export default class KanbanBoardContainer extends LightningElement {
  _columns = [];
  _showCardFieldLabels = false;
  _isLoading = false;
  _errorMessage;
  _warningMessage;
  _showEmptyState = false;
  _boardHeight;
  _enableVirtualization = false;
  _cardDisplayConfigKey;

  activeDropColumnKey = null;
  lastDragOverColumnKey = null;
  _dragOverLastTimestamp = null;
  _dragOverTimeoutId = null;
  _pendingDragOverKey = null;

  @api
  get columns() {
    return this._columns;
  }

  set columns(value) {
    this._columns = Array.isArray(value) ? value : [];
  }

  @api
  get showCardFieldLabels() {
    return this._showCardFieldLabels;
  }

  set showCardFieldLabels(value) {
    this._showCardFieldLabels = normalizeBoolean(value);
  }

  @api
  get isLoading() {
    return this._isLoading;
  }

  set isLoading(value) {
    const normalized = normalizeBoolean(value);
    if (normalized === this._isLoading) {
      return;
    }
    this._isLoading = normalized;
  }

  @api
  get errorMessage() {
    return this._errorMessage;
  }

  set errorMessage(value) {
    this._errorMessage = value;
  }

  @api
  get warningMessage() {
    return this._warningMessage;
  }

  set warningMessage(value) {
    this._warningMessage = value;
  }

  @api
  get showEmptyState() {
    return this._showEmptyState;
  }

  set showEmptyState(value) {
    this._showEmptyState = normalizeBoolean(value);
  }

  @api
  get enableVirtualization() {
    return this._enableVirtualization;
  }

  set enableVirtualization(value) {
    this._enableVirtualization = normalizeBoolean(value);
  }

  @api
  get cardDisplayConfigKey() {
    return this._cardDisplayConfigKey;
  }

  set cardDisplayConfigKey(value) {
    this._cardDisplayConfigKey = value;
  }

  @api
  get boardHeight() {
    return this._boardHeight;
  }

  set boardHeight(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      this._boardHeight = parsed;
    } else {
      this._boardHeight = undefined;
    }
  }

  get hasColumns() {
    return this.columns && this.columns.length > 0;
  }

  get resolvedBoardHeight() {
    return this._boardHeight || DEFAULT_BOARD_HEIGHT;
  }

  get columnSectionStyle() {
    const height = this.resolvedBoardHeight;
    return `height: ${height}px; max-height: ${height}px;`;
  }

  get columnBodyStyle() {
    const height = this.resolvedBoardHeight;
    const bodyHeight = Math.max(height - HEADER_BUFFER, 120);
    return `max-height: ${bodyHeight}px; overflow-y: auto;`;
  }

  handleCardDragStart(event) {
    if (this._isLoading) {
      return;
    }
    const { recordId, columnKey } = event.detail || {};
    if (!recordId) {
      return;
    }
    this.lastDragOverColumnKey = columnKey || null;
  }

  handleCardDragEnd() {
    this.resetDragOverThrottle();
    this.lastDragOverColumnKey = null;
    this.activeDropColumnKey = null;
  }

  handleColumnDragOver(event) {
    if (this._isLoading) {
      return;
    }
    const columnKey = event.detail?.columnKey || null;
    this.throttleDragOver(columnKey);
  }

  handleColumnDragEnter(event) {
    if (this._isLoading) {
      return;
    }
    const columnKey = event.detail?.columnKey;
    if (!columnKey) {
      return;
    }
    if (this.activeDropColumnKey !== columnKey) {
      this.activeDropColumnKey = columnKey;
    }
    this.lastDragOverColumnKey = columnKey;
  }

  handleColumnDragLeave(event) {
    const columnKey = event.detail?.columnKey;
    if (this.activeDropColumnKey === columnKey) {
      this.activeDropColumnKey = null;
    }
  }

  handleColumnDrop(event) {
    if (this._isLoading) {
      return;
    }
    const { recordId, targetColumnKey } = event.detail || {};
    if (!recordId || !targetColumnKey) {
      return;
    }
    this.resetDragOverThrottle();
    this.lastDragOverColumnKey = null;
    this.activeDropColumnKey = null;
    this.dispatchEvent(
      new CustomEvent("columndrop", {
        detail: event.detail,
        bubbles: true,
        composed: true
      })
    );
  }

  handleCardTitleClick(event) {
    event?.stopPropagation?.();
    this.dispatchEvent(
      new CustomEvent("cardtitleclick", {
        detail: event.detail,
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

  handleBoardDragLeave(event) {
    const container = event.currentTarget;
    const related = event.relatedTarget;
    const isLeaving = !related || !container || !container.contains(related);
    if (isLeaving) {
      this.resetDragOverThrottle();
      this.activeDropColumnKey = null;
      this.lastDragOverColumnKey = null;
    }
  }

  throttleDragOver(columnKey) {
    const now = Date.now();
    const elapsed =
      this._dragOverLastTimestamp === null
        ? null
        : now - this._dragOverLastTimestamp;
    if (
      this._dragOverLastTimestamp === null ||
      elapsed >= DRAG_OVER_THROTTLE_MS
    ) {
      this._dragOverLastTimestamp = now;
      this.applyDragOver(columnKey);
      return;
    }
    this._pendingDragOverKey = columnKey;
    if (this._dragOverTimeoutId) {
      return;
    }
    const remaining = Math.max(DRAG_OVER_THROTTLE_MS - elapsed, 0);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._dragOverTimeoutId = setTimeout(() => {
      this._dragOverTimeoutId = null;
      this._dragOverLastTimestamp = Date.now();
      this.applyDragOver(this._pendingDragOverKey);
      this._pendingDragOverKey = null;
    }, remaining);
  }

  applyDragOver(columnKey) {
    if (columnKey !== this.lastDragOverColumnKey) {
      this.lastDragOverColumnKey = columnKey;
    }
    if (columnKey && this.activeDropColumnKey !== columnKey) {
      this.activeDropColumnKey = columnKey;
    }
  }

  resetDragOverThrottle() {
    if (this._dragOverTimeoutId) {
      clearTimeout(this._dragOverTimeoutId);
    }
    this._dragOverLastTimestamp = null;
    this._dragOverTimeoutId = null;
    this._pendingDragOverKey = null;
  }
}
