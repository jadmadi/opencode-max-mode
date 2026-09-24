// OpenCode V2 max-mode plugin.
//
// Registers a `best_of_n` tool: run several candidate answers in parallel, ask
// a judge which is best, and return the winner. The `/max` command sets the
// default candidate count for the session.
//
// Text mode is a tool because no plugin hook can replace the main turn's
// response: the `context` hook only edits inputs, and only the `compaction` and
// `title` hooks may set a result.
//
// The runtime does not resolve @opencode/plugin, so this file exports a plain
// { id, setup } object.

const VERSION = "2026.9.0"

const MIN = 2
const MAX = 8
const DEFAULT = 3

function parseCandidates(text: string): number | undefined {
  const trimmed = text.trim().toLowerCase()
  if (trimmed === "off" || trimmed === "0") return 0
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= MIN && value <= MAX ? value : undefined
}

function clampCandidates(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined
  return value >= MIN && value <= MAX ? value : undefined
}

function key(sessionID: string): string {
  return `max-mode/${sessionID}`
}

async function storedCandidates(ctx: any, sessionID: string): Promise<number | undefined> {
  const value = await ctx.storage.get(key(sessionID))
  return clampCandidates(value)
}

function judgePrompt(prompt: string, candidates: string[]): string {
  return [
    "Pick the best answer to the question. Judge correctness and clarity.",
    "Reply with exactly two lines:",
    "WINNER: <number>",
    "REASON: <one short sentence>",
    "",
    `Question: ${prompt}`,
    "",
    ...candidates.map((text, index) => `## Candidate ${index + 1}\n${text.slice(0, 4000)}`),
  ].join("\n")
}

function parseWinner(text: unknown, count: number): number | undefined {
  const raw = typeof text === "string" ? text : ""
  const match = raw.match(/WINNER\s*:\s*(\d+)/i)
  if (!match) return undefined
  const index = Number(match[1]) - 1
  return index >= 0 && index < count ? index : undefined
}

async function mapLimit(count: number, limit: number, callback: () => Promise<string>): Promise<string[]> {
  const results: string[] = new Array(count)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, count)) }, async () => {
    while (next < count) {
      const index = next
      next += 1
      results[index] = await callback()
    }
  })
  await Promise.all(workers)
  return results
}

function parseModelRef(ref: string | undefined): { providerID: string; id: string } | undefined {
  if (!ref) return undefined
  const cleaned = ref.trim()
  const slash = cleaned.indexOf("/")
  if (slash < 1 || slash === cleaned.length - 1) return undefined
  return { providerID: cleaned.slice(0, slash), id: cleaned.slice(slash + 1) }
}

async function resolveModel(ctx: any, sessionID: string): Promise<{ providerID: string; id: string } | undefined> {
  // Some providers do not support transient generation: OpenCode Go returned
  // "Request is missing x-opencode-session" in testing. MAX_MODE_MODEL points
  // the candidates and the judge at a working model.
  const override = parseModelRef(process.env.MAX_MODE_MODEL)
  if (override) return override
  const info: any = await ctx.session.get({ sessionID }).catch(() => undefined)
  return info?.model ?? info?.data?.model
}

async function runBestOfN(ctx: any, sessionID: string, prompt: string, requested?: number): Promise<string> {
  const model = await resolveModel(ctx, sessionID)
  if (!model?.providerID || !model?.id) throw new Error("could not resolve the session model")

  const candidates = clampCandidates(requested) ?? (await storedCandidates(ctx, sessionID)) ?? DEFAULT
  const answers = await mapLimit(candidates, candidates, async () => {
    const result = await ctx.generate.text({ model: { providerID: model.providerID, id: model.id }, prompt })
    return typeof result?.text === "string" ? result.text.trim() : ""
  })
  if (answers.some((answer) => !answer)) throw new Error("a candidate returned nothing")

  const judged = await ctx.generate.text({
    model: { providerID: model.providerID, id: model.id },
    prompt: judgePrompt(prompt, answers),
  })
  const winner = parseWinner(judged?.text, candidates)
  if (winner === undefined) throw new Error("the judge did not name a winner")
  return answers[winner]
}

const plugin = {
  id: "max-mode",
  async setup(ctx: any) {
    await ctx.tool.transform((editor: any) => {
      editor.add({
        name: "best_of_n",
        description: `Run ${MIN} to ${MAX} candidate answers in parallel for a hard question and return the best one, chosen by a judge. Cost multiplies with the count.`,
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The question to answer." },
            candidates: { type: "number", description: `Optional count, ${MIN} to ${MAX}. Defaults to the session setting or ${DEFAULT}.` },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        execute: async (input: any, context: any) => {
          const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
          if (!prompt) throw new Error("best_of_n needs a prompt")
          const winner = await runBestOfN(ctx, context.sessionID, prompt, input.candidates)
          return { content: winner }
        },
      })
    })

    await ctx.command.transform((editor: any) => {
      editor.add({
        name: "max",
        description: "Set the default best-of-N candidate count for this session",
        execute: async ({ sessionID, prompt }: any) => {
          if (typeof sessionID !== "string") throw new Error("max needs a session id")
          const text = typeof prompt?.text === "string" ? prompt.text.trim() : ""

          if (!text || text.toLowerCase() === "status") {
            const current = await storedCandidates(ctx, sessionID)
            throw new Error(`best-of-n candidates: ${current ?? DEFAULT} (session default), cap ${MAX}\nmax-mode ${VERSION}`)
          }

          const parsed = parseCandidates(text)
          if (parsed === undefined) throw new Error(`use /max <${MIN}-${MAX}>, /max off, or /max`)
          if (parsed === 0) {
            await ctx.storage.remove(key(sessionID))
            return
          }
          await ctx.storage.set(key(sessionID), parsed)
        },
      })
    })
  },
}

export { clampCandidates, judgePrompt, parseCandidates, parseWinner, runBestOfN, VERSION }
export default plugin
