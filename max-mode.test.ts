import { describe, expect, test } from "bun:test"
import plugin, { clampCandidates, judgePrompt, parseCandidates, parseWinner, runBestOfN } from "./max-mode.ts"

function makeCtx(options: { judge?: string; candidate?: (n: number) => string; model?: any } = {}) {
  const store = new Map<string, unknown>()
  const tools: any[] = []
  const commands: any[] = []
  let candidateCalls = 0
  const ctx: any = {
    storage: {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: unknown) => void store.set(key, value),
      remove: async (key: string) => void store.delete(key),
    },
    session: { get: async () => ({ model: options.model === undefined ? { providerID: "p", id: "m" } : options.model }) },
    generate: {
      text: async ({ prompt }: any) => {
        if (String(prompt).includes("Pick the best answer")) return { text: options.judge ?? "WINNER: 2\nREASON: best" }
        candidateCalls += 1
        return { text: options.candidate ? options.candidate(candidateCalls) : `answer ${candidateCalls}` }
      },
    },
    tool: { transform: (callback: any) => callback({ add: (definition: any) => tools.push(definition) }) },
    command: { transform: (callback: any) => callback({ add: (definition: any) => commands.push(definition) }) },
  }
  return { ctx, store, tools, commands, calls: () => candidateCalls }
}

describe("parseCandidates", () => {
  test("accepts the range and off", () => {
    expect(parseCandidates("2")).toBe(2)
    expect(parseCandidates("8")).toBe(8)
    expect(parseCandidates("off")).toBe(0)
    expect(parseCandidates("0")).toBe(0)
  })

  test("rejects out of range and bad input", () => {
    expect(parseCandidates("1")).toBeUndefined()
    expect(parseCandidates("9")).toBeUndefined()
    expect(parseCandidates("abc")).toBeUndefined()
    expect(parseCandidates("")).toBeUndefined()
  })
})

describe("clampCandidates", () => {
  test("accepts integers in range only", () => {
    expect(clampCandidates(3)).toBe(3)
    expect(clampCandidates(1)).toBeUndefined()
    expect(clampCandidates(9)).toBeUndefined()
    expect(clampCandidates(2.5)).toBeUndefined()
    expect(clampCandidates("3")).toBeUndefined()
  })
})

describe("parseWinner", () => {
  test("reads a winner index", () => {
    expect(parseWinner("WINNER: 2\nREASON: best", 3)).toBe(1)
    expect(parseWinner("winner: 3", 3)).toBe(2)
  })

  test("rejects a missing or out-of-range index", () => {
    expect(parseWinner("no idea", 3)).toBeUndefined()
    expect(parseWinner("WINNER: 4", 3)).toBeUndefined()
    expect(parseWinner("WINNER: 0", 3)).toBeUndefined()
  })
})

describe("judgePrompt", () => {
  test("includes the question and the candidates", () => {
    const prompt = judgePrompt("What is 2+2?", ["four", "five"])
    expect(prompt).toContain("What is 2+2?")
    expect(prompt).toContain("Candidate 1")
    expect(prompt).toContain("WINNER:")
  })
})

describe("runBestOfN", () => {
  test("runs the default count and returns the judged winner", async () => {
    const { ctx, calls } = makeCtx({ judge: "WINNER: 2\nREASON: best" })
    expect(await runBestOfN(ctx, "ses_1", "Q")).toBe("answer 2")
    expect(calls()).toBe(3)
  })

  test("honors the requested count", async () => {
    const { ctx, calls } = makeCtx({ judge: "WINNER: 3" })
    expect(await runBestOfN(ctx, "ses_1", "Q", 4)).toBe("answer 3")
    expect(calls()).toBe(4)
  })

  test("falls back to the stored count", async () => {
    const { ctx, store, calls } = makeCtx()
    await store.set("max-mode/ses_1", 2)
    await runBestOfN(ctx, "ses_1", "Q")
    expect(calls()).toBe(2)
  })

  test("ignores an out-of-range request", async () => {
    const { ctx, calls } = makeCtx()
    await runBestOfN(ctx, "ses_1", "Q", 99)
    expect(calls()).toBe(3)
  })

  test("fails when a candidate is empty", async () => {
    const { ctx } = makeCtx({ candidate: () => "   " })
    await expect(runBestOfN(ctx, "ses_1", "Q")).rejects.toThrow(/candidate returned nothing/)
  })

  test("fails when the judge names no winner", async () => {
    const { ctx } = makeCtx({ judge: "no idea" })
    await expect(runBestOfN(ctx, "ses_1", "Q")).rejects.toThrow(/did not name a winner/)
  })

  test("fails without a session model", async () => {
    const { ctx } = makeCtx({ model: null })
    await expect(runBestOfN(ctx, "ses_1", "Q")).rejects.toThrow(/could not resolve the session model/)
  })

  test("MAX_MODE_MODEL overrides the session model", async () => {
    process.env.MAX_MODE_MODEL = "deepseek/deepseek-flash"
    try {
      const { ctx } = makeCtx()
      const models: any[] = []
      const original = ctx.generate.text
      ctx.generate.text = async (input: any) => {
        models.push(input.model)
        return original(input)
      }
      await runBestOfN(ctx, "ses_1", "Q")
      expect(models[0]).toEqual({ providerID: "deepseek", id: "deepseek-flash" })
    } finally {
      delete process.env.MAX_MODE_MODEL
    }
  })
})

describe("command", () => {
  const run = (commands: any[], text: string) => commands[0].execute({ sessionID: "ses_1", prompt: { text } })

  test("sets, shows, and clears the default", async () => {
    const { ctx, store, commands } = makeCtx()
    await (plugin as any).setup(ctx)

    await expect(run(commands, "")).rejects.toThrow(/candidates: 3/)
    await run(commands, "4")
    expect(store.get("max-mode/ses_1")).toBe(4)
    await expect(run(commands, "status")).rejects.toThrow(/candidates: 4/)
    await run(commands, "off")
    expect(store.get("max-mode/ses_1")).toBeUndefined()
  })

  test("rejects a bad count", async () => {
    const { ctx, commands } = makeCtx()
    await (plugin as any).setup(ctx)
    await expect(run(commands, "1")).rejects.toThrow(/use \/max/)
    await expect(run(commands, "9")).rejects.toThrow(/use \/max/)
    await expect(run(commands, "abc")).rejects.toThrow(/use \/max/)
  })
})

describe("setup", () => {
  test("registers the tool and the command", async () => {
    const { ctx, tools, commands } = makeCtx()
    await (plugin as any).setup(ctx)
    expect(tools.map((entry) => entry.name)).toEqual(["best_of_n"])
    expect(commands.map((entry) => entry.name)).toEqual(["max"])
  })

  test("the tool returns the winner", async () => {
    const { ctx, tools } = makeCtx({ judge: "WINNER: 1" })
    await (plugin as any).setup(ctx)
    const result = await tools[0].execute({ prompt: "Q" }, { sessionID: "ses_1" })
    expect(result.content).toBe("answer 1")
  })
})
