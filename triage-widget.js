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
    const emails = cfg.emails;
    const tree = cfg.tree;
    const batchNum = cfg.batch || 1;

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
    const root = document.getElementById("tw-root");
    root.innerHTML = `
<div style="padding:.5rem 0">
  <div class="tw-bar"><span class="tw-lbl">Batch ${batchNum}</span><div class="tw-dots" id="tw-dots"></div><span class="tw-lbl" id="tw-dc">0 / 0 decided</span></div>
  <div class="tw-nav"><button class="tw-nbtn" id="tw-prev" onclick="TW.go(-1)">← Prev</button><span class="tw-lbl" id="tw-pos"></span><button class="tw-nbtn" id="tw-next" onclick="TW.go(1)">Next →</button></div>
  <div id="tw-card"></div>
  <div class="tw-bg">
    <div class="tw-bc"><div class="tw-cl">Meta</div><button class="tw-a" id="btn-a" onclick="TW.decide('a')"><span class="tw-ac">a</span>Agree</button><button class="tw-a" id="btn-cu" onclick="TW.decide('cu')"><span class="tw-ac">cu</span>Custom</button><button class="tw-a" id="btn-st" onclick="TW.decide('st')"><span class="tw-ac">st</span>Stop</button></div>
    <div class="tw-bc"><div class="tw-cl">Handle now</div><button class="tw-a" id="btn-do" onclick="TW.decide('do')"><span class="tw-ac">do</span>Do now</button><button class="tw-a" id="btn-de" onclick="TW.decide('de')"><span class="tw-ac">de</span>Delegate</button><button class="tw-a" id="btn-wa" onclick="TW.decide('wa')"><span class="tw-ac">wa</span>Waiting</button></div>
    <div class="tw-bc"><div class="tw-cl">Defer</div><button class="tw-a" id="btn-su" onclick="TW.decide('su')"><span class="tw-ac">su</span>Sunsama</button><button class="tw-a" id="btn-df" onclick="TW.decide('df')"><span class="tw-ac">df</span>Defer</button><button class="tw-a" id="btn-un" onclick="TW.decide('un')"><span class="tw-ac">un</span>Undecided</button></div>
    <div class="tw-bc"><div class="tw-cl">Archive</div><button class="tw-a" id="btn-pa" onclick="TW.decide('pa')"><span class="tw-ac">pa</span>PARA folder</button><button class="tw-a" id="btn-ar" onclick="TW.decide('ar')"><span class="tw-ac">ar</span>Triage dump</button></div>
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
  <div class="tw-sr"><button class="tw-sb" id="tw-sub" disabled onclick="TW.submit()">Submit batch</button></div>
</div>`;

    /* --- Helpers --- */
    const $ = (id) => document.getElementById(id);

    function renderDots() {
      const c = $("tw-dots");
      c.innerHTML = "";
      emails.forEach((_, i) => {
        const d = document.createElement("span");
        d.className = "tw-dot" + (decisions[i] ? " decided" : "") + (i === cur ? " current" : "");
        d.onclick = () => { cur = i; render(); };
        c.appendChild(d);
      });
      $("tw-dc").textContent = decisions.filter(Boolean).length + " / " + emails.length + " decided";
      $("tw-sub").disabled = decisions.some((d) => !d);
    }

    function render() {
      closeAll();
      const e = emails[cur];
      let h = '<div class="tw-card' + (detailsOpen ? " open" : "") + '">';
      if (e.threadRef) h += '<div class="tw-thr">🔗 ' + e.threadRef + "</div>";
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
      $("tw-prev").disabled = cur === 0;
      $("tw-next").disabled = cur === emails.length - 1;
      $("tw-pos").textContent = cur + 1 + " of " + emails.length;
      renderDots();
    }

    function advance() {
      for (let i = cur + 1; i < emails.length; i++) { if (!decisions[i]) { cur = i; render(); return; } }
      for (let i = 0; i < cur; i++) { if (!decisions[i]) { cur = i; render(); return; } }
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
      go(delta) { const n = cur + delta; if (n >= 0 && n < emails.length) { cur = n; render(); } },

      toggleDetails() { detailsOpen = !detailsOpen; render(); },
      openDetailsFile() { sendPrompt("details:" + emails[cur].id); }, // skill writes <snapshot>/details/<emailId>.md

      decide(code) {
        if (code === "pa") { togglePanel("tw-pap"); return; }
        if (code === "df" || code === "wa") { openWaitDefer(code); return; }
        if (code === "de") { togglePanel("tw-dep"); setTimeout(() => $("tw-de-tgt").focus(), 50); return; }
        if (code === "cu") { togglePanel("tw-cup"); setTimeout(() => $("tw-cu-note").focus(), 50); return; }
        if (code === "st") { renderDots(); return; } // S40 lock: stop writes NO row
        decisions[cur] = buildDecision(code, {});
        advance();
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
        const out = [];
        decisions.forEach((d) => { if (d) out.push(d); }); // omit untouched emails
        sendPrompt("batch:" + JSON.stringify(out));
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
      if (e.key === "Escape" && activePanel) { closeAll(); return; }
      if (e.key === "i") { e.preventDefault(); window.TW.toggleDetails(); return; } // S40: open/close details
      if (e.key === "ArrowLeft") { e.preventDefault(); window.TW.go(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); window.TW.go(1); return; }
      const map = { a: "a", cu: "cu", st: "st", do: "do", de: "de", wa: "wa", su: "su", df: "df", un: "un", pa: "pa", ar: "ar" };
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

