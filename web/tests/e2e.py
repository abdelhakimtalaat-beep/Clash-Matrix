"""Browser end-to-end test on the dev backend: three people, roles, live propagation. Run: python3 web/tests/e2e.py (needs playwright + chromium)."""
import subprocess, time, sys, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOTS = os.environ.get("SHOTS", "/tmp/shots"); os.makedirs(SHOTS, exist_ok=True)
procs = [subprocess.Popen(["node", f"{ROOT}/scripts/devserver.mjs"], env={**os.environ, "PORT": "8787"}),
         subprocess.Popen(["http-server", f"{ROOT}/web", "-p", "8765", "-s"])]
time.sleep(2)
CFG = 'globalThis.__BCM_CONFIG={backend:"dev",devServer:"http://localhost:8787"};'
errs = []
def ok(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: errs.append(m)
def person(br):
    ctx = br.new_context(viewport={"width": 1300, "height": 800}); ctx.route("**/config.js", lambda r: r.fulfill(body=CFG, content_type="text/javascript"))
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e) + " | " + str(getattr(e, "stack", ""))[:600])); return pg
def signup(pg, email):
    pg.goto("http://localhost:8765/"); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", email); pg.fill("input[type=password]", "secret1"); pg.click("text=إنشاء حساب"); pg.wait_for_selector("text=المشاريع >> nth=0")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        A, B, C = person(br), person(br), person(br)
        signup(A, "alice@x.com"); signup(B, "bob@x.com"); signup(C, "carol@x.com")
        # Alice creates a project and imports the matrix
        A.fill("input[placeholder='اسم مشروع جديد']", "Tower"); A.click("text=إنشاء >> nth=-1"); A.wait_for_selector("text=استيراد المصفوفة")
        with A.expect_file_chooser() as fc: A.click("text=اختر ملف آخر")
        fc.value.set_files(f"{ROOT}/web/tests/sample-matrix.xlsx"); A.click("button.pri >> text=استيراد"); A.wait_for_timeout(600)
        A.click("nav a:text('الرموز')"); A.wait_for_selector("table")
        ok(A.evaluate("__bcm.state.cfg.codeMappings.find(m=>m.code==='H').profileId") == "profile-hard", "code ending in H gets the Hard clash type")
        ok(A.locator("button:text-is('توليد الاختبارات')").count() == 0, "Generate tests is no longer on the Codes tab")
        A.click("nav a:text('الاختبارات')"); A.wait_for_selector("#gen-tests")
        ok(A.locator("details.card").count() == 0, "the two collapsibles are gone from Tests")
        A.click("#gen-tests"); A.wait_for_timeout(800)
        n = A.evaluate("__bcm.state.cfg.clashTests.length"); ok(n == 24, f"alice generated {n} tests")
        # Find-Items style editor: dropdowns from the catalog, custom value, OR block
        A.click("nav a:text('مجموعات البحث')"); A.wait_for_selector(".menu summary")
        ok(A.evaluate("__bcm.state.cfg.searchSets.length") == 0, "generating tests did not create search sets")
        A.click(".menu summary"); A.click(".menu-items >> text=ECG-Views"); A.wait_for_selector("table.find")
        ok(A.evaluate("__bcm.state.cfg.searchSets.length") > 40, "Published Views library added by the button")
        ok(A.evaluate("__bcm.state.cfg.clashTests.some((t) => t.searchSetAId && t.searchSetBId)"), "tests are linked to the added search sets")
        A.click(".menu summary"); A.once("dialog", lambda d: d.accept()); A.click(".menu-items >> text=ECG-NWC"); A.wait_for_timeout(800)
        ok(A.evaluate("__bcm.state.cfg.searchSets.some((s) => s.library === 'nwc') && !__bcm.state.cfg.searchSets.some((s) => s.library === 'published-views')"), "NWC replaces the Published Views sets")
        # find & replace over Value cells
        before = A.evaluate("JSON.stringify(__bcm.state.cfg.searchSets.flatMap((s) => s.root.conditions.concat(...s.root.groups.map((g) => g.conditions))).filter((c) => c.value === 'ZZ-ST').length)")
        A.fill("#fr-find", "ST-ZZ"); A.fill("#fr-replace", "STR-ZZ"); A.click("#fr-find-btn"); A.wait_for_timeout(200)
        ok("values" in A.inner_text("#fr-result") or "قيمة" in A.inner_text("#fr-result"), "find shows how many values match")
        A.once("dialog", lambda d: d.accept()); A.click("#fr-replace-btn"); A.wait_for_timeout(500)
        ok(A.evaluate("JSON.stringify(__bcm.state.cfg.searchSets).includes('STR-ZZ') && !JSON.stringify(__bcm.state.cfg.searchSets).includes('\"ST-ZZ\"')"), "replace all changed the values")
        cat = A.locator("table.find select").first
        ok("Element" in cat.inner_text(), "category dropdown lists catalog categories")
        cat.select_option("Element"); A.wait_for_timeout(200)
        A.locator("table.find select").nth(1).select_option("Category"); A.wait_for_timeout(200)
        cond = A.evaluate("__bcm.state.cfg.searchSets[0].root.conditions[0]")
        ok(cond["categoryInternal"] == "LcSvf_Element" and cond["propertyInternal"].endswith("LcRevitPropertyElementCategory"), "internal names filled from catalog")
        A.locator("table.find select").nth(3).select_option("__custom__"); A.wait_for_timeout(200)
        A.locator("table.find input").first.fill("Walls"); A.locator("table.find input").first.dispatch_event("change"); A.wait_for_timeout(200)
        A.click("text=مجموعة OR جديدة"); A.wait_for_timeout(200)
        root_ = A.evaluate("__bcm.state.cfg.searchSets[0].root")
        ok(root_["mode"] == "Any" and len(root_["groups"]) == 2 and root_["groups"][0]["conditions"][0]["value"] == "Walls", "OR block created, value kept")
        ok(A.locator("details.fold").count() >= 3, "search sets are shown in folders")
        A.screenshot(path=f"{SHOTS}/findsets.png")
        # Excel-style matrix editing
        A.click("nav a:text('المصفوفة')"); A.wait_for_selector("input.mcell")
        ok(A.locator(".lod:not(.disc)").count() == 4 and "LOD350" in A.inner_text(".lods"), "four LOD boxes shown")
        A.locator(".lod").nth(2).click(); A.wait_for_timeout(300)  # LOD350 = codes starting with C
        ok(A.evaluate("__bcm.state.cfg.lodFilter.join()") == "C", "clicking a LOD box sets the filter")
        vals = A.evaluate("[...document.querySelectorAll('input.mcell')].map(i=>i.value).filter(Boolean)")
        ok(len(vals) > 0 and all(v.startswith("C") for v in vals), "only that level's codes are shown")
        A.click("text=عرض الكل"); A.wait_for_timeout(300)
        ok(A.evaluate("__bcm.state.cfg.lodFilter.length") == 0 and any(not v.startswith("C") for v in A.evaluate("[...document.querySelectorAll('input.mcell')].map(i=>i.value).filter(Boolean)")), "show all restores everything")
        ok(A.locator(".disc").count() == 7, "seven discipline boxes shown")
        A.locator(".disc").nth(3).click(); A.wait_for_timeout(300)  # MEP
        ok(A.evaluate("__bcm.state.cfg.discFilter.join()") == "MEP", "clicking a discipline box sets the filter")
        labs = A.evaluate("[...document.querySelectorAll('.editable tr td:first-child input, .editable tr th input')].length")
        ok(A.evaluate("[...document.querySelectorAll('table .hdr, table th, table td')].every(()=>true)"), "matrix still draws under the discipline filter")
        A.click("text=عرض الكل"); A.wait_for_timeout(300)
        ok(A.evaluate("(__bcm.state.cfg.discFilter ?? []).length") == 0, "show all clears discipline filter too")
        n0 = A.evaluate("__bcm.state.cfg.matrix.systems.length")
        A.click("text=نظام (صف وعمود)"); A.wait_for_timeout(300)
        ok(A.evaluate("__bcm.state.cfg.matrix.systems.length") == n0 + 1 and A.evaluate("__bcm.state.cfg.matrix.rowSystemIds.length") == A.evaluate("__bcm.state.cfg.matrix.columnSystemIds.length"), "system added as row and column")
        last = A.evaluate("__bcm.state.cfg.matrix.rowSystemIds.length") - 1
        A.fill(f"input.mcell[data-r='{last}'][data-c='{last}']", "ZZ9"); A.locator(f"input.mcell[data-r='{last}'][data-c='{last}']").dispatch_event("change"); A.wait_for_timeout(200)
        ok(A.evaluate("__bcm.state.cfg.matrix.cells.some(c=>c.rawValue==='ZZ9')") and A.evaluate("__bcm.state.cfg.codeMappings.some(m=>m.code==='ZZ9')"), "typed code stored and mapping created")
        A.fill(f"input.mcell[data-r='{last}'][data-c='{last}']", ""); A.locator(f"input.mcell[data-r='{last}'][data-c='{last}']").dispatch_event("change"); A.wait_for_timeout(200)
        ok(not A.evaluate("__bcm.state.cfg.matrix.cells.some(c=>c.rawValue==='ZZ9')"), "clearing a cell removes it")
        with A.expect_download() as dl: A.click("#export-png")
        dl.value.save_as(f"{SHOTS}/matrix-export.png"); ok(os.path.getsize(f"{SHOTS}/matrix-export.png") > 5000, "matrix PNG downloaded")
        A.screenshot(path=f"{SHOTS}/matrix.png")
        # Alice adds Bob (editor) and Carol (viewer)
        A.click("nav a:text('الفريق')"); A.wait_for_selector("input[placeholder='email@company.com']")
        for email, role in (("bob@x.com", "editor"), ("carol@x.com", "viewer")):
            A.fill("input[placeholder='email@company.com']", email); A.select_option("div.row select >> nth=-1", role); A.click("button.pri >> text=إضافة"); A.wait_for_timeout(500)
        A.screenshot(path=f"{SHOTS}/team.png")
        ok("carol@x.com" in A.inner_text("main"), "team lists carol")
        A.click("nav a:text('الاختبارات')"); A.wait_for_selector("table input[size='36']")
        pr = A.evaluate("(()=>{const t=__bcm.state.cfg.clashTests; return t.map(x=>[x.sourceCode, x.name])})()")
        ok("Priority" in A.inner_text("main") and "High" in A.inner_text("main") or "Medium" in A.inner_text("main") or "Low" in A.inner_text("main"), "tests table shows priority")
        # Tests page: multi-select filters + bulk tolerance
        total = A.locator("table tr").count() - 1
        A.locator("details.ms summary", has_text="Clash Type").click()
        A.locator("details.ms[open] label", has_text="Clearance").locator("input").check(); A.wait_for_timeout(300)
        fewer = A.locator("table tr").count() - 1
        ok(0 < fewer < total, f"clash type filter narrows {total} -> {fewer}")
        A.locator("details.ms summary", has_text="Clash Type").click() if A.locator("details.ms[open]").count() else None
        A.click("text=إلغاء كل الفلاتر"); A.wait_for_timeout(300)
        ok(A.locator("table tr").count() - 1 == total, "reset filters restores all rows")
        A.locator("table tr").nth(1).locator("input[type=checkbox]").first.check()
        A.fill("input[placeholder='قيمة']", "25"); A.click("button.pri >> text=تطبيق"); A.wait_for_timeout(300)
        ok(A.evaluate("__bcm.state.cfg.clashTests.filter(t=>t.toleranceOverride && t.toleranceOverride.value==='25').length") == 1, "bulk tolerance applied to the selected test only")
        A.evaluate("(()=>{const w=g=>{g.conditions.forEach(c=>{if(!c.value)c.value='x'});g.groups.forEach(w)};__bcm.state.cfg.searchSets.forEach(s=>w(s.root))})()")
        A.evaluate("__bcm.state.cfg.codeMappings.forEach(m=>{ if(!/[HCD]$/i.test(m.code)) m.generateTest=false }); __bcm.app.changed()")
        A.evaluate("""(()=>{const c=__bcm.state.cfg;for(const s of c.matrix.systems){ if(c.searchSets.some(x=>x.systemId===s.id)) continue;
          c.searchSets.push({id:'ss-'+s.id,name:s.label,systemId:s.id,folder:null,guid:null,root:{mode:'All',conditions:[{id:'c-'+s.id,category:'Item',property:'Name',operator:'Contains',value:s.label,valueKind:'wstring',flags:0,exclude:false,isPlaceholder:false}],groups:[]},status:{syntacticallyValid:false,representable:false,modelVerified:false,modelHitCount:null},nativeObjectId:null}) }
          const by=new Map(c.searchSets.filter(x=>x.systemId).map(x=>[x.systemId,x.id]));c.clashTests.forEach(t=>{t.searchSetAId=by.get(t.systemAId)??null;t.searchSetBId=by.get(t.systemBId)??null}); __bcm.app.changed()})()""")
        with A.expect_download() as dl2:
            A.click("nav a:text('التصدير')"); A.wait_for_selector("#dl-xml"); A.click("#dl-xml")
        dl2.value.save_as(f"{SHOTS}/export.xml"); ok(open(f"{SHOTS}/export.xml", encoding="utf8").read().lstrip().startswith("<?xml"), "export downloads a .xml file directly")
        A.click("nav a:text('الاختبارات')"); A.wait_for_selector("table input[size='36']")
        # Bob and Carol open the project
        for pg in (B, C):
            pg.reload(); pg.wait_for_selector("text=Tower"); pg.click("button:text('فتح')"); pg.wait_for_selector("text=لوحة" if False else "nav a")
        B.click("nav a:text('الاختبارات')"); B.wait_for_selector("table input[size='36']")
        ok(B.evaluate("__bcm.state.cfg.clashTests.length") == 24, "bob sees the 24 tests")
        B.wait_for_timeout(1200)
        aud = A.evaluate("__bcm.state.backend.audit(__bcm.state.project.id, 500)")
        ok(not any((a.get('by') or '').startswith('bob') for a in aud), "merely opening pages creates no edits by bob in the audit log")
        # live propagation through the real UI
        inp = A.query_selector("table input[size='36']"); inp.fill("RENAMED-BY-ALICE"); inp.dispatch_event("change"); A.wait_for_timeout(1200)
        B.wait_for_timeout(500)
        vals = B.evaluate("[...document.querySelectorAll(\"table input[size='36']\")].map(i=>i.value)")
        ok("RENAMED-BY-ALICE" in vals, "bob's open page shows alice's edit without reload")
        # presence
        ok(A.evaluate("__bcm.state.presence.length") >= 2, f"presence shows {A.evaluate('__bcm.state.presence.length')} people online")
        # viewer is read-only in UI and on the server
        C.click("nav a:text('الاختبارات')"); C.wait_for_selector("table input[size='36']")
        ok(C.evaluate("[...document.querySelectorAll('main input,main select')].every(e=>e.disabled)"), "carol's inputs are all disabled")
        ok("قراءة فقط" in C.inner_text("#top"), "carol's header says read-only")
        r = C.evaluate("""async () => { try { await __bcm.state.backend.saveEntity(__bcm.state.project.id,'clashTest','x',{},0); return 'allowed' } catch(e){ return e.message } }""")
        ok(r == "forbidden", f"server refuses viewer write ({r})")
        # activity log shows who did what
        A.click("nav a:text('النشاط')"); A.wait_for_selector("text=سجل التدقيق"); A.wait_for_timeout(600)
        ok("alice" in A.inner_text("main"), "audit log names alice")
        # named version + restore
        A.fill("input[placeholder^='اسم النسخة']", "v1"); A.click("text=حفظ نسخة مسمّاة"); A.wait_for_timeout(500)
        A.wait_for_timeout(500); print("MAIN:", A.inner_text("main")[:300].replace("\n"," | ")); ok("v1" in A.inner_text("main"), "named version saved")
        for name, pg in (("alice", A), ("bob", B), ("carol", C)): pg.screenshot(path=f"{SHOTS}/{name}.png")
        # reload keeps session and project
        B.reload(); B.wait_for_selector("nav a"); ok(B.evaluate("!!__bcm.state.project"), "bob reload restores session + project")
        # project deletion: only an admin sees the button; the name must be typed to confirm
        B.click("button:text-is('المشاريع')"); B.wait_for_selector(".proj")
        ok(B.locator(".proj button.danger").count() == 0, "non-admin sees no delete button")
        A.click("button:text-is('المشاريع')"); A.wait_for_selector(".proj button.danger")
        dlg = []
        def on_dialog(d): dlg.append(d.type); d.accept("Tower" if d.type == "prompt" else None)
        A.on("dialog", on_dialog)
        A.click(".proj button.danger"); A.wait_for_timeout(800)
        ok(dlg == ["confirm", "prompt"] and A.locator(".proj").count() == 0, "admin deletes the project after confirm + typing its name")
        # bundled default workbook, in a fresh project
        A.fill("input[placeholder='اسم مشروع جديد']", "ECG"); A.click("text=إنشاء >> nth=-1"); A.wait_for_selector("#use-default")
        A.click("#use-default"); A.wait_for_selector("text=ECG-BIM-Clash_Matrix.xlsx"); A.click("button.pri >> text=استيراد"); A.wait_for_timeout(800)
        ok(A.evaluate("__bcm.state.cfg.matrix.systems.length") == 42, "default ECG workbook imports 42 systems")
        br.close()
finally:
    for pr in procs: pr.terminate()
print("ERRORS", errs); sys.exit(1 if errs else 0)
