// Property names seen in one genuine Navisworks 2026 export (Revit-sourced model). Values are learned by importing a Navisworks XML.
const S = (category, categoryInternal, property, propertyInternal) => ({ category, categoryInternal, property, propertyInternal, n: 0, values: [] });
export const CATALOG_SEED = [
  S("Element", "LcSvf_Element", "Category", "LcRevitData_Element:LcRevitPropertyElementCategory"),
  S("Element", "LcSvf_Element", "Name", "LcRevitData_Element:LcRevitPropertyElementName"),
  S("Element", "LcSvf_Element", "Type", "LcRevitData_Element:LcRevitPropertyElementType"),
  S("Element", "LcSvf_Element", "System Name", "LcRevitData_Element:lcldrevit_parameter_-1140324"),
  S("Element", "LcRevitData_Element", "Width", "lcldrevit_parameter_-1001301"),
  S("Element", "LcRevitData_Element", "Duct Width", "lcldrevit_parameter_Duct Width_PG_GEOMETRY"),
  S("Element", "LcRevitData_Element", "Diameter", "lcldrevit_parameter_-1140225"),
  S("Element", "LcRevitData_Element", "Nominal Diameter", "lcldrevit_parameter_Nominal Diameter_PG_GEOMETRY"),
  S("Document", "LcSvf_Document", "Title", "Document:Title"),
  S("Identity Data", "LcSvf_Identity Data", "Type Name", "Type Name"),
  S("Identity Data", "LcSvf_Identity Data", "Comments", "Comments"),
];
