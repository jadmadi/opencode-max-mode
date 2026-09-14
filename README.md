# opencode-max-mode

An OpenCode V2 plugin that adds a best-of-N tool. It runs several candidates for
a hard question and a judge picks the winner.

## OpenCode

This plugin runs on OpenCode. Install it with my referral link:

https://opencode.ai/go?ref=N9H3ZEP22A

## Install

```sh
mkdir -p ~/.config/opencode/plugins
curl -fsSL \
  https://raw.githubusercontent.com/jadmadi/opencode-max-mode/main/max-mode.ts \
  -o ~/.config/opencode/plugins/max-mode.ts
```

For one project, put it in `.opencode/plugins/`. Tested against OpenCode v2.0.3.

To pin a release, replace `main` in the URL with a tag such as `v0.1.0`.

## Use

| Command     | Effect                                        |
| ----------- | --------------------------------------------- |
| `/max <n>`  | Set the default candidate count for the session |
| `/max`      | Show the current default                       |
| `/max off`  | Clear the default                              |

The plugin registers a `best_of_n` tool. Ask the model to use it, or call it
with `{ prompt, candidates? }`. The count defaults to the session setting, or 3.
The cap is 8.

## Why a tool

No plugin hook can replace the main turn's response. The `context` hook only
edits inputs, and only the `compaction` and `title` hooks may supply a result. So
best-of-N is a tool the model can call, not an interceptor for the next turn.
The tool runs `n` parallel `ctx.generate.text` calls, then one judge call, and
returns the winning text.

Cost multiplies with the candidate count: `n` calls plus one judge.

## Model

Candidates and the judge use the session's model. Some providers do not support
transient generation: OpenCode Go returned `Request is missing x-opencode-session`
in testing. Set `MAX_MODE_MODEL` to a working model, for example:

```sh
MAX_MODE_MODEL=deepseek/deepseek-flash
```

## Tests

```sh
bun test
```

## Attribution

Inspired by MiMoCode's max mode. See `NOTICE`.

## License

MIT
