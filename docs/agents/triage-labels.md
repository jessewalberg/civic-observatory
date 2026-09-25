# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to GitHub issue state, labels, and the `Mission Control` status field.

| Role in mattpocock/skills | GitHub state | GitHub labels | Mission Control status | Meaning |
| ------------------------- | ------------ | ------------- | ---------------------- | ------- |
| `needs-triage` | open | `needs-triage`, `status:needs-triage` | `status:needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | open | `needs-info`, `status:needs-info` | `status:needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | open | `ready-for-agent`, `status:todo` | `status:todo` | Fully specified, ready for an AFK agent |
| `ready-for-human` | open | `ready-for-human`, `status:ready-for-human` | `status:ready-for-human` | Requires human implementation or owner action |
| `wontfix` | closed as not planned | `wontfix`, `status:canceled` | `status:canceled` | Will not be actioned |
| `bug` | unchanged | `type:bug` | unchanged | Something is broken |
| `enhancement` | unchanged | `type:feature` | unchanged | New feature or improvement |

Each active issue must have exactly one status label:
`status:needs-triage`, `status:needs-info`, `status:backlog`, `status:icebox`,
`status:planning`, `status:todo`, `status:ready-for-human`, `status:blocked`,
`status:in-progress`, `status:in-review`, `status:done`, or `status:canceled`.

During Linear migration, treat `auto` as a legacy alias for `ready-for-agent` and `hitl` as a legacy alias for `ready-for-human`. Preserve unrelated useful labels.
