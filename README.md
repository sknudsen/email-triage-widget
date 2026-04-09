# email-triage-dev

Private development repo for the email triage widget and related tooling.

## Repo structure

```
triage-widget.js          # The widget — mirrored to public repo on push
README.md                 # This file (also mirrored)
.github/workflows/        # CI — mirror action
```

## Public mirror

On every push to `main` that touches `triage-widget.js`, `README.md`, or `LICENSE`,
a GitHub Action mirrors those files to the public repo at
[sknudsen/email-triage-widget](https://github.com/sknudsen/email-triage-widget).

The public repo serves the widget via jsdelivr CDN:
```
https://cdn.jsdelivr.net/gh/sknudsen/email-triage-widget@main/triage-widget.js
```

Everything else in this repo (issues, workflows, dev notes) stays private.

## Setup (one-time)

1. Create a GitHub Personal Access Token (classic) with `repo` scope.
2. In this repo's Settings → Secrets and variables → Actions, add a secret
   called `PUBLIC_REPO_TOKEN` with the PAT value.
3. Push to `main` — the mirror action will run automatically.

## Issues

Use this repo's issue tracker for all email triage skill development:
bugs, feature requests, design ideas, and process improvements.
Issues stay private and are not mirrored to the public repo.
