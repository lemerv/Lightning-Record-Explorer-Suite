import { LightningElement, api } from "lwc";

export default class KanbanBoardActions extends LightningElement {
  @api filtersAvailable = false;
  @api filterDefinitions = [];
  @api clearFiltersDisabled = false;
  @api searchAvailable = false;
  @api searchValue = "";
  @api sortFieldOptions = [];
  @api sortButtonClass = "filter-dropdown_button sort-dropdown_button";
  @api isSortMenuOpen = false;
  @api selectedSortLabel = "Sort";
  @api sortDirectionIcon = "utility:arrowup";
  @api sortDirectionAltText = "";
  @api refreshButtonDisabled = false;

  get hasSortOptions() {
    return (
      Array.isArray(this.sortFieldOptions) && this.sortFieldOptions.length > 0
    );
  }

  get resolvedSortButtonClass() {
    const base =
      this.sortButtonClass || "filter-dropdown_button sort-dropdown_button";
    if (
      this.isSortMenuOpen &&
      !base.includes("filter-dropdown_button--active")
    ) {
      return `${base} filter-dropdown_button--active`.trim();
    }
    return base;
  }

  @api
  focusWithin(selector) {
    if (!selector) {
      return;
    }
    const element = this.template?.querySelector(selector);
    element?.focus?.();
  }

  handleClearFiltersClick(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("clearfilters", {
        bubbles: true,
        composed: true
      })
    );
  }

  handleSearchInput(event) {
    event.stopPropagation();
    const value = event.detail?.value ?? event.target?.value ?? "";
    if (
      event.type === "change" &&
      this._lastSearchDispatchType === "input" &&
      value === this._lastSearchDispatchValue
    ) {
      return;
    }
    this._lastSearchDispatchType = event.type;
    this._lastSearchDispatchValue = value;
    this.dispatchEvent(
      new CustomEvent("searchinput", {
        detail: { value },
        bubbles: true,
        composed: true
      })
    );
  }

  handleSortMenuToggle(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("sortmenutoggle", {
        bubbles: true,
        composed: true
      })
    );
  }

  handleSortMenuClick(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("sortmenuclick", {
        bubbles: true,
        composed: true
      })
    );
  }

  handleSortMenuKeydown(event) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
    }
    this.dispatchEvent(
      new CustomEvent("sortmenukeydown", {
        detail: { key: event.key },
        bubbles: true,
        composed: true
      })
    );
  }

  handleSortOptionChange(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("sortoptionchange", {
        detail: {
          value: event.target?.value ?? event.target?.dataset?.sortValue
        },
        bubbles: true,
        composed: true
      })
    );
  }

  handleSortDirectionToggle(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("sortdirectiontoggle", {
        bubbles: true,
        composed: true
      })
    );
  }

  handleManualRefresh(event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("manualrefresh", {
        bubbles: true,
        composed: true
      })
    );
  }
}
