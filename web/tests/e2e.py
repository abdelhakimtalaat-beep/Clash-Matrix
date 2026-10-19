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
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e))); return pg
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
        with A.expect_file_chooser() as fc: A.click("text=اختر ملف Excel")
        fc.value.set_files(f"{ROOT}/web/tests/sample-matrix.xlsx"); A.click("button.pri >> text=استيراد"); A.wait_for_timeout(600)
        A.click("nav a:text('الرموز')"); A.wait_for_selector("table")
        for s in A.query_selector_all("main select"): s.select_option("profile-hard")
        A.click("button.pri"); A.wait_for_timeout(800)
        n = A.evaluate("__bcm.state.cfg.clashTests.length"); ok(n == 26, f"alice generated {n} tests")
        # Alice adds Bob (editor) and Carol (viewer)
        A.click("nav a:text('الفريق')"); A.wait_for_selector("input[placeholder='email@company.com']")
        for email, role in (("bob@x.com", "editor"), ("carol@x.com", "viewer")):
            A.fill("input[placeholder='email@company.com']", email); A.select_option("div.row select >> nth=-1", role); A.click("button.pri >> text=إضافة"); A.wait_for_timeout(500)
        A.screenshot(path=f"{SHOTS}/team.png")
        ok("carol@x.com" in A.inner_text("main"), "team lists carol")
        A.click("nav a:text('الاختبارات')"); A.wait_for_selector("table input[size='36']")
        # Bob and Carol open the project
        for pg in (B, C):
            pg.reload(); pg.wait_for_selector("text=Tower"); pg.click("button:text('فتح')"); pg.wait_for_selector("text=لوحة" if False else "nav a")
        B.click("nav a:text('الاختبارات')"); B.wait_for_selector("table input[size='36']")
        ok(B.evaluate("__bcm.state.cfg.clashTests.length") == 26, "bob sees the 26 tests")
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
        br.close()
finally:
    for pr in procs: pr.terminate()
print("ERRORS", errs); sys.exit(1 if errs else 0)
