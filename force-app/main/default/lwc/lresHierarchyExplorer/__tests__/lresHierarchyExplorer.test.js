import { createElement } from "lwc";
import LresHierarchyExplorer from "c/lresHierarchyExplorer";
import { flushPromises } from "../../lresTestUtils/lresTestUtils";
import { getObjectInfos } from "lightning/uiObjectInfoApi";
import {
  getFocusedTabInfo,
  isConsoleNavigation,
  openSubtab,
  openTab
} from "lightning/platformWorkspaceApi";

import getHierarchy from "@salesforce/apex/LRES_HierarchyExplorerController.getHierarchy";

jest.mock(
  "@salesforce/apex/LRES_HierarchyExplorerController.getHierarchy",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock("lightning/uiObjectInfoApi", () => {
  const { createLdsTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
  return {
    getObjectInfos: createLdsTestWireAdapter()
  };
});

jest.mock(
  "lightning/platformWorkspaceApi",
  () => ({
    getFocusedTabInfo: jest.fn(),
    isConsoleNavigation: jest.fn(),
    openSubtab: jest.fn(),
    openTab: jest.fn()
  }),
  { virtual: true }
);

describe("c-lres-hierarchy-explorer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  const buildComponent = (props = {}) => {
    const element = createElement("c-lres-hierarchy-explorer", {
      is: LresHierarchyExplorer
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  };

  it("uses rootRecordId over recordId when provided", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "002",
      nodes: [{ id: "002", title: "Root", details: [] }],
      edges: [],
      capped: false
    });

    buildComponent({
      recordId: "001",
      rootRecordId: "002",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    expect(getHierarchy).toHaveBeenCalledWith(
      expect.objectContaining({
        templateDeveloperName: "MyTemplate",
        effectiveRootRecordId: "002",
        maxLevels: 10,
        maxNodes: 50
      })
    );
  });

  it("renders hierarchy cards from Apex response", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [
        { id: "001", title: "Root", details: [], showCardFieldLabels: true },
        { id: "002", title: "Child", details: [], showCardFieldLabels: false }
      ],
      edges: [{ parentId: "001", childId: "002" }],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const cards = element.shadowRoot.querySelectorAll("c-lres-hierarchy-card");
    expect(cards.length).toBe(2);
    expect(cards[0].showCardFieldLabels).toBe(true);
    expect(cards[1].showCardFieldLabels).toBe(false);
  });

  it("shows warning banner when capped", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [{ id: "001", title: "Root", details: [] }],
      edges: [],
      capped: true,
      capMessage: "Capped at 50 nodes"
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const banner = element.shadowRoot.querySelector(
      ".hierarchy-explorer_warning"
    );
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("Capped at 50 nodes");
  });

  it("uses UI API metadata labels when available", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [
        {
          id: "001",
          objectApiName: "Account",
          title: "Root",
          details: [
            { apiName: "Custom_Field__c", label: "Custom_Field__c", value: "X" }
          ]
        }
      ],
      edges: [],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    getObjectInfos.emit({
      results: [
        {
          result: {
            apiName: "Account",
            fields: {
              Custom_Field__c: { label: "Custom Field" }
            }
          }
        }
      ]
    });

    await flushPromises();

    const card = element.shadowRoot.querySelector("c-lres-hierarchy-card");
    expect(card.card.details[0].label).toBe("Custom Field");
  });

  it("centers the root record in the viewport on initial render", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [{ id: "001", title: "Root", details: [] }],
      edges: [],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const viewport = element.shadowRoot.querySelector(
      ".hierarchy-explorer_viewport"
    );
    viewport.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600
    });

    element.recenter();
    await flushPromises();

    const canvas = element.shadowRoot.querySelector(
      ".hierarchy-explorer_canvas"
    );
    expect(canvas.getAttribute("style")).toContain("translate(302px, 237px)");
  });

  it("relayouts rows using max height per depth", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [
        { id: "001", title: "Root", details: [] },
        { id: "002", title: "Child A", details: [] },
        { id: "003", title: "Child B", details: [] },
        { id: "004", title: "Grandchild", details: [] }
      ],
      edges: [
        { parentId: "001", childId: "002" },
        { parentId: "001", childId: "003" },
        { parentId: "002", childId: "004" }
      ],
      capped: false
    });

    const OriginalResizeObserver =
      global.ResizeObserver || window.ResizeObserver;
    const ResizeObserverMock = class ResizeObserverMock {
      constructor(callback) {
        this._callback = callback;
      }
      observe() {}
      disconnect() {}
    };
    global.ResizeObserver = ResizeObserverMock;
    window.ResizeObserver = ResizeObserverMock;

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();
    await flushPromises();

    let grandchildEl = element.shadowRoot.querySelector(
      '.hierarchy-explorer_node[data-node-id="004"]'
    );
    expect(grandchildEl.getAttribute("style")).toContain("top:500px;");

    element.relayoutWithHeights({
      "001": 60,
      "002": 150,
      "003": 80,
      "004": 70
    });

    await flushPromises();

    grandchildEl = element.shadowRoot.querySelector(
      '.hierarchy-explorer_node[data-node-id="004"]'
    );
    expect(grandchildEl.getAttribute("style")).toContain("top:350px;");

    global.ResizeObserver = OriginalResizeObserver;
    window.ResizeObserver = OriginalResizeObserver;
  });

  it("does not start panning when pointerdown originates from a node/card", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [{ id: "001", title: "Root", details: [] }],
      edges: [],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const viewport = element.shadowRoot.querySelector(
      ".hierarchy-explorer_viewport"
    );
    viewport.setPointerCapture = jest.fn();

    const node = element.shadowRoot.querySelector(".hierarchy-explorer_node");
    const pointerDown = new CustomEvent("pointerdown", { bubbles: true });
    Object.defineProperty(pointerDown, "button", { value: 0 });
    Object.defineProperty(pointerDown, "pointerId", { value: 1 });
    Object.defineProperty(pointerDown, "clientX", { value: 10 });
    Object.defineProperty(pointerDown, "clientY", { value: 10 });

    node.dispatchEvent(pointerDown);
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();
  });

  it("zooms in when zoom button is clicked", async () => {
    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [{ id: "001", title: "Root", details: [] }],
      edges: [],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const viewport = element.shadowRoot.querySelector(
      ".hierarchy-explorer_viewport"
    );
    const zoomInButton = element.shadowRoot.querySelector(
      'lightning-button-icon[title="Zoom in"]'
    );
    viewport.setPointerCapture = jest.fn();

    const createPointerDown = () => {
      const event = new CustomEvent("pointerdown", { bubbles: true });
      Object.defineProperty(event, "button", { value: 0 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "clientX", { value: 10 });
      Object.defineProperty(event, "clientY", { value: 10 });
      return event;
    };

    viewport.dispatchEvent(createPointerDown());
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(1);

    viewport.setPointerCapture.mockClear();
    zoomInButton.dispatchEvent(createPointerDown());
    expect(viewport.setPointerCapture).not.toHaveBeenCalled();

    const canvas = element.shadowRoot.querySelector(
      ".hierarchy-explorer_canvas"
    );
    const initialStyle = canvas.getAttribute("style");

    zoomInButton.click();
    await flushPromises();

    const updatedStyle = canvas.getAttribute("style");
    expect(updatedStyle).not.toBe(initialStyle);
    expect(updatedStyle).toContain("scale(");
  });

  it("opens record in a new console subtab when running in console navigation", async () => {
    isConsoleNavigation.mockResolvedValue(true);
    getFocusedTabInfo.mockResolvedValue({ tabId: "tab-1" });
    openSubtab.mockResolvedValue("subtab-1");

    getHierarchy.mockResolvedValue({
      rootId: "001",
      nodes: [{ id: "001", title: "Root", details: [] }],
      edges: [],
      capped: false
    });

    const element = buildComponent({
      recordId: "001",
      templateDeveloperName: "MyTemplate"
    });

    await flushPromises();

    const card = element.shadowRoot.querySelector("c-lres-hierarchy-card");
    card.dispatchEvent(
      new CustomEvent("cardtitleclick", {
        detail: { recordId: "001" },
        bubbles: true,
        composed: true
      })
    );

    await flushPromises();

    expect(openSubtab).toHaveBeenCalledWith(
      "tab-1",
      expect.objectContaining({
        recordId: "001",
        actionName: "view",
        focus: true
      })
    );
    expect(openTab).not.toHaveBeenCalled();
  });
});
