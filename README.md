# email-triage-widget

A standalone HTML/CSS/JS widget for email triage, designed to be loaded via CDN inside [Claude's Visualizer](https://claude.ai) (`show_widget`). Used by a custom Claude skill that runs a GTD + PARA inbox-zero workflow against Outlook via MCP connectors.

## Why this exists

Claude's Visualizer streams widget code token-by-token before rendering. For complex widgets (~5,000+ tokens of CSS, JS, and HTML), this creates a noticeable delay. By hosting the static template externally and loading it via CDN, each widget call shrinks to just the per-batch data payload (~1,000–1,500 tokens), cutting load times by roughly 60–70%.

## Usage

### In a Claude `show_widget` call

```html
<div id="tw-root"></div>
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/email-triage-widget@main/triage-widget.js"></script>
<script>
initTriage({
  batch: 1,
  emails: [
    {
      id: "outlook-email-id",
      sender: "someone@example.com",
      date: "Mon 23 Mar 09:00",
      subject: "Re: Meeting notes",
      attachment: null,
      sentNotice: null,
      badgeLabel: "PARA folder",
      badgeClass: "badge-pa",
      suggestedAction: "pa",
      suggestedPath: ".PARA-work/2_Areas/ProjectX",
      reason: "Sender map → ProjectX folder",
      annotation: "📅 Meeting with someone tomorrow",
      threadRef: null
    }
    // ... up to 13 emails per batch
  ],
  tree: {
    work: {
      label: "PARA-work",
      prefix: ".PARA-work",
      sections: [
        [{ name: "ProjectA" }, { name: "ProjectB" }],   // 1_Current_projects
        [{ name: "AreaX" }],                              // 2_Areas
        [{ name: "ResourceY" }],                          // 3_Resources
        [{ name: "Inbox_trash" }]                         // 4_Archive
      ]
    },
    personal: {
      label: "PARA-personal",
      prefix: ".PARA-personal",
      sections: [
        [{ name: "ProjectC" }],
        [{ name: "Finance" }],
        [],
        [{ name: "Inbox_trash" }]
      ]
    }
  }
});
</script>
```

### Email object fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Outlook email ID |
| `sender` | string | Display name or email |
| `date` | string | Formatted date string |
| `subject` | string | Email subject |
| `attachment` | string \| null | Attachment description |
| `sentNotice` | string \| null | "You replied on..." notice |
| `badgeLabel` | string | Suggestion label text |
| `badgeClass` | string | CSS class: `badge-pa`, `badge-do`, `badge-su`, `badge-ar`, `badge-df`, `badge-wa`, `badge-un`, `badge-de` |
| `suggestedAction` | string | Action code: `pa`, `do`, `su`, `ar`, `df`, `wa`, `un`, `de`, `cu` |
| `suggestedPath` | string \| null | PARA path for `pa` suggestions |
| `reason` | string | One-line reasoning |
| `annotation` | string \| null | Calendar/task context note |
| `threadRef` | string \| null | "Same thread as #N" |
| `suggestion` | object \| null | Verbatim Stage 2 `Suggestion` record (input bridge). Echoed on each decision row at submit. Omit → `null`. |
| `metadata` | object \| null | Stage 1 email-metadata record, rendered under the details panel's `Email metadata` section. Omit → section shows `(none)`. |
| `stage1` | object \| null | Stage 1 per-email context record, rendered under the details panel's `Stage 1 — context` section. Omit → section shows `(none)`. |

#### The details panel (`i`)

Each card carries a quiet `details` affordance (top-aligned with the badge in the
suggestion pill row). `i` toggles it, or click the affordance; the label swaps
`details` ↔ `close`. The panel folds out between the card and the action grid (card
and panel fuse: rounded top + square bottom on the card, square top + rounded bottom
on the panel). It is sticky across navigation so the operator can flip through cards
comparing each card's surface against its underlying record.

The panel renders three sections — `Email metadata`, `Stage 1 — context`,
`Stage 2 — suggestion` — from the three per-email objects above (`metadata`,
`stage1`, `suggestion`), iterating each object's keys generically as plain
key:value rows in declaration order. Missing/null values render as `(none)`;
absent objects render the whole section as `(none)`. New schema fields surface
automatically without widget changes (append-only).

The panel footer has an **Open as .md file** button. The widget is sandboxed (no
filesystem), so it emits `sendPrompt('details:' + emailId)`; the calling skill writes
the same three sections to `<snapshot>/details/<emailId>.md` (lazy on-click,
overwrite-always) and opens it. The on-disk file is the level-2 drill-down for
side-by-side / archivable inspection the in-widget panel can't serve.

#### The `suggestion` field (input bridge)

The calling skill stitches each email's verbatim Stage 2 `Suggestion` record onto its
entry as `suggestion`. The widget renders from the derived projection (`suggestedAction`,
`suggestedPath`, `reason`, …) and echoes the full record back on submit, so the decision
log carries Stage 2's output alongside the operator's choice. Record shape:

```js
{
  emailId, source, action, actionConfidence, actionReasons,
  parameterisation, parameterisationConfidence, parameterisationReasons,
  relatedDecisions
}
```

### Decision output

On submit, the widget calls `sendPrompt('batch:' + JSON.stringify(decisions))`, emitting one
row per **decided** email (untouched emails are omitted). Each row follows the S42 locked
envelope:

```js
{
  emailId,            // the email ID
  decisionKey,        // key pressed: a, do, de, wa, su, df, un, pa, ar, cu
  timestamp,          // ISO 8601, captured when the decision was made
  action,             // routed action; == decisionKey except for "a" (see below)
  user_typed_params,  // operator/derived params, namespaced (see per-action table)
  suggestion          // verbatim Stage 2 record, or null
}
```

`st` (stop) terminates the session and writes **no row** (S40 lock).

| `decisionKey` | `action` | `user_typed_params` |
|------|------|------|
| `a` (agree) | copied from `suggestion.action` | copy of `suggestion.parameterisation` |
| `pa` | `pa` | `{ destination }` — selected PARA path |
| `df` | `df` | `{ contextNote }` when a note was typed, else `{}` |
| `do`, `de`, `wa`, `su`, `un`, `ar` | same as key | `{}` |

Deferred to later sessions (not yet collected): `pa.folderState`; `wa`/`df`
`thresholdDate`; `de` `delegationTarget`; `cu` `note`; pre-fill visual-flag UX.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Navigate between emails |
| `a` | Agree with suggestion |
| `do` | Do now |
| `de` | Delegate |
| `wa` | Waiting |
| `su` | Sunsama |
| `df` | Defer (opens note panel) |
| `un` | Undecided |
| `pa` | PARA folder (opens tree) |
| `ar` | Triage dump |
| `cu` | Custom |
| `st` | Stop triage |
| `i` | Toggle details panel (open/close) |
| Arrow keys | Navigate PARA tree (when open) |
| `Enter` | Confirm PARA selection |
| `Esc` | Close panel |

## Styling

The widget uses CSS custom properties from Claude's Visualizer theme (e.g. `--color-text-primary`, `--color-background-secondary`, `--border-radius-md`). It renders correctly in both light and dark mode without modification.

## License

MIT
