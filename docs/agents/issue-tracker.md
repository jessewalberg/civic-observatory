# Issue tracker: Linear

Issues and PRDs for this repo live in Linear. GitHub may still hold code, PRs, and CI, but Linear is the work-item source of truth unless this file says otherwise.

## Configured routing

- **Workspace connector**: `mcp__linear-theroomofrequirement`
- **Team**: `THE`
- **Project / initiative / repo label**: set this during setup if the repo uses one
- **Default state for agent-ready work**: `Todo` with label `auto`
- **Default state for owner-gated work**: `Ready For Human` with label `hitl`

Do not store Linear API keys in the repo, sandbox, or CI. Use the existing MCP connector or ask the human to perform Linear-only setup.

## Conventions

- **Create an issue**: use the configured Linear MCP connector's `save_issue` with `team`, `title`, `description`, optional `project`, `labels`, `state`, `blockedBy`, and `blocks`.
- **Read an issue**: find the issue by identifier or URL with `list_issues` using `query` and the configured team/project filters, then read comments with `list_comments`.
- **List issues**: use `list_issues` with the configured team/project filters, plus `state`, `label`, `updatedAt`, or `query` as needed.
- **Comment on an issue**: use `save_comment` with `issueId` and a Markdown `body`.
- **Apply triage state**: use `save_issue` with the issue `id` and `state` from `triage-labels.md`.
- **Apply / remove labels**: use `save_issue` with the complete intended `labels` set when label changes are needed. Verify labels first with `list_issue_labels`.
- **Close / reject**: post the explanation as a comment, then update the issue state to the configured `wontfix` state, normally `Canceled`.
- **Dependencies**: use `blockedBy` and `blocks`; do not encode dependencies only as prose.

When passing Markdown strings to Linear tools, use literal newlines. Do not pass escaped `\n` sequences.

## Pull requests and diffs

Linear issues may link GitHub PRs or Linear diffs, but PRs are not the issue tracker. For review work, fetch the implementation diff from GitHub or Linear's diff tools as appropriate, then update the Linear issue with findings or status.

## When a skill says "publish to the issue tracker"

Create a Linear issue with the configured team and project routing. If the repo has a parent planning issue, set `parentId` or link it in the description.

## When a skill says "fetch the relevant ticket"

Fetch the Linear issue by identifier (for example `THE-123`) or URL, then fetch its comments. Treat the issue description plus comments as the acceptance source unless a later agent brief explicitly supersedes them.
