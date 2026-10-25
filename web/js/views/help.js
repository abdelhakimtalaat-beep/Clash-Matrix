import { h } from "../ui.js";

const STEPS = [
  ["Create or open a project", "On the Projects page, type a name and press Create, or press Open on an existing project."],
  ["Import the matrix (Import tab)", "Press “Use default file (ECG)” or “Choose another file” to pick your own Excel matrix, select the sheet, then press Import."],
  ["Check the matrix (Matrix tab)", "Cells are colored by their code. You can edit cells, add rows or columns, and paste from Excel. Use the LOD boxes and the discipline boxes to show only part of the matrix; “Show all” clears the filters. “Export PNG” saves the matrix as an image."],
  ["Review the codes (Codes tab)", "Each code gets its Clash Type from its last letter (H = Hard, C = Clearance, D = Duplicates). Untick “Generate?” for a code that should not create tests."],
  ["Add the search sets (Search sets tab)", "Press “Add search sets” and choose ECG-Views or ECG-NWC. The sets are linked to the matrix systems by name, and are filled in as Selection A and B of every test automatically. You can open any set and edit its conditions."],
  ["Generate the tests (Tests tab)", "Press “Generate tests”. Every test is created or updated from the matrix, so run it again after any change to the matrix or the codes."],
  ["Adjust the tests (Tests tab)", "Use the filters (Default Assignee, Priority, Tolerance, Clash Type) to find tests, tick the ones you want, then set Tolerance or Priority for all of them at once, or Enable / Disable them. Disabled tests are not exported."],
  ["Validate (Validation tab)", "Fix every Error shown here. Warnings and info messages do not block the export."],
  ["Export (Export tab)", "Choose the Navisworks version (2027 or later, or 2026 or older), then download ClashTests.xml. SearchSets.xml is optional."],
  ["Use the file in Navisworks", "Open Clash Detective, choose Import, and select ClashTests.xml. The file stays marked “Unverified” until you have imported it in Navisworks and checked the tests."],
];

export default function render(root) {
  root.append(h("h2", {}, "How to use this platform"),
    h("div", { class: "card" }, h("ol", { class: "steps" }, STEPS.map(([title, text]) => h("li", {}, h("b", {}, title), h("br"), text)))),
    h("div", { class: "card" }, h("p", { class: "Info" }, "Optional: the Team tab lets you add people to the project, Activity shows who changed what and lets you save named versions, and Naming holds the naming rules for tests.")));
}
