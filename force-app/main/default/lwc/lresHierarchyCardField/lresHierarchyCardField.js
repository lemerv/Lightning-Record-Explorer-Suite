import { LightningElement, api } from "lwc";

export default class HierarchyCardField extends LightningElement {
  @api detail;
  @api showLabel = false;

  get isParentBadge() {
    return Boolean(this.detail?.isParentBadge);
  }

  get wrapperClass() {
    return this.detail?.className || "hierarchy-card_field";
  }
}
