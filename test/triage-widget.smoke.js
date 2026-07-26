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
    suggestion: makeSuggestion("AAA", "pa", { destination: ".PARA-work/1_Current_projects/Atlas", folderState: "exists_in_outlook" }) },
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
  { id: "FFF", sender: "pm@x.dk", date: "Wed 04 Jun 10:00", subject: "Borealis kickoff",
    bodyPreview: "Filing this under Borealis.", attachment: null, sentNotice: null,
    badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa",
    suggestedPath: null, reason: "Override to a marked leaf", annotation: null, threadRef: null,
    suggestion: null },
  { id: "GGG", sender: "lead@x.dk", date: "Tue 03 Jun 09:00", subject: "New initiative Helix",
    bodyPreview: "No folder yet — create one.", attachment: null, sentNotice: null,
    badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa",
    suggestedPath: null, reason: "New folder via confirmNew", annotation: null, threadRef: null,
    suggestion: null },
];
// Defer subfolders (#243): the producer's {name, path, id} shape. Picked items
// set user_typed_params.destination; the implicit "none → Inbox/Defer" is added
// by the widget as a first-class grid item, not listed here.
const deferSubfolders = [
  { name: "Defer_eboks", path: "Inbox/Defer/Defer_eboks", id: "id-eboks" },
  { name: "Defer_finance", path: "Inbox/Defer/Defer_finance", id: "id-finance" },
];
const tree = {
  work: { label: "PARA-work", prefix: ".PARA-work", sections: [
    [{ name: "Atlas" }, { name: "Borealis", folderState: "exists_in_outlook" }], [{ name: "Ops" }], [{ name: "Refs" }], [{ name: "0_Inbox_trash" }] ] },
  personal: { label: "PARA-personal", prefix: ".PARA-personal", sections: [
    [{ name: "House" }], [{ name: "Finance" }], [], [{ name: "0_Inbox_trash" }] ] },
};

// A real origin (url) so window.localStorage works — the S68 resume scenario
// relies on it (jsdom gives no localStorage on the default opaque origin).
const dom = new JSDOM(`<!DOCTYPE html><body><div id="tw-root"></div></body>`, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://triage.local/" });
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
try { window.initTriage({ batch: 1, total: 4, emails, tree, deferSubfolders }); }
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
ok("nav to email 3 of 7", document.getElementById("tw-pos").textContent === "3 of 7");
window.TW.decide("do");

console.log("== agree on a suggestion-bearing email ==");
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("ag");

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
ok("defer-subfolder picker hidden for wa (#243)", document.getElementById("tw-dfsub").style.display === "none");
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
ok("defer-subfolder picker visible for df (#243)", document.getElementById("tw-dfsub").style.display === "block");
ok("picker has none + 2 subfolders (3 cells)", document.querySelectorAll("#tw-dfsgrid .tw-ti").length === 3);
ok("none → Inbox/Defer is first cell, selected by default", (() => { const c = document.querySelectorAll("#tw-dfsgrid .tw-ti")[0]; return /Inbox\/Defer/.test(c.textContent) && c.classList.contains("sel"); })());
document.getElementById("tw-wd-note").value = "chase next week";
window.TW.confirmWaitDefer();

console.log("== pa override to a skill-marked leaf (S47 item 8) — FFF ==");
document.querySelectorAll(".tw-dot")[5].onclick();
window.TW.decide("pa");
ok("pa panel visible for FFF", document.getElementById("tw-pap").style.display === "block");
const marked = document.querySelector('.tw-ti[data-col="0"][data-sec="0"][data-idx="1"]'); // Borealis
ok("marked leaf (Borealis) rendered", !!marked && /Borealis/.test(marked.textContent));
marked.dispatchEvent(new window.Event("click"));
ok("pa panel closed after marked select", document.getElementById("tw-pap").style.display === "none");

console.log("== pa new folder via confirmNew (S47 item 8) — GGG ==");
document.querySelectorAll(".tw-dot")[6].onclick();
window.TW.decide("pa");
ok("pa panel visible for GGG", document.getElementById("tw-pap").style.display === "block");
document.getElementById("tw-nr").value = "work";
document.getElementById("tw-ns").value = "0"; // Projects
document.getElementById("tw-nfn").value = "Helix";
window.TW.confirmNew();
ok("pa panel closed after confirmNew", document.getElementById("tw-pap").style.display === "none");

console.log("== all decided, submit ==");
ok("submit enabled", document.getElementById("tw-sub").disabled === false);
window.TW.submit();
ok("sendPrompt fired with batch:", !!lastPrompt && lastPrompt.startsWith("batch:"));
const rows = JSON.parse(lastPrompt.slice("batch:".length));
ok("7 rows emitted (all decided)", rows.length === 7, "got " + rows.length);

const byId = Object.fromEntries(rows.map((r) => [r.emailId, r]));
ok("CCC decisionKey=do action=do params={}", byId.CCC.decisionKey === "do" && byId.CCC.action === "do" && Object.keys(byId.CCC.user_typed_params).length === 0);
ok("CCC envelope carries no suggestion payload (#242)", !("suggestion" in byId.CCC));
ok("CCC paramsEdited=false (direct key, nothing pre-filled)", byId.CCC.paramsEdited === false);
ok("AAA agree -> decisionKey=ag action=pa", byId.AAA.decisionKey === "ag" && byId.AAA.action === "pa");
ok("AAA agree copies suggestion.parameterisation.destination", byId.AAA.user_typed_params.destination === ".PARA-work/1_Current_projects/Atlas");
ok("AAA params is a copy, not same ref", byId.AAA.user_typed_params !== emails[0].suggestion.parameterisation);
ok("AAA agree paramsEdited=false (accept = verbatim)", byId.AAA.paramsEdited === false);
ok("BBB decisionKey=pa with destination", byId.BBB.decisionKey === "pa" && typeof byId.BBB.user_typed_params.destination === "string");
ok("AAA agree carries Stage 2 folderState verbatim (exists_in_outlook)", byId.AAA.user_typed_params.folderState === "exists_in_outlook");
ok("BBB override of unmarked leaf defaults to exists_in_onedrive", byId.BBB.user_typed_params.folderState === "exists_in_onedrive");
ok("FFF override of skill-marked leaf stamps exists_in_outlook", byId.FFF.decisionKey === "pa" && byId.FFF.user_typed_params.folderState === "exists_in_outlook" && /Borealis$/.test(byId.FFF.user_typed_params.destination));
ok("GGG confirmNew stamps proposed", byId.GGG.decisionKey === "pa" && byId.GGG.user_typed_params.folderState === "proposed" && /Helix$/.test(byId.GGG.user_typed_params.destination));
ok("DDD decisionKey=df contextNote set", byId.DDD.decisionKey === "df" && byId.DDD.user_typed_params.contextNote === "chase next week");
ok("DDD df has no thresholdDate key (empty field omitted)", !("thresholdDate" in byId.DDD.user_typed_params));
ok("DDD df none-picked omits destination (carrier → flat Inbox/Defer) (#243)", !("destination" in byId.DDD.user_typed_params));
ok("DDD envelope carries no suggestion payload (#242)", !("suggestion" in byId.DDD));
ok("DDD paramsEdited=false (no pre-filled field touched via input)", byId.DDD.paramsEdited === false);
ok("EEE final decisionKey=wa action=wa", byId.EEE.decisionKey === "wa" && byId.EEE.action === "wa");
ok("EEE wa carries pre-filled contextNote + thresholdDate", byId.EEE.user_typed_params.contextNote === "vendor to confirm pricing" && byId.EEE.user_typed_params.thresholdDate === "2026-06-20");
ok("EEE final overwrote transient de/cu (only wa remains)", byId.EEE.user_typed_params.delegationTarget === undefined && byId.EEE.user_typed_params.note === undefined);
ok("EEE paramsEdited=true (edited a pre-filled field, #242)", byId.EEE.paramsEdited === true);
ok("every row has the 6 envelope keys + ISO timestamp (#242: paramsEdited, not suggestion)", rows.every((r) =>
  ["emailId","decisionKey","timestamp","action","user_typed_params","paramsEdited"].every((k) => k in r) &&
  /^\d{4}-\d{2}-\d{2}T/.test(r.timestamp)));
ok("no row carries a suggestion payload (#242 anti-masquerade)", rows.every((r) => !("suggestion" in r)));

console.log("== page locked after submit (#214) ==");
lastPrompt = null;
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("ar");  // no-op on a submitted page
window.TW.submit();      // no-op on a submitted page
ok("submitted page is locked — no re-submit fires", lastPrompt === null);
ok("submit button shows submitted state", document.getElementById("tw-sub").textContent.indexOf("submitted") !== -1);
ok("AAA decision unchanged after locked ar", document.querySelectorAll(".tw-dot")[0].className.indexOf("decided") !== -1);

console.log("== #196 inline decision echo + .sel · #263 min-height · #195 ag button ==");
// cur is on AAA (decided via Agree -> decisionKey "ag") from the dot click above.
ok("#196 inline decision echo present on a decided card", !!document.querySelector(".tw-ydec"));
ok("#196 echo names the decision (Agree)", /Agree/.test(document.querySelector(".tw-ydec").textContent));
// #196: AAA decided via Agree materialises the Stage 2 pa suggestion, whose
// destination is .PARA-work/1_Current_projects/Atlas — the echo must surface it.
ok("#196 echo carries the resolved destination (ag -> pa dest)",
  document.querySelector(".tw-ydest") && document.querySelector(".tw-ydest").textContent.includes(".PARA-work/1_Current_projects/Atlas"));
ok("#196 decided action button gets .sel (btn-ag)", document.getElementById("btn-ag").classList.contains("sel"));
ok("#195 agree button is btn-ag, old single-char btn-a gone", !!document.getElementById("btn-ag") && !document.getElementById("btn-a"));
// #290: the S98 440 floor is gone; .tw-card min-height is now a live-tuneable
// CSS var (stage3-tuning.yaml → cfg.widget) defaulting to 0px = content height.
ok("#290 .tw-card min-height is var-driven, default 0px",
  /\.tw-card\{[^}]*min-height:var\(--tw-card-min-h,0px\)/.test(document.querySelector("style").textContent));
// #290: bodyPreview is scroll-capped via a tuneable var (default 126px) +
// overflow, replacing the old #265 line-clamp:7 hidden-overflow truncation.
ok("#290 .tw-body is scroll-capped via var (default 126px) + overflow-y",
  /\.tw-body\{[^}]*max-height:var\(--tw-body-max-h,126px\)[^}]*overflow-y:auto/.test(document.querySelector("style").textContent));
ok("#290 old line-clamp truncation removed from .tw-body", !document.querySelector("style").textContent.includes("-webkit-line-clamp:7"));
// #290: cfg.widget (from stage3-tuning.yaml via assemble_config) applies the
// render knobs as CSS custom properties on #tw-root.
window.initTriage({ batch: 1, total: emails.length, emails, tree, widget: { cardMinHeightPx: 400, bodyMaxHeightPx: 90 } });
ok("#290 cfg.widget.cardMinHeightPx -> --tw-card-min-h on #tw-root",
  document.getElementById("tw-root").style.getPropertyValue("--tw-card-min-h") === "400px");
ok("#290 cfg.widget.bodyMaxHeightPx -> --tw-body-max-h on #tw-root",
  document.getElementById("tw-root").style.getPropertyValue("--tw-body-max-h") === "90px");
// restore the default (no cfg.widget) render for the scenarios that follow
window.initTriage({ batch: 1, total: 4, emails, tree, deferSubfolders });

/* ===== Multi-page paging scenario (#214): 15 emails -> 2 pages (13 + 2) ===== */
console.log("\n== multi-page paging (#214) ==");
const $g = (id) => document.getElementById(id);
function mkP(i) {
  return { id: "E" + i, sender: "s" + i + "@x.dk", date: "Mon", subject: "S" + i,
    bodyPreview: "b" + i, attachment: null, sentNotice: null,
    badgeLabel: "Triage dump", badgeClass: "badge-ar", suggestedAction: "ar",
    suggestedPath: null, reason: "r" + i, annotation: null, threadRef: null,
    suggestion: null, metadata: { conversationId: "C" + i } };
}
const emailsP = [];
for (let i = 0; i < 15; i++) emailsP.push(mkP(i));
// E0 + E1 share a conversation, both on page 0 -> carousel count 1.
emailsP[0].metadata.conversationId = "CONVPG"; emailsP[0].threadRef = "1 other email in this thread"; emailsP[0].threadCount = 1;
emailsP[1].metadata.conversationId = "CONVPG"; emailsP[1].threadRef = "1 other email in this thread"; emailsP[1].threadCount = 1;

window.initTriage({ batch: 1, total: 15, emails: emailsP, tree });
ok("page label shows 2 pages", $g("tw-page").textContent === "Page 1 of 2");
ok("13 dots on page 0 (page-scoped)", document.querySelectorAll(".tw-dot").length === 13);
ok("pos is within-page (1 of 13)", $g("tw-pos").textContent === "1 of 13");
ok("thread chip mixes run + carousel in its hover text", !!document.querySelector(".tw-thc") &&
  /1 other email in this thread, 1 in this carousel/.test(document.querySelector(".tw-thc").title));
ok("#331/2 chip reads <on this page>/<in thread> when a sibling is on the page",
  document.querySelector(".tw-thc").textContent.trim() === "🔗 1/1");
ok("prev disabled at page start", $g("tw-prev").disabled === true);
ok("page-prev disabled on first page", $g("tw-ppage").disabled === true);

// Decide all 13 on page 0, then submit the page.
for (let k = 0; k < 13; k++) { document.querySelectorAll(".tw-dot")[k].onclick(); window.TW.decide("ar"); }
ok("page 0 submit enabled after 13 decided", $g("tw-sub").disabled === false);
lastPrompt = null;
window.TW.submit();
ok("page 0 submit emits exactly 13 rows", !!lastPrompt && JSON.parse(lastPrompt.slice(6)).length === 13);
// No auto-advance — the celebration card holds on page 1 until Page ▶ (the breath).
ok("stays on page 1 after submit (celebration card, no auto-advance)", $g("tw-page").textContent === "Page 1 of 2" && !!document.querySelector(".tw-ccard"));
ok("post-submit card invites the operator to the next page", /Next page/.test(document.querySelector(".tw-ccard").textContent));
ok("Page ▶ enabled on the celebration card", $g("tw-npage").disabled === false);
// Footer swaps Submit for a primary "Next page →" on a submitted intermediate page.
ok("footer shows Next page button, Submit hidden", $g("tw-nextpage").style.display !== "none" && $g("tw-sub").style.display === "none");
// Enter advances (keyboard twin of the button).
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
ok("Enter on submitted celebration card advances to page 2", $g("tw-page").textContent === "Page 2 of 2");
ok("page 2 normal card restores Submit, hides Next page", $g("tw-sub").style.display === "" && $g("tw-nextpage").style.display === "none");
ok("page 2 has 2 dots", document.querySelectorAll(".tw-dot").length === 2);
ok("page 2 submit disabled (none decided)", $g("tw-sub").disabled === true);

// An undecided card keeps its page un-submittable.
document.querySelectorAll(".tw-dot")[0].onclick(); window.TW.decide("do"); // E13
ok("page 2 submit blocked with 1 of 2 decided", $g("tw-sub").disabled === true);

// Decide the second card, submit page 2.
document.querySelectorAll(".tw-dot")[1].onclick(); window.TW.decide("ar");
ok("page 2 submit enabled after both decided", $g("tw-sub").disabled === false);
lastPrompt = null;
window.TW.submit();
ok("page 2 submit emits exactly 2 rows", !!lastPrompt && JSON.parse(lastPrompt.slice(6)).length === 2);
ok("final submit shows inbox-zero celebration card", /Inbox zero/.test(document.querySelector(".tw-ccard").textContent));
ok("last page has no Next page button (Submit shown instead)", $g("tw-nextpage").style.display === "none" && $g("tw-sub").style.display === "");

// Revisiting a submitted page shows it locked.
window.TW.goPage(-1);
ok("goPage back to page 1", $g("tw-page").textContent === "Page 1 of 2");
ok("revisited page 1 still locked", $g("tw-sub").textContent.indexOf("submitted") !== -1);

/* ===== Stop + localStorage resume + celebration quote (S68) ===== */
console.log("\n== stop / resume / quote (S68) ==");
try { window.localStorage.clear(); } catch (e) {}
const STAMP = "2026-06-13_11-55-13+02-00";
const quotes = ["Long story short, I survived.", "It's me, hi."];
function mkS(n) { const a = []; for (let i = 0; i < n; i++) a.push(mkP(i)); return a; }

// 20 emails -> 2 pages (13 + 7), WITH a stamp so resume persistence is active.
window.initTriage({ stamp: STAMP, batch: 1, total: 20, emails: mkS(20), tree, quotes });
ok("fresh session renders 13 dots on page 0", document.querySelectorAll(".tw-dot").length === 13);
// Decide + submit page 0 -> celebration card carries the quote (banner removed), ids persisted.
for (let k = 0; k < 13; k++) { document.querySelectorAll(".tw-dot")[k].onclick(); window.TW.decide("ar"); }
window.TW.submit();
ok("celebration card shown after submit (no banner element)", !!document.querySelector(".tw-ccard") && document.getElementById("tw-cel") === null);
ok("celebration card carries a baked quote", quotes.some((q) => document.querySelector(".tw-ccard").textContent.indexOf(q) !== -1));
// Step to page 1 with Page ▶ (no auto-advance), decide 3, then STOP. Stop is two-step.
window.TW.goPage(1);
for (let k = 0; k < 3; k++) { document.querySelectorAll(".tw-dot")[k].onclick(); window.TW.decide("ar"); }
lastPrompt = null;
window.TW.stop();
ok("stop arms a confirm bar (no flush yet)", $g("tw-stopbar").style.display === "flex" && lastPrompt === null);
ok("confirm bar names the pending count", /3 decided cards/.test($g("tw-stopmsg").textContent));
window.TW.cancelStop();
ok("cancel hides the bar, still no flush", $g("tw-stopbar").style.display === "none" && lastPrompt === null);
window.TW.stop();
window.TW.confirmStop();
ok("confirmStop flushed the 3 decided rows", !!lastPrompt && JSON.parse(lastPrompt.slice(6)).length === 3);
ok("confirmStop renders terminal screen (no card)", !document.getElementById("tw-card") && /Stopped/.test(document.getElementById("tw-root").textContent));

// Reopen the SAME artifact (same stamp): 13 submitted + 3 flushed = 16 filtered out -> 4 remain.
window.initTriage({ stamp: STAMP, batch: 1, total: 20, emails: mkS(20), tree, quotes });
ok("resume drops the 16 submitted ids", document.getElementById("tw-page").textContent === "Page 1 of 1");
ok("resume shows the 4 missed cards", document.querySelectorAll(".tw-dot").length === 4);
ok("missed-first: page opens on E16 (first un-submitted)", /S16/.test(document.getElementById("tw-card").textContent));

// Finish the 4, submit -> inbox zero. Reopen -> done terminal.
for (let k = 0; k < 4; k++) { document.querySelectorAll(".tw-dot")[k].onclick(); window.TW.decide("ar"); }
window.TW.submit();
ok("inbox-zero celebration card on final submit", /Inbox zero/.test(document.querySelector(".tw-ccard").textContent));
window.initTriage({ stamp: STAMP, batch: 1, total: 20, emails: mkS(20), tree, quotes });
ok("reopen after all done -> inbox-zero terminal", /Inbox zero/.test(document.getElementById("tw-root").textContent) && !document.getElementById("tw-card"));
try { window.localStorage.clear(); } catch (e) {}

/* ===== Skip action — no-op "keep" that satisfies the page-submit gate ===== */
console.log("\n== skip action (no-op keep) ==");
window.initTriage({ batch: 1, total: 3, emails: mkS(3), tree });
ok("Skip button present in grid", !!$g("btn-sk"));
document.querySelectorAll(".tw-dot")[0].onclick(); window.TW.decide("ar");
document.querySelectorAll(".tw-dot")[1].onclick(); window.TW.decide("do");
ok("page not submittable with 1 undecided", $g("tw-sub").disabled === true);
document.querySelectorAll(".tw-dot")[2].onclick(); window.TW.decide("sk");
ok("skip marks the card decided", document.querySelectorAll(".tw-dot")[2].className.indexOf("decided") !== -1);
ok("page submittable after skip", $g("tw-sub").disabled === false);
lastPrompt = null; window.TW.submit();
const skrows = JSON.parse(lastPrompt.slice(6));
const skrow = skrows.find((r) => r.decisionKey === "sk");
ok("skip row emitted (decisionKey sk)", !!skrow);
ok("skip resolves to action keep (carrier no-op)", skrow.action === "keep");

/* ===== Defer-subfolder picker — prefill, keyboard, click, none (#243) ===== */
console.log("\n== defer-subfolder picker (#243) ==");
function mkDf(id, sugDest) {
  return { id, sender: id + "@x.dk", date: "Mon", subject: "Defer " + id,
    bodyPreview: "", attachment: null, sentNotice: null,
    badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
    suggestedPath: null, reason: "r", annotation: null, threadRef: null,
    suggestion: sugDest ? makeSuggestion(id, "df", { destination: sugDest }) : null };
}
// DF1 prefilled to a subfolder; DF2/DF3/DF4 no suggestion.
const dfEmails = [
  mkDf("DF1", "Inbox/Defer/Defer_finance"),
  mkDf("DF2", null),
  mkDf("DF3", null),
  mkDf("DF4", null),
];
window.initTriage({ batch: 1, total: 4, emails: dfEmails, tree, deferSubfolders });

// DF1 — prefill from suggestion.parameterisation.destination, then Enter-confirm.
window.TW.decide("df");
ok("DF1 picker visible", $g("tw-dfsub").style.display === "block");
let dcells = document.querySelectorAll("#tw-dfsgrid .tw-ti");
ok("DF1 prefill selects suggested subfolder (Defer_finance)", dcells[2].classList.contains("sel") && /Defer_finance/.test(dcells[2].textContent));
ok("DF1 prefill focuses the suggested cell", dcells[2].classList.contains("foc"));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" })); // select + confirm in one keystroke
ok("DF1 Enter-confirm closes the panel", $g("tw-wdp").style.display === "none");

// DF2 — no prefill; ArrowDown then Enter selects the first real subfolder.
document.querySelectorAll(".tw-dot")[1].onclick();
window.TW.decide("df");
dcells = document.querySelectorAll("#tw-dfsgrid .tw-ti");
ok("DF2 none selected by default (no suggestion)", dcells[0].classList.contains("sel"));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown" }));
ok("DF2 ArrowDown moves focus to Defer_eboks", dcells[1].classList.contains("foc"));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));

// DF3 — no prefill; click-select Defer_finance (operator may still type a note).
document.querySelectorAll(".tw-dot")[2].onclick();
window.TW.decide("df");
dcells = document.querySelectorAll("#tw-dfsgrid .tw-ti");
dcells[2].dispatchEvent(new window.Event("click"));
ok("DF3 click selects Defer_finance (sel)", document.querySelectorAll("#tw-dfsgrid .tw-ti")[2].classList.contains("sel"));
document.getElementById("tw-wd-note").value = "with a note too";
window.TW.confirmWaitDefer();

// DF4 — leave none selected; destination must be omitted.
document.querySelectorAll(".tw-dot")[3].onclick();
window.TW.decide("df");
window.TW.confirmWaitDefer();

ok("all 4 df decided -> submit enabled", $g("tw-sub").disabled === false);
lastPrompt = null;
window.TW.submit();
const dfRows = JSON.parse(lastPrompt.slice("batch:".length));
const dfById = Object.fromEntries(dfRows.map((r) => [r.emailId, r]));
ok("DF1 prefill+Enter -> destination = suggested path", dfById.DF1.user_typed_params.destination === "Inbox/Defer/Defer_finance");
ok("DF1 decisionKey=df action=df", dfById.DF1.decisionKey === "df" && dfById.DF1.action === "df");
ok("DF2 arrow+Enter -> destination = Defer_eboks", dfById.DF2.user_typed_params.destination === "Inbox/Defer/Defer_eboks");
ok("DF3 click+note -> destination = Defer_finance AND contextNote set", dfById.DF3.user_typed_params.destination === "Inbox/Defer/Defer_finance" && dfById.DF3.user_typed_params.contextNote === "with a note too");
ok("DF4 none -> destination omitted", !("destination" in dfById.DF4.user_typed_params));

// Picker is suppressed entirely when no deferSubfolders are baked (degraded mode).
console.log("== df picker suppressed when no deferSubfolders (#243) ==");
window.initTriage({ batch: 1, total: 1, emails: [mkDf("DZ", null)], tree }); // no deferSubfolders
window.TW.decide("df");
ok("df panel still opens with no deferSubfolders", $g("tw-wdp").style.display === "block");
ok("df picker hidden when deferSubfolders empty/absent", $g("tw-dfsub").style.display === "none");
document.getElementById("tw-wd-note").value = "no picker here";
window.TW.confirmWaitDefer();
ok("df with no picker still works (decided)", document.querySelectorAll(".tw-dot")[0].className.indexOf("decided") !== -1);

/* ===== #195 two-char keyboard: a→r reaches `ar` (no single-key short-circuit) ===== */
console.log("\n== #195 keyboard ar / ag reachability ==");
window.initTriage({ batch: 1, total: 2, emails: [mkP(0), mkP(1)], tree });
document.querySelectorAll(".tw-dot")[0].onclick();
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a" }));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r" }));
ok("#195 'a' then 'r' decides E0 (ar reachable, not short-circuited to agree)", document.querySelectorAll(".tw-dot")[0].className.indexOf("decided") !== -1);
document.querySelectorAll(".tw-dot")[1].onclick();
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "a" }));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "g" }));
ok("#195 'a' then 'g' decides E1 (agree)", document.querySelectorAll(".tw-dot")[1].className.indexOf("decided") !== -1);
lastPrompt = null; window.TW.submit();
const kbById = Object.fromEntries(JSON.parse(lastPrompt.slice(6)).map((r) => [r.emailId, r]));
ok("#195 a→r row carries decisionKey=ar", kbById.E0.decisionKey === "ar");
ok("#195 a→g row carries decisionKey=ag (agree)", kbById.E1.decisionKey === "ag");

/* ===== #242 ar contract destination materialised on accept; override never inherits ===== */
console.log("\n== #242 ar destination baked (accept) vs override (no inherit) ==");
const arAccept = { id: "ARA", sender: "a@x.dk", date: "Mon", subject: "Archive me",
  bodyPreview: "", attachment: null, sentNotice: null, badgeLabel: "Triage dump",
  badgeClass: "badge-ar", suggestedAction: "ar", suggestedPath: null, reason: "",
  annotation: null, threadRef: null,
  suggestion: makeSuggestion("ARA", "ar", { destination: ".PARA-personal/4_Archive/0_Inbox_trash" }) };
const arOverride = { id: "ARO", sender: "b@x.dk", date: "Mon", subject: "Override to archive",
  bodyPreview: "", attachment: null, sentNotice: null, badgeLabel: "PARA folder",
  badgeClass: "badge-pa", suggestedAction: "pa", suggestedPath: ".PARA-work/2_Areas/Tatiana",
  reason: "", annotation: null, threadRef: null,
  suggestion: makeSuggestion("ARO", "pa", { destination: ".PARA-work/2_Areas/Tatiana" }) };
window.initTriage({ batch: 1, total: 2, emails: [arAccept, arOverride], tree });
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("ar"); // accept the ar suggestion -> bake the contract destination
document.querySelectorAll(".tw-dot")[1].onclick();
window.TW.decide("ar"); // override a pa suggestion to ar -> must NOT bake the pa leaf (#258)
lastPrompt = null; window.TW.submit();
const arById = Object.fromEntries(JSON.parse(lastPrompt.slice(6)).map((r) => [r.emailId, r]));
ok("#242 ar accept bakes the contract destination into user_typed_params",
  arById.ARA.user_typed_params.destination === ".PARA-personal/4_Archive/0_Inbox_trash");
ok("#242 ar accept carries no suggestion payload", !("suggestion" in arById.ARA));
ok("#242 ar accept paramsEdited=false (contract not editable)", arById.ARA.paramsEdited === false);
ok("#242 ar OVERRIDE of a pa suggestion does NOT bake the pa destination (#258)",
  !("destination" in arById.ARO.user_typed_params));
ok("#242 ar override carries no suggestion payload", !("suggestion" in arById.ARO));

/* ===== #183 empty-state for a no-suggestion card (suggestedAction null) ===== */
console.log("\n== #183 no-suggestion empty state ==");
const noSug = { id: "NS1", sender: "x@x.dk", date: "Mon", subject: "No suggestion here",
  bodyPreview: "", attachment: null, sentNotice: null,
  badgeLabel: "", badgeClass: "badge-un", suggestedAction: null,
  suggestedPath: null, reason: "", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noSug], tree });
ok("#183 no-suggestion card shows the marker text", /no Stage 2 suggestion/.test(document.getElementById("tw-card").textContent));
ok("#183 marker uses the muted tw-nosug class", !!document.querySelector(".tw-nosug"));
ok("#183 nothing highlighted when there is no suggested action", document.querySelectorAll("button.tw-a.hl").length === 0);

/* ===== #266 HTML-escape every email-derived string (raw-HTML injection) ===== */
console.log("\n== #266 HTML-escape email-derived strings ==");
const xss = { id: "X1", sender: "<b>e</b>vil@x.dk", date: "Mon <09:00>", subject: "<img src=x onerror=alert(1)>hi",
  bodyPreview: "<script>alert('p')</script> body & stuff", attachment: "<i>a</i>.pdf", sentNotice: "<u>sent</u>",
  badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
  suggestedPath: "<x>/path", reason: "<reason> & more", annotation: "<note>",
  threadRef: '<3> "others"', threadCount: 3,
  suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [xss], tree, deferSubfolders });
ok("#266 no <img> element injected from subject", document.querySelector("#tw-card img") === null);
ok("#266 no <script> element injected from bodyPreview", document.querySelector("#tw-card script") === null);
ok("#266 no <b> element injected from sender", document.querySelector(".tw-meta b") === null);
ok("#266 bodyPreview survives as escaped text (not markup)", document.querySelector(".tw-body").textContent.includes("<script>alert('p')</script>"));
ok("#266 subject survives as escaped text", document.querySelector(".tw-subj").textContent.includes("<img src=x onerror=alert(1)>hi"));
ok("#266 threadRef survives as escaped text in the chip title",
  document.querySelector(".tw-thc").title === '<3> "others"');
// The quote is the break-out character in an attribute context, and it is the
// one escHtml leaves alone — so escAttr's job is exactly this. (`<`/`>` need no
// escaping inside an attribute value and the serializer prints them raw.)
ok("#266 chip title escapes the quote that would break out of the attribute",
  document.querySelector(".tw-subj").innerHTML.includes("&quot;others&quot;"));
ok("#266 reason survives as escaped text", document.querySelector(".tw-reason").textContent.includes("<reason> & more"));
ok("#266 card innerHTML carries escaped entity (&lt;script&gt;)", document.getElementById("tw-card").innerHTML.includes("&lt;script&gt;"));

/* ===== #18 From/Date aligned grid; decision tag in its own column ===== */
console.log("\n== #18 From/Date aligned grid, tag in own column ==");
const STYLE = document.querySelector("style").textContent;
ok("#18 .tw-meta is a grid (no space-between header)", STYLE.includes(".tw-meta{display:grid"));
ok("#18 .tw-dtag no longer uses margin-left:auto", !/\.tw-dtag\{[^}]*margin-left:auto/.test(STYLE));
ok("#18 .tw-dtag sits in its own grid column (justify-self:end)", /\.tw-dtag\{[^}]*justify-self:end/.test(STYLE));
window.initTriage({ batch: 1, total: 2, emails: [mkP(0), mkP(1)], tree });
ok("#18 header rendered as .tw-meta grid", !!document.querySelector(".tw-meta"));
ok("#18 From + Date labels both present", (() => { const ks = [...document.querySelectorAll(".tw-meta .tw-k")].map((k) => k.textContent); return ks.includes("From") && ks.includes("Date"); })());
document.querySelectorAll(".tw-dot")[0].onclick();
window.TW.decide("ar");                                   // decide E0, cursor advances to E1
document.querySelectorAll(".tw-dot")[0].onclick();        // back to the decided E0
ok("#18 decided card renders .tw-dtag inside the grid", !!document.querySelector(".tw-meta .tw-dtag"));
ok("#18 From label still present alongside the tag (not collapsed)", [...document.querySelectorAll(".tw-meta .tw-k")].some((k) => k.textContent === "From"));

/* ===== #331/2 thread chip on the subject line (retires the #263 reserved row) =====
   #263 kept a full-width thread row on every card, empty when there was no
   thread, so heights stayed constant. The S118 calibration render showed that
   empty band reading as dead whitespace above From, and cardMinHeightPx (#290)
   now holds height stability instead — so the row is gone and the reference is a
   chip beside the subject. */
console.log("\n== #331/2 thread chip on the subject line ==");
ok("#331/2 the reserved .tw-thr row is gone from the stylesheet",
  !/\.tw-thr\{/.test(STYLE));
const noThr = { id: "NT", sender: "a@x.dk", date: "Mon", subject: "no thread",
  bodyPreview: "x", attachment: null, sentNotice: null, badgeLabel: "Defer", badgeClass: "badge-df",
  suggestedAction: "df", suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noThr], tree });
ok("#331/2 no thread row rendered at all when there is no thread",
  document.querySelector(".tw-thr") === null);
ok("#331/2 no chip when there is no thread", document.querySelector(".tw-thc") === null);
const yesThr = Object.assign({}, noThr, { id: "YT", subject: "threaded",
  threadRef: "3 other emails in this thread", threadCount: 3 });
window.initTriage({ batch: 1, total: 1, emails: [yesThr], tree });
ok("#331/2 chip renders inside the subject line, not above it",
  !!document.querySelector(".tw-subj .tw-thc"));
ok("#331/2 no sibling on this page -> bare run total, not a puzzling 0/3",
  document.querySelector(".tw-thc").textContent.trim() === "🔗 3");
ok("#331/2 the sentence is the hover text",
  document.querySelector(".tw-thc").title === "3 other emails in this thread");
// Back-compat: an artifact baked before threadCount existed carries only the
// prose. The chip still renders, from the page-local count the widget derives.
const oldThr = Object.assign({}, noThr, { id: "OT", subject: "old bake",
  threadRef: "2 other emails in this thread" });
const oldThr2 = Object.assign({}, oldThr, { id: "OT2" });
oldThr.metadata = { conversationId: "COLD" };
oldThr2.metadata = { conversationId: "COLD" };
window.initTriage({ batch: 1, total: 2, emails: [oldThr, oldThr2], tree });
ok("#331/2 no threadCount (pre-#331 bake) -> chip still renders from the page count",
  document.querySelector(".tw-thc").textContent.trim() === "🔗 1");

/* ===== #21 completion card after the last decided card ===== */
console.log("\n== #21 completion-signal card ==");
// Gate: not reachable until the page is fully decided.
window.initTriage({ batch: 1, total: 2, emails: [mkP(0), mkP(1)], tree });
ok("#21 no completion card on a fresh page", !document.querySelector(".tw-ccard"));
document.querySelectorAll(".tw-dot")[0].onclick(); window.TW.decide("ar"); // E0 decided -> advance to E1
document.querySelectorAll(".tw-dot")[1].onclick();                          // sit on E1 (undecided)
window.TW.go(1);
ok("#21 completion gated while a card is still undecided", !document.querySelector(".tw-ccard"));
// Single page, decide all -> completion card surfaces as the done signal.
window.initTriage({ batch: 1, total: 3, emails: [mkP(0), mkP(1), mkP(2)], tree });
for (let k = 0; k < 3; k++) { document.querySelectorAll(".tw-dot")[k].onclick(); window.TW.decide("ar"); }
ok("#21 completion card shown once every card decided", !!document.querySelector(".tw-ccard"));
ok("#21 position reads complete", document.getElementById("tw-pos").textContent === "✓ complete");
ok("#21 action grid hidden on the completion card", document.querySelector(".tw-bg").style.display === "none");
ok("#21 dots count only the 3 emails (card 14 is not a dot)", document.querySelectorAll(".tw-dot").length === 3);
ok("#21 counter still reads 3 / 3 (completion card excluded)", document.getElementById("tw-dc").textContent === "3 / 3 decided");
ok("#21 submit enabled on the completion card", document.getElementById("tw-sub").disabled === false);
ok("#21 keyboard/decide inert on completion card (no re-decide)", (() => { window.TW.decide("do"); return document.querySelector(".tw-ccard") && /3 \/ 3/.test(document.getElementById("tw-dc").textContent); })());
window.TW.go(-1);
ok("#21 Prev leaves completion back to a real card (no trap)", !document.querySelector(".tw-ccard") && !!document.querySelector(".tw-meta"));
window.TW.go(1);
ok("#21 forward re-reaches the completion card", !!document.querySelector(".tw-ccard"));
lastPrompt = null;
window.TW.submit();
ok("#21 submit from completion emits the 3-row batch", !!lastPrompt && lastPrompt.startsWith("batch:") && JSON.parse(lastPrompt.slice(6)).length === 3);
ok("#21 post-submit completion card celebrates (inbox zero)", /inbox zero/i.test(document.querySelector(".tw-ccard").textContent));
ok("#21 action grid restored after navigating back to a card", (() => { document.querySelectorAll(".tw-dot")[0].onclick(); return document.querySelector(".tw-bg").style.display === ""; })());

/* ===== #270 From shows sender name AND address (producer senderAddress) ===== */
console.log("\n== #270 From: name + address ==");
ok("#270 .tw-vaddr muted-address style present", STYLE.includes(".tw-vaddr{display:block"));
const named = { id: "NM", sender: "Jonas Holm", senderAddress: "jonas@x.dk", date: "Mon", subject: "s",
  bodyPreview: "b", badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
  suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [named], tree });
ok("#270 display name rendered in the From value", document.querySelector(".tw-meta .tw-v").textContent.includes("Jonas Holm"));
ok("#270 address rendered as a second muted line", !!document.querySelector(".tw-vaddr") && document.querySelector(".tw-vaddr").textContent === "jonas@x.dk");

// address equals the display name (no envelope name) -> no duplicate second line
const noName = { id: "NN", sender: "jonas@x.dk", senderAddress: "jonas@x.dk", date: "Mon", subject: "s",
  bodyPreview: "b", badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
  suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noName], tree });
ok("#270 no second line when address equals display name", document.querySelector(".tw-vaddr") === null);

// absent senderAddress -> single-string fallback (back-compat with pre-#270 payloads)
const noAddr = { id: "NA", sender: "team@x.dk", date: "Mon", subject: "s",
  bodyPreview: "b", badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
  suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noAddr], tree });
ok("#270 degrades to single From string when senderAddress absent",
  document.querySelector(".tw-vaddr") === null && document.querySelector(".tw-meta .tw-v").textContent.includes("team@x.dk"));

// #266: a hostile address must be escaped, never injected as markup
const evilAddr = { id: "EA", sender: "Mallory", senderAddress: "<b>x</b>@x.dk", date: "Mon", subject: "s",
  bodyPreview: "b", badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df",
  suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [evilAddr], tree });
ok("#270 senderAddress is HTML-escaped (#266)",
  document.querySelector(".tw-vaddr b") === null && document.querySelector(".tw-vaddr").textContent.includes("<b>x</b>@x.dk"));

/* ===== #196 resolved destination in the echo (fixed folders + escaping) ===== */
console.log("\n== #196 decision-echo destination ==");
// A direct "do" press resolves to the fixed triage folder Inbox/Do_now.
const doCard = { id: "DO", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "Do now", badgeClass: "badge-do", suggestedAction: "do", suggestedPath: null,
  reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [doCard], tree });
window.TW.decide("do");
document.querySelectorAll(".tw-dot")[0].onclick();  // deciding the only card jumps to completion; return to it
ok("#196 fixed-folder action resolves to Inbox/Do_now in the echo",
  document.querySelector(".tw-ydest") && document.querySelector(".tw-ydest").textContent.includes("Inbox/Do_now"));

// Skip (sk -> keep) has no destination — the echo shows no arrow/path.
const skCard = { id: "SK", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "Triage dump", badgeClass: "badge-ar", suggestedAction: "ar", suggestedPath: null,
  reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [skCard], tree });
window.TW.decide("sk");
document.querySelectorAll(".tw-dot")[0].onclick();  // return to the decided card
ok("#196 keep/skip card has the echo but no destination arrow",
  !!document.querySelector(".tw-ydec") && document.querySelector(".tw-ydest") === null);

// suggestion line still shows the SUGGESTED path (not the decided destination).
const sugCard = { id: "SG", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa",
  suggestedPath: ".PARA-work/1_Current_projects/Atlas", reason: "r", annotation: null,
  threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [sugCard], tree });
ok("#196 suggestion line still shows suggestedPath (not the decided dest)",
  document.querySelector(".tw-spath") && document.querySelector(".tw-spath").textContent.includes(".PARA-work/1_Current_projects/Atlas"));

// #266: a hostile typed destination must be escaped in the echo, never injected.
const evilDest = { id: "ED", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa", suggestedPath: null,
  reason: "r", annotation: null, threadRef: null,
  suggestion: makeSuggestion("ED", "pa", { destination: "<b>x</b>/Hack" }) };
window.initTriage({ batch: 1, total: 1, emails: [evilDest], tree });
window.TW.decide("ag");
document.querySelectorAll(".tw-dot")[0].onclick();  // return from completion card to the decided card
ok("#196 echo destination is HTML-escaped (#266)",
  document.querySelector(".tw-ydest b") === null && document.querySelector(".tw-ydest").textContent.includes("<b>x</b>/Hack"));

/* ===== #14 current folder on the card face ===== */
console.log("\n== #14 current folder on card ==");
const cfCard = { id: "CF", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  currentFolder: "Inbox/Defer/Defer_eboks", badgeLabel: "Defer", badgeClass: "badge-df",
  suggestedAction: "df", suggestedPath: null, reason: "r", annotation: null, threadRef: null,
  suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [cfCard], tree });
ok("#14 current folder rendered on the card (.tw-cfv)",
  document.querySelector(".tw-cfv") && document.querySelector(".tw-cfv").textContent.includes("Inbox/Defer/Defer_eboks"));
ok("#14 current folder sits in the From/Date meta grid",
  !!document.querySelector(".tw-meta .tw-cfv"));

// degrades cleanly when currentFolder is absent — no Folder row.
const noCf = { id: "NC", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "Defer", badgeClass: "badge-df", suggestedAction: "df", suggestedPath: null,
  reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noCf], tree });
ok("#14 no Folder row when currentFolder absent", document.querySelector(".tw-cfv") === null);

// #266: a hostile currentFolder must be escaped.
const evilCf = { id: "EC", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  currentFolder: "<b>x</b>/Folder", badgeLabel: "Defer", badgeClass: "badge-df",
  suggestedAction: "df", suggestedPath: null, reason: "r", annotation: null, threadRef: null,
  suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [evilCf], tree });
ok("#14 currentFolder is HTML-escaped (#266)",
  document.querySelector(".tw-cfv b") === null && document.querySelector(".tw-cfv").textContent.includes("<b>x</b>/Folder"));

/* ===== #285 nav split: page-nav row separated from per-card nav ===== */
console.log("\n== #285 nav split ==");
window.initTriage({ batch: 1, total: 15, emails: emailsP, tree });
ok("#285 page-nav row exists (.tw-pgnav)", !!document.querySelector(".tw-pgnav"));
ok("#285 page buttons live in the page-nav row, not the per-card nav",
  !!document.querySelector(".tw-pgnav #tw-ppage") && !!document.querySelector(".tw-pgnav #tw-npage") &&
  !document.querySelector(".tw-nav #tw-ppage") && !document.querySelector(".tw-nav #tw-npage"));
ok("#285 per-card nav keeps Prev/Next only", !!document.querySelector(".tw-nav #tw-prev") && !!document.querySelector(".tw-nav #tw-next"));
ok("#285 pages-submitted counter sits in the page-nav row", $g("tw-pgcount").textContent === "0 of 2 pages submitted");
ok("#285 overall counter no longer duplicates pages-submitted", $g("tw-gp").textContent === "0 / 15 decided overall");

/* ===== #281 §B(7) folderState dot + column-header label ===== */
console.log("\n== #281 folderState tri-state ==");
const fsTree = {
  work: { label: "Work", prefix: ".PARA-work", sections: [
    [{ name: "OutlookOnly", folderState: "exists_in_outlook" }, { name: "OnedriveOnly", folderState: "exists_in_onedrive" }], [], [], []] },
  personal: { label: "Personal", prefix: ".PARA-personal", sections: [
    [{ name: "PlainPersonal" }], [], [], []] },
};
const fsEmail = { id: "FS", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
  badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa", suggestedPath: null,
  reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [fsEmail], tree: fsTree });
window.TW.decide("pa");
const fsOut = document.querySelector('.tw-ti[data-col="0"][data-sec="0"][data-idx="0"]'); // OutlookOnly
const fsOd = document.querySelector('.tw-ti[data-col="0"][data-sec="0"][data-idx="1"]');  // OnedriveOnly
ok("#281 onedrive leaf is italic (.nw)", fsOd.classList.contains("nw"));
ok("#281 onedrive leaf carries a right-aligned dot (.tw-fsdot)", !!fsOd.querySelector(".tw-fsdot"));
ok("#281 outlook leaf has no italic and no dot", !fsOut.classList.contains("nw") && !fsOut.querySelector(".tw-fsdot"));
ok("#281 leaf name is wrapped in .tw-ti-name (truncation container)", !!fsOd.querySelector(".tw-ti-name"));
const fsHeaders = document.querySelectorAll(".tw-tr");
ok("#281 work column header shows '· in OneDrive'", /in OneDrive/.test(fsHeaders[0].querySelector(".tw-fshl") ? fsHeaders[0].querySelector(".tw-fshl").textContent : ""));
ok("#281 personal column (no non-default leaf) has no header label", !fsHeaders[1].querySelector(".tw-fshl"));
ok("#281 folder name is HTML-escaped in the tree (#266)", (() => {
  const ev = { label: "Work", prefix: ".PARA-work", sections: [[{ name: "<b>x</b>", folderState: "exists_in_onedrive" }], [], [], []] };
  window.initTriage({ batch: 1, total: 1, emails: [fsEmail], tree: { work: ev, personal: fsTree.personal } });
  window.TW.decide("pa");
  const r = document.querySelector('.tw-ti[data-col="0"][data-sec="0"][data-idx="0"]');
  return !r.querySelector("b") && r.textContent.includes("<b>x</b>");
})());

/* ===== #287 OneDrive-only PARA relevance filter + show-all toggle ===== */
console.log("\n== #287 paraMatches filter ==");
const pmTree = {
  work: { label: "Work", prefix: ".PARA-work", sections: [
    [{ name: "OutlookA", folderState: "exists_in_outlook" },
     { name: "OdMatched", folderState: "exists_in_onedrive" },
     { name: "OdUnmatched", folderState: "exists_in_onedrive" }], [], [], []] },
  personal: { label: "Personal", prefix: ".PARA-personal", sections: [
    [{ name: "PlainP" }], [], [], []] },
};
const MATCHED = ".PARA-work/1_Current_projects/OdMatched";
const UNMATCHED = ".PARA-work/1_Current_projects/OdUnmatched";
const OUTLOOK = ".PARA-work/1_Current_projects/OutlookA";
function paCell(p) { return document.querySelector('.tw-ti[data-path="' + p + '"]'); }
function mkPmEmail(paraMatches) {
  const e = { id: "PM", sender: "x@x.dk", date: "Mon", subject: "s", bodyPreview: "b",
    badgeLabel: "PARA folder", badgeClass: "badge-pa", suggestedAction: "pa", suggestedPath: null,
    reason: "r", annotation: null, threadRef: null, suggestion: null };
  if (paraMatches !== undefined) e.paraMatches = paraMatches;
  return e;
}

// Filtered view: only the matched OneDrive leaf + all Outlook leaves show.
window.initTriage({ batch: 1, total: 1, emails: [mkPmEmail([{ path: MATCHED, score: 1.0 }])], tree: pmTree });
window.TW.decide("pa");
ok("#287 matched OneDrive leaf is shown", !!paCell(MATCHED));
ok("#287 unmatched OneDrive leaf is filtered out", !paCell(UNMATCHED));
ok("#287 Outlook leaf always shown (filter is OneDrive-only)", !!paCell(OUTLOOK));
ok("#287 matched OneDrive leaf keeps its §B(7) dot", !!paCell(MATCHED).querySelector(".tw-fsdot"));
ok("#287 status bar visible + names the relevance filter",
  document.getElementById("tw-pmf").style.display !== "none" && /relevant/i.test($g("tw-pmf").textContent));

// Show-all toggle reveals the unmatched leaf (recall hatch).
window.TW.togglePm();
ok("#287 toggle reveals the unmatched OneDrive leaf", !!paCell(UNMATCHED));
ok("#287 toggle still shows matched + Outlook", !!paCell(MATCHED) && !!paCell(OUTLOOK));
ok("#287 toggled bar offers 'show only relevant'", /only relevant/i.test($g("tw-pmf").textContent));
// Toggle back to filtered.
window.TW.togglePm();
ok("#287 toggling back re-hides the unmatched leaf", !paCell(UNMATCHED));

// Empty paraMatches: every OneDrive-only leaf hidden, Outlook stays.
window.initTriage({ batch: 1, total: 1, emails: [mkPmEmail([])], tree: pmTree });
window.TW.decide("pa");
ok("#287 empty matches -> no OneDrive leaves", !paCell(MATCHED) && !paCell(UNMATCHED));
ok("#287 empty matches -> Outlook still shown", !!paCell(OUTLOOK));
ok("#287 empty matches -> bar reports none matched", /no onedrive/i.test($g("tw-pmf").textContent));

// Back-compat: an email with no paraMatches field shows the full tree, no bar.
window.initTriage({ batch: 1, total: 1, emails: [mkPmEmail(undefined)], tree: pmTree });
window.TW.decide("pa");
ok("#287 no paraMatches field -> show all (back-compat)", !!paCell(MATCHED) && !!paCell(UNMATCHED) && !!paCell(OUTLOOK));
ok("#287 no paraMatches field -> status bar hidden", document.getElementById("tw-pmf").style.display === "none");

// Heights track what's shown: the filtered column renders fewer rows than the
// full tree (the #279 jitter guard — no empty filler rows for hidden leaves).
window.initTriage({ batch: 1, total: 1, emails: [mkPmEmail([{ path: MATCHED, score: 1 }])], tree: pmTree });
window.TW.decide("pa");
const filteredLeaves = document.querySelectorAll('#tw-pgrid .tw-ti').length;
window.TW.togglePm();
const allLeaves = document.querySelectorAll('#tw-pgrid .tw-ti').length;
ok("#287 filtered grid renders fewer leaf cells than show-all (height recomputed)", filteredLeaves < allLeaves);

/* =======================================================================
 * #359 — the wa/df fold-out pre-fills from the operator's prior note
 *
 * A resurfaced deferred email arrives with Stage 2 emitting an empty
 * parameterisation, so the note field used to open blank while the note the
 * operator wrote last time sat on the same record as `priorNote`. They retyped
 * it — which is why the S121 category stacks are byte-identical, and why #360's
 * text dedup only becomes reliable once this works.
 * ======================================================================= */
console.log("== #359 prior-note prefill ==");

function mkNoteEmail(id, priorNote, sugParam) {
  return {
    id, sender: "a@b.dk", date: "Mon 20 Jul 09:00", subject: "Resurfaced deferral",
    bodyPreview: "", badgeLabel: "Defer", badgeClass: "df",
    suggestedAction: "df", suggestedPath: null, reason: "",
    annotation: priorNote, priorNote: priorNote, threadRef: null,
    suggestion: sugParam === undefined ? null : makeSuggestion(id, "df", sugParam),
  };
}
const noteEl = () => document.getElementById("tw-wd-note");
const noteHint = () => document.getElementById("tw-wd-note-pf");
const dateEl = () => document.getElementById("tw-wd-date");

// 1. Prior note present, Stage 2 silent → the prior note fills the field.
window.initTriage({ batch: 1, total: 1, emails: [mkNoteEmail("P1", "Check bank statements")], tree: null });
window.TW.decide("df");
ok("#359 prior note pre-fills the field", noteEl().value === "Check bank statements");
ok("#359 prior note carries the pre-filled styling (tw-pf)", noteEl().classList.contains("tw-pf"));
ok("#359 prior note hint visible", noteHint().style.display === "inline");
ok("#359 prior note hint says it is the operator's own, not a suggestion",
  /previous note/i.test(noteHint().textContent) && !/from suggestion/i.test(noteHint().textContent));

// 2. Stage 2 wins where present — a note proposed on THIS run is the fresher
//    statement than one carried back from a previous one.
window.initTriage({ batch: 1, total: 1,
  emails: [mkNoteEmail("P2", "the old note", { contextNote: "the Stage 2 note" })], tree: null });
window.TW.decide("df");
ok("#359 Stage 2 contextNote takes precedence over the prior note",
  noteEl().value === "the Stage 2 note");
ok("#359 hint reverts to 'from suggestion' when Stage 2 supplied it",
  /from suggestion/i.test(noteHint().textContent));

// 3. An EMPTY Stage 2 note must not shadow a real prior note (emptiness, not
//    presence, is the test — an empty parameterisation string is not a proposal).
window.initTriage({ batch: 1, total: 1,
  emails: [mkNoteEmail("P3", "the old note", { contextNote: "" })], tree: null });
window.TW.decide("df");
ok("#359 empty Stage 2 note falls through to the prior note", noteEl().value === "the old note");

// 4. Neither present → blank, unstyled (the pre-#359 behaviour, preserved).
window.initTriage({ batch: 1, total: 1, emails: [mkNoteEmail("P4", null)], tree: null });
window.TW.decide("df");
ok("#359 no prior note and no suggestion -> field blank", noteEl().value === "");
ok("#359 blank field carries no pre-filled styling", !noteEl().classList.contains("tw-pf"));
ok("#359 blank field hides the hint", noteHint().style.display === "none");

// 5. The DATE does not fall back to a prior value. The carrier writes it to the
//    follow-up flag, so re-committing a stale threshold would pin a resurfaced
//    item's due date in the past. A note re-confirmed is still true; a date is not.
window.initTriage({ batch: 1, total: 1, emails: [mkNoteEmail("P5", "a prior note")], tree: null });
window.TW.decide("df");
ok("#359 date field stays blank on a resurfaced email", dateEl().value === "");
ok("#359 date field carries no pre-filled styling", !dateEl().classList.contains("tw-pf"));

// 6. #242 stamping: re-confirming an UNCHANGED prior note is an accept
//    (paramsEdited=false) — the flag keeps its literal "did they touch a
//    pre-filled field" meaning. Distinguishing this from accepting a Stage 2
//    suggestion is a post-hoc join, deliberately not encoded in the boolean.
window.initTriage({ batch: 1, total: 1, emails: [mkNoteEmail("P6", "unchanged note")], tree: null });
window.TW.decide("df");
window.TW.confirmWaitDefer();
lastPrompt = null;
window.TW.submit();
const p6 = JSON.parse(lastPrompt.slice("batch:".length))[0];
ok("#359 unchanged prior note is carried into the decision row",
  p6.user_typed_params.contextNote === "unchanged note");
ok("#359 re-confirming an unchanged prior note stamps paramsEdited=false",
  p6.paramsEdited === false);

// 7. …and amending it stamps paramsEdited=true, as editing any pre-filled field
//    does. This is the path that only opens up once the field pre-fills at all.
window.initTriage({ batch: 1, total: 1, emails: [mkNoteEmail("P7", "unchanged note")], tree: null });
window.TW.decide("df");
noteEl().value = "amended note";
noteEl().dispatchEvent(new window.Event("input"));
ok("#359 editing a prior note clears its pre-filled styling", !noteEl().classList.contains("tw-pf"));
window.TW.confirmWaitDefer();
lastPrompt = null;
window.TW.submit();
const p7 = JSON.parse(lastPrompt.slice("batch:".length))[0];
ok("#359 amended prior note reaches the row", p7.user_typed_params.contextNote === "amended note");
ok("#359 amending a prior note stamps paramsEdited=true", p7.paramsEdited === true);

/* =======================================================================
 * #311 — plan-escalating suggestions: the mark, and the two-step `ag`
 * -----------------------------------------------------------------------
 * On S109 BOTH create-folder ops in the run came from `ag`, neither
 * destination actively chosen — one of them a confidence-0.5 guess into a
 * folder the operator would not have picked. Recurred S114 and S119. The
 * operator's framing: agreeing to a card is not the same as scrutinising a
 * destination path, and it is certainly not consent to create a folder.
 *
 * Two halves, both asserted here: the card MARKS the consequence, and `ag`
 * on a marked card takes a second deliberate act ON that mark. The second
 * half is what makes the first half more than decoration — a mark you can
 * agree past without touching is a mark you stop reading.
 * ======================================================================= */
console.log("== #311 plan-escalation mark + two-step ag ==");

function mkEscEmail(id, escalation, action) {
  return {
    id, sender: "lead@x.dk", date: "Tue 21 Jul 09:00", subject: "New initiative Helix",
    bodyPreview: "", badgeLabel: "PARA folder", badgeClass: "badge-pa",
    suggestedAction: action || "pa",
    suggestedPath: ".PARA-work/1_Current_projects/Helix",
    reason: "Sender map -> Helix", annotation: null, threadRef: null,
    escalation: escalation,
    suggestion: makeSuggestion(id, action || "pa", {
      destination: ".PARA-work/1_Current_projects/Helix", folderState: "exists_in_onedrive" }),
  };
}
const CREATE_FOLDER = { kind: "create-folder", label: "will create this folder",
                        detail: ".PARA-work/1_Current_projects/Helix" };
const escMark = () => document.querySelector(".tw-esc");

// 1. The mark renders, under the path it is about.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E1", CREATE_FOLDER)], tree: null });
ok("#311 escalation mark rendered on the card face", !!escMark());
ok("#311 mark names the consequence", escMark().textContent.includes("will create this folder"));
ok("#311 mark sits after the suggested path", (() => {
  const html = document.getElementById("tw-card").innerHTML;
  return html.indexOf("tw-spath") < html.indexOf("tw-esc");
})());
ok("#311 mark is not armed before ag is pressed", !escMark().classList.contains("armed"));

// 2. `ag` ARMS — it must not decide. This is the assertion the whole issue
//    turns on: one keystroke can no longer consent to a folder creation.
window.TW.decide("ag");
ok("#311 first ag arms rather than deciding", (() => {
  lastPrompt = null; window.TW.submit();
  return lastPrompt === null;   // nothing decided ⇒ submit has nothing to send
})());
ok("#311 armed mark becomes a control", escMark().classList.contains("armed"));
ok("#311 armed mark says how to confirm", escMark().textContent.includes("press Enter"));
ok("#311 ag button states what is expected next",
  document.getElementById("btn-ag").textContent.includes("Confirm on the mark"));
ok("#311 ag button carries the armed class",
  document.getElementById("btn-ag").classList.contains("armed"));

// 3. Enter confirms — and produces exactly the `ag` decision it always did.
lastPrompt = null;
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
window.TW.submit();
ok("#311 Enter confirms the armed ag", lastPrompt !== null && lastPrompt.startsWith("batch:"));
ok("#311 the confirmed decision is a plain ag", (() => {
  const row = JSON.parse(lastPrompt.slice("batch:".length))[0];
  return row.decisionKey === "ag";
})());

// 4. Clicking the mark is the other confirming gesture. Dispatched as a real
//    click on the element, not a direct confirmAgree() call — the onclick and
//    role="button" wiring is emitted ONLY when armed, so calling through would
//    leave exactly that conditional untested.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E2", CREATE_FOLDER)], tree: null });
ok("#311 the unarmed mark is not a click target", !escMark().getAttribute("role"));
window.TW.decide("ag");
ok("#311 the armed mark is exposed as a button", escMark().getAttribute("role") === "button");
escMark().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
lastPrompt = null;
window.TW.submit();
ok("#311 clicking the mark confirms the armed ag",
  lastPrompt !== null && JSON.parse(lastPrompt.slice("batch:".length))[0].decisionKey === "ag");

// 4b. A second `ag` press is NOT a confirm — the confirming gesture has to land
//     on the mark, or the two-step just becomes "press ag twice", which is the
//     same reflex it exists to interrupt.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E2b", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.decide("ag");
lastPrompt = null;
window.TW.submit();
ok("#311 a second ag press does not confirm", lastPrompt === null);
ok("#311 a second ag press leaves the card armed", escMark().classList.contains("armed"));

// 5. Escape abandons the arm without deciding anything.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E3", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
ok("#311 Escape disarms", !escMark().classList.contains("armed"));
lastPrompt = null;
window.TW.submit();
ok("#311 a disarmed card has no decision", lastPrompt === null);

// 6. Reaching for a DIFFERENT action is a change of mind — it must disarm, so a
//    stale arm can never be confirmed into existence afterwards.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E4", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.decide("un");           // a different decision entirely
window.TW.confirmAgree();          // must be inert now
lastPrompt = null;
window.TW.submit();
ok("#311 choosing another action disarms the pending ag", (() => {
  const row = JSON.parse(lastPrompt.slice("batch:".length))[0];
  return row.decisionKey === "un";
})());

// 7. An arm never travels: navigating away drops it, so it cannot commit on a
//    card the operator has stopped looking at.
window.initTriage({ batch: 1, total: 2,
  emails: [mkEscEmail("E5", CREATE_FOLDER), mkEscEmail("E6", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.go(1);
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
lastPrompt = null;
window.TW.submit();
ok("#311 navigating away disarms (nothing decided on either card)", lastPrompt === null);

// 8. `su` escalates too — the mechanism keys off the escalation's PRESENCE, so a
//    second kind needs no widget change. This asserts that generality directly.
const CREATE_TASK = { kind: "create-task", label: "will create a Sunsama task", detail: null };
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E7", CREATE_TASK, "su")], tree: null });
ok("#311 a create-task escalation marks the card too",
  escMark().textContent.includes("will create a Sunsama task"));
window.TW.decide("ag");
ok("#311 the two-step is driven by presence, not by kind",
  escMark().classList.contains("armed"));

// 9. The negative case, and the one that decides whether the affordance is
//    tolerable day to day: an ordinary card is completely untouched.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E8", null)], tree: null });
ok("#311 no escalation ⇒ no mark", escMark() === null);
lastPrompt = null;
window.TW.decide("ag");
window.TW.submit();
ok("#311 no escalation ⇒ ag still decides in one keystroke",
  lastPrompt !== null && JSON.parse(lastPrompt.slice("batch:".length))[0].decisionKey === "ag");

/* --- The arm must not outlive the states that lock decisions -----------------
 * Found by an independent review of this session's diff, before any of it ran
 * live. `confirmAgree` is the second write path to decisions[], and a write path
 * that skips decide()'s locks is worse than no lock at all: the decision renders
 * as accepted and is then dropped by submit(), so the operator watches a decision
 * land that does not exist. That is the #357 defect class reappearing one layer
 * up, which is precisely the outcome this session is meant to close. */

// 11. Dot-strip navigation disarms, like the arrows do. Without this an arm
//     abandoned by clicking away resurrects when the operator clicks back.
window.initTriage({ batch: 1, total: 2,
  emails: [mkEscEmail("E10", CREATE_FOLDER), mkEscEmail("E11", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
document.querySelectorAll(".tw-dot")[1].onclick();
document.querySelectorAll(".tw-dot")[0].onclick();
ok("#311 an arm does not survive dot navigation", !escMark().classList.contains("armed"));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
lastPrompt = null;
window.TW.submit();
ok("#311 a resurrected card cannot be confirmed without a fresh ag", lastPrompt === null);

// 12. An arm cannot write onto an already-submitted page.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E12", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.confirmAgree();          // decides + submits the page below
lastPrompt = null;
window.TW.submit();
ok("#311 setup: the page submitted", lastPrompt !== null);
window.TW.decide("ag");            // locked page — decide() is inert
window.TW.confirmAgree();          // …and so must confirmAgree() be
lastPrompt = null;
window.TW.submit();
ok("#311 confirmAgree cannot write to a submitted page", lastPrompt === null);

// 13. Stop disarms before it arms its own confirm bar, and Enter under that bar
//     never commits an agree.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E13", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.decide("st");
ok("#311 Stop disarms a pending ag", !escMark().classList.contains("armed"));
document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
lastPrompt = null;
window.TW.cancelStop();
window.TW.submit();
ok("#311 Enter under the stop bar records nothing", lastPrompt === null);

// 14. Opening a panel disarms AND re-renders — otherwise the mark keeps pulsing
//     as a live control that no longer does anything.
window.initTriage({ batch: 1, total: 1, emails: [mkEscEmail("E14", CREATE_FOLDER)], tree: null });
window.TW.decide("ag");
window.TW.decide("cu");            // opens the custom panel
ok("#311 opening a panel clears the armed styling", !escMark().classList.contains("armed"));
ok("#311 opening a panel restores the ag button label",
  document.getElementById("btn-ag").textContent.includes("Agree"));
ok("#311 the disarmed mark is no longer a click target", !escMark().getAttribute("role"));

// 10. The mark is HTML-escaped like every other operator-facing string (#266).
window.initTriage({ batch: 1, total: 1,
  emails: [mkEscEmail("E9", { kind: "create-folder", label: "will create <script>", detail: null })],
  tree: null });
ok("#311 escalation label is HTML-escaped",
  escMark().innerHTML.includes("&lt;script&gt;"));

console.log("\n== RESULT ==  pass=" + pass + "  fail=" + fail);
process.exit(fail ? 1 : 0);
