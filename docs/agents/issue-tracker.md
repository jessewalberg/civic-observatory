# Issue tracker: GitHub Issues

GitHub Issues are the work-item source of truth for this repository.
GitHub also holds code, branches, pull requests, reviews, and CI.

## Configured routing

- Repository: `jessewalberg/civic-observatory`
- Cross-repository project: the owner's GitHub Project `Mission Control`
- Agent-ready label: `ready-for-agent`
- Owner-gated label: `ready-for-human`
- Status source of truth: exactly one `status:*` label per issue
- Project status: mirror the canonical `status:*` label in `Mission Control`

Treat migrated `THE-*` identifiers and Linear references as historical metadata only.
Do not store tracker credentials in the repository, workspace, or CI.
Use the authenticated GitHub CLI or configured GitHub tools.

## Conventions

- Create work as a GitHub issue in `jessewalberg/civic-observatory` with clear acceptance criteria.
- Reference work as `jessewalberg/civic-observatory#N` or with its full GitHub issue URL.
- Read the issue body, comments, labels, and native relationships before acting.
- Preserve useful labels and keep exactly one canonical `status:*` label.
- Use native sub-issues and dependencies for same-repository structure.
- Record cross-repository dependencies as explicit links in both issues.
- Add portfolio work to `Mission Control` when Project access is available.
- If Project access is unavailable, keep the issue label correct and record the Project update as owner-gated follow-up.

## Pull requests and reviews

- Reference the GitHub issue in branch names and pull request bodies.
- Use `Closes jessewalberg/civic-observatory#N` only when the pull request completes every acceptance criterion.
- Use `Refs jessewalberg/civic-observatory#N` for partial, blocked, or owner-gated work.
- Keep implementer and reviewer roles independent under the canonical global policy.

## Skill routing

When a skill says to publish, fetch, update, or close a work item, operate on the corresponding GitHub issue in `jessewalberg/civic-observatory`.
Use `docs/agents/triage-labels.md` for status and role labels.
