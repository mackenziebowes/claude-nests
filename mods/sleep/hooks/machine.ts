// The sleep state machine: `step` turns the state and one event into the next state and what to do. It is pure, so
// every pair of state and event is decided here and nowhere else; register.ts only feeds it events and carries out
// its effects. The promise: a context is cleared only after a check found the diary and hand-off saved, and only
// when the turn that asked ended with an answer. After a sleep, a home's queue may start the fresh context on its
// next item, but never on the same item twice in a row.
import type { AfterClear, CancelReason, CheckResult, Effect, Fed, QueueRead, Refusal, SleepEvent, SleepState, Step } from '../types'

const stay = (state: SleepState, ...effects: Effect[]): Step => ({ state, effects })

export function step(state: SleepState, event: SleepEvent): Step {
  switch (event.kind) {
    case 'sleepCalled':
      if (event.caller.kind === 'subagent') return stay(state, refuse({ kind: 'subagent' }))
      if (state.kind === 'feeding') return stay(state, refuse({ kind: 'alreadyPending', after: { kind: 'sleep' } }))
      if (state.kind !== 'awake') return stay(state, refuse({ kind: 'alreadyPending', after: state.after }))
      return { state: { kind: 'checking', after: event.after, fed: state.fed }, effects: [{ kind: 'startCheck' }] }
    case 'checked':
      return state.kind === 'checking' ? afterCheck(state.after, state.fed, event.result) : stay(state)
    case 'checkThrew':
      return state.kind === 'checking' ? stay({ kind: 'awake', fed: state.fed }) : stay(state)
    case 'turnEnded':
      if (state.kind !== 'settling') return stay(state)
      switch (event.reason) {
        case 'answer':
          return {
            state: { kind: 'clearing', after: state.after, fed: state.fed },
            effects: [{ kind: 'runClear', after: state.after }],
          }
        case 'aborted':
          return cancel(state.fed, 'turnAborted')
        case 'refusal':
          return cancel(state.fed, 'turnRefused')
        case 'error':
          return cancel(state.fed, 'turnErrored')
      }
    case 'personSpoke':
      return state.kind === 'settling' ? cancel(state.fed, 'personSpoke') : stay(state)
    case 'cleared':
      if (state.kind !== 'clearing') return stay({ kind: 'awake', fed: state.fed })
      switch (state.after.kind) {
        case 'nap':
          return { state: { kind: 'awake', fed: state.fed }, effects: [{ kind: 'submitPrompt', prompt: state.after.prompt }] }
        case 'sleep':
          return { state: { kind: 'feeding', fed: state.fed }, effects: [{ kind: 'readQueue' }] }
      }
    case 'clearRefused':
      if (state.kind !== 'clearing') return stay(state)
      return {
        state: { kind: 'awake', fed: state.fed },
        effects: [{ kind: 'tellAgent', notice: { kind: 'clearFailed', why: event.why } }],
      }
    case 'queueRead':
      return state.kind === 'feeding' ? afterQueue(state.fed, event.read) : stay(state)
  }
}

function afterQueue(fed: Fed, read: QueueRead): Step {
  switch (read.kind) {
    case 'next':
      if (fed.kind === 'fed' && fed.item.text === read.item.text) return stay({ kind: 'awake', fed })
      return { state: { kind: 'awake', fed: { kind: 'fed', item: read.item } }, effects: [{ kind: 'submitQueued', item: read.item }] }
    case 'empty':
    case 'noQueue':
    case 'broken':
      return stay({ kind: 'awake', fed: { kind: 'none' } })
  }
}

function afterCheck(after: AfterClear, fed: Fed, result: CheckResult): Step {
  switch (result.kind) {
    case 'notReady':
      return { state: { kind: 'awake', fed }, effects: [refuse({ kind: 'notReady', problems: result.problems })] }
    case 'saved':
      return {
        state: { kind: 'settling', after, saved: result.saved, fed },
        effects: [{ kind: 'answerTool', verdict: { kind: 'goingToSleep', saved: result.saved, after } }],
      }
  }
}

function refuse(why: Refusal): Effect {
  return { kind: 'answerTool', verdict: { kind: 'refused', why } }
}

function cancel(fed: Fed, because: CancelReason): Step {
  return { state: { kind: 'awake', fed }, effects: [{ kind: 'tellAgent', notice: { kind: 'sleepCancelled', because } }] }
}
