/**
 * Email Triage Batch Widget
 * Standalone template for CDN hosting.
 * Version 2.0
 * Usage: initTriage({ batch, total, emails, tree })
 *
 * emails: array of { id, sender, date, subject, bodyPreview?, attachment?,
 *         sentNotice?, badgeLabel, badgeClass, suggestedAction,
 *         suggestedPath?, reason, annotation?, priorNote?, threadRef?,
 *         suggestion? }
 *   - bodyPreview: first ~200 chars of email body (shown below subject)
 *   - priorNote: the note this email was last deferred with, carried back from
 *     its Outlook category by Stage 1 (#359). Pre-fills the wa/df fold-out so a
 *     resurfaced item does not have to be re-typed; a Stage 2
 *     parameterisation.contextNote takes precedence. Same source as annotation
 *     today, separate field by contract — annotation is display, priorNote is
 *     re-committed text.
 *   - suggestedPath: full PARA path for ALL suggestion types (shown below reason)
 *     e.g. '.PARA-work/4_Archive/0_Inbox_trash' for triage dump
 *   - escalation (optional): { kind, label, detail } | null — the side-effect this
 *     suggestion's plan carries beyond moving the mail: 'create-folder' for a `pa`
 *     into a folder that is not yet an Outlook mail folder, 'create-task' for `su`
 *     (#311). Derived producer-side (present/widget_payload.plan_escalation); the
 *     widget switches on its PRESENCE, never on `kind`, so a new escalation class
 *     is a producer-only change. Two render consequences: the card draws a mark
 *     (.tw-esc) under the suggested path naming the consequence, and `ag` becomes
 *     a two-step — the first press ARMS (nothing is decided), and the confirming
 *     act is Enter or a click on the mark itself. Rationale: on S109 both
 *     create-folder ops came from `ag` with neither destination actively chosen —
 *     agreeing to a card is not the same as scrutinising a destination path, and
 *     is certainly not consent to create a folder. Cards with no escalation keep
 *     one-keystroke `ag`.
 *   - suggestion: the verbatim Stage 2 Suggestion record for this email, stitched
 *     in by the calling skill (input bridge). Echoed back on each decision row at
 *     submit time. Shape: { emailId, source, action, actionConfidence,
 *     actionReasons, parameterisation, parameterisationConfidence,
 *     parameterisationReasons, relatedDecisions }. Omit if unavailable (-> null).
 * deferSubfolders: [ { name, path, id? } ] — the children of Inbox/Defer, baked
 *   by the Stage 3 producer (present/defer_payload.py) from the Stage 1 snapshot's
 *   context.inboxFolders. Rendered as a select-only picker inside the shared
 *   wait/defer fold-out (#tw-wdp), shown ONLY when wdAction === "df" (hidden for
 *   "wa", which is always Inbox/Waiting). The "none → Inbox/Defer" default is a
 *   first-class grid item, NOT a list entry (the parent itself); picking it omits
 *   user_typed_params.destination so the carrier falls back to flat Inbox/Defer.
 *   Picking a subfolder sets user_typed_params.destination = its path. No "create
 *   new" (deliberate divergence from the PARA picker). Empty / absent -> the picker
 *   is suppressed and df behaves as before (note + date only). #243.
 * tree: { work: { label, prefix, sections: [[{name,isNew?,folderState?}]] },
 *         personal: { label, prefix, sections: [[{name,isNew?,folderState?}]] } }
 *   - folderState (per leaf, optional): the Stage 2 enum
 *     "exists_in_outlook" | "exists_in_onedrive" | "proposed". Supplied by the
 *     calling skill when it builds the tree from the Stage 1 snapshots, so an
 *     override pick can re-stamp the accurate provenance. When absent on an
 *     existing leaf the widget defaults to "exists_in_onedrive" (the tree is the
 *     OneDrive PARA reference). A confirmNew leaf is always "proposed". The
 *     widget never invents provenance — it reflects what the skill marked.
 */
(function () {
  "use strict";

  const SEC_NAMES = ["1 · Projects", "2 · Areas", "3 · Resources", "4 · Archive"];
  const SEC_KEYS = ["1_Current_projects", "2_Areas", "3_Resources", "4_Archive"];

  function initTriage(cfg) {
    const tree = cfg.tree;
    const batchNum = cfg.batch || 1;
    const quotes = (cfg.quotes && cfg.quotes.length) ? cfg.quotes.slice() : [];
    const stamp = cfg.stamp || null;
    const deferSubfolders = (cfg.deferSubfolders && cfg.deferSubfolders.length) ? cfg.deferSubfolders.slice() : [];
    const root = document.getElementById("tw-root");
    /* #290 render tuning (stage3-tuning.yaml → assemble_config → cfg.widget):
       apply the card min-height floor + bodyPreview scroll-cap as CSS custom
       properties that .tw-card / .tw-body read via var(...,default). Absent or
       partial cfg.widget leaves the CSS defaults (0px floor, 126px body cap). */
    if (root && cfg.widget) {
      const cmh = cfg.widget.cardMinHeightPx;
      if (typeof cmh === "number") root.style.setProperty("--tw-card-min-h", cmh + "px");
      const bmh = cfg.widget.bodyMaxHeightPx;
      if (typeof bmh === "number") root.style.setProperty("--tw-body-max-h", bmh + "px");
    }
    function pickQuote() { return quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : ""; }

    /* --- Resume persistence (Stop / #214). When the config carries a stamp,
       remember which emailIds were submitted (per-page submit OR a Stop flush)
       in localStorage, and on reopen drop them so only the remaining cards
       render — the missed cards surface first, and an already-moved email is
       never re-dispatched (so the executor can't 404 on a re-submit). Gated on
       `stamp`, so show_widget / jsdom runs without one keep the old behaviour. */
    const STORE_KEY = stamp ? ("triage:submitted:" + stamp) : null;
    function loadSubmitted() {
      if (!STORE_KEY) return {};
      try { const raw = window.localStorage.getItem(STORE_KEY); if (raw) { const m = {}; JSON.parse(raw).forEach((id) => { m[id] = true; }); return m; } } catch (e) {}
      return {};
    }
    function persistSubmitted(ids) {
      if (!STORE_KEY || !ids.length) return;
      try { const m = loadSubmitted(); ids.forEach((id) => { m[id] = true; }); window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.keys(m))); } catch (e) {}
    }
    const priorSubmitted = loadSubmitted();
    const emails = (cfg.emails || []).filter((e) => !priorSubmitted[e.id]);

    // Everything in this snapshot was already triaged in a prior sitting.
    if (emails.length === 0) {
      const q0 = pickQuote();
      root.innerHTML = '<div class="tw-done"><div class="tw-done-h">🎉 Inbox zero</div>' +
        '<div class="tw-done-s">Every card in this snapshot has been triaged.</div>' +
        (q0 ? '<div class="tw-quote">' + q0 + "</div>" : "") + "</div>";
      window.TW = { go() {}, goPage() {}, decide() {}, submit() {}, stop() {}, confirmStop() {}, cancelStop() {}, confirmAgree() {}, cancelAgree() {}, toggleDetails() {} };
      return;
    }

    /* --- Paging (#214) — fixed pages of 13, client-side over the baked set.
       The artifact bakes ALL triage subjects; the widget paginates them in the
       browser (zero latency) and submits one append-only batch per page. `cur`
       is a global index into `emails`; navigation/dots/submit are scoped to the
       current page. */
    const PAGE_SIZE = 13;
    const pageCount = Math.max(1, Math.ceil(emails.length / PAGE_SIZE));
    let curPage = 0;
    let stopped = false;       // Stop ends the sitting (terminal screen)
    const submittedPages = {}; // page index -> true once its batch is submitted
    function pageBounds(p) {
      const start = p * PAGE_SIZE;
      return { start: start, end: Math.min(start + PAGE_SIZE, emails.length) };
    }
    function pageDecidedCount(p) {
      const b = pageBounds(p);
      let n = 0;
      for (let i = b.start; i < b.end; i++) if (decisions[i]) n++;
      return n;
    }

    /* --- State --- */
    let cur = 0;
    // #21: completion card. A display-only 14th slot per page, reachable only once
    // every card on the page is decided. It is NOT an email (never enters
    // `decisions`, never emitted in a batch, never a dot), so the drain's per-page
    // row logic and the "N / N decided" counters ignore it. Pre-submit it confirms
    // the page is complete and points at Submit; post-submit it celebrates. Back-nav
    // to the decided cards stays available (it is not a terminal overlay).
    let showCompletion = false;
    const decisions = emails.map(() => null);
    let detailsOpen = false; // S40 details panel: sticky across navigation
    let activePanel = null,
      wdAction = null, // 'wa' | 'df' — which action opened the shared wait/defer panel
      dfDest = null,   // df picker: chosen subfolder path, or null = none → Inbox/Defer (#243)
      dfPrefill = null, // df picker: the subfolder Stage 2 pre-filled (edit-vs-accept baseline, #242)
      wdEdited = false, // wait/defer: did the operator touch a pre-filled field? (#242 edit-vs-accept)
      dfFocus = 0,     // df picker: index of the keyboard-focused grid cell (#243)
      paraShowAll = false, // #287: PARA picker "show all" — false filters OneDrive-only
                           // leaves to emails[cur].paraMatches; true drops back to the full
                           // tree (the recall hatch). Reset to false each time the panel opens.
      viewTree = tree, // #287: the filtered tree buildTree renders + nav reads. Equals `tree`
                       // until the first buildTree(); rebuilt per open so heights track what's shown.
      agArmed = null,  // #311: index of the card whose `ag` is armed and awaiting a
                       // second, deliberate confirm on the escalation mark. null =
                       // nothing armed. Card-scoped on purpose: navigating away is a
                       // disarm, so an arm can never survive to commit on a card the
                       // operator was no longer looking at.
      fCol = 0,
      fSec = 0,
      fIdx = 0;

    /* --- Inject CSS --- */
    const style = document.createElement("style");
    style.textContent = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-sans,system-ui,sans-serif);color:var(--color-text-primary);font-size:14px}
.tw-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.tw-lbl{font-size:12px;color:var(--color-text-secondary);white-space:nowrap}
.tw-dots{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.tw-dot{width:10px;height:10px;border-radius:50%;background:var(--color-background-secondary);border:1px solid var(--color-border-tertiary);cursor:pointer}
.tw-dot.decided{background:var(--color-border-info)}
.tw-dot.current{box-shadow:0 0 0 2px var(--color-border-info)}
.tw-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.tw-pgnav{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}
.tw-pgnav .tw-lbl{flex:1;text-align:center}
.tw-nbtn{font-size:13px;padding:5px 12px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer}
.tw-nbtn:hover{background:var(--color-background-secondary)}
.tw-nbtn:disabled{opacity:.3;cursor:default}
.tw-card{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1.25rem;min-height:var(--tw-card-min-h,0px);margin:0 0 .75rem}
.tw-mr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.tw-k{font-size:12px;color:var(--color-text-secondary)}
.tw-v{font-size:14px;color:var(--color-text-primary)}
.tw-subj{font-size:16px;font-weight:500;color:var(--color-text-primary);margin:8px 0 4px}
.tw-hr{border:none;border-top:.5px solid var(--color-border-tertiary);margin:12px 0}
.tw-badge{font-size:11px;font-weight:500;padding:3px 8px;border-radius:var(--border-radius-md);white-space:nowrap}
.badge-pa{background:var(--color-background-warning);color:var(--color-text-warning)}
.badge-do{background:var(--color-background-success);color:var(--color-text-success)}
.badge-su{background:var(--color-background-info);color:var(--color-text-info)}
.badge-ar,.badge-df,.badge-wa,.badge-un{background:var(--color-background-secondary);color:var(--color-text-secondary)}
.badge-de{background:var(--color-background-danger);color:var(--color-text-danger)}
.tw-reason{font-size:13px;color:var(--color-text-secondary);line-height:1.5}
.tw-body{font-size:12px;color:var(--color-text-tertiary);line-height:1.5;margin:4px 0 0;white-space:pre-line;max-height:var(--tw-body-max-h,126px);overflow-y:auto}
.tw-spath{font-size:11px;color:var(--color-text-tertiary);font-family:var(--font-mono,monospace);margin-top:2px}
/* #311 plan-escalation mark: sits under the suggested path, and becomes the
   confirm target once \`ag\` is armed. Warning-toned unarmed (a consequence, not
   an error); when armed it gains a ring + pulse and reads as a control. */
.tw-esc{display:flex;align-items:center;gap:6px;margin-top:4px;padding:3px 7px;border-radius:var(--border-radius-md);background:var(--color-background-warning);color:var(--color-text-warning);font-size:11px;font-weight:500;width:fit-content;max-width:100%}
.tw-escdot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
.tw-esc.armed{cursor:pointer;box-shadow:0 0 0 2px var(--color-text-warning);animation:tw-escpulse 1s ease-in-out infinite}
.tw-esc.armed:hover{opacity:.85}
.tw-escgo{font-size:10px;font-weight:600;opacity:.9;margin-left:2px}
@keyframes tw-escpulse{0%,100%{opacity:1}50%{opacity:.55}}
/* A blinking control is the accessibility-hostile version of this affordance:
   drop the motion and keep the ring, which is what carries the meaning. */
@media (prefers-reduced-motion:reduce){.tw-esc.armed{animation:none}}
.tw-sent{font-size:12px;color:var(--color-text-secondary);background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:6px 10px;margin-top:8px}
.tw-thc{font-size:12px;font-weight:400;color:var(--color-text-info);margin-left:8px;white-space:nowrap;cursor:help}
.tw-meta{display:grid;grid-template-columns:auto 1fr auto;column-gap:8px;row-gap:4px;align-items:baseline;margin-bottom:4px}
.tw-vaddr{display:block;font-size:11px;font-weight:400;color:var(--color-text-tertiary)}
.tw-dtag{font-size:11px;padding:2px 8px;border-radius:var(--border-radius-md);background:var(--color-background-success);color:var(--color-text-success);justify-self:end}
.tw-ydec{font-size:12px;font-weight:600;color:var(--color-text-success);margin-top:6px;display:flex;align-items:center;gap:6px}
.tw-ydec .tw-ac{font-size:10px;color:var(--color-text-success);font-family:var(--font-mono)}
.tw-ydec .tw-ydest{font-family:var(--font-mono,monospace);font-weight:500}
.tw-meta .tw-cfv{font-family:var(--font-mono,monospace);font-size:11px;color:var(--color-text-tertiary)}
.tw-nosug{font-style:italic;color:var(--color-text-tertiary)}
.tw-cl{font-size:10px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.tw-bg{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.tw-bc{display:flex;flex-direction:column;gap:4px}
button.tw-a{font-size:13px;padding:7px 8px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer;text-align:left;width:100%}
button.tw-a:hover{background:var(--color-background-secondary)}
button.tw-a:active{transform:scale(.98)}
button.tw-a .tw-ac{font-size:10px;color:var(--color-text-tertiary);display:block;font-family:var(--font-mono)}
button.tw-a.hl{border-color:var(--color-border-info);background:var(--color-background-info);box-shadow:0 0 0 2px var(--color-border-info);font-weight:600}
button.tw-a.hl .tw-ac{color:var(--color-text-info)}
button.tw-a.sel{border-color:var(--color-text-success);background:var(--color-background-success);font-weight:600}
button.tw-a.sel .tw-ac{color:var(--color-text-success)}
/* #311: the armed \`ag\` — the button states what is expected next rather than
   offering the act, so the second press isn't a guess. */
button.tw-a.armed{border-color:var(--color-text-warning);background:var(--color-background-warning);color:var(--color-text-warning);font-weight:600}
button.tw-a.armed .tw-ac{color:var(--color-text-warning)}
.tw-kh{font-size:11px;color:var(--color-text-tertiary);margin-top:8px;text-align:right}
.tw-sr{margin-top:12px;text-align:center}
.tw-sb{font-size:14px;padding:10px 24px;border-radius:var(--border-radius-md);border:none;background:var(--color-border-info);color:#fff;cursor:pointer;font-weight:500}
.tw-sb:disabled{opacity:.3;cursor:default}
.tw-sb:hover:not(:disabled){opacity:.85}
.tw-stopbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:10px;padding:8px 12px;border-radius:var(--border-radius-md);background:var(--color-background-warning);color:var(--color-text-warning);font-size:13px}
.tw-done{padding:2rem 1rem;text-align:center}
.tw-done-h{font-size:20px;font-weight:600;color:var(--color-text-primary);margin-bottom:8px}
.tw-done-s{font-size:13px;color:var(--color-text-secondary);margin-bottom:14px}
.tw-quote{font-size:14px;font-style:italic;color:var(--color-text-success);max-width:34rem;margin:0 auto}
.tw-ccard{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px}
.tw-cc-h{font-size:18px;font-weight:600;color:var(--color-text-success)}
.tw-cc-s{font-size:13px;color:var(--color-text-secondary);max-width:32rem;line-height:1.5}
.tw-ccard .tw-quote{font-size:17px;margin-top:4px}
.tw-pnl{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1rem 1.25rem;margin-top:6px}
.tw-pt{font-size:13px;font-weight:500;margin-bottom:10px;color:var(--color-text-primary)}
.tw-pg{display:grid;grid-template-columns:1fr 1fr}
.tw-pc:first-child{padding-right:12px;border-right:.5px solid var(--color-border-tertiary)}
.tw-pc:last-child{padding-left:12px}
.tw-tr{font-size:12px;font-weight:500;color:var(--color-text-secondary);padding:4px 0;border-bottom:.5px solid var(--color-border-tertiary);margin-bottom:4px;display:flex;justify-content:space-between;align-items:baseline}
.tw-fshl{font-size:10px;color:var(--color-text-tertiary);font-style:italic;font-weight:400}
.tw-tsl{font-size:10px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.05em;padding:6px 4px 3px}
.tw-ti{font-size:13px;color:var(--color-text-primary);padding:4px 8px;border-radius:var(--border-radius-md);cursor:pointer;display:flex;align-items:center;gap:6px}
.tw-ti:hover{background:var(--color-background-secondary)}
.tw-ti.sel{background:var(--color-background-info);color:var(--color-text-info)}
.tw-ti.foc{box-shadow:0 0 0 2px var(--color-border-info)}
.tw-ti.nw{font-style:italic}
.tw-pmf{font-size:11px;color:var(--color-text-tertiary);margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tw-pmt{color:var(--color-text-info);cursor:pointer;text-decoration:underline;white-space:nowrap}
.tw-ti-name{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.tw-ti-name>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tw-fsdot{width:6px;height:6px;border-radius:50%;background:var(--color-text-tertiary);display:inline-block;flex-shrink:0}
.tw-ico{font-size:11px;color:var(--color-text-tertiary);flex-shrink:0}
.tw-nfr{display:flex;gap:6px;margin-top:10px;border-top:.5px solid var(--color-border-tertiary);padding-top:10px;align-items:center}
.tw-nfr select{font-size:12px;padding:6px 4px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:var(--color-background-primary);color:var(--color-text-primary);cursor:pointer;width:20%}
.tw-nfr input{flex:1;font-size:13px;padding:6px 8px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);min-width:0}
.tw-nfr input:focus{outline:none;box-shadow:0 0 0 2px var(--color-border-info)}
.tw-cb{font-size:13px;padding:6px 12px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-info);background:var(--color-background-info);color:var(--color-text-info);cursor:pointer;white-space:nowrap}
.tw-cb:hover{opacity:.85}
.tw-dfp{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1rem 1.25rem;margin-top:6px}
.tw-dfr{display:flex;gap:6px;align-items:center}
.tw-dfr input{flex:1;font-size:13px;padding:6px 8px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary)}
.tw-dfr input:focus{outline:none;box-shadow:0 0 0 2px var(--color-border-info)}
.tw-dfr input::placeholder{color:var(--color-text-tertiary)}
.tw-card.open{border-bottom:none;border-radius:var(--border-radius-lg) var(--border-radius-lg) 0 0;margin-bottom:0}
.tw-iaff{font-size:12px;color:var(--color-text-tertiary);background:transparent;border:.5px solid transparent;border-radius:var(--border-radius-md);padding:2px 8px;margin-left:auto;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0}
.tw-iaff:hover{border-color:var(--color-border-secondary);color:var(--color-text-secondary)}
.tw-iaff .tw-ac{font-size:10px;color:var(--color-text-tertiary);font-family:var(--font-mono)}
.tw-dp{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-top:none;border-radius:0 0 var(--border-radius-lg) var(--border-radius-lg);padding:.5rem 1.25rem 1rem;margin:0 0 .75rem}
.tw-dsh{font-size:10px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px;font-weight:500}
.tw-dsh:first-child{margin-top:0}
.tw-drow{display:flex;gap:12px;align-items:baseline;padding:2px 0}
.tw-dk{font-size:11px;color:var(--color-text-tertiary);font-family:var(--font-mono);flex:0 0 38%;word-break:break-word}
.tw-dv{font-size:12px;color:var(--color-text-primary);flex:1;min-width:0;word-break:break-word;white-space:pre-wrap}
.tw-dft{margin-top:12px;border-top:.5px solid var(--color-border-tertiary);padding-top:10px;text-align:right}
.tw-dfb{font-size:12px;padding:6px 12px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer}
.tw-dfb:hover{background:var(--color-background-secondary)}
.tw-dfg{display:flex;flex-direction:column;margin:4px 0 12px}
.tw-wdf{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.tw-wdl{display:flex;flex-direction:column;gap:3px}
.tw-wdl>span{font-size:11px;color:var(--color-text-secondary)}
.tw-wdl input{font-size:13px;padding:6px 8px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary)}
.tw-wdl input:focus{outline:none;box-shadow:0 0 0 2px var(--color-border-info)}
input.tw-pf{border-left:2px solid var(--color-border-info);font-style:italic}
.tw-pfh{font-style:normal;font-size:10px;color:var(--color-text-info)}
.tw-req{font-size:11px;color:var(--color-text-danger);margin-top:6px;display:none}
.tw-pr{text-align:right;margin-top:4px}`;
    document.head.appendChild(style);

    /* --- Build HTML --- */
    root.innerHTML = `
<div style="padding:.5rem 0">
  <div class="tw-bar"><span class="tw-lbl" id="tw-page">Page 1 of 1</span><div class="tw-dots" id="tw-dots"></div><span class="tw-lbl" id="tw-dc">0 / 0 decided</span></div>
  <div class="tw-nav"><button class="tw-nbtn" id="tw-prev" onclick="TW.go(-1)">← Prev</button><span class="tw-lbl" id="tw-pos"></span><button class="tw-nbtn" id="tw-next" onclick="TW.go(1)">Next →</button></div>
  <div id="tw-card"></div>
  <div class="tw-bg">
    <div class="tw-bc"><div class="tw-cl">Meta</div><button class="tw-a" id="btn-ag" onclick="TW.decide('ag')"><span class="tw-ac">ag</span>Agree</button><button class="tw-a" id="btn-cu" onclick="TW.decide('cu')"><span class="tw-ac">cu</span>Custom</button><button class="tw-a" id="btn-st" onclick="TW.decide('st')"><span class="tw-ac">st</span>Stop</button></div>
    <div class="tw-bc"><div class="tw-cl">Handle now</div><button class="tw-a" id="btn-do" onclick="TW.decide('do')"><span class="tw-ac">do</span>Do now</button><button class="tw-a" id="btn-de" onclick="TW.decide('de')"><span class="tw-ac">de</span>Delegate</button><button class="tw-a" id="btn-wa" onclick="TW.decide('wa')"><span class="tw-ac">wa</span>Waiting</button></div>
    <div class="tw-bc"><div class="tw-cl">Defer</div><button class="tw-a" id="btn-su" onclick="TW.decide('su')"><span class="tw-ac">su</span>Sunsama</button><button class="tw-a" id="btn-df" onclick="TW.decide('df')"><span class="tw-ac">df</span>Defer</button><button class="tw-a" id="btn-un" onclick="TW.decide('un')"><span class="tw-ac">un</span>Undecided</button></div>
    <div class="tw-bc"><div class="tw-cl">Archive</div><button class="tw-a" id="btn-pa" onclick="TW.decide('pa')"><span class="tw-ac">pa</span>PARA folder</button><button class="tw-a" id="btn-ar" onclick="TW.decide('ar')"><span class="tw-ac">ar</span>Triage dump</button><button class="tw-a" id="btn-sk" onclick="TW.decide('sk')"><span class="tw-ac">sk</span>Skip</button></div>
  </div>
  <div class="tw-kh">← → navigate · type shorthand to decide · Enter in PARA tree confirms</div>
  <div id="tw-pap" style="display:none"><div class="tw-pnl"><div class="tw-pt">Choose PARA folder</div><div class="tw-pmf" id="tw-pmf"></div><div class="tw-pg" id="tw-pgrid"></div>
    <div class="tw-nfr"><select id="tw-nr"><option value="work">work</option><option value="personal">personal</option></select><select id="tw-ns"><option value="0">1 · Projects</option><option value="1">2 · Areas</option><option value="2">3 · Resources</option><option value="3">4 · Archive</option></select><input type="text" id="tw-nfn" placeholder="New folder name…"/><button class="tw-cb" onclick="TW.confirmNew()">Create + select</button></div></div></div>
  <div id="tw-wdp" style="display:none"><div class="tw-dfp">
    <div class="tw-pt" id="tw-wd-title">Defer</div>
    <div id="tw-dfsub" style="display:none"><div class="tw-tsl">Defer subfolder · ↑↓ then Enter</div><div class="tw-dfg" id="tw-dfsgrid"></div></div>
    <div class="tw-wdf">
      <label class="tw-wdl"><span>Follow-up note<em class="tw-pfh" id="tw-wd-note-pf" style="display:none"> · from suggestion</em></span><input type="text" id="tw-wd-note" placeholder="optional"/></label>
      <label class="tw-wdl"><span>Threshold date<em class="tw-pfh" id="tw-wd-date-pf" style="display:none"> · from suggestion</em></span><input type="text" id="tw-wd-date" placeholder="YYYY-MM-DD (optional)"/></label>
    </div>
    <div class="tw-pr"><button class="tw-cb" onclick="TW.confirmWaitDefer()">Confirm</button></div></div></div>
  <div id="tw-dep" style="display:none"><div class="tw-dfp"><div class="tw-dfr"><input type="text" id="tw-de-tgt" placeholder="Delegate to… (required)"/><button class="tw-cb" onclick="TW.confirmDelegate()">Delegate</button></div><div class="tw-req" id="tw-de-hint">Required — enter a delegate.</div></div></div>
  <div id="tw-cup" style="display:none"><div class="tw-dfp"><div class="tw-dfr"><input type="text" id="tw-cu-note" placeholder="Custom note… (required)"/><button class="tw-cb" onclick="TW.confirmCustom()">Save</button></div><div class="tw-req" id="tw-cu-hint">Required — enter a note.</div></div></div>
  <div id="tw-stopbar" class="tw-stopbar" style="display:none"><span id="tw-stopmsg"></span><button class="tw-cb" id="tw-stopok" onclick="TW.confirmStop()">Confirm stop</button><button class="tw-nbtn" onclick="TW.cancelStop()">Cancel</button></div>
  <div class="tw-pgnav"><button class="tw-nbtn" id="tw-ppage" onclick="TW.goPage(-1)">◀ Page</button><span class="tw-lbl" id="tw-pgcount"></span><button class="tw-nbtn" id="tw-npage" onclick="TW.goPage(1)">Page ▶</button></div>
  <div class="tw-sr"><span class="tw-lbl" id="tw-gp"></span><button class="tw-sb" id="tw-sub" disabled onclick="TW.submit()">Submit page</button><button class="tw-sb" id="tw-nextpage" style="display:none" onclick="TW.goPage(1)">Next page →</button></div>
</div>`;

    /* --- Helpers --- */
    const $ = (id) => document.getElementById(id);
    // Human labels for the inline decision echo (#196). Keyed by decisionKey.
    const DEC_LABELS = { ag: "Agree", cu: "Custom", st: "Stop", sk: "Skip", do: "Do now", de: "Delegate", wa: "Waiting", su: "Sunsama", df: "Defer", un: "Undecided", pa: "PARA folder", ar: "Triage dump" };
    // #196: the fixed triage folder each action files into when no operator-typed
    // destination overrides it. Mirror (NOT import) of carrier.py
    // TRIAGE_FOLDER_DEST + SUNSAMA_FOLDER_DEST — re-implemented here for the
    // inline decision echo so the widget stays standalone (no cross-package
    // import). pa / df-with-subfolder / ar-on-accept carry their own
    // user_typed_params.destination (baked at submit, #242 B); do/wa/un/de/su and
    // flat df resolve here; keep/cu/sk and ag-without-a-dest resolve to nothing.
    const TRIAGE_DEST = { do: "Inbox/Do_now", wa: "Inbox/Waiting", df: "Inbox/Defer", de: "Inbox/Delegate", un: "Inbox/Undecided", su: "Inbox/Sunsama_task" };
    // Resolve the destination to show in the echo: the operator-typed/baked
    // destination first (pa/df-subfolder/ar-accept; for "ag" the materialised
    // action's params), else the action's fixed triage folder, else null.
    function decisionDest(d) {
      const utp = d.user_typed_params || {};
      if (utp.destination) return utp.destination;
      return TRIAGE_DEST[d.action] || null;
    }

    function renderDots() {
      const c = $("tw-dots");
      c.innerHTML = "";
      const b = pageBounds(curPage);
      for (let i = b.start; i < b.end; i++) {
        const d = document.createElement("span");
        d.className = "tw-dot" + (decisions[i] ? " decided" : "") + (i === cur ? " current" : "");
        // #311: the dot strip is navigation like ← →, so it disarms too. Without
        // this, an arm abandoned by clicking away resurrects when the operator
        // clicks back — armed with no fresh `ag` press, one Enter from committing.
        d.onclick = (function (idx) { return function () { agArmed = null; showCompletion = false; cur = idx; render(); }; })(i);
        c.appendChild(d);
      }
      const pageTotal = b.end - b.start;
      const pageDecided = pageDecidedCount(curPage);
      const done = submittedPages[curPage];
      $("tw-dc").textContent = pageDecided + " / " + pageTotal + " decided";
      // Submit a page only when all its cards are decided and it hasn't already
      // been submitted (per-page append-only — #214).
      $("tw-sub").disabled = done || pageTotal === 0 || pageDecided < pageTotal;
      $("tw-sub").textContent = done ? "Page submitted ✓" : "Submit page";
      const overall = decisions.filter(Boolean).length;
      $("tw-gp").textContent = overall + " / " + emails.length + " decided overall";
      // #285: the pages-submitted counter lives in the bottom page-nav row,
      // centered between ◀ Page / Page ▶ (separated from the per-card nav).
      $("tw-pgcount").textContent =
        Object.keys(submittedPages).length + " of " + pageCount + " pages submitted";
    }

    function render() {
      closeAll();
      if (showCompletion) { renderCompletion(); return; } // #21
      // Action grid + keyboard hint are inert on the completion card; restore them
      // here so a normal render always shows them (idempotent).
      const bg = document.querySelector(".tw-bg"); if (bg) bg.style.display = "";
      const kh = document.querySelector(".tw-kh"); if (kh) kh.style.display = "";
      $("tw-sub").style.display = ""; $("tw-nextpage").style.display = "none";
      const e = emails[cur];
      const pb = pageBounds(curPage);
      let h = '<div class="tw-card' + (detailsOpen ? " open" : "") + '">';
      // Thread line (#214 mix): the run-level part comes baked from Stage 3
      // (`threadRef` — "N other emails in this thread"); the widget appends the
      // page-local part ("X in this carousel"), which only it can know.
      let thr = e.threadRef || "";
      let inCar = 0;
      const conv = e.metadata && e.metadata.conversationId;
      if (conv) {
        for (let i = pb.start; i < pb.end; i++) {
          if (i !== cur && emails[i].metadata && emails[i].metadata.conversationId === conv) inCar++;
        }
        if (inCar > 0) thr = (thr ? thr + ", " : "") + inCar + " in this carousel";
      }
      // #331/2: the thread reference is a chip on the subject line, not its own
      // row. It used to be a full-width row emitted even when empty — #263
      // reserved that line so cards with and without a thread stayed the same
      // height. That reservation is retired here: the S118 calibration render
      // showed the empty band reads as dead whitespace above From (worth 24px:
      // 18px min-height + 6px margin, which is exactly the 312→288
      // cardMinHeightPx drop it allowed), and the #290 floor now does the
      // height-stability job better without spending a line on every card.
      //
      // Label is "🔗 <on this page>/<in the thread>" — the carousel siblings are
      // the actionable figure (they are in front of you and usually want
      // deciding together), the run total is the context they sit in. The slash
      // form only appears when it says something: with no sibling on this page
      // the chip is the bare run total rather than a puzzling "0/3". The full
      // sentence stays as hover text.
      // #266: escaped — escAttr (not escHtml) for the title, since the sentence
      // goes into an attribute.
      const thrRun = (typeof e.threadCount === "number" && e.threadCount > 0)
        ? e.threadCount : 0;
      const thrLabel = (inCar > 0 && thrRun > 0) ? (inCar + "/" + thrRun)
        : (thrRun > 0 ? String(thrRun) : (inCar > 0 ? String(inCar) : ""));
      const thrChip = (thrLabel && thr)
        ? '<span class="tw-thc" title="' + escAttr(thr) + '">🔗 ' + thrLabel + "</span>"
        : "";
      // #18: From/Date as one aligned label·value·tag grid (.tw-meta). The decision
      // tag sits in its own grid column, so it can never collapse "From" against the
      // sender (the old .tw-mr space-between + margin-left:auto bug). #266: every
      // email-derived string is HTML-escaped before it reaches innerHTML.
      // #270 (refs #18): show the sender display name AND the raw address. The
      // address renders as a second muted line inside the From value cell, but
      // only when it's present AND differs from the display name (when the
      // envelope had no name, sender already IS the address — no double line).
      // #266: both strings HTML-escaped before innerHTML.
      var fromVal = escHtml(e.sender);
      if (e.senderAddress && e.senderAddress !== e.sender) {
        fromVal += '<span class="tw-vaddr">' + escHtml(e.senderAddress) + "</span>";
      }
      h += '<div class="tw-meta"><span class="tw-k">From</span><span class="tw-v">' + fromVal + "</span>";
      h += decisions[cur] ? '<span class="tw-dtag">✓ ' + escHtml(decisions[cur].decisionKey.toUpperCase()) + "</span>" : "<span></span>";
      h += '<span class="tw-k">Date</span><span class="tw-v">' + escHtml(e.date) + "</span><span></span>";
      // #14: show the email's current folder on the card face (its own meta row),
      // so the operator sees where it lives now without opening details. The
      // producer emits currentFolder from the Stage 1 snapshot's
      // currentFolder.path; the row is omitted when absent. #266: escaped.
      if (e.currentFolder) h += '<span class="tw-k">Folder</span><span class="tw-v tw-cfv">' + escHtml(e.currentFolder) + "</span><span></span>";
      h += "</div>";
      h += '<div class="tw-subj">' + escHtml(e.subject) + thrChip + "</div>";
      if (e.bodyPreview) h += '<div class="tw-body">' + escHtml(e.bodyPreview) + "</div>";
      if (e.attachment) h += '<div class="tw-mr"><span class="tw-k">Attachments</span><span class="tw-v" style="color:var(--color-text-info)">' + escHtml(e.attachment) + "</span></div>";
      if (e.sentNotice) h += '<div class="tw-sent">📤 ' + escHtml(e.sentNotice) + "</div>";
      // #183: distinguish "Stage 2 saw it, no suggestion" from a blank card.
      const hasSug = !!e.suggestedAction;
      const badgeLabel = hasSug ? e.badgeLabel : "none";
      h += '<hr class="tw-hr"><div style="display:flex;align-items:flex-start;gap:10px"><span class="tw-badge ' + e.badgeClass + '">' + badgeLabel + '</span><div style="flex:1;min-width:0">';
      if (hasSug) {
        h += '<div class="tw-reason">' + escHtml(e.reason) + "</div>";
        if (e.suggestedPath) h += '<div class="tw-spath">→ ' + escHtml(e.suggestedPath) + "</div>";
        // #311: the plan-escalation mark. Sits directly under the path it is
        // about, because that is the thing the operator is being asked to
        // scrutinise. When armed it is also the confirm target — see armAgree().
        if (e.escalation) {
          const armed = agArmed === cur;
          h += '<div class="tw-esc' + (armed ? " armed" : "") + '"' +
            (armed ? ' id="tw-esc-mark" role="button" tabindex="0"' : "") +
            '><span class="tw-escdot"></span>' + escHtml(e.escalation.label) +
            (armed ? '<span class="tw-escgo">click to agree, or press Enter</span>' : "") +
            "</div>";
        }
        if (e.annotation) h += '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px">' + escHtml(e.annotation) + "</div>";
      } else {
        h += '<div class="tw-reason tw-nosug">no Stage 2 suggestion</div>';
      }
      // #196: echo the operator's own decision inline, right after the suggestion
      // text — where the eye already is — not only in the top-right corner tag.
      if (decisions[cur]) {
        const dk = decisions[cur].decisionKey;
        // #196: show the resolved decision destination alongside the action, so a
        // revisited pa/df/ar (and the materialised "ag") card reads where it's
        // going, not just what was chosen. #266: dest is HTML-escaped.
        const ddest = decisionDest(decisions[cur]);
        h += '<div class="tw-ydec">✓ Your decision: ' + (DEC_LABELS[dk] || dk) +
          (ddest ? ' <span class="tw-ydest">→ ' + escHtml(ddest) + "</span>" : "") +
          ' <span class="tw-ac">' + dk + "</span></div>";
      }
      h += "</div>"; // close reason block
      h += '<button class="tw-iaff" onclick="TW.toggleDetails()" aria-label="Toggle details">' + (detailsOpen ? "close" : "details") + '<span class="tw-ac">i</span></button>';
      h += "</div></div>"; // close pill row + tw-card
      if (detailsOpen) h += buildDetails(e);
      $("tw-card").innerHTML = h;
      // #311: bind the armed mark's confirm as a real listener rather than an
      // inline onclick attribute — same pattern as the PARA leaf rows. Inline
      // handlers are invisible to the jsdom smoke (runScripts: "outside-only"),
      // so the confirming click would be the one gesture in the two-step with no
      // test behind it.
      const escEl = $("tw-esc-mark");
      if (escEl) escEl.addEventListener("click", () => window.TW.confirmAgree());
      document.querySelectorAll("button.tw-a").forEach((b) => { b.classList.remove("hl"); b.classList.remove("sel"); });
      const sb = $("btn-" + e.suggestedAction);
      if (sb) sb.classList.add("hl");
      // #311: while armed, the `ag` button stops offering the act and states what
      // is now expected — so the operator is never left pressing a key that
      // appears to have done nothing. Restored on every render where nothing is
      // armed, which is also how a disarm becomes visible.
      const agb = $("btn-ag");
      if (agb) {
        const armed = agArmed === cur && !!e.escalation;
        agb.innerHTML = armed
          ? '<span class="tw-ac">ag</span>Confirm on the mark ↑'
          : '<span class="tw-ac">ag</span>Agree';
        agb.classList.toggle("armed", armed);
      }
      // #196: mark the operator's own decided action distinctly from the .hl suggestion.
      if (decisions[cur]) { const db = $("btn-" + decisions[cur].decisionKey); if (db) db.classList.add("sel"); }
      $("tw-prev").disabled = cur === pb.start;
      $("tw-next").disabled = cur === pb.end - 1;
      $("tw-ppage").disabled = curPage === 0;
      $("tw-npage").disabled = curPage >= pageCount - 1;
      $("tw-pos").textContent = (cur - pb.start + 1) + " of " + (pb.end - pb.start);
      $("tw-page").textContent = "Page " + (curPage + 1) + " of " + pageCount;
      renderDots();
    }

    /* Completion card (#21) — a display-only slot one step past the last email of
       a fully-decided page. Pre-submit it confirms "all N decided" and points at
       Submit. Post-submit it becomes the celebration card: the sitting pauses here
       on EVERY page (no auto-advance), giving the operator a breath before they
       step to the next page with Page ▶. The action grid + keyboard hint are hidden
       so the only forward affordance is Submit / Page ▶; ← Prev returns to the
       decided cards (no back-nav trap). */
    function renderCompletion() {
      const b = pageBounds(curPage);
      const total = b.end - b.start;
      const submitted = submittedPages[curPage];
      const last = pageCount - 1;
      let h = '<div class="tw-card tw-ccard">';
      if (submitted) {
        const q = pickQuote();
        const allSubmitted = Object.keys(submittedPages).length === pageCount;
        const hasNext = curPage < last;
        h += '<div class="tw-cc-h">' + (allSubmitted ? "🎉 Inbox zero" : "🎉 Page submitted") + "</div>";
        h += '<div class="tw-cc-s">All ' + total + " decision" + (total !== 1 ? "s" : "") + " on this page are in.</div>";
        h += '<div class="tw-cc-s">' +
          (allSubmitted
            ? "That was the last page — inbox zero for this sitting."
            : (hasNext
              ? "Take a breath — Next page when you're ready."
              : "Use ◀ Page to finish the remaining pages.")) +
          "</div>";
        if (q) h += '<div class="tw-quote">' + escHtml(q) + "</div>";
      } else {
        h += '<div class="tw-cc-h">✓ All ' + total + " decided</div>";
        h += '<div class="tw-cc-s">Every card on this page has a decision. Review with ← Prev, or submit the page below.</div>';
      }
      h += "</div>";
      $("tw-card").innerHTML = h;
      const bg = document.querySelector(".tw-bg"); if (bg) bg.style.display = "none";
      const kh = document.querySelector(".tw-kh"); if (kh) kh.style.display = "none";
      document.querySelectorAll("button.tw-a").forEach((bn) => { bn.classList.remove("hl"); bn.classList.remove("sel"); });
      $("tw-prev").disabled = false;       // ← Prev returns to the decided cards
      $("tw-next").disabled = true;        // nothing past the completion card
      $("tw-ppage").disabled = curPage === 0;
      $("tw-npage").disabled = curPage >= pageCount - 1;
      $("tw-pos").textContent = "✓ complete";
      $("tw-page").textContent = "Page " + (curPage + 1) + " of " + pageCount;
      renderDots();
      // Footer affordance: a submitted page with a next page swaps the (now inert)
      // Submit button for a primary "Next page →" in the same spot — visible
      // forwarding + Enter-to-advance (#21 review). Pre-submit / last page keep
      // the Submit button (renderDots drives its enabled/submitted state).
      const showNext = submitted && curPage < last;
      $("tw-nextpage").style.display = showNext ? "" : "none";
      $("tw-sub").style.display = showNext ? "none" : "";
    }

    /* Terminal screen after Stop — the sitting is over; reopening the artifact
       resumes on the remaining cards (localStorage filter). */
    function renderStopped(flushed) {
      const remaining = decisions.filter((d) => !d).length;
      const q = pickQuote();
      root.innerHTML = '<div class="tw-done"><div class="tw-done-h">⏸ Stopped</div>' +
        '<div class="tw-done-s">Flushed ' + flushed + " decision" + (flushed !== 1 ? "s" : "") + ". " +
        (remaining > 0
          ? "Reopen this artifact to continue with the " + remaining + " remaining."
          : "Inbox zero — nothing left! 🎉") + "</div>" +
        (q ? '<div class="tw-quote">' + q + "</div>" : "") + "</div>";
    }

    function advance() {
      // Scoped to the current page — at page end we stay put (the operator
      // submits the page, which advances to the next one). #214.
      const b = pageBounds(curPage);
      for (let i = cur + 1; i < b.end; i++) { if (!decisions[i]) { cur = i; render(); return; } }
      for (let i = b.start; i < cur; i++) { if (!decisions[i]) { cur = i; render(); return; } }
      // No undecided card left on the page — surface the completion card (#21) as
      // the "you've finished this page" signal, instead of silently re-rendering
      // the last card with nothing to do next.
      if (pageDecidedCount(curPage) === (b.end - b.start)) showCompletion = true;
      render();
    }

    /* #311: arm the current card's `ag` — step 1 of the two-step. Decides
       nothing; it re-renders so the mark becomes a live control and the `ag`
       button says what is now expected. The confirming gesture (Enter, or a
       click on the mark) is handled by TW.confirmAgree.

       Mirrors the house two-step already used for Stop (stop() arms a confirm
       bar, confirmStop() commits) — the same shape for the same reason: an act
       with a consequence the operator can't easily undo shouldn't be one
       keystroke away. The difference is where the confirm lives: Stop's bar is a
       neutral strip, while this one is deliberately the mark itself, so
       confirming is physically an act on the consequence being confirmed. */
    function armAgree() {
      agArmed = cur;
      render();
    }

    /* --- PARA tree --- */

    // #287: the matched-path set for the current card. `null` means the email
    // carries no `paraMatches` field at all (a pre-#287 payload) → no filtering,
    // render the full reference. A Set (possibly empty) means filter OneDrive-only
    // leaves down to these canonical paths.
    function paraMatchPaths() {
      const pm = emails[cur] && emails[cur].paraMatches;
      if (pm === undefined) return null;
      return new Set(
        (pm || [])
          .map((m) => (typeof m === "string" ? m : m && m.path))
          .filter(Boolean)
      );
    }

    // #287: a filtered copy of `tree`. A OneDrive-only leaf (folderState
    // "exists_in_onedrive") survives only when `paraShowAll` is on, the email
    // has no paraMatches field (null set → show all), or its reconstructed path
    // is in the matched set. Outlook leaves and session-created (isNew/proposed)
    // leaves are always kept. Sides keep label/prefix so path reconstruction and
    // the §B(7) header are identical to the unfiltered render. buildTree, nav,
    // and findNearest all read this so heights + arrow-keys track what's shown.
    function buildViewTree() {
      const set = paraMatchPaths();
      if (paraShowAll || set === null) return tree; // recall hatch / pre-#287 payload
      const out = {};
      ["work", "personal"].forEach((side) => {
        const data = tree[side];
        out[side] = {
          label: data.label,
          prefix: data.prefix,
          sections: data.sections.map((items, si) =>
            items.filter((it) => {
              if (!it) return false;
              const isNewLeaf = !!it.isNew || it.folderState === "proposed";
              if (isNewLeaf || it.folderState !== "exists_in_onedrive") return true;
              const path = data.prefix + "/" + SEC_KEYS[si] + "/" + it.name;
              return set.has(path); // OneDrive-only: keep iff matched
            })
          ),
        };
      });
      return out;
    }

    // #287: status + recall-toggle line above the grid. Names the filter so the
    // operator knows the picker is scoped, and offers the "show all PARA" hatch.
    function renderParaMatchBar() {
      const bar = $("tw-pmf");
      if (!bar) return;
      const set = paraMatchPaths();
      if (set === null) { bar.innerHTML = ""; bar.style.display = "none"; return; }
      bar.style.display = "flex";
      if (paraShowAll) {
        bar.innerHTML =
          "<span>Showing all PARA folders.</span>" +
          '<span class="tw-pmt" onclick="TW.togglePm()">Show only relevant</span>';
      } else {
        const n = set.size;
        const noun = n === 1 ? "OneDrive folder" : "OneDrive folders";
        const lead = n > 0
          ? "Showing " + n + " relevant " + noun + " (Outlook folders always shown)."
          : "No OneDrive folders matched this email (Outlook folders shown).";
        bar.innerHTML =
          "<span>" + lead + "</span>" +
          '<span class="tw-pmt" onclick="TW.togglePm()">Show all PARA</span>';
      }
    }

    function buildTree() {
      const grid = $("tw-pgrid");
      grid.innerHTML = "";
      viewTree = buildViewTree();
      renderParaMatchBar();
      const maxC = SEC_KEYS.map((_, si) => Math.max(viewTree.work.sections[si].length, viewTree.personal.sections[si].length));
      const preSel = emails[cur].suggestedAction === "pa" ? emails[cur].suggestedPath : "";
      ["work", "personal"].forEach((side, ci) => {
        const data = viewTree[side], col = document.createElement("div");
        col.className = "tw-pc";
        const rt = document.createElement("div");
        rt.className = "tw-tr";
        rt.style.cssText = "height:28px;line-height:28px";
        // #281 §B(7): right-aligned column-header state label. "· in OneDrive"
        // when any leaf in the column is exists_in_onedrive; "· new" when any is
        // proposed/isNew. exists_in_outlook is the default — no signal. Renders
        // only when the column carries a non-default leaf, so the operator learns
        // the dot vocabulary once from the header then scans the dots.
        let anyOd = false, anyNew = false;
        data.sections.forEach((its) => its.forEach((it) => {
          if (!it) return;
          if (it.isNew || it.folderState === "proposed") anyNew = true;
          else if (it.folderState === "exists_in_onedrive") anyOd = true;
        }));
        const hl = [];
        if (anyOd) hl.push("· in OneDrive");
        if (anyNew) hl.push("· new");
        rt.innerHTML = "<span>" + escHtml(data.label) + "</span>" +
          (hl.length ? '<span class="tw-fshl">' + hl.join(" ") + "</span>" : "");
        col.appendChild(rt);
        data.sections.forEach((items, si) => {
          const lbl = document.createElement("div");
          lbl.className = "tw-tsl";
          lbl.style.cssText = "height:28px;line-height:28px";
          lbl.textContent = SEC_NAMES[si];
          col.appendChild(lbl);
          for (let i = 0; i < maxC[si]; i++) {
            const item = items[i], row = document.createElement("div");
            row.style.cssText = "height:28px";
            if (item) {
              // #281 §B(7): italic name + right-aligned dot when the folder isn't
              // in Outlook yet (exists_in_onedrive) or is brand-new (proposed/
              // isNew). exists_in_outlook — and an unmarked leaf — render with no
              // signal. The widget never invents provenance; it reflects only what
              // the producer (tree_payload.py) marked. The `.nw` italic, once just
              // the session-created-folder flag, now generalises to "not in
              // Outlook yet" per the locked §B(7) note.
              const isNewLeaf = !!item.isNew || item.folderState === "proposed";
              const isOnedrive = item.folderState === "exists_in_onedrive";
              const flagged = isNewLeaf || isOnedrive;
              row.className = "tw-ti" + (flagged ? " nw" : "");
              const path = data.prefix + "/" + SEC_KEYS[si] + "/" + item.name;
              row.dataset.path = path; row.dataset.col = ci; row.dataset.sec = si; row.dataset.idx = i;
              if (path === preSel) { row.classList.add("sel"); fCol = ci; fSec = si; fIdx = i; }
              row.innerHTML = '<span class="tw-ti-name"><span class="tw-ico">📁</span><span>' + escHtml(item.name) + "</span></span>" +
                (flagged ? '<span class="tw-fsdot"></span>' : "");
              row.addEventListener("click", () => selectPara(path, false, item.folderState));
            }
            col.appendChild(row);
          }
        });
        grid.appendChild(col);
      });
    }

    function getCell(c, s, i) { return document.querySelector('.tw-ti[data-col="' + c + '"][data-sec="' + s + '"][data-idx="' + i + '"]'); }
    function setFocus(c, s, i) {
      document.querySelectorAll(".tw-ti").forEach((el) => el.classList.remove("foc"));
      const el = getCell(c, s, i);
      if (el) { el.classList.add("foc"); el.scrollIntoView({ block: "nearest" }); fCol = c; fSec = s; fIdx = i; }
    }
    function findNearest(col, sec, idx) {
      const side = col === 0 ? "work" : "personal";
      // #287: read the filtered viewTree so arrow-nav lands only on shown leaves.
      for (let s = sec; s < 4; s++) { const its = viewTree[side].sections[s]; const i = s === sec ? Math.min(idx, its.length - 1) : 0; if (its.length > 0 && i >= 0) return { sec: s, idx: i }; }
      for (let s = sec - 1; s >= 0; s--) { const its = viewTree[side].sections[s]; if (its.length > 0) return { sec: s, idx: its.length - 1 }; }
      return null;
    }

    function selectPara(path, isNew, leafFolderState) {
      // folderState re-stamps the Stage 2 enum for an override pick (item 8). A
      // confirmNew leaf is "proposed" (operator invented it). An existing pick
      // reflects the leaf's skill-supplied provenance, defaulting to
      // "exists_in_onedrive" when unmarked (the tree is the OneDrive reference).
      // The widget never invents "exists_in_outlook"; that only rides the agree
      // path, where buildDecision copies suggestion.parameterisation verbatim.
      const folderState = isNew ? "proposed" : (leafFolderState || "exists_in_onedrive");
      if (isNew) { // widget-internal hint: grow the tree; not emitted in the payload
        tree[path.startsWith(".PARA-work") ? "work" : "personal"]
          .sections[parseInt($("tw-ns").value)]
          .push({ name: path.split("/").pop(), isNew: true, folderState: "proposed" });
      }
      decisions[cur] = buildDecision("pa", { destination: path, folderState: folderState });
      closeAll();
      advance();
    }

    /* --- Panels --- */
    function closeAll() {
      ["tw-pap", "tw-wdp", "tw-dep", "tw-cup"].forEach((id) => { $(id).style.display = "none"; });
      ["tw-de-hint", "tw-cu-hint"].forEach((id) => { $(id).style.display = "none"; }); // reset required hints
      activePanel = null;
    }
    function togglePanel(id) {
      if (activePanel === id) { closeAll(); } else { closeAll(); $(id).style.display = "block"; activePanel = id; if (id === "tw-pap") { paraShowAll = false; buildTree(); } }
    }

    /* --- Editable-param panels (S46, items 5–9) ----------------------------
     * wa/df share one two-field panel (contextNote + thresholdDate). Both fields
     * pre-fill from suggestion.parameterisation when present; a pre-filled field
     * carries a quiet visual flag (tw-pf + "from suggestion" hint) that clears on
     * first edit (item 9). de/cu open single required free-text panels — an empty
     * submit blocks the decision and surfaces an inline hint (confirmNew pattern).
     * All values route through buildDecision into user_typed_params. */
    /* `src` labels where the value came from, so the hint can say so (#359).
     * "suggestion" = Stage 2 proposed it; "prior" = the operator's own previous
     * note, carried back from Outlook. The distinction is the operator's: one is
     * a machine proposal to check, the other is their own words to amend, and
     * "· from suggestion" over their own text would be a lie. */
    function prefillField(id, val, src) {
      const el = $(id), hint = $(id + "-pf");
      if (val !== undefined && val !== null && String(val) !== "") {
        el.value = String(val); el.classList.add("tw-pf");
        if (hint) {
          hint.textContent = src === "prior" ? " · your previous note" : " · from suggestion";
          hint.style.display = "inline";
        }
      } else {
        el.value = ""; el.classList.remove("tw-pf");
        if (hint) hint.style.display = "none";
      }
    }
    function clearPf(id) { // operator edited a pre-filled field → it's now typed
      $(id).classList.remove("tw-pf");
      const hint = $(id + "-pf"); if (hint) hint.style.display = "none";
      wdEdited = true; // #242: editing a pre-filled field flips the row to "edited"
    }
    /* --- Defer-subfolder picker (#243) -------------------------------------
     * Lives inside the shared wait/defer fold-out, shown only for df. Mirrors
     * the PARA picker's grid behaviour (focusable .tw-ti cells, ↑↓ navigate,
     * Enter confirms) but over a flat single-column list, so it sidesteps the
     * number-key collision with the free-text note input. The "none →
     * Inbox/Defer" default is index 0 (a first-class grid item, path null);
     * the real subfolders follow in the producer's order. Select-only — no
     * "create new" (deliberate divergence from the PARA picker). Clicking a
     * cell marks dfDest (lets the operator still add a note/date); Enter on a
     * focused cell selects AND confirms the defer in one keystroke, so
     * accept-as-suggested from a prefilled cell is a single Enter. */
    function dfItems() {
      return [{ name: "none → Inbox/Defer", path: null, none: true }]
        .concat(deferSubfolders.map((s) => ({ name: s.name, path: s.path })));
    }
    function buildDeferGrid() {
      const grid = $("tw-dfsgrid");
      grid.innerHTML = "";
      dfItems().forEach((it, i) => {
        const row = document.createElement("div");
        row.className = "tw-ti" + (it.none ? " nw" : "") + ((it.path || null) === dfDest ? " sel" : "");
        row.dataset.idx = i;
        row.dataset.path = it.path == null ? "" : it.path;
        row.innerHTML = '<span class="tw-ico">📁</span>' + it.name;
        row.addEventListener("click", () => selectDefer(i, false));
        grid.appendChild(row);
      });
      dfSetFocus(dfFocus);
    }
    function dfCells() { return $("tw-dfsgrid").querySelectorAll(".tw-ti"); }
    function dfSetFocus(i) {
      const cells = dfCells();
      if (!cells.length) return;
      dfFocus = Math.max(0, Math.min(i, cells.length - 1));
      cells.forEach((el, j) => el.classList.toggle("foc", j === dfFocus));
      cells[dfFocus].scrollIntoView({ block: "nearest" });
    }
    function dfMove(delta) { dfSetFocus(dfFocus + delta); }
    function selectDefer(idx, confirm) {
      const cells = dfCells();
      const el = cells[idx];
      if (!el) return;
      dfDest = el.dataset.path === "" ? null : el.dataset.path; // "" → none → Inbox/Defer
      if (dfDest !== dfPrefill) wdEdited = true; // #242: picking a non-pre-filled subfolder is an edit
      dfFocus = idx;
      cells.forEach((c, j) => c.classList.toggle("sel", j === idx));
      dfSetFocus(idx);
      if (confirm) window.TW.confirmWaitDefer();
    }

    function openWaitDefer(code) {
      togglePanel("tw-wdp");
      if (activePanel !== "tw-wdp") return; // toggled closed
      wdAction = code;
      dfDest = null; dfFocus = 0; dfPrefill = null; wdEdited = false; // #242: fresh edit-vs-accept baseline
      $("tw-wd-title").textContent = code === "wa" ? "Waiting for" : "Defer";
      const p = (emails[cur].suggestion && emails[cur].suggestion.parameterisation) || {};
      /* #359: on a *resurfaced* deferred email Stage 2 emits an empty
       * parameterisation, so `p.contextNote` is undefined and the field used to
       * open blank — while the note the operator wrote last time sat two lines
       * away on the same record. They retyped it, which is why the S121 stacks
       * are byte-identical, and why #360's text dedup only becomes reliable once
       * this is fixed.
       *
       * Precedence: a Stage 2 note wins where present. Stage 2 proposing a note
       * is a deliberate act on *this* run, so it is the fresher statement; the
       * prior note is the fallback for the (currently universal) case where
       * Stage 2 offers nothing. The value is checked for emptiness rather than
       * `undefined` so an empty-string parameterisation doesn't shadow a real
       * prior note.
       *
       * The date deliberately does NOT fall back the same way. A stale threshold
       * is worse than a blank one: the carrier writes it to the follow-up flag,
       * so silently re-committing last week's date would keep an item's due date
       * pinned in the past every time it resurfaced. A note re-confirmed is still
       * true; a date re-confirmed is usually not. */
      const stage2Note = (p.contextNote !== undefined && p.contextNote !== null
        && String(p.contextNote) !== "") ? p.contextNote : null;
      prefillField(
        "tw-wd-note",
        stage2Note !== null ? stage2Note : emails[cur].priorNote,
        stage2Note !== null ? "suggestion" : "prior"
      );
      prefillField("tw-wd-date", p.thresholdDate, "suggestion");
      // Defer-subfolder picker: only for df, only when subfolders exist (#243).
      const showGrid = code === "df" && deferSubfolders.length > 0;
      $("tw-dfsub").style.display = showGrid ? "block" : "none";
      if (showGrid) {
        // Prefill the selection from the suggestion's destination so
        // accept-as-suggested is one keystroke. A "Inbox/Defer" (flat) or
        // unmatched destination leaves the default "none" item focused.
        const items = dfItems();
        if (p.destination) {
          const k = items.findIndex((it) => it.path === p.destination);
          if (k >= 0) { dfDest = items[k].path; dfFocus = k; dfPrefill = items[k].path; }
        }
        buildDeferGrid();
        setTimeout(() => { try { $("tw-dfsgrid").querySelectorAll(".tw-ti")[dfFocus].focus(); } catch (e) {} }, 50);
      } else {
        setTimeout(() => $("tw-wd-note").focus(), 50);
      }
    }

    /* --- Decision envelope (S42 locked shape, #242 Direction B) --------------
     * Emits { emailId, decisionKey, timestamp, action, user_typed_params,
     * paramsEdited }. The Stage 2 `suggestion` payload no longer crosses the
     * boundary (#242): whatever is selected here is what gets consumed
     * downstream, so the row is the complete, self-sufficient decision and the
     * carrier resolves nothing from the suggestion. Anything downstream that
     * needs Stage 2's record re-reads suggestions-<stamp>.json by emailId.
     *
     * The widget MATERIALISES the operator's selection into the row (the
     * "widget dumb" lock S44–49 is retired, consciously):
     *   - decisionKey = key pressed; action = same except for "ag" (agree),
     *     where action + params are materialised from the Stage 2 suggestion
     *     (submitting "ag" selects "consume Stage 2's proposal").
     *   - "ar" destination is a Stage 2 *contract* (the operator can't edit it):
     *     bake it into the row ONLY when the suggestion's own action is "ar"
     *     (accept). An ar-OVERRIDE of a non-ar suggestion must NOT inherit that
     *     suggestion's destination (#258) — leave utp empty and let the carrier
     *     use its archive fallback. The widget only ever bakes the destination
     *     matching the *selected* action.
     *   - paramsEdited = the edit-vs-accept signal, stamped at submit. The
     *     widget knows whether the operator touched a pre-filled field, so it
     *     records it directly (S46's downstream diff against
     *     suggestion.parameterisation is gone with the echo).
     *
     * #359 raised what paramsEdited means once a field can be pre-filled from
     * the operator's OWN prior note rather than from Stage 2. Decision (S125):
     * the flag keeps its literal meaning — "did the operator touch a pre-filled
     * field" — so re-confirming an unchanged prior note stamps `false`, exactly
     * as accepting an unchanged suggestion does.
     *
     * That is deliberately NOT a claim that the two events are the same. They
     * are not: accepting a suggestion is agreement with Stage 2, while leaving
     * your own note alone is agreement with yourself, and counting the second as
     * the first would credit Stage 2 for the operator's prior work — the exact
     * dishonesty #358 removed from the override metric. The flag stays literal
     * because the distinction does not need to live in it: the two cases are
     * separable after the fact from artefacts already written immutably. A row
     * whose `user_typed_params.contextNote` equals the snapshot's `contextNote`
     * for that emailId, where `suggestions-<stamp>.json` carries no
     * `parameterisation.contextNote`, was a prior-note re-confirm; anything else
     * was not. Derived, not duplicated — the same choice made for grouped_review
     * and for #358's resolved-destination test.
     *
     * The consequence to respect: any future analysis that reads paramsEdited as
     * "accepted Stage 2's parameters" must do that join first, or it will
     * over-count acceptance on the deferral path — which is the highest-volume
     * path in the pipeline, so the error would not be small.
     */
    function buildDecision(code, params, edited) {
      const e = emails[cur];
      const sug = e.suggestion || null;
      let action = code;
      let utp = params || {};
      let paramsEdited = !!edited;
      if (code === "ag") { // agree: materialise the Stage 2 suggestion (accept = select)
        action = (sug && sug.action) || e.suggestedAction || "ag";
        utp = (sug && sug.parameterisation) ? Object.assign({}, sug.parameterisation) : {};
        paramsEdited = false; // agree accepts verbatim — nothing edited
      }
      if (code === "ar") { // archive: bake the contract destination only on accept (sug was ar)
        if (sug && sug.action === "ar" && sug.parameterisation && sug.parameterisation.destination) {
          utp = Object.assign({}, utp, { destination: sug.parameterisation.destination });
        }
        paramsEdited = false; // ar destination is a contract; not operator-editable
      }
      if (code === "sk") { action = "keep"; } // skip: no-action, carrier leaves it in place (NOOP_ACTIONS)
      return {
        emailId: e.id,
        decisionKey: code,
        timestamp: new Date().toISOString(),
        action: action,
        user_typed_params: utp,
        paramsEdited: paramsEdited,
      };
    }

    /* --- Details panel (S40 lock) -------------------------------------------
     * Fold-out between card and action grid. Renders three sections from three
     * per-email objects the calling skill hands in (metadata, stage1, suggestion),
     * iterating keys generically so new schema fields surface without code change
     * ("plain key:value lines, declaration order, missing/null -> (none)" — S40).
     * The same three sections back the .md drill-down; the file write lives in the
     * calling skill (widget is sandboxed, no IO), triggered by openDetailsFile(). */
    function escHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    /* #266 for attribute contexts: escHtml leaves quotes intact, which is safe
       between tags but would break out of a title="…" and let email-derived text
       inject markup. Anything that lands in an attribute goes through here. */
    function escAttr(s) {
      return escHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function fmtVal(v) {
      if (v === null || v === undefined || v === "") return "(none)";
      if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === "object") ? JSON.stringify(x) : String(x)).join(", ") : "(none)";
      if (typeof v === "object") return Object.keys(v).length ? JSON.stringify(v) : "(none)";
      return String(v);
    }
    function detailsSection(title, obj) {
      let s = '<div class="tw-dsh">' + title + "</div>";
      const keys = obj && typeof obj === "object" ? Object.keys(obj) : [];
      if (!keys.length) return s + '<div class="tw-drow"><span class="tw-dv">(none)</span></div>';
      keys.forEach((k) => {
        s += '<div class="tw-drow"><span class="tw-dk">' + escHtml(k) + '</span><span class="tw-dv">' + escHtml(fmtVal(obj[k])) + "</span></div>";
      });
      return s;
    }
    function buildDetails(e) {
      let s = '<div class="tw-dp">';
      s += detailsSection("Email metadata", e.metadata);
      s += detailsSection("Stage 1 — context", e.stage1);
      s += detailsSection("Stage 2 — suggestion", e.suggestion);
      s += '<div class="tw-dft"><button class="tw-dfb" onclick="TW.openDetailsFile()">Open as .md file</button></div>';
      return s + "</div>";
    }

    /* --- Public API (attached to window.TW) --- */
    window.TW = {
      go(delta) {
        agArmed = null;   // #311: leaving the card disarms; an arm never travels
        const b = pageBounds(curPage);
        if (showCompletion) { // on the completion card: ← Prev returns to the last card; Next stays
          if (delta < 0) { showCompletion = false; cur = b.end - 1; render(); }
          return;
        }
        const n = cur + delta;
        if (n >= b.start && n < b.end) { cur = n; render(); return; }
        // Stepping forward past the last card of a fully-decided page reveals the
        // completion card (#21) — the hidden-until-complete forward affordance.
        if (delta > 0 && n === b.end && pageDecidedCount(curPage) === (b.end - b.start)) { showCompletion = true; render(); }
      },

      goPage(delta) {
        const p = curPage + delta;
        if (p < 0 || p >= pageCount) return;
        agArmed = null;   // #311: same disarm-on-leave rule as go()
        showCompletion = false;
        curPage = p;
        cur = pageBounds(p).start;
        render();
      },

      toggleDetails() { detailsOpen = !detailsOpen; render(); },
      // #287: flip the PARA picker between the relevance-filtered view and the
      // full reference tree (the recall hatch). Re-renders in place.
      togglePm() { paraShowAll = !paraShowAll; buildTree(); },
      openDetailsFile() { sendPrompt("details:" + emails[cur].id); }, // skill writes <snapshot>/details/<emailId>.md

      decide(code) {
        // #311: reaching for any action other than `ag` is a change of mind, so
        // disarm — and re-render, because the mark and the `ag` button label are
        // only refreshed by render(). This runs FIRST, ahead of every early
        // return including Stop and the panel-opening branches, so no path can
        // leave a mark pulsing and clickable while the arm behind it is gone.
        if (agArmed !== null && code !== "ag") { agArmed = null; render(); }
        if (code === "st") { window.TW.stop(); return; } // Stop = flush + end the sitting
        if (showCompletion) return; // action grid is inert on the completion card (#21)
        if (stopped || submittedPages[curPage]) return; // page submitted / sitting stopped — locked
        // #311: `ag` on a plan-escalating card arms rather than decides. The
        // operator is answering "does this look right?" while the row silently
        // escalates into a mutation with a side-effect — a create-folder or a
        // create-task. So agreeing takes a second, deliberate act, and that act
        // lands ON the mark describing the consequence, where their eye has to
        // go. Cards with no escalation are untouched: `ag` stays one keystroke.
        if (code === "ag" && emails[cur] && emails[cur].escalation) {
          // A second `ag` press is deliberately NOT a confirm: the whole point
          // is that the confirming gesture lands on the mark, so double-tapping
          // the key the operator already reached for would reopen the reflex
          // this exists to interrupt. The button says what to do instead.
          if (agArmed !== cur) armAgree();
          return;
        }
        if (code === "pa") { togglePanel("tw-pap"); return; }
        if (code === "df" || code === "wa") { openWaitDefer(code); return; }
        if (code === "de") { togglePanel("tw-dep"); setTimeout(() => $("tw-de-tgt").focus(), 50); return; }
        if (code === "cu") { togglePanel("tw-cup"); setTimeout(() => $("tw-cu-note").focus(), 50); return; }
        decisions[cur] = buildDecision(code, {});
        agArmed = null;
        advance();
      },

      /* #311: commit an armed `ag`. Reached by clicking the escalation mark or
         pressing Enter while armed — never by any path that could fire without
         the operator having seen the mark, which is the whole point of the
         two-step. A no-op unless *this* card is the armed one.

         It carries decide()'s locks verbatim, because it is the other write path
         to decisions[] and a write path without the lock is worse than no lock:
         a decision recorded onto a submitted page renders as accepted and is
         then dropped by submit(), i.e. the operator watches a decision land that
         does not exist — the #357 defect class, reintroduced in the widget. */
      confirmAgree() {
        if (agArmed !== cur) return;
        agArmed = null;
        if (showCompletion || stopped || submittedPages[curPage]) { render(); return; }
        decisions[cur] = buildDecision("ag", {});
        advance();
      },

      /* #311: abandon an armed `ag` without deciding anything. */
      cancelAgree() { if (agArmed !== null) { agArmed = null; render(); } },

      // Stop the whole sitting. Two-step: stop() arms a confirm bar (Stop ends
      // the sitting, so guard against a fat-finger); confirmStop() commits.
      stop() {
        if (stopped) return;
        let pending = 0;
        for (let i = 0; i < emails.length; i++) {
          const p = Math.floor(i / PAGE_SIZE);
          if (decisions[i] && !submittedPages[p]) pending++;
        }
        $("tw-stopmsg").textContent = "Stop now? " + pending + " decided card" +
          (pending !== 1 ? "s" : "") + " will be flushed; undecided cards return next time.";
        $("tw-stopbar").style.display = "flex";
      },

      cancelStop() { const b = $("tw-stopbar"); if (b) b.style.display = "none"; },

      // Commit the stop: flush every decided-but-unsubmitted row as one final
      // batch (so carrier/executor can take them up), persist their ids for
      // resume, and show the terminal screen. Undecided cards are left for the
      // next open (#214 Stop).
      confirmStop() {
        if (stopped) return;
        const out = [], ids = [];
        for (let i = 0; i < emails.length; i++) {
          const p = Math.floor(i / PAGE_SIZE);
          if (decisions[i] && !submittedPages[p]) { out.push(decisions[i]); ids.push(emails[i].id); }
        }
        if (out.length) { sendPrompt("batch:" + JSON.stringify(out)); persistSubmitted(ids); }
        stopped = true;
        renderStopped(out.length);
      },

      confirmNew() {
        const sk = $("tw-nr").value, si = parseInt($("tw-ns").value), name = $("tw-nfn").value.trim();
        if (!name) return;
        const path = tree[sk].prefix + "/" + SEC_KEYS[si] + "/" + name;
        $("tw-nfn").value = "";
        selectPara(path, true);
      },

      confirmWaitDefer() { // wa/df: note + date optional; df adds a picked subfolder
        const note = $("tw-wd-note").value.trim(), date = $("tw-wd-date").value.trim();
        const utp = {};
        if (note) utp.contextNote = note;
        if (date) utp.thresholdDate = date;
        // df only: a picked subfolder sets destination; none (dfDest null) omits
        // it so the carrier falls back to flat Inbox/Defer (#243). wa never sets
        // it (always Inbox/Waiting).
        if (wdAction === "df" && dfDest) utp.destination = dfDest;
        decisions[cur] = buildDecision(wdAction || "df", utp, wdEdited); // #242: stamp edit-vs-accept
        $("tw-wd-note").value = ""; $("tw-wd-date").value = "";
        dfDest = null; dfFocus = 0; dfPrefill = null; wdEdited = false;
        closeAll();
        advance();
      },

      confirmDelegate() { // de: delegationTarget required
        const tgt = $("tw-de-tgt").value.trim();
        if (!tgt) { $("tw-de-hint").style.display = "block"; return; }
        decisions[cur] = buildDecision("de", { delegationTarget: tgt });
        $("tw-de-tgt").value = "";
        closeAll();
        advance();
      },

      confirmCustom() { // cu: note required
        const note = $("tw-cu-note").value.trim();
        if (!note) { $("tw-cu-hint").style.display = "block"; return; }
        decisions[cur] = buildDecision("cu", { note: note });
        $("tw-cu-note").value = "";
        closeAll();
        advance();
      },

      submit() {
        // Per-page append-only submit (#214): emit ONLY the current page's
        // decided rows as their own batch and lock the page. Each batch becomes
        // its own immutable decisions-<stamp>/batch-*.json, so a page finished
        // before the artifact dies is never lost.
        if (stopped || submittedPages[curPage]) return;
        const b = pageBounds(curPage);
        const out = [], ids = [];
        for (let i = b.start; i < b.end; i++) { if (decisions[i]) { out.push(decisions[i]); ids.push(emails[i].id); } } // omit untouched
        if (!out.length) return;
        sendPrompt("batch:" + JSON.stringify(out));
        submittedPages[curPage] = true;
        persistSubmitted(ids); // remember for resume — skip on next open (no 404)
        // Stay on the page's celebration card — a deliberate pause between pages.
        // The operator steps to the next page with Page ▶ (goPage), which clears
        // showCompletion. No auto-advance, no separate banner (the card carries
        // the quote). The terminal "all submitted" state is reflected by the card.
        showCompletion = true;
        render();
      },
    };

    /* --- Keyboard + field wiring --- */
    $("tw-wd-note").addEventListener("keydown", (e) => { if (e.key === "Enter") window.TW.confirmWaitDefer(); });
    $("tw-wd-date").addEventListener("keydown", (e) => { if (e.key === "Enter") window.TW.confirmWaitDefer(); });
    $("tw-de-tgt").addEventListener("keydown", (e) => { if (e.key === "Enter") window.TW.confirmDelegate(); });
    $("tw-cu-note").addEventListener("keydown", (e) => { if (e.key === "Enter") window.TW.confirmCustom(); });
    $("tw-nfn").addEventListener("keydown", (e) => { if (e.key === "Enter") window.TW.confirmNew(); });
    $("tw-wd-note").addEventListener("input", () => clearPf("tw-wd-note")); // pre-filled → typed (item 9)
    $("tw-wd-date").addEventListener("input", () => clearPf("tw-wd-date"));

    document.addEventListener("keydown", function (e) {
      if (activePanel === "tw-pap") {
        if (document.activeElement === $("tw-nfn")) return;
        const side = fCol === 0 ? "work" : "personal";
        if (e.key === "ArrowDown") { e.preventDefault(); const its = viewTree[side].sections[fSec]; if (fIdx + 1 < its.length) { setFocus(fCol, fSec, fIdx + 1); } else { for (let s = fSec + 1; s < 4; s++) { if (viewTree[side].sections[s].length > 0) { setFocus(fCol, s, 0); break; } } } return; }
        if (e.key === "ArrowUp") { e.preventDefault(); if (fIdx > 0) { setFocus(fCol, fSec, fIdx - 1); } else { for (let s = fSec - 1; s >= 0; s--) { const its = viewTree[side].sections[s]; if (its.length > 0) { setFocus(fCol, s, its.length - 1); break; } } } return; }
        if (e.key === "ArrowRight" && fCol === 0) { e.preventDefault(); const n = findNearest(1, fSec, fIdx); if (n) setFocus(1, n.sec, n.idx); return; }
        if (e.key === "ArrowLeft" && fCol === 1) { e.preventDefault(); const n = findNearest(0, fSec, fIdx); if (n) setFocus(0, n.sec, n.idx); return; }
        if (e.key === "Enter") { e.preventDefault(); const el = getCell(fCol, fSec, fIdx); if (el) selectPara(el.dataset.path, false); return; }
        if (e.key === "Escape") { closeAll(); return; }
      }
      // Defer-subfolder grid (#243): same ↑↓/Enter pattern as the PARA tree,
      // but only when focus isn't in the note/date inputs (so typing a note
      // still works). Enter selects + confirms the focused subfolder.
      if (activePanel === "tw-wdp" && wdAction === "df" && $("tw-dfsub").style.display !== "none") {
        const ae = document.activeElement;
        if (ae !== $("tw-wd-note") && ae !== $("tw-wd-date")) {
          if (e.key === "ArrowDown") { e.preventDefault(); dfMove(1); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); dfMove(-1); return; }
          if (e.key === "Enter") { e.preventDefault(); selectDefer(dfFocus, true); return; }
          if (e.key === "Escape") { closeAll(); return; }
        }
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      // Completion card: Enter advances to the next page once this page is
      // submitted — the keyboard twin of the footer "Next page →" button (#21).
      if (showCompletion && e.key === "Enter" && submittedPages[curPage] && curPage < pageCount - 1) { e.preventDefault(); window.TW.goPage(1); return; }
      const sbar = $("tw-stopbar");
      if (e.key === "Escape" && sbar && sbar.style.display !== "none") { window.TW.cancelStop(); return; }
      if (e.key === "Escape" && activePanel) { closeAll(); return; }
      // #311: the armed-`ag` two-step. Enter confirms, Escape abandons. Placed
      // after the panel handlers so an open PARA/defer picker keeps its own
      // Enter (that Enter selects a folder — a different act), and before the
      // shorthand buffer, where Enter is otherwise unbound on a base card.
      // The stop bar is excluded as well: Enter is inert there today, and an
      // Enter that silently records a decision under a confirm bar the operator
      // is reading is the opposite of what a confirm bar is for.
      const stopOpen = sbar && sbar.style.display !== "none";
      if (agArmed !== null && !activePanel && !showCompletion && !stopOpen) {
        if (e.key === "Enter") { e.preventDefault(); window.TW.confirmAgree(); return; }
        if (e.key === "Escape") { e.preventDefault(); window.TW.cancelAgree(); return; }
      }
      if (e.key === "i") { e.preventDefault(); window.TW.toggleDetails(); return; } // S40: open/close details
      if (e.key === "ArrowLeft") { e.preventDefault(); window.TW.go(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); window.TW.go(1); return; }
      const map = { ag: "ag", cu: "cu", st: "st", sk: "sk", do: "do", de: "de", wa: "wa", su: "su", df: "df", un: "un", pa: "pa", ar: "ar" };
      const buf = window._kbBuf || "", cand = buf + e.key;
      if (map[cand]) { e.preventDefault(); window._kbBuf = ""; window.TW.decide(map[cand]); return; }
      if ("acdwusp".includes(e.key.toLowerCase())) { window._kbBuf = e.key; setTimeout(() => { if (window._kbBuf === e.key) window._kbBuf = ""; }, 600); } else window._kbBuf = "";
    });

    /* --- Init --- */
    render();
  }

  /* Expose globally */
  window.initTriage = initTriage;
})();

