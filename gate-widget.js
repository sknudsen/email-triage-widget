/* gate-widget.js — the operator-sourced, un-skippable grouped-review gate (S111, #308).
 *
 * A small, standalone, SINGLE-PAGE ATOMIC widget: it renders the tier-tagged
 * pending ops (from present/gate_payload.py) as one scrollable approve/decline
 * pass and submits ONCE. There is deliberately no pagination and no localStorage
 * resume (unlike triage-widget.js) — the gate is a quick approval pass and a
 * #200 throwaway (it is deleted when --execute-all lands). Fail-closed: if the
 * operator closes the widget without submitting, nothing lands in the approvals
 * set and the executor refuses every Tier-2/3 `done` (present/executor.py).
 *
 * Usage: initGate({ stamp, tier1Count, tier2:[...], tier3:[...], counts, opCount }).
 * On Submit it emits `sendPrompt("gate:" + JSON.stringify({stamp, tier2BlockConfirm,
 * tier3:[{gateKey, approved, channel}]}))`, which the skill routes (put_gate /
 * onedrive-upload) to _scratch/artifact-gate-<stamp>-<ts>.json for present/gate_drain.py.
 *
 * Why this exists: at S109 the driving agent inferred approval from a scope
 * answer and dispatched 63 mutations with zero acks, then narrated fabricated ack
 * counts. Moving the acks onto a real operator UI act — captured structurally, not
 * narrated — removes that skip mode and cuts the per-op fatigue that caused it.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fire(t) {
    if (typeof sendPrompt === "function") sendPrompt(t);
    else if (typeof window !== "undefined" && typeof window.sendPrompt === "function") window.sendPrompt(t);
  }
  function root() {
    return document.getElementById("tg-root")
      || document.getElementById("tw-root")
      || document.body;
  }

  var CSS =
    ".tg{font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:760px}"
    + ".tg-h{font-size:16px;font-weight:600;margin:0 0 4px}"
    + ".tg-sub{color:#555;margin:0 0 16px}"
    + ".tg-sec{border:1px solid #e2e2e2;border-radius:8px;padding:12px 14px;margin:0 0 14px}"
    + ".tg-sh{font-weight:600;margin:0 0 8px}"
    + ".tg-t1{color:#555}"
    + ".tg-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-top:1px solid #f0f0f0}"
    + ".tg-row:first-of-type{border-top:none}"
    + ".tg-move{flex:1;min-width:0}"
    + ".tg-subj{font-weight:500}"
    + ".tg-from{color:#444;font-size:13px}"
    + ".tg-faddr{color:#8a9099;font-size:12px;margin-left:6px}"
    + ".tg-path{color:#666;font-size:13px}"
    + ".tg-flags{color:#a15c00;font-size:12px}"
    + ".tg-btns{display:flex;gap:6px;flex:none}"
    + ".tg-b{border:1px solid #ccc;background:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:13px}"
    + ".tg-b.tg-ap.on{background:#1a7f37;border-color:#1a7f37;color:#fff}"
    + ".tg-b.tg-dc.on{background:#b42318;border-color:#b42318;color:#fff}"
    + ".tg-ch{margin-top:4px}"
    + ".tg-ch input{font:13px inherit;padding:2px 6px;border:1px solid #ccc;border-radius:5px;width:180px}"
    + ".tg-conf{display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:500}"
    + ".tg-submit{margin-top:6px;background:#1a1a1a;color:#fff;border:none;border-radius:7px;padding:9px 18px;cursor:pointer;font-size:14px}"
    + ".tg-done{background:#eef7f0;border:1px solid #1a7f37;border-radius:8px;padding:14px;color:#0f5323}"
    + ".tg-watch{background:#fff8e6;border:1px solid #e0c56b;border-radius:8px;padding:10px 12px;margin:0 0 14px}"
    + ".tg-wh{font-weight:600;color:#8a6d00;margin:0 0 6px}"
    + ".tg-wl{margin:0;padding-left:18px}.tg-wl li{margin:2px 0}";

  function initGate(cfg) {
    cfg = cfg || {};
    var stamp = cfg.stamp;
    var tier2 = cfg.tier2 || [];
    var tier3 = cfg.tier3 || [];
    var tier1Count = cfg.tier1Count || 0;
    var watch = cfg.watch || []; // operator In-file reminder, display-only (#326)

    // State. tier2Confirmed: one block toggle. tier3State: per-op approval +
    // optional channel. Undecided (approved !== true) submits as approved:false.
    var tier2Confirmed = false;
    var tier3State = {}; // gateKey -> { approved: bool|undefined, channel: string }
    var submitted = false;

    function payload() {
      return {
        stamp: stamp,
        tier2BlockConfirm: tier2Confirmed === true,
        tier3: tier3.map(function (op) {
          var d = tier3State[op.gateKey] || {};
          return {
            gateKey: op.gateKey,
            approved: d.approved === true,
            channel: (d.channel && String(d.channel).trim()) || null,
          };
        }),
      };
    }

    function moveHtml(op) {
      var flags = (op.flags && op.flags.length)
        ? '<div class="tg-flags">flags: ' + esc(op.flags.join(", ")) + "</div>" : "";
      var chan = op.needsChannel
        ? '<div class="tg-ch">channel <input data-ch="' + esc(op.gateKey) + '" placeholder="'
          + esc(op.scopeHint ? "hint: " + op.scopeHint : "or leave blank to auto-predict") + '"></div>'
        : "";
      /* #331: sender on the gate row. #308 made this the un-skippable approval
         surface, and until now it showed subject + paths only — approving an
         archive or a PARA move on a subject line alone. Mirrors the card face
         (#270): display name, with the raw address appended only when it adds
         something (absent when the envelope carried no name, since `sender` is
         then already the address — the producer sends null). Escaped like every
         other email-derived string (#266). */
      var from = op.sender
        ? '<div class="tg-from">' + esc(op.sender)
          + (op.senderAddress ? '<span class="tg-faddr">' + esc(op.senderAddress) + "</span>" : "")
          + "</div>"
        : "";
      return '<div class="tg-move"><div class="tg-subj">' + esc(op.subject) + "</div>"
        + from
        + '<div class="tg-path">' + esc(op.action) + ": " + esc(op.sourcePath || "Inbox")
        + " → " + esc(op.destPath || "(in place)") + "</div>" + flags + chan + "</div>";
    }

    function render() {
      if (submitted) {
        var p = payload();
        var okN = p.tier3.filter(function (t) { return t.approved; }).length;
        root().innerHTML = '<div class="tg"><div class="tg-done">'
          + "✓ Gate submitted — " + (p.tier2BlockConfirm ? "Tier-2 block confirmed" : "Tier-2 block NOT confirmed")
          + ", " + okN + " of " + tier3.length + " Tier-3 ops approved."
          + " The executor will dispatch only the approved set.</div></div>";
        return;
      }

      var h = '<div class="tg"><div class="tg-h">Grouped-review gate</div>'
        + '<div class="tg-sub">Approve before dispatch. Nothing dispatches without your ok here (#308).</div>';

      // Watch-list — the operator's In-file reminders, surfaced before the
      // decision (#326). Display-only: eyeball these while approving.
      if (watch.length) {
        h += '<div class="tg-watch"><div class="tg-wh">⚠ Watch this run</div><ul class="tg-wl">';
        watch.forEach(function (w) { h += "<li>" + esc(w) + "</li>"; });
        h += "</ul></div>";
      }

      // Tier 1 — count only (rides the page "go").
      h += '<div class="tg-sec"><div class="tg-sh">Tier 1 · low-risk</div>'
        + '<div class="tg-t1">' + tier1Count + " op(s) will dispatch on the page “go” — no approval needed.</div></div>";

      // Tier 2 — enumerated block + one confirm toggle.
      if (tier2.length) {
        h += '<div class="tg-sec"><div class="tg-sh">Tier 2 · confirm these '
          + tier2.length + " triage-folder move(s) as a block</div>";
        tier2.forEach(function (op, i) {
          h += '<div class="tg-row">' + moveHtml(op) + "</div>";
        });
        h += '<label class="tg-conf"><input type="checkbox" id="tg-t2c"> Confirm all '
          + tier2.length + " as a block</label></div>";
      }

      // Tier 3 — one row per op, each its own approve/decline.
      if (tier3.length) {
        h += '<div class="tg-sec"><div class="tg-sh">Tier 3 · approve each ('
          + tier3.length + ")</div>";
        tier3.forEach(function (op) {
          var st = tier3State[op.gateKey] || {};
          h += '<div class="tg-row">' + moveHtml(op)
            + '<div class="tg-btns">'
            + '<button class="tg-b tg-ap' + (st.approved === true ? " on" : "") + '" data-ap="' + esc(op.gateKey) + '">Approve</button>'
            + '<button class="tg-b tg-dc' + (st.approved === false ? " on" : "") + '" data-dc="' + esc(op.gateKey) + '">Decline</button>'
            + "</div></div>";
        });
        h += "</div>";
      }

      h += '<button class="tg-submit" id="tg-submit">Submit gate</button></div>';
      root().innerHTML = h;
      wire();
    }

    function wire() {
      var t2c = document.getElementById("tg-t2c");
      if (t2c) {
        t2c.checked = tier2Confirmed;
        t2c.onchange = function () { tier2Confirmed = t2c.checked; };
      }
      [].forEach.call(document.querySelectorAll("[data-ap]"), function (b) {
        b.onclick = function () { GATE.approve(b.getAttribute("data-ap")); };
      });
      [].forEach.call(document.querySelectorAll("[data-dc]"), function (b) {
        b.onclick = function () { GATE.decline(b.getAttribute("data-dc")); };
      });
      [].forEach.call(document.querySelectorAll("[data-ch]"), function (inp) {
        inp.oninput = function () { GATE.setChannel(inp.getAttribute("data-ch"), inp.value); };
      });
      var sub = document.getElementById("tg-submit");
      if (sub) sub.onclick = function () { GATE.submit(); };
    }

    var GATE = {
      approve: function (key) {
        var s = tier3State[key] || (tier3State[key] = {});
        s.approved = true;
        render();
      },
      decline: function (key) {
        var s = tier3State[key] || (tier3State[key] = {});
        s.approved = false;
        render();
      },
      setChannel: function (key, val) {
        var s = tier3State[key] || (tier3State[key] = {});
        s.channel = val;
      },
      toggleTier2: function (v) {
        tier2Confirmed = v == null ? !tier2Confirmed : !!v;
        render();
      },
      submit: function () {
        fire("gate:" + JSON.stringify(payload()));
        submitted = true;
        render();
      },
      _payload: payload, // test hook
    };
    if (typeof window !== "undefined") window.GATE = GATE;

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    render();
    return GATE;
  }

  if (typeof window !== "undefined") window.initGate = initGate;
  if (typeof module !== "undefined" && module.exports) module.exports = { initGate: initGate };
})();
