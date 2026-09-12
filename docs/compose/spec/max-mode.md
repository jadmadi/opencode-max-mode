---
feature: max-mode
status: in-progress
updated: 2026-09-12
branch: feat/max-mode
commits:
---

# Max Mode

## Report

## [S1] Problem

A hard prompt gets one attempt. There is no best-of-N sampling and no judge to
pick the best candidate. MiMoCode enables best-of-N through
`experimental.maxMode`, with a judge that selects the winner.

## [S2] Design

A tool runs several candidates and a judge picks one.

- No plugin hook can replace the main turn's response. The `context` hook only
  edits inputs; only the `compaction` and `title` hooks may supply a result. So
  text mode is a tool, `best_of_n`, not a next-turn interceptor.
- `/max <n>` sets the default candidate count for the session, `/max` shows it,
  and `/max off` clears it. The cap is 8.
- The tool input is `{ prompt, candidates? }`. Candidates default to the session
  setting, or 3. The tool runs `n` parallel `ctx.generate.text` calls, then one
  judge call, and returns the winning text as tool content.
- Edit mode is phase two. It would run `n` child sessions with a subagent, take
  their diffs, and judge them. Applying a winner needs a merge step, so it stays
  out until the text mode works end to end.
- Cost: the command states the candidate count and that cost multiplies. A hard
  cap on `n` prevents accidents.

## [S3] Out of Scope

- Routing candidates across different models.
- Edit mode and diff merging.
- Automatic selection of when to use max mode.
- A TUI control.

## Tasks

- [x] T0: spike whether a hook can replace the main turn's response - result: it
      cannot. The `context` hook only edits inputs, and only the `compaction` and
      `title` hooks may set a result. Text mode is therefore a `best_of_n` tool,
      as recorded in S2.
- [ ] T1: the /max command and per-session settings - acceptance: set, print,
      clear, and reject an out-of-range count in a test (covers: S2)
- [ ] T2: parallel candidate generation - acceptance: a fake-context test
      confirms n calls run and all results are collected (covers: S2; depends:
      T1)
- [ ] T3: the judge call and winner selection - acceptance: a test supplies a
      judge answer and confirms the winner is returned as tool content (covers:
      S2; depends: T2)
- [ ] T4: README and NOTICE - acceptance: both files exist and name MiMoCode's
      max mode as the inspiration (covers: S2; depends: T3)
