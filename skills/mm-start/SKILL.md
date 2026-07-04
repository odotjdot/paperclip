---
name: mm-start
description: >-
  Wake MegaMind. Recalls the keeper triad — doctrine + latest session +
  current-state — from the ONE shared brain (supermemory /v3, container tag
  fm-brain) so the AI doesn't start blind. Includes a staleness guard.
  Aliases: /start-mm, /wake-mm, "start MM", "wake the brain".
allowed-tools: Bash(*)
---

# MM Start

You just opened a chat. Before doing anything else, wake the brain.

This is the universal MM entry point. There is ONE brain — **supermemory `/v3`**, scoped to the container tag `fm-brain`. What any agent learns, all can recall. This skill recalls the **keeper triad** so the session starts oriented:

1. **Doctrine** — the standing operating rules and constraints.
2. **Latest session** — the most recent session log (what was built, state on exit).
3. **Current state** — active tasks, open questions, what to pick up next.

Connection is read by **location, never pasted**. The endpoint + key arrive as environment variables provisioned from the company secret store (see the `mega-recall` skill for the full contract):

- `SUPERMEMORY_URL` — e.g. `https://mem.funkmedia.io:9443`
- `SUPERMEMORY_KEY` — auth token, sent as header `X-SM-Key`
- `SUPERMEMORY_CONTAINER_TAG` — the partition, default `fm-brain` (ALWAYS scope every call to it)

Real Let's Encrypt cert — connect normally, no `-k`.

---

## Step 0 — Recall the keeper triad

Run all three searches, scoped to the container tag. Read the top matches as recalled context (not gospel — they reflect what was true when written).

```bash
: "${SUPERMEMORY_CONTAINER_TAG:=fm-brain}"

# 1) doctrine / operating rules
curl -s -X POST "$SUPERMEMORY_URL/v3/search" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" -H "Content-Type: application/json" \
  -d "{\"q\":\"doctrine operating rules constraints and standing orders\",\"containerTags\":[\"$SUPERMEMORY_CONTAINER_TAG\"]}"

# 2) latest session — state on exit
curl -s -X POST "$SUPERMEMORY_URL/v3/search" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" -H "Content-Type: application/json" \
  -d "{\"q\":\"latest MegaMind session log: what was built, state on exit, next steps\",\"containerTags\":[\"$SUPERMEMORY_CONTAINER_TAG\"]}"

# 3) current state — active tasks / open questions
curl -s -X POST "$SUPERMEMORY_URL/v3/search" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" -H "Content-Type: application/json" \
  -d "{\"q\":\"current state: active tasks, open questions, what to pick up next\",\"containerTags\":[\"$SUPERMEMORY_CONTAINER_TAG\"]}"
```

> If `SUPERMEMORY_URL` / `SUPERMEMORY_KEY` are unset, the SessionStart hook already prints a "supermemory not configured" notice. On this box the machine-wide `sm` CLI is the convenience equivalent — `sm search "<question>"` runs the same `/v3/search` scoped to `fm-brain`.

---

## Step 1 — Staleness guard (do not skip)

Look at the newest timestamp in the **latest-session** recall.

- **Latest session row > 48h old** → warn the operator explicitly: *"Latest session is ~Nh old — the recalled state may be behind; confirm before relying on it."* A stale anchor means a session-end write was missed or you're in a long-dormant project.
- **No session row at all** → say so. Either supermemory has nothing for this scope yet, or the boundary marker never landed. Don't fabricate continuity.

The SessionStart hook performs this same check automatically; restate it for the operator if it fired.

---

## Step 2 — On-demand topic recall

For deeper lookups while working a specific area, search the same brain with a focused query:

```bash
curl -s -X POST "$SUPERMEMORY_URL/v3/search" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" -H "Content-Type: application/json" \
  -d "{\"q\":\"<topic, e.g. pg-migrations / i18n / deploy / commerce>\",\"containerTags\":[\"$SUPERMEMORY_CONTAINER_TAG\"]}"
```

Recall is semantic — wording need not match the stored fact.

---

## Step 3 — Report

After reading the recalls, give the operator a brief summary:

- `Doctrine: <N> rules/standing-orders recalled (top: …)`
- `Last session: <date> — <one-line state-on-exit>`
- `Active tasks: <from current-state recall, or "none">`
- `Staleness: <ok | ⚠ latest session ~Nh old | no session row>`
- `Ready to work on: <what the operator asked for, or ask>`

That's the whole skill. The brain is loaded. Carry on with the operator's request.

---

## Aliases

The operator may invoke this as `/mm-start` (canonical), `/start-mm`, `/wake-mm`, or via natural language — "start MM", "start megamind", "wake the brain". All resolve to the procedure above.

---

## What this skill does NOT do

- No reads of `~/.claude/projects/.../memory/*.json` files or `MEMORY.md` indexes — supermemory `/v3` (`fm-brain`) is the single source of truth.
- No second memory backend, no local engine, no DynamoDB — there is ONE brain.
- No task-board reads at startup — the board (Plane) is a task surface, not memory.
