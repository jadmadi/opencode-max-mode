# AGENTS.md

Guidance for agents working in this repository.

## What this is

An OpenCode V2 plugin (`max-mode.ts`) that registers a `best_of_n` tool and a
`/max` command. The tool runs best-of-N text generation with a judge. No build
step, no dependencies, AGPL-3.0-only.

## Local development

```sh
bun test
cp max-mode.ts ~/.config/opencode/plugins/max-mode.ts
touch ~/.config/opencode/plugins/max-mode.ts
```

Check the server log when something is off:

```sh
grep max-mode ~/.local/share/opencode/log/opencode.log | tail
```

## Spike result (T0)

No plugin hook can replace the main turn's response. The `context` hook only
edits inputs; only the `compaction` and `title` hooks may set a result. So text
mode is a `best_of_n` tool, not a next-turn interceptor.

## Hard constraints

- Do not import `@opencode/plugin`. Export a plain `{ id, setup }` object.
- Keep the plugin dependency-free.
- Cap the candidate count at 8.
- Plugin `console` output is not visible to users. A command surfaces messages
  only by throwing.

## API notes

- `ctx.tool.transform((editor) => editor.add({ name, description, input, execute }))`
  registers the tool. The execute context carries `sessionID`.
- `ctx.generate.text({ model, prompt })` makes one candidate or the judge call.
  The model comes from `ctx.session.get({ sessionID })`. It failed on OpenCode Go
  with `Request is missing x-opencode-session` in testing, so `MAX_MODE_MODEL`
  overrides the model.
- The session default lives in `ctx.storage` under `max-mode/<sessionID>`.

## Layout

- `parseCandidates`, `clampCandidates` - parse and bound the candidate count.
- `judgePrompt`, `parseWinner` - the judge prompt and its parsing.
- `resolveModel` - the session model, or `MAX_MODE_MODEL`.
- `runBestOfN` - the tool body, exported for tests.
- `setup` - registers the tool and the command.
- `max-mode.test.ts` - tests with a fake ctx.

## Releasing

- Semantic commit messages. Changes through a feature branch and a PR.
- Keep `NOTICE` accurate.
