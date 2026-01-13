import { LightningElement, api } from "lwc";
import { normalizeBoolean } from "c/lresFieldUtils";

const DEFAULT_BOARD_HEIGHT = 1000;
const HEADER_BUFFER = 110;

export default class KanbanBoardContainer extends LightningElement {
  _columns = [];
  _showCardFieldLabels = false;
  _isLoading = false;
  _errorMessage;
  _warningMessage;
  _showEmptyState = false;
  _boardHeight;

  draggedRecordId = null;
  activeDropColumnKey = null;
  lastDragOverColumnKey = null;

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
    this.draggedRecordId = recordId;
    this.lastDragOverColumnKey = columnKey || null;
  }

  handleCardDragEnd() {
    this.draggedRecordId = null;
    this.lastDragOverColumnKey = null;
    this.activeDropColumnKey = null;
  }

  handleColumnDragOver(event) {
    if (this._isLoading) {
      return;
    }
    const columnKey = event.detail?.columnKey || null;
    if (columnKey !== this.lastDragOverColumnKey) {
      this.lastDragOverColumnKey = columnKey;
    }
  }

  handleColumnDragEnter(event) {
    if (this._isLoading) {
      return;
    }
    const columnKey = event.detail?.columnKey;
    if (!columnKey) {
      return;
    }
    this.activeDropColumnKey = columnKey;
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
    this.draggedRecordId = null;
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
}
