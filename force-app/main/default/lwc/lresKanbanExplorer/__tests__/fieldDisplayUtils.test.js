jest.mock("@salesforce/i18n/currency", () => ({ default: "USD" }), {
  virtual: true
});

import {
  extractFieldData,
  formatFieldDisplayValue,
  getFieldLabel,
  qualifyFieldName
} from "c/lresFieldDisplayUtils";

describe("fieldDisplayUtils.getFieldLabel", () => {
  it("renders nested lookup paths with all segments", () => {
    const component = {
      cardObjectApiName: "Project_Task__c",
      objectInfo: {
        fields: {
          Project__c: {
            relationshipName: "Project__r",
            referenceToInfos: [{ apiName: "Project__c", label: "Project" }]
          },
          OwnerId: {
            relationshipName: "Owner",
            label: "Owner"
          }
        }
      }
    };

    const field = qualifyFieldName(component, "Project__r.Owner.Name");

    expect(getFieldLabel(component, field)).toBe(
      "Project \u2192 Owner \u2192 Name"
    );
  });
});

describe("fieldDisplayUtils.formatFieldDisplayValue", () => {
  const component = {
    objectInfo: {
      fields: {
        Amount: { dataType: "Currency", scale: 2 },
        Discount: { dataType: "Percent", scale: 0 },
        Quantity: { dataType: "Double", scale: 3 }
      }
    },
    effectiveDateTimeFormat: null,
    patternTokenCache: new Map()
  };

  it("formats currency values with locale defaults", () => {
    const record = {
      fields: {
        CurrencyIsoCode: { value: "USD" }
      }
    };
    const result = formatFieldDisplayValue(
      component,
      "Amount",
      10000,
      "10000",
      record
    );
    expect(result).toBe("$10,000.00");
  });

  it("formats percent values with numeric normalization", () => {
    const result = formatFieldDisplayValue(component, "Discount", 25, "25", {});
    expect(result).toBe("25%");
  });

  it("formats number values using field scale", () => {
    const result = formatFieldDisplayValue(
      component,
      "Quantity",
      12.3,
      "12.3",
      {}
    );
    expect(result).toBe("12.300");
  });

  it("keeps formatted display values when provided", () => {
    const result = formatFieldDisplayValue(
      component,
      "Amount",
      10000,
      "$10,000.00",
      {}
    );
    expect(result).toBe("$10,000.00");
  });
});

describe("fieldDisplayUtils.extractFieldData", () => {
  it("serves cached values when present and falls back when cache is absent", () => {
    const component = {
      cardObjectApiName: "Opportunity",
      objectInfo: { fields: { Name: { dataType: "String" } } },
      effectiveDateTimeFormat: null,
      patternTokenCache: new Map(),
      _fieldDataCache: new Map()
    };
    const record = {
      id: "001",
      fields: {
        "Opportunity.Name": {
          value: "First Deal",
          displayValue: "First Deal"
        }
      }
    };

    const initial = extractFieldData(component, record, "Opportunity.Name");
    record.fields["Opportunity.Name"].value = "Updated Deal";
    record.fields["Opportunity.Name"].displayValue = "Updated Deal";

    const cached = extractFieldData(component, record, "Opportunity.Name");
    expect(cached.display).toBe(initial.display);
    expect(cached.display).toBe("First Deal");

    component._fieldDataCache = null;
    const fresh = extractFieldData(component, record, "Opportunity.Name");
    expect(fresh.display).toBe("Updated Deal");
  });
});
