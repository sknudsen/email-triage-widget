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

### Decision output

On submit, the widget calls `sendPrompt('batch:' + JSON.stringify(decisions))` where each decision object contains:

| Field | When present |
|-------|-------------|
| `id` | Always — the email ID |
| `decision` | Always — one of: `a`, `do`, `de`, `wa`, `su`, `df`, `un`, `pa`, `ar`, `cu`, `st` |
| `resolved` | When `decision` is `a` — the full suggested action |
| `path` | When `decision` is `pa` — the selected PARA path |
| `isNew` | When `pa` and a new folder was created in the widget |
| `note` | When `df` and the user typed a follow-up note |

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
| Arrow keys | Navigate PARA tree (when open) |
| `Enter` | Confirm PARA selection |
| `Esc` | Close panel |

## Styling

The widget uses CSS custom properties from Claude's Visualizer theme (e.g. `--color-text-primary`, `--color-background-secondary`, `--border-radius-md`). It renders correctly in both light and dark mode without modification.

## License

MIT
