/**
 * Email Triage Batch Widget
 * Standalone template for CDN hosting.
 * Version 2.0
 * Usage: initTriage({ batch, total, emails, tree })
 *
 * emails: array of { id, sender, date, subject, bodyPreview?, attachment?,
 *         sentNotice?, badgeLabel, badgeClass, suggestedAction,
 *         suggestedPath?, reason, annotation?, threadRef?, suggestion? }
 *   - bodyPreview: first ~200 chars of email body (shown below subject)
 *   - suggestedPath: full PARA path for ALL suggestion types (shown below reason)
 *     e.g. '.PARA-work/4_Archive/0_Inbox_trash' for triage dump
 *   - suggestion: the verbatim Stage 2 Suggestion record for this email, stitched
 *     in by the calling skill (input bridge). Echoed back on each decision row at
 *     submit time. Shape: { emailId, source, action, actionConfidence,
 *     actionReasons, parameterisation, parameterisationConfidence,
 *     parameterisationReasons, relatedDecisions }. Omit if unavailable (-> null).
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
    const root = document.getElementById("tw-root");
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
      window.TW = { go() {}, goPage() {}, decide() {}, submit() {}, stop() {}, confirmStop() {}, cancelStop() {}, toggleDetails() {} };
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
    let celebration = "";      // last celebration quote, shown after a submit
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
    const decisions = emails.map(() => null);
    let detailsOpen = false; // S40 details panel: sticky across navigation
    let activePanel = null,
      wdAction = null, // 'wa' | 'df' — which action opened the shared wait/defer panel
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
.tw-nbtn{font-size:13px;padding:5px 12px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer}
.tw-nbtn:hover{background:var(--color-background-secondary)}
.tw-nbtn:disabled{opacity:.3;cursor:default}
.tw-card{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1.25rem;margin:0 0 .75rem}
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
.tw-body{font-size:12px;color:var(--color-text-tertiary);line-height:1.5;margin:4px 0 0;white-space:pre-line;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.tw-spath{font-size:11px;color:var(--color-text-tertiary);font-family:var(--font-mono,monospace);margin-top:2px}
.tw-sent{font-size:12px;color:var(--color-text-secondary);background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:6px 10px;margin-top:8px}
.tw-thr{font-size:12px;color:var(--color-text-info);margin-bottom:6px}
.tw-dtag{font-size:11px;padding:2px 8px;border-radius:var(--border-radius-md);background:var(--color-background-success);color:var(--color-text-success);margin-left:auto}
.tw-cl{font-size:10px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.tw-bg{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.tw-bc{display:flex;flex-direction:column;gap:4px}
button.tw-a{font-size:13px;padding:7px 8px;border-radius:var(--border-radius-md);border:.5px solid var(--color-border-secondary);background:transparent;color:var(--color-text-primary);cursor:pointer;text-align:left;width:100%}
button.tw-a:hover{background:var(--color-background-secondary)}
button.tw-a:active{transform:scale(.98)}
button.tw-a .tw-ac{font-size:10px;color:var(--color-text-tertiary);display:block;font-family:var(--font-mono)}
button.tw-a.hl{border-color:var(--color-border-info);background:var(--color-background-info)}
button.tw-a.hl .tw-ac{color:var(--color-text-info)}
.tw-kh{font-size:11px;color:var(--color-text-tertiary);margin-top:8px;text-align:right}
.tw-sr{margin-top:12px;text-align:center}
.tw-sb{font-size:14px;padding:10px 24px;border-radius:var(--border-radius-md);border:none;background:var(--color-border-info);color:#fff;cursor:pointer;font-weight:500}
.tw-sb:disabled{opacity:.3;cursor:default}
.tw-sb:hover:not(:disabled){opacity:.85}
.tw-cel{margin:4px 0 10px;padding:8px 12px;border-radius:var(--border-radius-md);background:var(--color-background-success);color:var(--color-text-success);font-size:13px;font-style:italic;text-align:center}
.tw-stopbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:10px;padding:8px 12px;border-radius:var(--border-radius-md);background:var(--color-background-warning);color:var(--color-text-warning);font-size:13px}
.tw-done{padding:2rem 1rem;text-align:center}
.tw-done-h{font-size:20px;font-weight:600;color:var(--color-text-primary);margin-bottom:8px}
.tw-done-s{font-size:13px;color:var(--color-text-secondary);margin-bottom:14px}
.tw-quote{font-size:14px;font-style:italic;color:var(--color-text-success);max-width:34rem;margin:0 auto}
.tw-pnl{background:var(--color-background-primary);border:.5px solid var(--color-border-tertiary);border-radius:var(--border-radius-lg);padding:1rem 1.25rem;margin-top:6px}
.tw-pt{font-size:13px;font-weight:500;margin-bottom:10px;color:var(--color-text-primary)}
.tw-pg{display:grid;grid-template-columns:1fr 1fr}
.tw-pc:first-child{padding-right:12px;border-right:.5px solid var(--color-border-tertiary)}
.tw-pc:last-child{padding-left:12px}
.tw-tr{font-size:12px;font-weight:500;color:var(--color-text-secondary);padding:4px 0;border-bottom:.5px solid var(--color-border-tertiary);margin-bottom:4px}
.tw-tsl{font-size:10px;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:.05em;padding:6px 4px 3px}
.tw-ti{font-size:13px;color:var(--color-text-primary);padding:4px 8px;border-radius:var(--border-radius-md);cursor:pointer;display:flex;align-items:center;gap:6px}
.tw-ti:hover{background:var(--color-background-secondary)}
.tw-ti.sel{background:var(--color-background-info);color:var(--color-text-info)}
.tw-ti.foc{box-shadow:0 0 0 2px var(--color-border-info)}
.tw-ti.nw{font-style:italic}
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
  <div class="tw-nav"><button class="tw-nbtn" id="tw-ppage" onclick="TW.goPage(-1)">◀ Page</button><button class="tw-nbtn" id="tw-prev" onclick="TW.go(-1)">← Prev</button><span class="tw-lbl" id="tw-pos"></span><button class="tw-nbtn" id="tw-next" onclick="TW.go(1)">Next →</button><button class="tw-nbtn" id="tw-npage" onclick="TW.goPage(1)">Page ▶</button></div>
  <div id="tw-cel" class="tw-cel" style="display:none"></div>
  <div id="tw-card"></div>
  <div class="tw-bg">
    <div class="tw-bc"><div class="tw-cl">Meta</div><button class="tw-a" id="btn-a" onclick="TW.decide('a')"><span class="tw-ac">a</span>Agree</button><button class="tw-a" id="btn-cu" onclick="TW.decide('cu')"><span class="tw-ac">cu</span>Custom</button><button class="tw-a" id="btn-st" onclick="TW.decide('st')"><span class="tw-ac">st</span>Stop</button></div>
    <div class="tw-bc"><div class="tw-cl">Handle now</div><button class="tw-a" id="btn-do" onclick="TW.decide('do')"><span class="tw-ac">do</span>Do now</button><button class="tw-a" id="btn-de" onclick="TW.decide('de')"><span class="tw-ac">de</span>Delegate</button><button class="tw-a" id="btn-wa" onclick="TW.decide('wa')"><span class="tw-ac">wa</span>Waiting</button></div>
    <div class="tw-bc"><div class="tw-cl">Defer</div><button class="tw-a" id="btn-su" onclick="TW.decide('su')"><span class="tw-ac">su</span>Sunsama</button><button class="tw-a" id="btn-df" onclick="TW.decide('df')"><span class="tw-ac">df</span>Defer</button><button class="tw-a" id="btn-un" onclick="TW.decide('un')"><span class="tw-ac">un</span>Undecided</button></div>
    <div class="tw-bc"><div class="tw-cl">Archive</div><button class="tw-a" id="btn-pa" onclick="TW.decide('pa')"><span class="tw-ac">pa</span>PARA folder</button><button class="tw-a" id="btn-ar" onclick="TW.decide('ar')"><span class="tw-ac">ar</span>Triage dump</button><button class="tw-a" id="btn-sk" onclick="TW.decide('sk')"><span class="tw-ac">sk</span>Skip</button></div>
  </div>
  <div class="tw-kh">← → navigate · type shorthand to decide · Enter in PARA tree confirms</div>
  <div id="tw-pap" style="display:none"><div class="tw-pnl"><div class="tw-pt">Choose PARA folder</div><div class="tw-pg" id="tw-pgrid"></div>
    <div class="tw-nfr"><select id="tw-nr"><option value="work">work</option><option value="personal">personal</option></select><select id="tw-ns"><option value="0">1 · Projects</option><option value="1">2 · Areas</option><option value="2">3 · Resources</option><option value="3">4 · Archive</option></select><input type="text" id="tw-nfn" placeholder="New folder name…"/><button class="tw-cb" onclick="TW.confirmNew()">Create + select</button></div></div></div>
  <div id="tw-wdp" style="display:none"><div class="tw-dfp">
    <div class="tw-pt" id="tw-wd-title">Defer</div>
    <div class="tw-wdf">
      <label class="tw-wdl"><span>Follow-up note<em class="tw-pfh" id="tw-wd-note-pf" style="display:none"> · from suggestion</em></span><input type="text" id="tw-wd-note" placeholder="optional"/></label>
      <label class="tw-wdl"><span>Threshold date<em class="tw-pfh" id="tw-wd-date-pf" style="display:none"> · from suggestion</em></span><input type="text" id="tw-wd-date" placeholder="YYYY-MM-DD (optional)"/></label>
    </div>
    <div class="tw-pr"><button class="tw-cb" onclick="TW.confirmWaitDefer()">Confirm</button></div></div></div>
  <div id="tw-dep" style="display:none"><div class="tw-dfp"><div class="tw-dfr"><input type="text" id="tw-de-tgt" placeholder="Delegate to… (required)"/><button class="tw-cb" onclick="TW.confirmDelegate()">Delegate</button></div><div class="tw-req" id="tw-de-hint">Required — enter a delegate.</div></div></div>
  <div id="tw-cup" style="display:none"><div class="tw-dfp"><div class="tw-dfr"><input type="text" id="tw-cu-note" placeholder="Custom note… (required)"/><button class="tw-cb" onclick="TW.confirmCustom()">Save</button></div><div class="tw-req" id="tw-cu-hint">Required — enter a note.</div></div></div>
  <div id="tw-stopbar" class="tw-stopbar" style="display:none"><span id="tw-stopmsg"></span><button class="tw-cb" id="tw-stopok" onclick="TW.confirmStop()">Confirm stop</button><button class="tw-nbtn" onclick="TW.cancelStop()">Cancel</button></div>
  <div class="tw-sr"><span class="tw-lbl" id="tw-gp"></span><button class="tw-sb" id="tw-sub" disabled onclick="TW.submit()">Submit page</button></div>
</div>`;

    /* --- Helpers --- */
    const $ = (id) => document.getElementById(id);

    function renderDots() {
      const c = $("tw-dots");
      c.innerHTML = "";
      const b = pageBounds(curPage);
      for (let i = b.start; i < b.end; i++) {
        const d = document.createElement("span");
        d.className = "tw-dot" + (decisions[i] ? " decided" : "") + (i === cur ? " current" : "");
        d.onclick = (function (idx) { return function () { cur = idx; render(); }; })(i);
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
      $("tw-gp").textContent =
        overall + " / " + emails.length + " decided overall · " +
        Object.keys(submittedPages).length + " of " + pageCount + " pages submitted";
    }

    function render() {
      closeAll();
      const e = emails[cur];
      const pb = pageBounds(curPage);
      let h = '<div class="tw-card' + (detailsOpen ? " open" : "") + '">';
      // Thread line (#214 mix): the run-level part comes baked from Stage 3
      // (`threadRef` — "N other emails in this thread"); the widget appends the
      // page-local part ("X in this carousel"), which only it can know.
      let thr = e.threadRef || "";
      const conv = e.metadata && e.metadata.conversationId;
      if (conv) {
        let inCar = 0;
        for (let i = pb.start; i < pb.end; i++) {
          if (i !== cur && emails[i].metadata && emails[i].metadata.conversationId === conv) inCar++;
        }
        if (inCar > 0) thr = (thr ? thr + ", " : "") + inCar + " in this carousel";
      }
      if (thr) h += '<div class="tw-thr">🔗 ' + thr + "</div>";
      h += '<div class="tw-mr"><span class="tw-k">From</span><span class="tw-v">' + e.sender + "</span>";
      if (decisions[cur]) h += '<span class="tw-dtag">✓ ' + decisions[cur].decisionKey.toUpperCase() + "</span>";
      h += '</div><div class="tw-mr"><span class="tw-k">Date</span><span class="tw-v">' + e.date + "</span></div>";
      h += '<div class="tw-subj">' + e.subject + "</div>";
      if (e.bodyPreview) h += '<div class="tw-body">' + e.bodyPreview + "</div>";
      if (e.attachment) h += '<div class="tw-mr"><span class="tw-k">Attachments</span><span class="tw-v" style="color:var(--color-text-info)">' + e.attachment + "</span></div>";
      if (e.sentNotice) h += '<div class="tw-sent">📤 ' + e.sentNotice + "</div>";
      h += '<hr class="tw-hr"><div style="display:flex;align-items:flex-start;gap:10px"><span class="tw-badge ' + e.badgeClass + '">' + e.badgeLabel + '</span><div style="flex:1;min-width:0">';
      h += '<div class="tw-reason">' + e.reason + "</div>";
      if (e.suggestedPath) h += '<div class="tw-spath">→ ' + e.suggestedPath + "</div>";
      if (e.annotation) h += '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px">' + e.annotation + "</div>";
      h += "</div>"; // close reason block
      h += '<button class="tw-iaff" onclick="TW.toggleDetails()" aria-label="Toggle details">' + (detailsOpen ? "close" : "details") + '<span class="tw-ac">i</span></button>';
      h += "</div></div>"; // close pill row + tw-card
      if (detailsOpen) h += buildDetails(e);
      $("tw-card").innerHTML = h;
      document.querySelectorAll("button.tw-a").forEach((b) => b.classList.remove("hl"));
      const sb = $("btn-" + e.suggestedAction);
      if (sb) sb.classList.add("hl");
      $("tw-prev").disabled = cur === pb.start;
      $("tw-next").disabled = cur === pb.end - 1;
      $("tw-ppage").disabled = curPage === 0;
      $("tw-npage").disabled = curPage >= pageCount - 1;
      $("tw-pos").textContent = (cur - pb.start + 1) + " of " + (pb.end - pb.start);
      $("tw-page").textContent = "Page " + (curPage + 1) + " of " + pageCount;
      const cel = $("tw-cel");
      if (celebration) { cel.textContent = "🎉 " + celebration; cel.style.display = "block"; }
      else { cel.style.display = "none"; }
      renderDots();
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
      render();
    }

    /* --- PARA tree --- */
    function buildTree() {
      const grid = $("tw-pgrid");
      grid.innerHTML = "";
      const maxC = SEC_KEYS.map((_, si) => Math.max(tree.work.sections[si].length, tree.personal.sections[si].length));
      const preSel = emails[cur].suggestedAction === "pa" ? emails[cur].suggestedPath : "";
      ["work", "personal"].forEach((side, ci) => {
        const data = tree[side], col = document.createElement("div");
        col.className = "tw-pc";
        const rt = document.createElement("div");
        rt.className = "tw-tr";
        rt.style.cssText = "height:28px;line-height:28px";
        rt.textContent = data.label;
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
              row.className = "tw-ti" + (item.isNew ? " nw" : "");
              const path = data.prefix + "/" + SEC_KEYS[si] + "/" + item.name;
              row.dataset.path = path; row.dataset.col = ci; row.dataset.sec = si; row.dataset.idx = i;
              if (path === preSel) { row.classList.add("sel"); fCol = ci; fSec = si; fIdx = i; }
              row.innerHTML = '<span class="tw-ico">📁</span>' + item.name;
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
      for (let s = sec; s < 4; s++) { const its = tree[side].sections[s]; const i = s === sec ? Math.min(idx, its.length - 1) : 0; if (its.length > 0 && i >= 0) return { sec: s, idx: i }; }
      for (let s = sec - 1; s >= 0; s--) { const its = tree[side].sections[s]; if (its.length > 0) return { sec: s, idx: its.length - 1 }; }
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
      if (activePanel === id) { closeAll(); } else { closeAll(); $(id).style.display = "block"; activePanel = id; if (id === "tw-pap") buildTree(); }
    }

    /* --- Editable-param panels (S46, items 5–9) ----------------------------
     * wa/df share one two-field panel (contextNote + thresholdDate). Both fields
     * pre-fill from suggestion.parameterisation when present; a pre-filled field
     * carries a quiet visual flag (tw-pf + "from suggestion" hint) that clears on
     * first edit (item 9). de/cu open single required free-text panels — an empty
     * submit blocks the decision and surfaces an inline hint (confirmNew pattern).
     * All values route through buildDecision into user_typed_params. */
    function prefillField(id, val) {
      const el = $(id), hint = $(id + "-pf");
      if (val !== undefined && val !== null && String(val) !== "") {
        el.value = String(val); el.classList.add("tw-pf");
        if (hint) hint.style.display = "inline";
      } else {
        el.value = ""; el.classList.remove("tw-pf");
        if (hint) hint.style.display = "none";
      }
    }
    function clearPf(id) { // operator edited a pre-filled field → it's now typed
      $(id).classList.remove("tw-pf");
      const hint = $(id + "-pf"); if (hint) hint.style.display = "none";
    }
    function openWaitDefer(code) {
      togglePanel("tw-wdp");
      if (activePanel !== "tw-wdp") return; // toggled closed
      wdAction = code;
      $("tw-wd-title").textContent = code === "wa" ? "Waiting for" : "Defer";
      const p = (emails[cur].suggestion && emails[cur].suggestion.parameterisation) || {};
      prefillField("tw-wd-note", p.contextNote);
      prefillField("tw-wd-date", p.thresholdDate);
      setTimeout(() => $("tw-wd-note").focus(), 50);
    }

    /* --- Decision envelope (S42 locked shape) --- */
    // Emits { emailId, decisionKey, timestamp, action, user_typed_params, suggestion }.
    // decisionKey = key pressed; action = same except for "a" (agree), where action and
    // params are copied from the Stage 2 suggestion. suggestion is echoed verbatim from the
    // input bridge (emails[cur].suggestion), or null if the calling skill passed none.
    function buildDecision(code, params) {
      const e = emails[cur];
      const sug = e.suggestion || null;
      let action = code;
      let utp = params || {};
      if (code === "a") { // agree: accept Stage 2 suggestion verbatim
        action = (sug && sug.action) || e.suggestedAction || "a";
        utp = (sug && sug.parameterisation) ? Object.assign({}, sug.parameterisation) : {};
      }
      if (code === "sk") { action = "keep"; } // skip: no-action, carrier leaves it in place (NOOP_ACTIONS)
      return {
        emailId: e.id,
        decisionKey: code,
        timestamp: new Date().toISOString(),
        action: action,
        user_typed_params: utp,
        suggestion: sug,
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
      go(delta) { const b = pageBounds(curPage); const n = cur + delta; if (n >= b.start && n < b.end) { cur = n; render(); } },

      goPage(delta) {
        const p = curPage + delta;
        if (p < 0 || p >= pageCount) return;
        curPage = p;
        cur = pageBounds(p).start;
        render();
      },

      toggleDetails() { detailsOpen = !detailsOpen; render(); },
      openDetailsFile() { sendPrompt("details:" + emails[cur].id); }, // skill writes <snapshot>/details/<emailId>.md

      decide(code) {
        if (code === "st") { window.TW.stop(); return; } // Stop = flush + end the sitting
        if (stopped || submittedPages[curPage]) return; // page submitted / sitting stopped — locked
        if (code === "pa") { togglePanel("tw-pap"); return; }
        if (code === "df" || code === "wa") { openWaitDefer(code); return; }
        if (code === "de") { togglePanel("tw-dep"); setTimeout(() => $("tw-de-tgt").focus(), 50); return; }
        if (code === "cu") { togglePanel("tw-cup"); setTimeout(() => $("tw-cu-note").focus(), 50); return; }
        decisions[cur] = buildDecision(code, {});
        advance();
      },

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

      confirmWaitDefer() { // wa/df: both fields optional
        const note = $("tw-wd-note").value.trim(), date = $("tw-wd-date").value.trim();
        const utp = {};
        if (note) utp.contextNote = note;
        if (date) utp.thresholdDate = date;
        decisions[cur] = buildDecision(wdAction || "df", utp);
        $("tw-wd-note").value = ""; $("tw-wd-date").value = "";
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
        // decided rows as their own batch, lock the page, advance to the next.
        // Each batch becomes its own immutable decisions-<stamp>/batch-*.json,
        // so a page finished before the artifact dies is never lost.
        if (stopped || submittedPages[curPage]) return;
        const b = pageBounds(curPage);
        const out = [], ids = [];
        for (let i = b.start; i < b.end; i++) { if (decisions[i]) { out.push(decisions[i]); ids.push(emails[i].id); } } // omit untouched
        if (!out.length) return;
        sendPrompt("batch:" + JSON.stringify(out));
        submittedPages[curPage] = true;
        persistSubmitted(ids); // remember for resume — skip on next open (no 404)
        const allDone = Object.keys(submittedPages).length === pageCount;
        // Celebrate the batch (the v1 widget showed a quote after a batch of 13).
        const q = pickQuote();
        celebration = allDone ? ("Inbox zero!" + (q ? " " + q : "")) : (q || "Batch done.");
        if (!allDone && curPage < pageCount - 1) { curPage += 1; cur = pageBounds(curPage).start; }
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
        if (e.key === "ArrowDown") { e.preventDefault(); const its = tree[side].sections[fSec]; if (fIdx + 1 < its.length) { setFocus(fCol, fSec, fIdx + 1); } else { for (let s = fSec + 1; s < 4; s++) { if (tree[side].sections[s].length > 0) { setFocus(fCol, s, 0); break; } } } return; }
        if (e.key === "ArrowUp") { e.preventDefault(); if (fIdx > 0) { setFocus(fCol, fSec, fIdx - 1); } else { for (let s = fSec - 1; s >= 0; s--) { const its = tree[side].sections[s]; if (its.length > 0) { setFocus(fCol, s, its.length - 1); break; } } } return; }
        if (e.key === "ArrowRight" && fCol === 0) { e.preventDefault(); const n = findNearest(1, fSec, fIdx); if (n) setFocus(1, n.sec, n.idx); return; }
        if (e.key === "ArrowLeft" && fCol === 1) { e.preventDefault(); const n = findNearest(0, fSec, fIdx); if (n) setFocus(0, n.sec, n.idx); return; }
        if (e.key === "Enter") { e.preventDefault(); const el = getCell(fCol, fSec, fIdx); if (el) selectPara(el.dataset.path, false); return; }
        if (e.key === "Escape") { closeAll(); return; }
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const sbar = $("tw-stopbar");
      if (e.key === "Escape" && sbar && sbar.style.display !== "none") { window.TW.cancelStop(); return; }
      if (e.key === "Escape" && activePanel) { closeAll(); return; }
      if (e.key === "i") { e.preventDefault(); window.TW.toggleDetails(); return; } // S40: open/close details
      if (e.key === "ArrowLeft") { e.preventDefault(); window.TW.go(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); window.TW.go(1); return; }
      const map = { a: "a", cu: "cu", st: "st", sk: "sk", do: "do", de: "de", wa: "wa", su: "su", df: "df", un: "un", pa: "pa", ar: "ar" };
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

