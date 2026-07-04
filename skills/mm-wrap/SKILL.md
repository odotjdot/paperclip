---
name: mm-wrap
description: >-
  Close (or checkpoint) the session. Always writes the synthesized session log
  to the ONE brain (supermemory /v3, container tag fm-brain) via POST
  /v3/documents. Then makes a JUDGMENT call on the active Plane task — flip it
  forward ONLY if it actually finished this session; otherwise comment and leave
  status alone. A wrap NEVER auto-marks an unfinished task done.
  Aliases: /wrap-mm, /close-mm, "wrap MM", "log the session".
allowed-tools: Bash(*), Agent
---

# MM Wrap

You're ending (or checkpointing) a session. Run this BEFORE the operator closes the chat so the next session boots with full context.

mm-wrap does two things, in order: **(1) always** write the session log to the brain (the memory write), then **(2) judge** the active Plane task and act accordingly — it does NOT blindly flip status.

There is ONE brain — **supermemory `/v3`**, scoped to the container tag `fm-brain`. The session log lives there and nowhere else (it is never mirrored to the task board). Connection is read by **location, never pasted** (same contract as `mega-recall` / `mm-start`):

- `SUPERMEMORY_URL`, `SUPERMEMORY_KEY` (header `X-SM-Key`), `SUPERMEMORY_CONTAINER_TAG` (default `fm-brain`)

> **The board rule (a wrap is not a completion).** Never blindly flip the active task to "done/waiting" on every wrap — that marks unfinished work as done and corrupts the board. The correct behavior is a judgment call from session context:
> - **Task actually finished this session** (its AC are met) → flip it forward (e.g. → **Waiting**; the operator owns the final "Complete") + comment what landed and what to verify.
> - **Task NOT finished** — you're wrapping because you're out of context, pivoting, or the story isn't done → post a **progress comment** (what happened, what's left) and **leave the status unchanged**.
> - **No task worked** → skip the board entirely.
>
> "Done" is your judgment that the work is complete, not a side-effect of closing the chat. When unsure, treat it as in-progress (comment, don't flip): a missed flip is cheap, a false "done" corrupts the board.

**Run this at the end of every session, every sprint wrap, every major pivot.**

**Mid-session checkpoints:** set phase to `checkpoint`. Write the checkpoint row to the brain WITHOUT ending the session — a recovery point for long stretches. A checkpoint is **memory-only — it NEVER touches the board** (you haven't finished anything).

---

## Step 1 — Gather facts (~100 tokens, from conversation)

Pull these from context. Don't search files.

- **Session name** — feature + sprint or date (e.g., "MegaMind v3 — plugin assembly")
- **Phase** — `start` | `checkpoint` | `pivot` | `wrap`
- **Mood** — `smooth` | `engaged` | `grinding` | `frustrated` | `breakthrough` (be honest; don't sanitize)
- **Summary** — 1-2 sentences: what was built
- **Breakthroughs** — patterns or discoveries worth keeping (or "none")
- **Dead ends** — approaches tried and abandoned (or "none")
- **Open questions** — unresolved decisions (or "none")
- **State on exit** — what is complete, what is next
- **Branch** — current git branch (`git branch --show-current` if unknown)
- **Tags** — comma-separated from: `backend`, `frontend`, `architecture`, `infrastructure`, `database`, `security`, `testing`

---

## Step 2 — Write the session log to the brain (always)

Compose one durable document — plain prose, the brain handles indexing. Lead with an ISO-8601 timestamp and the word `session` so `/mm-start`'s latest-session recall and staleness guard can anchor on it.

```bash
: "${SUPERMEMORY_CONTAINER_TAG:=fm-brain}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

read -r -d '' LOG <<EOF
MegaMind session log ${NOW} — <SESSION_NAME> [phase=<PHASE> mood=<MOOD> branch=<BRANCH>]
Summary: <SUMMARY>
Breakthroughs: <BREAKTHROUGHS>
Dead ends: <DEAD_ENDS>
Open questions: <OPEN_QUESTIONS>
State on exit: <STATE_ON_EXIT>
Tags: session, <TAG_1>, <TAG_2>
EOF

curl -s -X POST "$SUPERMEMORY_URL/v3/documents" \
  -H "X-SM-Key: $SUPERMEMORY_KEY" -H "Content-Type: application/json" \
  -d "$(python3 -c 'import json,os;print(json.dumps({"content":os.environ["LOG"],"containerTag":os.environ["SUPERMEMORY_CONTAINER_TAG"]}))')"
```

> On this box the machine-wide `sm` CLI is the convenience equivalent: `sm write "<the log text>"` runs the same `/v3/documents` write scoped to `fm-brain`.

Ingest is asynchronous (a few seconds to embed before it's searchable). If the write returns an error, **STOP** and surface it to the operator — context loss between sessions is a P1 risk. Never silently swallow a failed session write.

---

## Step 3 — Judge the active Plane task (skip entirely on `phase: checkpoint`)

Only for `phase: wrap`. A checkpoint NEVER touches the board. For a wrap, decide per task you worked this session — YOUR judgment from session context, not autopilot. The board is **Plane** (`https://wb.funkmedia.io`, workspace `fmos`); the token lives in AWS Secrets Manager `fm/plane/api`, resolved via the Mac `default` profile (see the project `TOOLBOX.md`). Delegate the board write to the `pm` agent:

```
Agent({
  subagent_type: "pm",
  description: "mm-wrap: Plane task disposition",
  prompt: `Apply the wrap disposition I determined for the task(s) worked this session, on the Plane board (workspace fmos):
    - FINISHED <ids>: move Status -> 'Waiting' (the operator owns the final 'Complete') + comment <what landed + verification steps>.
    - IN-PROGRESS <ids>: post a progress comment <what advanced / what's left>; DO NOT change Status.
    Hard rules: the brain (supermemory fm-brain) is the canonical memory; the board is a task surface only — never write memory/session rows to the board. Resolve the Plane token from Secrets Manager fm/plane/api via the Mac default profile. If Plane is not reachable, report 'plane not configured' and DO NOT fail the wrap.
    Report which task ids were flipped to Waiting vs commented-only.`
})
```

If the PM agent reports "not configured/unreachable," that's fine — Step 2's memory write already succeeded; mm-wrap never fails on the board step.

---

## Step 4 — Report

When both steps land, relay:

```
╔══════════════════════════════════════════════════════════╗
║              SESSION LOGGED TO MEGAMIND                   ║
╠══════════════════════════════════════════════════════════╣
║  Session:     {name}                                     ║
║  Phase:       {phase}      Mood: {mood}                  ║
║  Brain:       supermemory fm-brain  ✓ written            ║
║  Done → Waiting:        [{finished ids, or "none"}]      ║
║  In-progress (comment): [{ids, or "none"}]               ║
╚══════════════════════════════════════════════════════════╝
```

If the operator wants the next session to wake on this state, tell them to run `/mm-start` in the new chat.

---

## Aliases

`/mm-wrap` (canonical), `/wrap-mm`, `/close-mm`, or natural language — "wrap MM", "close megamind", "log the session".

---

## Rules

1. **Never synthesize in Opus for the sake of it.** Gather facts from context, supply them in the write payload.
2. **A wrap is not a completion — judge, don't autopilot.** Flip a task forward ONLY when it actually finished this session. Otherwise comment and leave status alone. Checkpoints never touch the board. When unsure, treat as in-progress. The old blind auto-flip-on-every-wrap is the exact bug this rule kills.
3. **Mood = honest.** "grinding" and "frustrated" are valid.
4. **Open questions = real.** If something is unresolved, log it — it surfaces next session via `/mm-start`.
5. **Fail loud.** If the brain write fails, STOP and surface the error. Context loss is P1.
6. **The board holds tasks, not memory.** Session/pattern/context memory is never mirrored to the board — supermemory `fm-brain` is the sole memory store; the read path never reads the board.
