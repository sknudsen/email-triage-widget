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
ok("#196 decided action button gets .sel (btn-ag)", document.getElementById("btn-ag").classList.contains("sel"));
ok("#195 agree button is btn-ag, old single-char btn-a gone", !!document.getElementById("btn-ag") && !document.getElementById("btn-a"));
ok("#263 .tw-card carries a min-height floor", document.querySelector("style").textContent.includes("min-height:320px"));
ok("#265 .tw-body line-clamp raised to 7", document.querySelector("style").textContent.includes("-webkit-line-clamp:7"));

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
emailsP[0].metadata.conversationId = "CONVPG"; emailsP[0].threadRef = "1 other email in this thread";
emailsP[1].metadata.conversationId = "CONVPG"; emailsP[1].threadRef = "1 other email in this thread";

window.initTriage({ batch: 1, total: 15, emails: emailsP, tree });
ok("page label shows 2 pages", $g("tw-page").textContent === "Page 1 of 2");
ok("13 dots on page 0 (page-scoped)", document.querySelectorAll(".tw-dot").length === 13);
ok("pos is within-page (1 of 13)", $g("tw-pos").textContent === "1 of 13");
ok("thread line mixes run + carousel", !!document.querySelector(".tw-thr") &&
  /1 other email in this thread, 1 in this carousel/.test(document.querySelector(".tw-thr").textContent));
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
  suggestedPath: "<x>/path", reason: "<reason> & more", annotation: "<note>", threadRef: "<3> others",
  suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [xss], tree, deferSubfolders });
ok("#266 no <img> element injected from subject", document.querySelector("#tw-card img") === null);
ok("#266 no <script> element injected from bodyPreview", document.querySelector("#tw-card script") === null);
ok("#266 no <b> element injected from sender", document.querySelector(".tw-meta b") === null);
ok("#266 bodyPreview survives as escaped text (not markup)", document.querySelector(".tw-body").textContent.includes("<script>alert('p')</script>"));
ok("#266 subject survives as escaped text", document.querySelector(".tw-subj").textContent.includes("<img src=x onerror=alert(1)>hi"));
ok("#266 threadRef survives as escaped text", document.querySelector(".tw-thr").textContent.includes("<3> others"));
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

/* ===== #263 thread-ref row reserves stable space ===== */
console.log("\n== #263 thread-ref row reserves space ==");
ok("#263 .tw-thr carries a min-height floor", /\.tw-thr\{[^}]*min-height/.test(STYLE));
const noThr = { id: "NT", sender: "a@x.dk", date: "Mon", subject: "no thread",
  bodyPreview: "x", attachment: null, sentNotice: null, badgeLabel: "Defer", badgeClass: "badge-df",
  suggestedAction: "df", suggestedPath: null, reason: "r", annotation: null, threadRef: null, suggestion: null };
window.initTriage({ batch: 1, total: 1, emails: [noThr], tree });
ok("#263 .tw-thr present even when threadRef is null (no reflow)", !!document.querySelector(".tw-thr"));
ok("#263 empty thread row carries no link glyph", document.querySelector(".tw-thr").textContent.indexOf("🔗") === -1);

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

console.log("\n== RESULT ==  pass=" + pass + "  fail=" + fail);
process.exit(fail ? 1 : 0);
