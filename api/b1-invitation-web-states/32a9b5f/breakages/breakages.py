# Planted breaks of round 1's fixes to the invitation page (api/b1-invitation-web-states), each to be caught by
# apps/web's tests. Each edits one file, runs vitest in apps/web, and restores the file from its saved text.
import subprocess, sys, os
ROOT = "/home/user/tadayo-web"
WEB = ROOT + "/apps/web"
ENV = dict(os.environ, PATH="/opt/nvm/versions/node/v26.13.0/bin:" + os.environ["PATH"], NO_COLOR="1")
JS, HTML, CSS = "apps/web/public/i.js", "apps/web/public/i.html", "apps/web/public/i.css"
B = [
    ("Y01 Retry waits for no drawn frame", JS,
     "const [outcome] = again ? await Promise.all([asked, drawn()]) : [await asked];", "const [outcome] = [await asked];"),
    ("Y02 the first load waits for a frame too", JS,
     "const [outcome] = again ? await Promise.all([asked, drawn()]) : [await asked];", "const [outcome] = await Promise.all([asked, drawn()]);"),
    ("Y03 a frame is a microtask, not requestAnimationFrame", JS,
     "      page.requestAnimationFrame(() => {\n        setTimeout(resolve, 0);\n      });", "      void Promise.resolve().then(resolve);"),
    ("Y04 no hold of the status block after Retry", JS,
     "      if (again && status !== null) status.style.minHeight = `${String(status.getBoundingClientRect().height)}px`;\n", ""),
    ("Y05 the hold outlives the answer", JS,
     "      status?.style.removeProperty(\"min-height\");\n", ""),
    ("Y06 the first load holds the block too", JS,
     "if (again && status !== null) status.style.minHeight", "if (status !== null) status.style.minHeight"),
    ("Y07 the hold rounds the drawn height", JS,
     "String(status.getBoundingClientRect().height)", "String(Math.round(status.getBoundingClientRect().height))"),
    ("Y08 another link in the same tab isn't looked at", JS,
     "  page.addEventListener(\"hashchange\", () => {\n    page.location.reload();\n  });\n", ""),
    ("Y09 another link is asked about in place, not reloaded", JS,
     "    page.location.reload();\n", "    void run(false);\n"),
    ("Y10 no touchstart listener for Safari's pressed look", JS,
     "  retry?.addEventListener(\"touchstart\", () => undefined, { passive: true });\n", ""),
    ("Y11 the touchstart listener isn't passive", JS,
     "{ passive: true }", "{ passive: false }"),
    ("Y12 busy, Retry loses its hint", JS,
     "working ? \"retry-busy retry-hint\" : \"retry-hint\"", "working ? \"retry-busy\" : \"retry-hint\""),
    ("Y13 the unavailable page's App Store name comes back", HTML,
     "        aria-describedby=\"get-hint\"\n", "        aria-describedby=\"get-hint\"\n        aria-label=\"Get Tadayo from the App Store.\"\n"),
    ("Y14 Safari's tap highlight stays over the pressed colour", CSS,
     "  -webkit-tap-highlight-color: transparent;\n", ""),
    ("Y15 the hint names Tadayo in the App Store again", HTML,
     "<span id=\"get-hint\" hidden>Open TestFlight in the App Store.</span>", "<span id=\"get-hint\" hidden>Open Tadayo in the App Store.</span>"),
    ("Y16 the hold measures the block after the checking is shown, holding nothing", JS,
     "      if (again && status !== null) status.style.minHeight = `${String(status.getBoundingClientRect().height)}px`;\n      show(doc, { state: \"checking\" }, again);\n",
     "      show(doc, { state: \"checking\" }, again);\n      if (again && status !== null) status.style.minHeight = `${String(status.getBoundingClientRect().height)}px`;\n"),
]
only = sys.argv[1:]
caught = 0
for name, path, old, new in B:
    code = name.split()[0]
    if only and code not in only:
        continue
    full = os.path.join(ROOT, path)
    text = open(full).read()
    assert text.count(old) == 1, (code, text.count(old))
    try:
        open(full, "w").write(text.replace(old, new))
        r = subprocess.run(["npx", "vitest", "run"], cwd=WEB, env=ENV, capture_output=True, text=True, timeout=300)
    finally:
        open(full, "w").write(text)
    out = r.stdout + r.stderr
    failed = [l.strip() for l in out.splitlines() if l.strip().startswith("×")]
    summary = [l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")]
    verdict = "CAUGHT" if r.returncode != 0 else "NOT CAUGHT"
    caught += r.returncode != 0
    print(f"== {name}: {verdict}; exit {r.returncode} {summary}")
    for l in failed[:4]:
        print("    " + l)
print(f"{caught} caught")
