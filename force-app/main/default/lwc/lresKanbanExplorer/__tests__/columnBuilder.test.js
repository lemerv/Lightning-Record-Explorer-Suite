import { buildColumns, BLANK_KEY } from "../columnBuilder";

describe("columnBuilder.buildColumns", () => {
  const baseOptions = {
    groupingField: "Status",
    cardFields: ["Title", "Detail"],
    defaultTitleField: "Title",
    blankGroupLabel: "No Status",
    blankKey: BLANK_KEY,
    metadataColumns: [
      { key: "A", label: "Active", rawValue: "A" },
      { key: "B", label: "Backlog", rawValue: "B" }
    ],
    isGroupingFieldOptional: true,
    sortField: "Title",
    fallbackSortField: "Title",
    sortDirection: "asc",
    extractFieldData: (record, field) => ({
      raw: record[field],
      display: record[field]
    }),
    extractFieldValue: (record, field) => record[field],
    extractSimpleFieldName: (field) => field,
    getFieldLabel: (field) => `${field} Label`,
    parseIconEntry: () => ({ iconName: null, emoji: null }),
    sanitizeFieldOutput: (value) => value,
    getFieldMetadata: () => null,
    getUiPicklistValues: () => null,
    shouldDisplayParentReferenceOnCards: true,
    getRecordParentLabel: (record) => record.parentName,
    parentBadgeLabel: "Parent"
  };

  it("builds ordered columns, injects blank column, and adds parent badge", () => {
    const records = [
      {
        id: "1",
        Status: "A",
        Title: "Alpha",
        Detail: "One",
        parentName: "Parent A"
      },
      { id: "2", Status: null, Title: "Beta", Detail: "Two" }
    ];

    const columns = buildColumns(records, baseOptions);
    expect(columns.map((col) => col.key)).toEqual(["A", "B", BLANK_KEY]);
    expect(columns.find((col) => col.key === "A").count).toBe(1);
    expect(columns.find((col) => col.key === BLANK_KEY).label).toBe(
      "No Status"
    );

    const card = columns.find((col) => col.key === "A").records[0];
    const parentBadge = card.details.find((detail) => detail.isParentBadge);
    expect(parentBadge).toBeDefined();
    expect(parentBadge.label).toBe("Parent");
    expect(parentBadge.value).toBe("Parent A");
  });

  it("sorts entries within a column using picklist order", () => {
    const options = {
      ...baseOptions,
      groupingField: "Bucket",
      sortField: "Status",
      fallbackSortField: "Title",
      metadataColumns: [],
      getFieldMetadata: (field) => {
        if (field === "Status") {
          return {
            dataType: "Picklist",
            picklistValues: [
              { value: "In Progress" },
              { value: "New" },
              { value: "Closed" }
            ]
          };
        }
        return null;
      }
    };

    const records = [
      { id: "1", Bucket: "X", Status: "Closed", Title: "Zeta", Detail: "One" },
      { id: "2", Bucket: "X", Status: "New", Title: "Alpha", Detail: "Two" },
      {
        id: "3",
        Bucket: "X",
        Status: "In Progress",
        Title: "Beta",
        Detail: "Three"
      }
    ];

    const columns = buildColumns(records, options);
    const lane = columns.find((col) => col.key === "X");
    expect(lane.records.map((card) => card.id)).toEqual(["3", "2", "1"]);
  });

  it("skips records not included by predicate", () => {
    const options = {
      ...baseOptions,
      isRecordIncluded: (record) => record.Status === "A"
    };
    const records = [
      { id: "1", Status: "A", Title: "Alpha", Detail: "One" },
      { id: "2", Status: "B", Title: "Beta", Detail: "Two" }
    ];

    const columns = buildColumns(records, options);
    const activeColumn = columns.find((col) => col.key === "A");
    expect(activeColumn.count).toBe(1);
    const backlogColumn = columns.find((col) => col.key === "B");
    expect(backlogColumn.count).toBe(0);
  });

  it("builds column summaries using provided aggregations", () => {
    const options = {
      ...baseOptions,
      summaryDefinitions: [
        { fieldApiName: "Amount", summaryType: "SUM", label: "Total" },
        { fieldApiName: "Amount", summaryType: "AVG", label: "Average" },
        { fieldApiName: "Amount", summaryType: "MIN", label: "Minimum" }
      ],
      coerceSummaryValue: (record, summary) => record[summary.fieldApiName],
      formatSummaryValue: (_summary, value) => {
        if (value === null || value === undefined) {
          return "";
        }
        return String(value);
      },
      getSummaryCurrencyCode: () => null
    };
    const records = [
      { id: "1", Status: "A", Title: "Alpha", Detail: "One", Amount: 10 },
      { id: "2", Status: "A", Title: "Beta", Detail: "Two", Amount: 20 }
    ];

    const columns = buildColumns(records, options);
    const column = columns.find((col) => col.key === "A");
    expect(column.summaries).toEqual([
      { key: "Amount|SUM|Total", label: "Total", value: "30" },
      { key: "Amount|AVG|Average", label: "Average", value: "15" },
      { key: "Amount|MIN|Minimum", label: "Minimum", value: "10" }
    ]);
  });
});
