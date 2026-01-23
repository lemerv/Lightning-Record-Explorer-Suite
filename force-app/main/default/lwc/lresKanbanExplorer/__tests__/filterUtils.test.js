import { buildFilterDefinitions } from "../filterUtils";

describe("filterUtils.buildFilterDefinitions", () => {
  const records = [
    { status: "New", owner: "u1" },
    { status: "In Progress", owner: "u2" },
    { status: "New", owner: "u3" }
  ];
  const blueprints = [
    { id: "status", field: "status", label: "Status", type: "field" },
    { id: "owner", field: "owner", label: "Owner", type: "field" }
  ];
  const getFilterValueKey = (record, blueprint) => record[blueprint.field];
  const getFilterValueLabel = (_record, _blueprint, fallback) => fallback;
  const sortFilterOptions = (options) =>
    options.sort((a, b) => a.label.localeCompare(b.label));
  const getFilterButtonClass = (id, hasSelection) =>
    `${id}-${hasSelection ? "on" : "off"}`;

  it("builds definitions from blueprints and records", () => {
    const logDebug = jest.fn();
    const { definitions, activeFilterMenuId, shouldCloseMenus } =
      buildFilterDefinitions({
        records,
        blueprints,
        existingDefinitions: [],
        activeFilterMenuId: null,
        getFilterValueKey,
        getFilterValueLabel,
        sortFilterOptions,
        getFilterButtonClass,
        logDebug
      });

    expect(definitions).toHaveLength(2);
    expect(definitions[0].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "In Progress", selected: false }),
        expect.objectContaining({ value: "New", selected: false })
      ])
    );
    expect(definitions[0].buttonClass).toBe("status-off");
    expect(activeFilterMenuId).toBeNull();
    expect(shouldCloseMenus).toBe(false);
    expect(logDebug).toHaveBeenCalled();
  });

  it("preserves previous selections and open state", () => {
    const previousSelection = [
      {
        ...blueprints[0],
        options: [
          { value: "New", label: "New", selected: true },
          { value: "In Progress", label: "In Progress", selected: false }
        ],
        selectedValues: ["New"],
        isOpen: true,
        buttonClass: "status-on"
      }
    ];

    const { definitions, activeFilterMenuId } = buildFilterDefinitions({
      records,
      blueprints,
      existingDefinitions: previousSelection,
      activeFilterMenuId: "status",
      getFilterValueKey,
      getFilterValueLabel,
      sortFilterOptions,
      getFilterButtonClass
    });

    const statusDef = definitions.find((def) => def.id === "status");
    expect(statusDef.selectedValues).toEqual(["New"]);
    expect(statusDef.options.find((opt) => opt.value === "New").selected).toBe(
      true
    );
    expect(statusDef.isOpen).toBe(true);
    expect(statusDef.buttonClass).toBe("status-on");
    expect(activeFilterMenuId).toBe("status");
  });

  it("clears active menu when blueprint is gone", () => {
    const { activeFilterMenuId, shouldCloseMenus } = buildFilterDefinitions({
      records: [],
      blueprints: [],
      existingDefinitions: [],
      activeFilterMenuId: "status",
      getFilterValueKey,
      getFilterValueLabel,
      sortFilterOptions,
      getFilterButtonClass,
      isSortMenuOpen: false
    });

    expect(activeFilterMenuId).toBeNull();
    expect(shouldCloseMenus).toBe(true);
  });
});
