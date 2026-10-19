// Project configuration: one plain JSON document. It is the single source of truth: the UI edits it,
// it is stored in the browser / GitHub as project.json, and the export and add-in read it.

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2) + Date.now().toString(16)).replaceAll("-", "");

export const TEST_TYPES = ["Hard", "HardConservative", "Clearance", "Duplicates"];
export const OPERATORS = ["Equals", "NotEquals", "Contains", "NotContains", "BeginsWith", "EndsWith",
  "GreaterThan", "GreaterOrEqual", "LessThan", "LessOrEqual", "Defined", "Undefined"];

export const defaultOptions = () => ({ selfIntersectA: false, selfIntersectB: false, mergeComposites: true, description: null, group: null, priority: null });

export function newConfig(name = "New project") {
  return {
    schemaVersion: 1,
    projectId: uid(),
    name,
    targetNavisworksVersion: "2026",
    generation: { mode: "Symmetric", ignoreDiagonal: true },
    naming: {
      projectCode: "", separator: "-", searchSetPattern: "{disc}{sep}{system}", testPattern: "{A} vs {B}", zone: null,
      disciplinePrefixes: {}, disciplineOrder: [], maxNameLength: 120, forbiddenCharacters: "/\\",
    },
    tolerances: { projectDefault: { value: "0", unit: "Millimeters" }, disciplineDefaults: {}, pairDefaults: [] },
    matrix: { sourceFileName: "", sheetName: "", systems: [], rowSystemIds: [], columnSystemIds: [], cells: [], importIssues: [] },
    codeMappings: [],
    // Starter profiles carry no tolerance, so they inherit from the tolerance hierarchy. No project value is invented.
    profiles: [
      { id: "profile-hard", name: "Hard", testType: "Hard", tolerance: null, options: defaultOptions() },
      { id: "profile-clearance", name: "Clearance", testType: "Clearance", tolerance: null, options: defaultOptions() },
    ],
    searchSets: [],
    clashTests: [],
  };
}

export const newCondition = () => ({ id: uid(), category: "Item", property: "Name", categoryInternal: null, propertyInternal: null, operator: "Contains", value: "", valueKind: "String", exclude: false, isPlaceholder: false });
export const newSearchSet = (name = "New search set") => ({
  id: uid(), name, systemId: null, folder: null, root: { mode: "All", conditions: [newCondition()], groups: [] },
  status: { syntacticallyValid: false, representable: false, modelVerified: false, modelHitCount: null }, nativeObjectId: null,
});
