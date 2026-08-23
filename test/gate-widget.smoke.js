/* Live-render smoke for gate-widget.js — full initGate against a real DOM (jsdom).
 * Verifies the render + interaction the payload can't: tier sections render, the
 * Tier-2 block confirm toggles, per-Tier-3 approve/decline set state, the su
 * channel input is captured, and Submit emits the correct `gate:` payload.
 * Run: `node test/gate-widget.smoke.js`. (S111, #308) */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const WIDGET = fs.readFileSync(path.resolve(__dirname, "../gate-widget.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

const cfg = {
  stamp: "2026-07-17_09-00-00+02-00",
  tier1Count: 8,
  tier2: [
    { gateKey: "batch-A|0|E1|wa", subject: "Re: waiting on <Tanya>", action: "wa",
      sender: "Tanya <Beck>", senderAddress: "tanya@ku.dk",
      sourcePath: "Inbox", destPath: "Inbox/Waiting", flags: [] },
    { gateKey: "batch-A|1|E2|df", subject: "Faktura marts", action: "df",
      sender: "faktura@e-boks.dk", senderAddress: null,
      sourcePath: "Inbox", destPath: "Inbox/Defer/Defer_eboks", flags: [] },
  ],
  tier3: [
    { gateKey: "batch-A|2|E3|pa", subject: "New initiative Helix", action: "pa",
      sender: "Helix PMO", senderAddress: "pmo@helix.example",
      sourcePath: "Inbox", destPath: ".PARA-work/1_Current_projects/Helix",
      flags: ["create-folder"], needsChannel: false },
    { gateKey: "batch-A|3|E4|su", subject: "KU interview slide-prep", action: "su",
      sender: "Tanya Beck", senderAddress: "tanya@ku.dk",
      sourcePath: "Inbox", destPath: "Inbox/Sunsama_task",
      flags: ["su-no-channel"], needsChannel: true, scopeHint: "scope: work (KU)" },
  ],
  counts: { tier1: 8, tier2: 2, tier3: 2 },
  opCount: 4,
  watch: ["#290 card height — eyeball the triage cards", "refusal path must fire this run"],
};

const dom = new JSDOM(`<!DOCTYPE html><body><div id="tg-root"></div></body>`,
  { runScripts: "outside-only", pretendToBeVisual: true, url: "https://triage.local/" });
const { window } = dom;
global.window = window; global.document = window.document;
let lastPrompt = null;
window.sendPrompt = (t) => { lastPrompt = t; };
global.sendPrompt = window.sendPrompt;

window.eval(WIDGET);

console.log("== init ==");
let threw = null;
try { window.initGate(cfg); } catch (e) { threw = e; }
ok("initGate does not throw", !threw, threw && threw.stack);
ok("window.GATE exposed", !!window.GATE);

console.log("== render ==");
ok("Tier-1 count shown, not enumerated", document.body.textContent.includes("8 op(s) will dispatch"));
const sections = document.querySelectorAll(".tg-sec");
ok("three tier sections", sections.length === 3);
ok("Tier-2 rows enumerated (2)", [...document.querySelectorAll(".tg-sec")][1].querySelectorAll(".tg-row").length === 2);
ok("Tier-3 rows enumerated (2)", [...document.querySelectorAll(".tg-sec")][2].querySelectorAll(".tg-row").length === 2);
ok("subject HTML-escaped (no raw <)", document.body.innerHTML.includes("&lt;Tanya&gt;"));
ok("#331 sender rendered on every gate row",
  document.querySelectorAll(".tg-from").length === 4);
ok("#331 sender name shown", document.body.textContent.includes("Helix PMO"));
ok("#331 raw address shown beside the name",
  document.querySelector(".tg-faddr").textContent === "tanya@ku.dk");
ok("#331 sender HTML-escaped (no raw <)",
  document.querySelector(".tg-from").innerHTML.includes("&lt;Beck&gt;"));
ok("#331 no second line when sender IS the address (#270 parity)",
  [...document.querySelectorAll(".tg-from")]
    .find(n => n.textContent.startsWith("faktura@e-boks.dk"))
    .querySelector(".tg-faddr") === null);
ok("create-folder flag surfaced", document.body.textContent.includes("create-folder"));
ok("su op shows a channel input", !!document.querySelector('[data-ch="batch-A|3|E4|su"]'));
ok("non-su op has no channel input", !document.querySelector('[data-ch="batch-A|2|E3|pa"]'));
ok("Tier-2 confirm starts unchecked", document.getElementById("tg-t2c").checked === false);
ok("watch block rendered (#326)", !!document.querySelector(".tg-watch"));
ok("watch item surfaced", document.body.textContent.includes("#290 card height"));
ok("watch items HTML-escaped path", document.querySelectorAll(".tg-wl li").length === 2);

console.log("== interact ==");
// Approve the pa op, decline nothing yet; leave su undecided.
window.GATE.approve("batch-A|2|E3|pa");
ok("approved pa button highlights", document.querySelector('[data-ap="batch-A|2|E3|pa"]').classList.contains("on"));
// Confirm the Tier-2 block.
const t2c = document.getElementById("tg-t2c");
t2c.checked = true; t2c.onchange();
// Give the su op a channel but leave it unapproved.
const chan = document.querySelector('[data-ch="batch-A|3|E4|su"]');
chan.value = "Work"; chan.oninput();

console.log("== submit ==");
window.GATE.submit();
ok("submit fired a gate: signal", lastPrompt && lastPrompt.indexOf("gate:") === 0);
const p = JSON.parse(lastPrompt.slice("gate:".length));
ok("payload carries the stamp", p.stamp === cfg.stamp);
ok("tier2BlockConfirm true after confirm", p.tier2BlockConfirm === true);
const pa = p.tier3.find((t) => t.gateKey === "batch-A|2|E3|pa");
const su = p.tier3.find((t) => t.gateKey === "batch-A|3|E4|su");
ok("approved pa op -> approved:true", pa.approved === true);
ok("undecided su op -> approved:false (fail-closed)", su.approved === false);
ok("su channel captured even when undecided", su.channel === "Work");
ok("post-submit confirmation shown", document.body.textContent.includes("Gate submitted"));

console.log("== #380 decline reason ==");
// Fresh gate instance (initGate rebuilds state in a new closure).
lastPrompt = null;
window.initGate(cfg);
window.GATE.decline("batch-A|2|E3|pa");
ok("#380 declining reveals the reason picker",
  !!document.querySelector('[data-rz-key="batch-A|2|E3|pa"]'));
window.GATE.submit();
ok("#380 submit blocked when a decline has no reason", lastPrompt === null);
ok("#380 block message shown", document.body.textContent.includes("need a reason"));
window.GATE.setReason("batch-A|2|E3|pa", "plan-wrong");
ok("#380 chosen reason highlights",
  document.querySelector('[data-rz-key="batch-A|2|E3|pa"][data-rz-code="plan-wrong"]').classList.contains("on"));
window.GATE.submit();
ok("#380 submit fires once a reason is chosen", lastPrompt && lastPrompt.indexOf("gate:") === 0);
const p380 = JSON.parse(lastPrompt.slice("gate:".length));
const pa380 = p380.tier3.find((t) => t.gateKey === "batch-A|2|E3|pa");
ok("#380 declined op -> approved:false with structured reason",
  pa380.approved === false && pa380.reason === "plan-wrong");

// Flipping a declined op back to approve must clear its reason.
lastPrompt = null;
window.initGate(cfg);
window.GATE.decline("batch-A|2|E3|pa");
window.GATE.setReason("batch-A|2|E3|pa", "misclick");
window.GATE.approve("batch-A|2|E3|pa");
window.GATE.submit();
const p380b = JSON.parse(lastPrompt.slice("gate:".length));
const pa380b = p380b.tier3.find((t) => t.gateKey === "batch-A|2|E3|pa");
ok("#380 approve clears any prior decline reason",
  pa380b.approved === true && pa380b.reason === null);

console.log("\n== RESULT ==  pass=" + pass + "  fail=" + fail);
process.exit(fail ? 1 : 0);
