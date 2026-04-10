---
name: Undo scope is per current user
description: Undo deletes the last event logged by the current user, not globally
type: feedback
---

Undo only removes the last event logged by the currently authenticated user, not the last event globally.

**Why:** Two parents may be logging simultaneously. Undoing the global last event could accidentally delete the other parent's entry.

**How to apply:** When implementing undo, track the last event ID per user (in session state), not the last event across all users.
