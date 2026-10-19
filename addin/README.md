# Navisworks add-in (اختياري / optional) — UNTESTED SKELETON

الهدف: قراءة `project.json` وإنشاء Search Sets و Clash Tests مباشرة داخل Navisworks عبر الـ API، والتحقق من عدد العناصر الفعلي لكل مجموعة بحث.

**الحالة:** كُتب من الذاكرة دون Navisworks ولا .NET SDK. لم يُترجم ولم يُشغَّل. أسماء الـ API (`Autodesk.Navisworks.Api`, `DocumentClash`, `SearchCondition`, `SelectionSourceCollection`...) يجب مراجعتها مع SDK الإصدار 2026 قبل الاعتماد عليها.

Purpose: read project.json, create sets/tests natively, and report real hit counts (the only way a search set becomes "model verified").

Steps once you have Visual Studio + Navisworks 2026 SDK:
1. New .NET class library, reference Autodesk.Navisworks.Api / Autodesk.Navisworks.Clash dlls from the install folder.
2. Implement a `[Plugin("BimClashMatrix","ADSK")] [AddInPlugin(AddInLocation.AddIn)]` command that opens project.json (System.Text.Json), builds each `Search` from `searchSets[].root.conditions`, saves to `doc.SelectionSets`, then counts `search.FindAll(doc, false).Count`.
3. For tests: use `DocumentClash.TestsData.TestsAddCopy(...)` with `ClashTest` properties from `clashTests[]`.
4. Write results back to `project.json` fields `status.modelHitCount` / `modelVerified`.
Nothing here is verified; treat as a to-do, not a deliverable.
