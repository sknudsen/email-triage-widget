/* Smoke for the db-backed gate page (#436, S176): public/gate-artifact-shell.template.html
 * with public/gate-widget.js baked in, run in jsdom against a stubbed artifact db.
 *
 * The mirror contract lives in test/fixtures/gate-contract.json, shared with
 * skills/email-triage-present/test_gate_contract.py: this side renders the
 * fixture's configDoc, performs its acts, and asserts that the page writes the
 * fixture's submitPayload; the Python side drains that submit into approvals.
 *
 * Run: `node test/gate-page.smoke.js` (part of `npm test`). */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const WIDGET = fs.readFileSync(path.resolve(__dirname, "../gate-widget.js"), "utf8");
const TEMPLATE = fs.readFileSync(path.resolve(__dirname, "../gate-artifact-shell.template.html"), "utf8");
const C = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/gate-contract.json"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Mirrors present.gate_page.build_gate_page (full-document form).
const PAGE = TEMPLATE
  .replace("/* __GATE_WIDGET_JS__ */", WIDGET)
  .replace("/* __GATE_PAGE_CONFIG__ */", JSON.stringify({ pageKind: "gate", schema: 1 }));

// docs: {path: data}. opts.noDb: no window.claude. opts.failWrite: set() rejects.
function load(docs, opts) {
  opts = opts || {};
  const writes = [];
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(PAGE, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "https://gate.test/", virtualConsole: vc,
    beforeParse(w) {
      if (opts.noDb) return;
      w.claude = { use: async () => ({
        doc: (p) => ({
          get: async () => ({ exists: p in docs, data: () => docs[p] }),
          set: async (data) => {
            if (opts.failWrite) throw new Error("quota exceeded");
            writes.push({ path: p, data: data }); docs[p] = data;
          },
        }),
      }) };
    },
  });
  return new Promise((res) => setTimeout(() => res({ w: dom.window, writes, errors }), 60));
}
const tick = () => new Promise((r) => setTimeout(r, 30));
function act(w, a) {
  if (a.do === "toggleTier2") w.GATE.toggleTier2(a.value);
  else if (a.do === "approve") w.GATE.approve(a.key);
  else if (a.do === "decline") w.GATE.decline(a.key);
  else if (a.do === "setReason") w.GATE.setReason(a.key, a.code);
  else throw new Error("unknown act " + a.do);
}

(async () => {
  console.log("== contract: decline reasons ==");
  {
    const { w } = await load({ "gate/config": clone(C.configDoc) });
    ok("widget decline codes == fixture == approvals.DECLINE_REASONS",
      same(w.GATE_DECLINE_REASONS, C.declineReasons), JSON.stringify(w.GATE_DECLINE_REASONS));
  }

  console.log("== happy path: config from db -> acts -> submit doc ==");
  {
    const { w, writes, errors } = await load({ "gate/config": clone(C.configDoc) });
    ok("page state ok", w.TG_PAGE && w.TG_PAGE.state === "ok", JSON.stringify(w.TG_PAGE));
    ok("status names the stamp and counts",
      /2026-11-10_11-39-18\+01-00: 1 Tier-2 and 2 Tier-3/.test(w.document.getElementById("gs-status").textContent));
    ok("watch item shown", w.document.body.textContent.includes("tier-3 rows carry sender"));
    ok("real gateKeys in the page (no aliasing)",
      C.configDoc.payload.tier3.every((op) => w.document.body.innerHTML.includes(op.gateKey.replace(/&/g, "&amp;"))));
    ok("no 'approve all' control exists",
      ![...w.document.querySelectorAll("button")].some((b) => /approve all/i.test(b.textContent)));
    C.acts.forEach((a) => act(w, a));
    w.GATE.submit();
    await tick();
    ok("exactly one db write", writes.length === 1, JSON.stringify(writes.map((x) => x.path)));
    const wr = writes[0] || { path: "", data: {} };
    ok("written to gate/submit-<ts>", /^gate\/submit-\d+$/.test(wr.path), wr.path);
    ok("doc carries v, stamp, ts", wr.data.v === 1 && wr.data.stamp === C.configDoc.stamp
      && typeof wr.data.ts === "number" && wr.path === "gate/submit-" + wr.data.ts);
    ok("signal is the raw gate: string", typeof wr.data.signal === "string" && wr.data.signal.indexOf("gate:") === 0);
    let sp = null; try { sp = JSON.parse(wr.data.signal.slice(5)); } catch (e) { /* fail below */ }
    ok("signal payload == fixture submitPayload (mirror contract)", same(sp, C.submitPayload), JSON.stringify(sp));
    ok("status confirms the save", /Gate saved ✓/.test(w.document.getElementById("gs-status").textContent)
      && w.document.getElementById("gs-status").className.includes("ok"));
    ok("page state submitted", w.TG_PAGE.state === "submitted" && w.TG_PAGE.doc === wr.path);
    ok("recovery box hidden", w.document.getElementById("gs-rec").style.display !== "block");
    ok("no script errors", errors.length === 0, errors.join("; "));
  }

  console.log("== refusals: the page never half-shows a bad config ==");
  const cases = [
    ["absent config", {}, /is absent/],
    ["schema", { "gate/config": Object.assign(clone(C.configDoc), { v: 2 }) }, /v=2/],
    ["payload/doc stamp skew", (() => { const d = clone(C.configDoc); d.payload.stamp = "2026-01-01_00-00-00+01-00"; return { "gate/config": d }; })(), /is not the doc stamp/],
    ["opCount mismatch", { "gate/config": Object.assign(clone(C.configDoc), { opCount: 9 }) }, /the doc says 9/],
    ["no tier lists", (() => { const d = clone(C.configDoc); delete d.payload.tier3; return { "gate/config": d }; })(), /tier2\/tier3/],
  ];
  for (const [name, docs, re] of cases) {
    const { w } = await load(docs);
    const st = w.document.getElementById("gs-status").textContent;
    ok("refuses: " + name, w.TG_PAGE.state === "refused" && re.test(st), st);
    ok("refuses: " + name + " -> no gate rendered", !w.GATE);
  }
  {
    const { w } = await load({}, { noDb: true });
    ok("no db -> refused no_db", w.TG_PAGE.state === "refused" && w.TG_PAGE.reason === "no_db");
  }

  console.log("== floor: a failed write leaves a copy-paste string ==");
  {
    const { w, writes } = await load({ "gate/config": clone(C.configDoc) }, { failWrite: true });
    C.acts.forEach((a) => act(w, a));
    w.GATE.submit();
    await tick();
    ok("nothing recorded as written", writes.length === 0);
    ok("page state recovery", w.TG_PAGE.state === "recovery" && w.TG_PAGE.reason === "write_failed");
    const box = w.document.getElementById("gs-rec");
    const txt = w.document.getElementById("gs-rec-text").value;
    ok("recovery box shown with the full gate: string", box.style.display === "block"
      && txt.indexOf("gate:") === 0 && same(JSON.parse(txt.slice(5)), C.submitPayload));
    ok("status says copy it", /Copy the text below/.test(w.document.getElementById("gs-status").textContent));
  }

  console.log("== resubmit: a second submit is a second doc (latest wins at drain) ==");
  {
    const { w, writes } = await load({ "gate/config": clone(C.configDoc) });
    C.acts.forEach((a) => act(w, a));
    w.GATE.submit(); await tick();
    await new Promise((r) => setTimeout(r, 5));
    w.GATE.toggleTier2(false); w.GATE.submit(); await tick();
    ok("two submit docs", writes.length === 2 && writes[0].path !== writes[1].path);
    ok("the later one carries the change", JSON.parse(writes[1].data.signal.slice(5)).tier2BlockConfirm === false
      && writes[1].data.ts > writes[0].data.ts);
  }

  console.log("\n== RESULT ==  pass=" + pass + "  fail=" + fail);
  process.exit(fail ? 1 : 0);
})();
