# Issue tracker: GitHub Issues

Issues and PRDs for this repo live in GitHub Issues. GitHub is the work-item source of truth and also holds code, branches, pull requests, and CI.

## Configured routing

- **Repository**: `jessewalberg/civic-observatory`
- **Cross-repo project**: user Project `Mission Control`
- **Default label for agent-ready work**: `ready-for-agent`
- **Default label for owner-gated work**: `ready-for-human`
- **Status source of truth**: exactly one `status:*` label per active issue; the `Mission Control` Project `Status` field mirrors that label.
- **Linear migration history**: migrated `THE-*` identifiers are metadata only; imported issues get `linear-migrated`.

Do not store tracker API tokens in the repo, sandbox, or CI. Use the GitHub CLI or configured GitHub MCP tools already available in the agent environment.

## Conventions

- **Create an issue**: create a GitHub issue in this repo with a clear title, acceptance criteria, and labels from `docs/agents/triage-labels.md`.
- **Read an issue**: fetch the issue by number, `jessewalberg/civic-observatory#N`, or URL; treat the description plus comments as the acceptance source unless a later agent brief supersedes them.
- **Comment on an issue**: add Markdown comments with status, findings, or handoff notes.
- **Apply labels**: preserve useful labels such as `type:*`, `owner:*`, and `wayfinder:*`; keep exactly one `status:*` label on each active issue.
- **Mission Control**: add portfolio work items to `Mission Control` when the session has Project permission. If Project access is unavailable, keep issue labels correct and leave Project membership as owner-gated follow-up.
- **Dependencies**: use native GitHub sub-issues/dependencies for same-repo structure where available. Preserve cross-repo blockers as explicit links in the issue body or comments.
- **Pull requests**: use `Closes/Fixes jessewalberg/civic-observatory#N` only for full acceptance. Use `Refs jessewalberg/civic-observatory#N` for partial, blocked, or owner-gated work, then update the issue labels/status instead of relying on PR magic words.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `jessewalberg/civic-observatory`.

## When a skill says "fetch the relevant ticket"

Fetch the GitHub issue by number, `jessewalberg/civic-observatory#N`, or URL, including comments and labels.
