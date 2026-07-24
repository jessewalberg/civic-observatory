# Triage labels

GitHub issue labels are the canonical workflow state for this repository.
The `Mission Control` Project `Status` field mirrors the canonical `status:*` label.

| Role | GitHub state | GitHub labels | Mission Control status |
| --- | --- | --- | --- |
| `needs-triage` | open | `needs-triage`, `status:needs-triage` | `status:needs-triage` |
| `needs-info` | open | `needs-info`, `status:needs-info` | `status:needs-info` |
| `ready-for-agent` | open | `ready-for-agent`, `status:todo` | `status:todo` |
| `ready-for-human` | open | `ready-for-human`, `status:ready-for-human` | `status:ready-for-human` |
| `wontfix` | closed as not planned | `wontfix`, `status:canceled` | `status:canceled` |
| `bug` | unchanged | `type:bug` | unchanged |
| `enhancement` | unchanged | `type:feature` | unchanged |

Every tracked issue must have exactly one of these status labels:

- `status:needs-triage`
- `status:needs-info`
- `status:backlog`
- `status:icebox`
- `status:planning`
- `status:todo`
- `status:ready-for-human`
- `status:blocked`
- `status:in-progress`
- `status:in-review`
- `status:done`
- `status:canceled`

Use `status:done` with the closed completed state.
Use `status:canceled` with the closed not-planned state.
Preserve useful scope labels such as `type:*`, `owner:*`, and `wayfinder:*`.
Treat migrated `THE-*` identifiers and `linear-migrated` labels as historical metadata only.
