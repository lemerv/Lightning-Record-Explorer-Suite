import { LightningElement, api, track, wire } from "lwc";
import getHierarchy from "@salesforce/apex/LRES_HierarchyExplorerController.getHierarchy";
import { normalizeString } from "c/lresFieldUtils";
import { parseError, showErrorToast } from "c/lresErrorHandler";
import { buildOrthogonalPaths, computeTreeLayout } from "./layout";
import { NavigationMixin } from "lightning/navigation";
import { nextZoomScale } from "./panZoom";
import { getObjectInfos } from "lightning/uiObjectInfoApi";
import {
  getFocusedTabInfo,
  isConsoleNavigation,
  openSubtab,
  openTab
} from "lightning/platformWorkspaceApi";
import {
  coerceIconName,
  getFieldLabel,
  resolveEmoji
} from "c/lresFieldDisplayUtils";

const MAX_LEVELS = 10;
const MAX_NODES = 50;
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 180;
const GAP_X = 60;
const GAP_Y = 70;

export default class LresHierarchyExplorer extends NavigationMixin(
  LightningElement
) {
  _recordId;
  _templateDeveloperName;
  _rootRecordId;

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    this._recordId = value;
    this.scheduleRefresh();
  }

  @api
  get templateDeveloperName() {
    return this._templateDeveloperName;
  }
  set templateDeveloperName(value) {
    this._templateDeveloperName = value;
    this.scheduleRefresh();
  }

  @api
  get rootRecordId() {
    return this._rootRecordId;
  }
  set rootRecordId(value) {
    this._rootRecordId = value;
    this.scheduleRefresh();
  }

  @track hierarchy;
  @track errorMessage;
  @track isLoading = false;
  @track positionedNodes = [];
  @track connectorPaths = [];

  objectApiNames;
  _objectInfoByApiName = {};

  _canvasWidth = 0;
  _canvasHeight = 0;

  _scale = 0.7;
  _translateX = 0;
  _translateY = 0;
  _isPanning = false;
  _panStartX = 0;
  _panStartY = 0;
  _panStartTranslateX = 0;
  _panStartTranslateY = 0;
  _activePointerId;

  _refreshScheduled = false;
  _pendingCenter = false;
  _layoutMeta;
  _centeredHierarchyKey;
  _resizeObserver;
  _observedNodeIds = new Set();
  _measuredHeightsById = new Map();
  _relayoutQueued = false;
  _nodeEntries = [];
  _edges = [];
  _viewportObserved = false;

  @wire(getObjectInfos, { objectApiNames: "$objectApiNames" })
  wiredObjectInfos({ data }) {
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) {
      return;
    }
    const nextMap = {};
    results.forEach((entry) => {
      const info = entry?.result;
      const apiName = entry?.objectApiName || info?.apiName;
      if (apiName && info) {
        nextMap[apiName] = info;
      }
    });
    this._objectInfoByApiName = nextMap;
    if (this.hierarchy) {
      this.buildRenderModel();
    }
  }

  connectedCallback() {
    this.scheduleRefresh();
  }

  disconnectedCallback() {
    this.disconnectResizeObserver();
  }

  renderedCallback() {
    if (!this.hasData) {
      return;
    }
    this.ensureResizeObserver();
    this.observeRenderedNodes();
    this.observeViewportForCentering();
    if (this._pendingCenter) {
      this.tryCenterRootInViewport();
    }
  }

  @api
  recenter() {
    this._pendingCenter = true;
    this.tryCenterRootInViewport();
  }

  @api
  relayout() {
    this.applyRowHeightLayout();
  }

  @api
  relayoutWithHeights(heightsById) {
    const nextMap = new Map();
    if (heightsById && typeof heightsById === "object") {
      Object.entries(heightsById).forEach(([id, height]) => {
        if (!id) {
          return;
        }
        const numeric = Number(height);
        if (Number.isFinite(numeric) && numeric > 0) {
          nextMap.set(id, numeric);
        }
      });
    }
    this._measuredHeightsById = nextMap;
    this.applyRowHeightLayout();
  }

  @api
  refreshHierarchy() {
    const templateDeveloperName = normalizeString(this.templateDeveloperName);
    const effectiveRootRecordId = this.effectiveRootRecordId;
    if (!templateDeveloperName || !effectiveRootRecordId) {
      this.hierarchy = null;
      this.errorMessage = null;
      return;
    }
    this.isLoading = true;
    this.errorMessage = null;
    getHierarchy({
      templateDeveloperName,
      effectiveRootRecordId,
      maxLevels: MAX_LEVELS,
      maxNodes: MAX_NODES
    })
      .then((result) => {
        this.hierarchy = result;
        this.objectApiNames = this.extractObjectApiNames(result?.nodes);
        this.buildRenderModel();
        this._pendingCenter = true;
      })
      .catch((error) => {
        const parsed = parseError(error);
        this.hierarchy = null;
        this.positionedNodes = [];
        this.connectorPaths = [];
        this.errorMessage = parsed.message;
        this.objectApiNames = undefined;
        this._objectInfoByApiName = {};
        showErrorToast(this, error, {
          title: "Hierarchy Explorer Error"
        });
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  scheduleRefresh() {
    if (this._refreshScheduled) {
      return;
    }
    this._refreshScheduled = true;
    Promise.resolve().then(() => {
      this._refreshScheduled = false;
      if (!this.isConnected) {
        return;
      }
      this.refreshHierarchy();
    });
  }

  get effectiveRootRecordId() {
    return (
      normalizeString(this._rootRecordId) || normalizeString(this._recordId)
    );
  }

  get hasError() {
    return Boolean(this.errorMessage);
  }

  get hasData() {
    return Boolean(this.hierarchy);
  }

  get nodeCount() {
    return this.hierarchy?.nodes?.length || 0;
  }

  get isCapped() {
    return Boolean(this.hierarchy?.capped);
  }

  get capMessage() {
    return this.hierarchy?.capMessage || "Results were capped.";
  }

  get canvasWidth() {
    return this._canvasWidth;
  }

  get canvasHeight() {
    return this._canvasHeight;
  }

  get svgViewBox() {
    return `0 0 ${this._canvasWidth} ${this._canvasHeight}`;
  }

  get canvasStyle() {
    return `transform: translate(${this._translateX}px, ${this._translateY}px) scale(${this._scale});`;
  }

  buildRenderModel() {
    this._measuredHeightsById = new Map();
    this.disconnectResizeObserver();

    const nodes = Array.isArray(this.hierarchy?.nodes)
      ? this.hierarchy.nodes
      : [];
    const edges = Array.isArray(this.hierarchy?.edges)
      ? this.hierarchy.edges
      : [];
    this._edges = edges;
    const nodeWidth = DEFAULT_NODE_WIDTH;
    const nodeMaxHeight = DEFAULT_NODE_HEIGHT;

    const { positionsById, bounds } = computeTreeLayout(nodes, edges, {
      nodeWidth,
      nodeHeight: nodeMaxHeight,
      gapX: GAP_X,
      gapY: GAP_Y
    });

    const basePositionsById = new Map();
    let maxDepth = 0;
    for (const [id, pos] of positionsById.entries()) {
      basePositionsById.set(id, {
        left: pos.left,
        centerX: pos.centerX,
        depth: pos.depth || 0
      });
      maxDepth = Math.max(maxDepth, pos.depth || 0);
    }

    this._canvasWidth = Math.ceil(bounds.width + GAP_X);
    this._layoutMeta = {
      basePositionsById,
      positionsById: new Map(),
      nodeWidth,
      nodeMaxHeight,
      gapY: GAP_Y,
      maxDepth
    };

    this._nodeEntries = nodes
      .map((node) => {
        if (!node?.id) {
          return null;
        }
        return { id: node.id, card: this.normalizeCardForDisplay(node) };
      })
      .filter(Boolean);

    this.applyRowHeightLayout();
    this._pendingCenter = true;
  }

  ensureResizeObserver() {
    if (this._resizeObserver || typeof ResizeObserver !== "function") {
      return;
    }
    this._resizeObserver = new ResizeObserver((entries) => {
      this.handleNodeResizes(entries);
    });
    this._observedNodeIds = new Set();
  }

  disconnectResizeObserver() {
    try {
      this._resizeObserver?.disconnect?.();
    } catch {
      // ignore
    }
    this._resizeObserver = undefined;
    this._observedNodeIds = new Set();
    this._viewportObserved = false;
  }

  observeRenderedNodes() {
    if (!this._resizeObserver) {
      return;
    }
    const nodeEls = this.template.querySelectorAll(
      ".hierarchy-explorer_node[data-node-id]"
    );
    nodeEls.forEach((nodeEl) => {
      const id = nodeEl.dataset?.nodeId;
      if (!id || this._observedNodeIds.has(id)) {
        return;
      }
      this._observedNodeIds.add(id);
      this._resizeObserver.observe(nodeEl);
    });
  }

  handleNodeResizes(entries) {
    let didUpdate = false;
    (entries || []).forEach((entry) => {
      const target = entry?.target;
      if (
        this._pendingCenter &&
        target?.classList?.contains?.("hierarchy-explorer_viewport")
      ) {
        this.tryCenterRootInViewport();
      }
      const id = target?.dataset?.nodeId;
      if (!id) {
        return;
      }
      const height =
        entry?.contentRect?.height ||
        target?.offsetHeight ||
        target?.getBoundingClientRect?.().height;
      if (!Number.isFinite(height) || height <= 0) {
        return;
      }
      const rounded = Math.round(height);
      if (this._measuredHeightsById.get(id) !== rounded) {
        this._measuredHeightsById.set(id, rounded);
        didUpdate = true;
      }
    });
    if (didUpdate) {
      this.queueRelayout();
    }
  }

  queueRelayout() {
    if (this._relayoutQueued) {
      return;
    }
    this._relayoutQueued = true;
    Promise.resolve().then(() => {
      this._relayoutQueued = false;
      if (!this.isConnected || !this.hasData) {
        return;
      }
      this.applyRowHeightLayout();
      if (this._pendingCenter) {
        this.tryCenterRootInViewport();
      }
    });
  }

  applyRowHeightLayout() {
    const layoutMeta = this._layoutMeta;
    if (!layoutMeta?.basePositionsById) {
      return;
    }

    const maxDepth = layoutMeta.maxDepth || 0;
    const maxHeightByDepth = new Array(maxDepth + 1).fill(0);
    for (const [id, pos] of layoutMeta.basePositionsById.entries()) {
      const depth = pos.depth || 0;
      const measured = this._measuredHeightsById.get(id);
      const height =
        Number.isFinite(measured) && measured > 0
          ? Math.min(measured, layoutMeta.nodeMaxHeight)
          : layoutMeta.nodeMaxHeight;
      maxHeightByDepth[depth] = Math.max(maxHeightByDepth[depth], height);
    }

    for (let depth = 0; depth < maxHeightByDepth.length; depth += 1) {
      if (!maxHeightByDepth[depth]) {
        maxHeightByDepth[depth] = layoutMeta.nodeMaxHeight;
      }
    }

    const topByDepth = new Array(maxDepth + 1).fill(0);
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      topByDepth[depth] =
        topByDepth[depth - 1] + maxHeightByDepth[depth - 1] + layoutMeta.gapY;
    }

    const adjustedPositionsById = new Map();
    for (const [id, pos] of layoutMeta.basePositionsById.entries()) {
      const depth = pos.depth || 0;
      const measured = this._measuredHeightsById.get(id);
      const height =
        Number.isFinite(measured) && measured > 0
          ? Math.min(measured, layoutMeta.nodeMaxHeight)
          : layoutMeta.nodeMaxHeight;
      const top = topByDepth[depth] || 0;
      adjustedPositionsById.set(id, {
        left: pos.left,
        top,
        depth,
        centerX: pos.centerX,
        centerY: top + height / 2,
        bottomY: top + height
      });
    }

    const lastRowBottom =
      (topByDepth[maxDepth] || 0) + (maxHeightByDepth[maxDepth] || 0);
    this._canvasHeight = Math.ceil(lastRowBottom + layoutMeta.gapY);

    layoutMeta.positionsById = adjustedPositionsById;
    this.positionedNodes = this._nodeEntries
      .map((entry) => {
        const pos = adjustedPositionsById.get(entry.id);
        if (!pos) {
          return null;
        }
        const style = `left:${pos.left}px;top:${pos.top}px;width:${layoutMeta.nodeWidth}px;`;
        const scrollStyle = `--lres-hierarchy-card-max-height:${layoutMeta.nodeMaxHeight}px;`;
        return {
          id: entry.id,
          card: entry.card,
          enableTextWrap: Boolean(entry.card?.enableTextWrap),
          style,
          scrollStyle
        };
      })
      .filter(Boolean);

    this.connectorPaths = buildOrthogonalPaths(
      this._edges,
      adjustedPositionsById
    );
  }

  observeViewportForCentering() {
    if (this._viewportObserved || !this._resizeObserver) {
      return;
    }
    const viewport = this.template.querySelector(
      ".hierarchy-explorer_viewport"
    );
    if (!viewport) {
      return;
    }
    this._viewportObserved = true;
    this._resizeObserver.observe(viewport);
  }

  tryCenterRootInViewport() {
    const centered = this.centerRootInViewport();
    if (centered) {
      this._pendingCenter = false;
    }
  }

  centerRootInViewport() {
    const viewport = this.template.querySelector(
      ".hierarchy-explorer_viewport"
    );
    const layoutMeta = this._layoutMeta;
    if (!viewport || !layoutMeta?.positionsById) {
      return false;
    }

    const rect = viewport.getBoundingClientRect?.();
    const viewportWidth = rect?.width || 0;
    const viewportHeight = rect?.height || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return false;
    }

    const hierarchyKey = `${normalizeString(this.templateDeveloperName) || ""}|${
      normalizeString(this.effectiveRootRecordId) || ""
    }|${this.hierarchy?.rootId || ""}|${this.hierarchy?.nodes?.length || 0}|${
      this.hierarchy?.edges?.length || 0
    }`;
    if (this._centeredHierarchyKey === hierarchyKey) {
      return true;
    }

    const rootId =
      normalizeString(this.hierarchy?.rootId) ||
      normalizeString(this.effectiveRootRecordId) ||
      normalizeString(this.hierarchy?.nodes?.[0]?.id);
    if (!rootId) {
      return false;
    }

    const rootPos = layoutMeta.positionsById.get(rootId);
    if (!rootPos) {
      return false;
    }

    const rootCenterX = rootPos.centerX;
    const rootCenterY = rootPos.centerY;

    const scale = Number.isFinite(this._scale) ? this._scale : 1;
    const nextTranslateX = Math.round(viewportWidth / 2 - rootCenterX * scale);
    const nextTranslateY = Math.round(viewportHeight / 2 - rootCenterY * scale);

    this._translateX = nextTranslateX;
    this._translateY = nextTranslateY;
    this._centeredHierarchyKey = hierarchyKey;
    return true;
  }

  normalizeCardForDisplay(card) {
    if (!card) {
      return card;
    }
    const objectApiName = normalizeString(card.objectApiName);
    const titleMeta =
      card.titleEmoji || card.titleIcon
        ? this.parseIconEntry(card.titleEmoji || card.titleIcon)
        : { iconName: null, emoji: null };
    const details = Array.isArray(card.details) ? card.details : [];
    const normalizedDetails = details.map((detail) => {
      const token = detail?.iconEmoji || detail?.iconName;
      const iconMeta = token
        ? this.parseIconEntry(token)
        : { iconName: null, emoji: null };
      return {
        ...detail,
        label: this.resolveDetailLabel(
          objectApiName,
          detail?.apiName,
          detail?.label
        ),
        iconName: iconMeta.iconName,
        iconEmoji: iconMeta.emoji
      };
    });
    return {
      ...card,
      showCardFieldLabels: Boolean(card.showCardFieldLabels),
      enableTextWrap: Boolean(card.enableTextWrap),
      titleIcon: titleMeta.iconName,
      titleEmoji: titleMeta.emoji,
      details: normalizedDetails
    };
  }

  resolveDetailLabel(objectApiName, fieldPath, fallbackLabel) {
    const apiName = normalizeString(objectApiName);
    const field = normalizeString(fieldPath);
    if (apiName && field) {
      const objectInfo = this._objectInfoByApiName?.[apiName];
      if (objectInfo) {
        const context = { cardObjectApiName: apiName, objectInfo };
        const label = getFieldLabel(context, field);
        if (label) {
          return label;
        }
      }
    }
    return fallbackLabel;
  }

  extractObjectApiNames(nodes) {
    const unique = new Set();
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
      const apiName = normalizeString(node?.objectApiName);
      if (apiName) {
        unique.add(apiName);
      }
    });
    return unique.size ? Array.from(unique) : undefined;
  }

  parseIconEntry(rawValue) {
    const value = normalizeString(rawValue);
    if (!value) {
      return { iconName: null, emoji: null };
    }
    const emoji = resolveEmoji(value);
    if (emoji) {
      return { iconName: null, emoji };
    }
    return { iconName: coerceIconName(value), emoji: null };
  }

  handleZoomIn(event) {
    event?.stopPropagation?.();
    this._scale = nextZoomScale(this._scale, { direction: "in" });
  }

  handleZoomOut(event) {
    event?.stopPropagation?.();
    this._scale = nextZoomScale(this._scale, { direction: "out" });
  }

  handleControlsPointerDown(event) {
    event?.stopPropagation?.();
  }

  handleCanvasPointerDown(event) {
    if (!event || this._isPanning) {
      return;
    }
    const target = event.target;
    if (
      target?.closest?.(".hierarchy-explorer_controls") ||
      target?.closest?.(".hierarchy-explorer_node") ||
      target?.closest?.("c-lres-hierarchy-card")
    ) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    this._isPanning = true;
    this._activePointerId = event.pointerId;
    this._panStartX = event.clientX;
    this._panStartY = event.clientY;
    this._panStartTranslateX = this._translateX;
    this._panStartTranslateY = this._translateY;
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    event.preventDefault();
  }

  handleCanvasPointerMove(event) {
    if (!this._isPanning) {
      return;
    }
    if (
      this._activePointerId !== undefined &&
      event.pointerId !== this._activePointerId
    ) {
      return;
    }
    const dx = event.clientX - this._panStartX;
    const dy = event.clientY - this._panStartY;
    this._translateX = this._panStartTranslateX + dx;
    this._translateY = this._panStartTranslateY + dy;
    event.preventDefault();
  }

  handleCanvasPointerUp(event) {
    if (
      this._activePointerId !== undefined &&
      event?.pointerId !== this._activePointerId
    ) {
      return;
    }
    this._isPanning = false;
    this._activePointerId = undefined;
    try {
      event?.currentTarget?.releasePointerCapture?.(event?.pointerId);
    } catch {
      // ignore
    }
    event?.preventDefault?.();
  }

  handleCardTitleClick(event) {
    const recordId = event?.detail?.recordId;
    if (!recordId) {
      return;
    }
    this.openRecordInNewTab(recordId);
  }

  handleCardOpenExternalLink(event) {
    const recordId = event?.detail?.recordId;
    if (!recordId) {
      return;
    }
    this.openRecordInNewTab(recordId);
  }

  async openRecordInNewTab(recordId) {
    const pageReference = {
      type: "standard__recordPage",
      attributes: {
        recordId,
        actionName: "view"
      }
    };

    try {
      const inConsole = await isConsoleNavigation();
      if (inConsole) {
        const focused = await getFocusedTabInfo();
        const parentTabId = focused?.tabId;
        if (parentTabId) {
          await openSubtab(parentTabId, {
            recordId,
            actionName: "view",
            focus: true
          });
          return;
        }
        await openTab({ recordId, actionName: "view", focus: true });
        return;
      }
    } catch {
      // Ignore and fall back to standard navigation.
    }

    try {
      this[NavigationMixin.Navigate](pageReference);
    } catch (error) {
      showErrorToast(this, error, { title: "Navigation Error" });
    }
  }
}
