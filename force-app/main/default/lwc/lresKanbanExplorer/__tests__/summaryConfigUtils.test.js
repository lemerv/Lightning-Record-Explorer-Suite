import {
  parseSummaryDefinitions,
  normalizeSummaryType
} from "../summaryConfigUtils";

describe("summaryConfigUtils.parseSummaryDefinitions", () => {
  it("parses entries with trimming and case-insensitive types", () => {
    const { summaries, warnings } = parseSummaryDefinitions(
      "[ Amount | sum | Sum of amount ]; [Amount|AVG|Average amount]"
    );

    expect(warnings).toHaveLength(0);
    expect(summaries).toEqual([
      { fieldApiName: "Amount", summaryType: "SUM", label: "Sum of amount" },
      { fieldApiName: "Amount", summaryType: "AVG", label: "Average amount" }
    ]);
  });

  it("ignores empty entries", () => {
    const { summaries, warnings } = parseSummaryDefinitions(
      ";[Amount|SUM|Total];"
    );

    expect(warnings).toHaveLength(0);
    expect(summaries).toEqual([
      { fieldApiName: "Amount", summaryType: "SUM", label: "Total" }
    ]);
  });

  it("returns warnings for malformed entries", () => {
    const { summaries, warnings } = parseSummaryDefinitions("[Amount|SUM]");

    expect(summaries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it("limits to three summaries", () => {
    const { summaries, warnings } = parseSummaryDefinitions(
      "[A|SUM|A];[B|AVG|B];[C|MIN|C];[D|MAX|D]"
    );

    expect(summaries).toHaveLength(3);
    expect(warnings).toContain("Only the first 3 summaries are used.");
  });

  it("flags unsupported summary types", () => {
    const { summaries, warnings } = parseSummaryDefinitions(
      "[Amount|MEDIAN|Median]"
    );

    expect(summaries).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });
});

describe("summaryConfigUtils.normalizeSummaryType", () => {
  it("normalizes supported types", () => {
    expect(normalizeSummaryType("sum")).toBe("SUM");
  });

  it("returns null for unsupported types", () => {
    expect(normalizeSummaryType("median")).toBeNull();
  });
});
