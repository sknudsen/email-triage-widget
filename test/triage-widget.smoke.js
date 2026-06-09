/* Live-render smoke for triage-widget.js — full initTriage against a real DOM
 * (jsdom). Verifies the render layer + interaction flows the closure-unit checks
 * can't: init against DOM, event wiring, panels, submit payload, and the S40
 * details panel. Run: `npm test` (from public/) or `node test/triage-widget.smoke.js`.
 *
 * Added in Session 45 after the smoke caught a render-layer regression (a stale
 * `.decision` read in render()) that a payload-only harness structurally misses. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const WIDGET = fs.readFileSync(path.resolve(__dirname, "../triage-widget.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  -> " + extra : "")); }
}

function makeSuggestion(id, action, param) {
  return {
    emailId: id, source: "inbox", action,
    actionConfidence: 0.8, actionReasons: ["match.sender_map_exact"],
    parameterisation: param || {}, parameterisationConfidence: 0.7,
    parameterisationReasons: ["routing.l1_sender_map"], relatedDecisions: [],
  };
}
const emails = [
  { id: "AAA", sender: "alice@x.dk", date: "Mon 09 Jun 09:00", subject: "Re: Project Atlas notes",
    bodyPreview: "Here are the notes from yesterday...", attachment: null, sentNotice: null,
    badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa",
    suggestedPath: ".PARA-work/1_Current_projects/Atlas", reason: "Sender map -> Atlas",
    annotation: "Atlas sync tomorrow", threadRef: null,
    metadata: { id: "AAA", subject: "Re: Project Atlas notes", from: "alice@x.dk", source: "inbox", currentFolder: ".PARA-work" },
    stage1: { conversationId: "conv-1", inferenceClassification: "focused", flag: null, thresholdDate: null, contextNote: "<has angle> & amp" },
    suggestion: makeSuggestion("AAA", "pa", { destination: ".PARA-work/1_Current_projects/Atlas" }) },
  { id: "BBB", sender: "newsletter@news.com", date: "Mon 09 Jun 08:30", subject: "Weekly digest",
    bodyPreview: "Top stories this week...", attachment: null, sentNotice: null,
    badgeLabel: "Triage dump", badgeClass: "badge-ar", suggestedAction: "ar",
    suggestedPath: ".PARA-work/4_Archive/0_Inbox_trash", reason: "Bulk newsletter",
    annotation: null, threadRef: null, suggestion: makeSuggestion("BBB", "ar", {}) },
  { id: "CCC", sender: "boss@x.dk", date: "Mon 09 Jun 07:55", subject: "Can you send the report?",
    bodyPreview: "Need the Q2 numbers by EOD.", attachment: "Q2.xlsx", sentNotice: "You replied 08:10",
    badgeLabel: "Do now", badgeClass: "badge-do", suggestedAction: "do",
    suggestedPath: null, reason: "Direct ask, due today", annotation: null,
    threadRef: "Same thread as #1", suggestion: makeSuggestion("CCC", "do", {}) },
  { id: "DDD", sender: "vendor@svc.com", date: "Fri 06 Jun 16:00", subject: "Invoice attached",
    bodyPreview: "Please find invoice 4421.", attachment: "INV-4421.pdf", sentNotice: null,
    badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
    suggestedPath: null, reason: "Not urgent", annotation: null, threadRef: null,
    suggestion: null },
  { id: "EEE", sender: "team@x.dk", date: "Thu 05 Jun 12:00", subject: "Pending vendor reply",
    bodyPreview: "Waiting to hear back on pricing...", attachment: null, sentNotice: null,
    badgeLabel: "Waiting", badgeClass: "badge-wa", suggestedAction: "wa",
    suggestedPath: null, reason: "Awaiting external reply", annotation: null, threadRef: null,
    suggestion: makeSuggestion("EEE", "wa", { contextNote: "vendor to confirm pricing", thresholdDate: "2026-06-20" }) },
];
const tree = {
  work: { label: "PARA-work", prefix: ".PARA-work", sections: [
    [{ name: "Atlas" }, { name: "Borealis" }], [{ name: "Ops" }], [{ name: "Refs" }], [{ name: "0_Inbox_trash" }] ] },
  personal: { label: "PARA-personal", prefix: ".PARA-personal", sections: [
    [{ name: "House" }], [{ name: "Finance" }], [], [{ name: "0_Inbox_trash" }] ] },
};

const dom = new JSDOM(`<!DOCTYPE html><body><div id="tw-root"></div></body>`, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
window.scrollTo = () => {};
Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: () => {}, writable: true });
let lastPrompt = null;
window.sendPrompt = (t) => { lastPrompt = t; };
global.sendPrompt = window.sendPrompt;

window.eval(WIDGET);

console.log("== init ==");
let threw = null;
try { window.initTriage({ batch: 1, total: 4, emails, tree }); }
catch (e) { threw = e; }
const card = () => document.querySelector(".tw-card");
const panel = () => document.querySelector(".tw-dp");
ok("initTriage does not throw", !threw, threw && threw.stack);
ok("window.TW exposed", !!window.TW);
ok("card rendered", document.getElementById("tw-card").innerHTML.length > 0);
ok("dots count == emails", document.querySelectorAll(".tw-dot").length === emails.length);
ok("suggested action highlighted (pa)", document.getElementById("btn-pa").classList.contains("hl"));
ok("submit disabled at start", document.getElementById("tw-sub").disabled === true);

console.log("== details panel (S40 item 4) ==");
ok("panel closed initially", panel() === null);
ok("affordance shows 'details' when closed", document.querySelector(".tw-iaff").textContent.indexOf("details") === 0);
window.TW.toggleDetails();
ok("panel opens on toggle", panel() !== null);
ok("card gets .open class", card().classList.contains("open"));
ok("affordance swaps to 'close'", document.querySelector(".tw-iaff").textContent.indexOf("close") === 0);
const heads = [...document.querySelectorAll(".tw-dsh")].map((h) => h.textContent);
ok("three sections in locked order", JSON.stringify(heads) === JSON.stringify(["Email metadata", "Stage 1 — context", "Stage 2 — suggestion"]));
ok("metadata keys rendered (subject, from...)", panel().textContent.includes("subject") && panel().textContent.includes("from"));
ok("suggestion nested fields rendered", panel().textContent.includes("actionConfidence"));
ok("null stage1 field -> (none)", [...panel().querySelectorAll(".tw-drow")].some((r) => /flag/.test(r.textContent) && /\(none\)/.test(r.textContent)));
ok("values HTML-escaped (no raw <)", panel().innerHTML.includes("&lt;has angle&gt;"));
ok("footer 'Open as .md file' button present", !!document.querySelector(".tw-dfb"));
window.TW.openDetailsFile();
ok("openDetailsFile fires details:<id> signal", lastPrompt === "details:AAA");
document.querySelectorAll(".tw-dot")[2].onclick();
ok("panel stays open after navigation (sticky)", panel() !== null);
ok("CCC Email metadata section shows (none)", (() => { const dsh = [...document.querySelectorAll(".tw-dsh")].find((h) => h.textContent === "Email metadata"); return dsh && dsh.nextElementSibling.textContent.trim() === "(none)"; })());
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "i" }));
ok("'i' key closes panel", panel() === null);
ok("card .open removed when closed", !card().classList.contains("open"));
lastPrompt = null;
window.TW.toggleDetails(); window.TW.toggleDetails();
document.querySelectorAll(".tw-dot")[0].onclick();

console.log("== decide do (email idx2 via dot) ==");
document.querySelectorAll(".tw-dot")[2].onclick();
ok("nav to email 3 of 5", document.getElementById("tw-pos").textContent === "3 of 5");
window.TW.decide("do");

console.log("== agree on a suggestion-bearing email ==");
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("a");

console.log("== pa tree open + select via API ==");
document.querySelectorAll(".tw-dot")[1].onclick();
window.TW.decide("pa");
ok("pa panel visible", document.getElementById("tw-pap").style.display === "block");
ok("tree rendered cells", document.querySelectorAll(".tw-ti").length > 0);
const cell = document.querySelector('.tw-ti[data-path]');
cell.dispatchEvent(new window.Event("click"));
ok("pa panel closed after select", document.getElementById("tw-pap").style.display === "none");

console.log("== de required free-text (S46 item 6) — transient on EEE ==");
document.querySelectorAll(".tw-dot")[4].onclick();
window.TW.decide("de");
ok("de panel visible", document.getElementById("tw-dep").style.display === "block");
document.getElementById("tw-de-tgt").value = "";
window.TW.confirmDelegate();
ok("empty de blocks decision (panel stays open)", document.getElementById("tw-dep").style.display === "block");
ok("de required hint shown on empty submit", document.getElementById("tw-de-hint").style.display === "block");
ok("no decision written for EEE yet", document.querySelectorAll(".tw-dot")[4].className.indexOf("decided") === -1);
document.getElementById("tw-de-tgt").value = "Anna (ops)";
window.TW.confirmDelegate();
ok("de closes after valid submit", document.getElementById("tw-dep").style.display === "none");

console.log("== cu required free-text (S46 item 7) — transient on EEE ==");
document.querySelectorAll(".tw-dot")[4].onclick(); // valid de advanced cursor off EEE; re-select
window.TW.decide("cu");
ok("cu panel visible", document.getElementById("tw-cup").style.display === "block");
document.getElementById("tw-cu-note").value = "   ";
window.TW.confirmCustom();
ok("whitespace-only cu blocks + hint", document.getElementById("tw-cup").style.display === "block" && document.getElementById("tw-cu-hint").style.display === "block");
document.getElementById("tw-cu-note").value = "park until reorg";
window.TW.confirmCustom();
ok("cu closes after valid submit", document.getElementById("tw-cup").style.display === "none");

console.log("== wa pre-fill + visual flag (S46 items 5,9) — final decision for EEE ==");
document.querySelectorAll(".tw-dot")[4].onclick(); // valid cu advanced cursor off EEE; re-select
window.TW.decide("wa");
ok("wa/df panel visible", document.getElementById("tw-wdp").style.display === "block");
ok("panel title reflects wa", document.getElementById("tw-wd-title").textContent === "Waiting for");
ok("note pre-filled from suggestion.parameterisation", document.getElementById("tw-wd-note").value === "vendor to confirm pricing");
ok("date pre-filled from suggestion.parameterisation", document.getElementById("tw-wd-date").value === "2026-06-20");
ok("pre-filled note carries visual flag (tw-pf)", document.getElementById("tw-wd-note").classList.contains("tw-pf"));
ok("pre-filled note hint visible", document.getElementById("tw-wd-note-pf").style.display === "inline");
document.getElementById("tw-wd-note").dispatchEvent(new window.Event("input"));
ok("visual flag clears on edit", !document.getElementById("tw-wd-note").classList.contains("tw-pf"));
ok("hint hidden after edit", document.getElementById("tw-wd-note-pf").style.display === "none");
window.TW.confirmWaitDefer();
ok("wa closes after confirm", document.getElementById("tw-wdp").style.display === "none");

console.log("== defer with note, no pre-fill (S46 item 5) — DDD suggestion null ==");
document.querySelectorAll(".tw-dot")[3].onclick();
window.TW.decide("df");
ok("wa/df panel visible for df", document.getElementById("tw-wdp").style.display === "block");
ok("panel title reflects df", document.getElementById("tw-wd-title").textContent === "Defer");
ok("note empty (no suggestion to pre-fill)", document.getElementById("tw-wd-note").value === "");
ok("note has no visual flag when not pre-filled", !document.getElementById("tw-wd-note").classList.contains("tw-pf"));
document.getElementById("tw-wd-note").value = "chase next week";
window.TW.confirmWaitDefer();

console.log("== all decided, submit ==");
ok("submit enabled", document.getElementById("tw-sub").disabled === false);
window.TW.submit();
ok("sendPrompt fired with batch:", !!lastPrompt && lastPrompt.startsWith("batch:"));
const rows = JSON.parse(lastPrompt.slice("batch:".length));
ok("5 rows emitted (all decided)", rows.length === 5, "got " + rows.length);

const byId = Object.fromEntries(rows.map((r) => [r.emailId, r]));
ok("CCC decisionKey=do action=do params={}", byId.CCC.decisionKey === "do" && byId.CCC.action === "do" && Object.keys(byId.CCC.user_typed_params).length === 0);
ok("CCC carries suggestion", byId.CCC.suggestion && byId.CCC.suggestion.emailId === "CCC");
ok("AAA agree -> decisionKey=a action=pa", byId.AAA.decisionKey === "a" && byId.AAA.action === "pa");
ok("AAA agree copies suggestion.parameterisation.destination", byId.AAA.user_typed_params.destination === ".PARA-work/1_Current_projects/Atlas");
ok("AAA params is a copy, not same ref", byId.AAA.user_typed_params !== emails[0].suggestion.parameterisation);
ok("BBB decisionKey=pa with destination", byId.BBB.decisionKey === "pa" && typeof byId.BBB.user_typed_params.destination === "string");
ok("DDD decisionKey=df contextNote set", byId.DDD.decisionKey === "df" && byId.DDD.user_typed_params.contextNote === "chase next week");
ok("DDD df has no thresholdDate key (empty field omitted)", !("thresholdDate" in byId.DDD.user_typed_params));
ok("DDD suggestion is null (omission case)", byId.DDD.suggestion === null);
ok("EEE final decisionKey=wa action=wa", byId.EEE.decisionKey === "wa" && byId.EEE.action === "wa");
ok("EEE wa carries pre-filled contextNote + thresholdDate", byId.EEE.user_typed_params.contextNote === "vendor to confirm pricing" && byId.EEE.user_typed_params.thresholdDate === "2026-06-20");
ok("EEE final overwrote transient de/cu (only wa remains)", byId.EEE.user_typed_params.delegationTarget === undefined && byId.EEE.user_typed_params.note === undefined);
ok("every row has the 6 envelope keys + ISO timestamp", rows.every((r) =>
  ["emailId","decisionKey","timestamp","action","user_typed_params","suggestion"].every((k) => k in r) &&
  /^\d{4}-\d{2}-\d{2}T/.test(r.timestamp)));

console.log("== st (stop) writes no row ==");
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("st");
window.TW.submit();
const rows2 = JSON.parse(lastPrompt.slice("batch:".length));
ok("st did not add/replace a row", rows2.length === 5 && rows2.find((r) => r.emailId === "AAA").decisionKey === "a");

console.log("\n== RESULT ==  pass=" + pass + "  fail=" + fail);
process.exit(fail ? 1 : 0);
