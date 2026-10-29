// The sleep mod's types: one state machine (SleepState, SleepEvent, Effect) and the words it answers with.

/** What the agent asks for. "nap" and "sleep" fit the nest theming. */
export type AfterClear =
  | { kind: 'nap'; prompt: NextPrompt } // the fresh context starts on this prompt
  | { kind: 'sleep' } // the fresh context waits for a person or a peer
export type NextPrompt = { text: string }

/** What the home's queue last handed this agent. The same item twice in a row means no progress. */
export type Fed = { kind: 'none' } | { kind: 'fed'; item: NextPrompt }

export type SleepState =
  | { kind: 'awake'; fed: Fed }
  | { kind: 'checking'; after: AfterClear; fed: Fed }
  | { kind: 'settling'; after: AfterClear; saved: Saved; fed: Fed }
  | { kind: 'clearing'; after: AfterClear; fed: Fed }
  | { kind: 'feeding'; fed: Fed } // cleared after a sleep; asking the home's queue for the next item

/** What `<home>/queue` answered: exit 0 with an item, exit 1 for nothing left, anything else is broken. */
export type QueueRead =
  | { kind: 'next'; item: NextPrompt }
  | { kind: 'empty' }
  | { kind: 'noQueue' }
  | { kind: 'broken'; why: EngineWords }

export type SleepEvent =
  | { kind: 'sleepCalled'; after: AfterClear; caller: Caller }
  | { kind: 'checked'; result: CheckResult }
  | { kind: 'checkThrew' }
  | { kind: 'turnEnded'; reason: TurnEndReason }
  | { kind: 'personSpoke' }
  | { kind: 'cleared' }
  | { kind: 'clearRefused'; why: EngineWords }
  | { kind: 'queueRead'; read: QueueRead }

export type Caller = { kind: 'main' } | { kind: 'subagent'; agentId: string }
export type TurnEndReason = 'answer' | 'aborted' | 'refusal' | 'error'
export type EngineWords = { text: string }

export type CheckResult = { kind: 'saved'; saved: Saved } | { kind: 'notReady'; problems: NotReady[] }
export type Saved = { diary: Fresh; handoff: Fresh }

export type Fresh = { kind: 'fresh'; file: string; touchedMs: number }
export type Stale = { kind: 'stale'; file: string; touchedMs: number; ageMinutes: number }
export type Missing = { kind: 'missing'; file: string }
export type Written = Fresh | Stale | Missing

export type NotReady =
  | { kind: 'diary'; written: Stale | Missing }
  | { kind: 'handoff'; written: Stale | Missing }
  | { kind: 'homeless'; name: string; home: string }
  | { kind: 'unnamed'; said: string }

export type Effect =
  | { kind: 'answerTool'; verdict: SleepVerdict }
  | { kind: 'startCheck' }
  | { kind: 'runClear'; after: AfterClear }
  | { kind: 'submitPrompt'; prompt: NextPrompt }
  | { kind: 'tellAgent'; notice: Notice }
  | { kind: 'readQueue' }
  | { kind: 'submitQueued'; item: NextPrompt }

export type SleepVerdict =
  | { kind: 'goingToSleep'; saved: Saved; after: AfterClear }
  | { kind: 'refused'; why: Refusal }
export type Refusal =
  | { kind: 'notReady'; problems: NotReady[] }
  | { kind: 'subagent' }
  | { kind: 'alreadyPending'; after: AfterClear }
  | { kind: 'napNeedsPrompt' } // the tool's input, refused at the edge
  | { kind: 'unknownAfter'; given: unknown }

export type Notice =
  | { kind: 'sleepCancelled'; because: CancelReason }
  | { kind: 'clearFailed'; why: EngineWords }

export type CancelReason = 'turnAborted' | 'turnRefused' | 'turnErrored' | 'personSpoke'

export type Step = { state: SleepState; effects: Effect[] }

declare module 'claude-code' {
  interface PluginState {
    sleep: { machine: SleepState }
  }
}
