---
name: mega-recall
description: >
  The org's ONE memory interface — the mega-recall seam. Use this skill whenever
  you need to recall past context or save a durable fact across sessions and across
  agents: searching prior decisions, people, projects, or long-running context;
  saving a fact/preference/decision that should outlive this run. One brain, shared
  by every agent in the company — what one agent learns, all can recall. The backend
  is swappable behind this skill (today: supermemory /v3, tag fm-brain). Trigger on
  any memory operation: recall, search, "remember this", saving a fact, looking up
  prior context.
---

# mega-recall

**mega-recall is the org's ONE memory interface (the seam).** Every agent reads and
writes the same single semantic store, so a fact saved by one agent is recallable by
all. Recall is semantic (vector search), so wording need not match.

Consumers call the *interface*; the *backend is swappable behind this skill*.
**Today's backend is supermemory `/v3`, container tag `fm-brain`** — that's what the
curl examples below speak to. In hooks, the backend is isolated entirely in one
adapter file (`hooks/claude-code/_mega_recall.sh`); only that file and this skill
name the backend. If the engine ever changes, the interface and these examples'
*shape* stay; only the adapter's endpoint/header change.

## Connection (read by location — never paste or echo secrets)

The endpoint and key are injected into your runtime as environment variables,
provisioned from the company secret store. Reference them by name; never print their
values. The neutral seam vars are `MEGA_RECALL_URL` / `MEGA_RECALL_KEY` /
`MEGA_RECALL_TAG`; the supermemory adapter (today's backend) also accepts the
back-compat names shown below.

- `SUPERMEMORY_URL` (or `MEGA_RECALL_URL`) — e.g. `https://mem.funkmedia.io:9443`
- `SUPERMEMORY_KEY` (or `MEGA_RECALL_KEY`) — auth token, sent as header `X-SM-Key`
- `SUPERMEMORY_CONTAINER_TAG` (or `MEGA_RECALL_TAG`) — the memory partition, e.g.
  `fm-brain`. ALWAYS scope every call to this tag. An unscoped call returns nothing.

The endpoint has a real, publicly-trusted Let's Encrypt cert — connect normally, no `-k`.

## Recall — search before you assume

Search the shared brain whenever the task depends on prior decisions, people,
projects, or context not in the current thread. Against the supermemory adapter
(today's backend):

```bash
curl -s -X POST "$SUPERMEMORY_URL/v3/search" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"<your question>\",\"containerTags\":[\"$SUPERMEMORY_CONTAINER_TAG\"]}"
```

Results come back ranked by relevance score. Read the top matches; treat them as
recalled context, not gospel — they reflect what was true when written.

## Write — save durable facts

Save a fact, decision, or preference that should survive this run and be visible to
every other agent. Ingest is asynchronous (a few seconds to embed + finalize before
it's searchable). Against the supermemory adapter (today's backend):

```bash
curl -s -X POST "$SUPERMEMORY_URL/v3/documents" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"content\":\"<the durable fact, one idea>\",\"containerTag\":\"$SUPERMEMORY_CONTAINER_TAG\"}"
```

Rules:
- One idea per document. Write the fact plainly; the brain handles indexing.
- Save durable facts immediately — memory does not survive a session restart, the
  brain does.
- Don't write trivial session chatter; write decisions, preferences, people,
  projects, and lessons.

## When to use which

- Recall (search) — the task references prior context, people, or decisions not in
  this thread.
- Write (save) — a durable fact, preference, or decision should outlive this run.
- The user says prior context is wrong — write a corrected fact (the new write wins
  on recency/relevance; do not attempt destructive edits here).

## Health check

```bash
curl -s "$SUPERMEMORY_URL/v3/health"
```

On this box the machine-wide `sm` CLI is the convenience equivalent of the seam:
`sm search "<question>"` / `sm write "<fact>"` / `sm health`.

## Scope note

The container tag is the single knob for partitioning. Today the whole org shares
one tag (`fm-brain`). If memory ever needs to be walled per-company, that is a
different tag value injected per company — no change to this skill or the interface.
