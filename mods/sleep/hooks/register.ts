// The sleep mod's adapters: each engine event becomes one SleepEvent for `step`, and each Effect it returns is
// carried out here. The promise: the machine's state survives both a hot reload (it lives in $.state) and its own
// /clear, which empties $.state (so `clearing` is also held in this module, which a /clear doesn't reload).
import type { EngineInterface, Register } from 'claude-code'
import type { AfterClear, CheckResult, Effect, Fed, Fresh, NotReady, QueueRead, SleepEvent, SleepState, SleepVerdict, Written } from '../types'
import { step } from './machine'
import {
  CHECK_FAILED,
  DROWSE_HALF,
  DROWSE_FULL,
  DROWSE_IDLE_MINUTES,
  type DrowseReason,
  FRESH_MINUTES,
  NO_ANSWER,
  TOOL_DESCRIPTION,
  drowseText,
  noticeText,
  queueText,
  verdictText,
} from './words'

const machine = { plugin: 'sleep', key: 'machine' } as const
const TOOL = 'mcp__sleep__sleep'

let clearing: Extract<SleepState, { kind: 'clearing' }> | undefined

async function current($: EngineInterface): Promise<SleepState> {
  if (clearing) return clearing
  const { value } = await $.state.get(machine)
  return fromStore(value)
}

/** The edge for `$.state`: a state saved before the queue has no `fed`, which reads as nothing fed yet. */
function fromStore(value: SleepState | undefined): SleepState {
  if (value === undefined) return { kind: 'awake', fed: { kind: 'none' } }
  const fed: Fed = 'fed' in value && value.fed !== undefined ? value.fed : { kind: 'none' }
  return { ...value, fed } as SleepState
}

async function save($: EngineInterface, state: SleepState) {
  clearing = state.kind === 'clearing' ? state : undefined
  await $.state.set(machine, state)
}

/** Feeds one event to the machine, saves the next state, and carries out every effect but the tool's answer. */
async function feed($: EngineInterface, event: SleepEvent): Promise<SleepVerdict | undefined> {
  const { state, effects } = step(await current($), event)
  await save($, state)
  let verdict: SleepVerdict | undefined
  for (const effect of effects) verdict = (await carryOut($, effect)) ?? verdict
  return verdict
}

async function carryOut($: EngineInterface, effect: Effect): Promise<SleepVerdict | undefined> {
  switch (effect.kind) {
    case 'answerTool':
      return effect.verdict
    case 'startCheck':
      return feed($, { kind: 'checked', result: await check($) })
    case 'runClear':
      $.clock.after(0, () => {
        $.command.run({ command: 'clear' }).catch((err: unknown) =>
          feed($, { kind: 'clearRefused', why: { text: err instanceof Error ? err.message : String(err) } }),
        )
      })
      return undefined
    case 'submitPrompt':
      $.clock.after(0, () => void $.prompt.submit({ text: effect.prompt.text, asUser: true }))
      return undefined
    case 'tellAgent':
      $.clock.after(0, () => void $.prompt.submit({ text: noticeText(effect.notice) }))
      return undefined
    case 'readQueue':
      return feed($, { kind: 'queueRead', read: await readQueue($) })
    case 'submitQueued':
      $.clock.after(0, () => void $.prompt.submit({ text: queueText(effect.item), asUser: true }))
      return undefined
  }
}

/** Runs `<home>/queue`. Exit 0 with output is the next item, exit 1 is nothing left; anything else, or no
 *  answer within the engine's 30 s, is broken. */
async function readQueue($: EngineInterface): Promise<QueueRead> {
  const found = await homeDir($)
  if (found.kind !== 'home') return { kind: 'noQueue' }
  const file = `${found.dir}/queue`
  const isFile = await $.fs.stat(file).then(s => s.kind === 'file').catch(() => false)
  if (!isFile) return { kind: 'noQueue' }
  const ran = await $.process.run([file], { cwd: found.dir }).catch((err: unknown) => ({
    exitCode: -1,
    stdout: '',
    stderr: err instanceof Error ? err.message : String(err),
  }))
  const item = ran.stdout.trim()
  if (ran.exitCode === 0 && item !== '') return { kind: 'next', item: { text: item.slice(0, 4000) } }
  if (ran.exitCode === 1) return { kind: 'empty' }
  return { kind: 'broken', why: { text: `exit ${ran.exitCode}: ${(ran.stderr || ran.stdout).trim().slice(0, 300)}` } }
}

type HomeDir = { kind: 'home'; name: string; dir: string } | { kind: 'notReady'; problem: NotReady }

/** This session's name, from its own ~/.claude/sessions/<pid>.json, and its home folder, if it has one. The homes
 *  live in $AGENT_SPACES (default ~/agent-spaces), the same folder the `agent` launcher uses. */
async function homeDir($: EngineInterface): Promise<HomeDir> {
  const home = (await $.env.get('HOME')) ?? ''
  const spaces = (await $.env.get('AGENT_SPACES')) || `${home}/agent-spaces`
  const session = await $.session.id()
  const name = await ownName($, home, session)
  if (name === undefined) return { kind: 'notReady', problem: { kind: 'unnamed', said: `no named session file for ${session}` } }
  const dir = `${spaces}/${name.toLowerCase()}`
  const isHome = await $.fs.stat(dir).then(s => s.kind === 'dir').catch(() => false)
  if (!isHome) return { kind: 'notReady', problem: { kind: 'homeless', name, home: dir } }
  return { kind: 'home', name, dir }
}

/** Who is asking, from the session file, and whether their diary and hand-off were written lately. */
async function check($: EngineInterface): Promise<CheckResult> {
  const found = await homeDir($)
  if (found.kind === 'notReady') return notReady(found.problem)
  const { dir } = found

  const now = await $.clock.now()
  const diaries = await $.fs.list(`${dir}/diary`).catch(() => [])
  const newest = diaries.filter(e => e.kind === 'file' && e.name.endsWith('.md')).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  const diary = newest ? written(`${dir}/diary/${newest.name}`, newest.mtimeMs, now) : missing(`${dir}/diary/<YYYY-MM-DD>.md`)
  const handoffFile = `${dir}/handoff.md`
  const handoffStat = await $.fs.stat(handoffFile).catch(() => undefined)
  const handoff = handoffStat?.kind === 'file' ? written(handoffFile, handoffStat.mtimeMs, now) : missing(handoffFile)

  const problems: NotReady[] = []
  if (diary.kind !== 'fresh') problems.push({ kind: 'diary', written: diary })
  if (handoff.kind !== 'fresh') problems.push({ kind: 'handoff', written: handoff })
  if (diary.kind === 'fresh' && handoff.kind === 'fresh') return { kind: 'saved', saved: { diary, handoff } }
  return { kind: 'notReady', problems }
}

/** This session's name, from the ~/.claude/sessions/<pid>.json that holds its id. Only the `.json` files are opened:
 *  the `.key` files beside them are secrets. */
async function ownName($: EngineInterface, home: string, session: string): Promise<string | undefined> {
  const dir = `${home}/.claude/sessions`
  const files = (await $.fs.list(dir).catch(() => [])).filter(e => e.kind === 'file' && /^\d+\.json$/.test(e.name))
  for (const f of files) {
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    if (!text.includes(`"sessionId":"${session}"`)) continue
    return sessionName(text)
  }
  return undefined
}

const notReady = (problem: NotReady): CheckResult => ({ kind: 'notReady', problems: [problem] })
const missing = (file: string): Written => ({ kind: 'missing', file })

function written(file: string, touchedMs: number, nowMs: number): Fresh | Exclude<Written, Fresh> {
  const ageMinutes = Math.floor((nowMs - touchedMs) / 60_000)
  return ageMinutes < FRESH_MINUTES ? { kind: 'fresh', file, touchedMs } : { kind: 'stale', file, touchedMs, ageMinutes }
}

/** The edge for a session file's JSON: its name, or nothing. */
function sessionName(stdout: string): string | undefined {
  try {
    const who: unknown = JSON.parse(stdout)
    if (typeof who === 'object' && who !== null && 'name' in who && typeof who.name === 'string' && who.name !== '') return who.name
  } catch {}
  return undefined
}

/** The edge for the tool's input. */
function parseAfter(input: unknown): AfterClear | SleepVerdict {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const prompt = typeof fields.prompt === 'string' ? fields.prompt.trim() : ''
  switch (fields.after) {
    case 'nap':
      return prompt ? { kind: 'nap', prompt: { text: prompt } } : { kind: 'refused', why: { kind: 'napNeedsPrompt' } }
    case 'sleep':
      return { kind: 'sleep' }
    default:
      return { kind: 'refused', why: { kind: 'unknownAfter', given: fields.after } }
  }
}

// ---- drowse: auto-compaction is off (DISABLE_AUTO_COMPACT), so the mod prompts an agent with a home to save
// and sleep when its context fills (an offer at 50%, a demand at 80%) or it sits idle; without it a full context stops with no room to save. Each nudge
// is sent at most once per context; /clear starts a fresh one.

type Sent = { half: boolean; full: boolean; idle: boolean }

let sent: Sent = { half: false, full: false, idle: false }
let idle: { cancel: () => void } | undefined
let homed = false
let noHomeUntil = 0
const NO_HOME_RECHECK_MS = 5 * 60_000

/** Whether this session has a home. A yes is remembered; a no only for a few minutes, so a session named after it
 *  started is found soon and a homeless one doesn't read the session files on every turn. */
async function hasHome($: EngineInterface): Promise<boolean> {
  if (homed) return true
  const now = await $.clock.now()
  if (noHomeUntil > now) return false
  homed = (await homeDir($)).kind === 'home'
  if (!homed) noHomeUntil = now + NO_HOME_RECHECK_MS
  return homed
}

async function sleepPending($: EngineInterface): Promise<boolean> {
  const { value } = await $.state.get({ plugin: 'sleep', key: 'machine' })
  return value !== undefined && value.kind !== 'awake'
}

async function nudge($: EngineInterface, reason: DrowseReason) {
  if (!(await hasHome($)) || (await sleepPending($))) return
  sent = { ...sent, [reason.kind]: true }
  $.clock.after(0, () => void $.prompt.submit({ text: drowseText(reason) }))
}

function stopIdle() {
  idle?.cancel()
  idle = undefined
}

async function drowseMeasured($: EngineInterface, percent: number | undefined) {
  if (percent === undefined) return
  const p = Math.round(percent)
  if (p >= DROWSE_FULL && !sent.full) await nudge($, { kind: 'full', percent: p })
  else if (p >= DROWSE_HALF && !sent.half && !sent.full) await nudge($, { kind: 'half', percent: p })
}

function drowseTurnEnded($: EngineInterface) {
  if (sent.idle) return
  stopIdle()
  idle = $.clock.after(DROWSE_IDLE_MINUTES * 60_000, () => void nudge($, { kind: 'idle' }))
}

function drowseCleared() {
  stopIdle()
  sent = { half: false, full: false, idle: false }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'sleep',
      description: TOOL_DESCRIPTION,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          after: { type: 'string', enum: ['nap', 'sleep'], description: 'nap: the fresh context starts on `prompt`. sleep: it waits for a message.' },
          prompt: { type: 'string', description: 'For a nap: the first thing the fresh context works on.' },
        },
        required: ['after'],
      },
    })
    return started
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const after = parseAfter(e)
    const verdict =
      'kind' in after && (after.kind === 'nap' || after.kind === 'sleep')
        ? await feed($, { kind: 'sleepCalled', after, caller: e.agentId ? { kind: 'subagent', agentId: e.agentId } : { kind: 'main' } })
        : (after as SleepVerdict)
    return { result: verdict ? verdictText(verdict) : NO_ANSWER }
  }).catch(async $ => {
    await feed($, { kind: 'checkThrew' })
    return { result: CHECK_FAILED }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await feed($, { kind: 'turnEnded', reason: e.reason })
      drowseTurnEnded($)
    }
    return done
  })

  on('prompt.submit', async ($, e, next) => {
    stopIdle()
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') await feed($, { kind: 'personSpoke' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await feed($, { kind: 'cleared' })
      drowseCleared()
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const done = await next(e)
    await drowseMeasured($, e.context.percent)
    return done
  })
}
