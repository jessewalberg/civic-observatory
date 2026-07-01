# Triage Labels

For Linear, the mattpocock/skills roles usually map to Linear states plus a small label vocabulary. Verify these names with `list_issue_statuses` and `list_issue_labels` during setup, then adjust the right-hand columns if this repo differs.

| Role in mattpocock/skills | Linear state      | Linear labels | Meaning                                  |
| ------------------------- | ----------------- | ------------- | ---------------------------------------- |
| `needs-triage`            | `Triage`          |               | Maintainer needs to evaluate this issue  |
| `needs-info`              | `Needs Criteria`  |               | Waiting on reporter for more information |
| `ready-for-agent`         | `Todo`            | `auto`        | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | `Ready For Human` | `hitl`        | Requires human implementation            |
| `wontfix`                 | `Canceled`        |               | Will not be actioned                     |
| `bug`                     | unchanged         | `type:bug`    | Something is broken                      |
| `enhancement`             | unchanged         | `type:feature` | New feature or improvement              |

When a skill mentions a role, apply the matching Linear state and labels from this table. Preserve unrelated labels already on the issue.

If a label does not exist, do not invent a near-duplicate silently. Ask whether to create the missing label, map the role to an existing label, or record the role using state only.
