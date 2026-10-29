// Every word the sleep mod says, written once: the tool's description, the verdict the model reads, and the notices
// it gets when a sleep is cancelled or a clear fails. Each refusal names what failed, the rule, and what to do next.
import type { AfterClear, NextPrompt, NotReady, Notice, Refusal, SleepVerdict, Written } from '../types'

export const FRESH_MINUTES = 30

export const NO_ANSWER = 'The sleep mod gave no answer. Nothing was cleared.'
export const CHECK_FAILED = 'The sleep mod failed while checking, so nothing was cleared. Try again, or end the session the usual way.'

export const TOOL_DESCRIPTION =
  `Clear your own context once your diary and hand-off are saved, so a fresh you continues from the hand-off. ` +
  `Only an agent with a home ($AGENT_SPACES/<name>/, default ~/agent-spaces/<name>/) can sleep. Before calling it, write today's diary entry ` +
  `(diary/<YYYY-MM-DD>.md) and your hand-off (handoff.md); both must have been written in the last ${FRESH_MINUTES} ` +
  `minutes. The clear happens once this turn ends with your reply, so say what you're doing first. ` +
  `after "nap": the fresh context starts on \`prompt\` straight away (a long job or a gate to wait out). ` +
  `after "sleep": the fresh context waits until a person or a peer writes (the work is done), unless your home has an ` +
  `executable \`queue\` that names a next item (exit 0); then the fresh context starts on that item. ` +
  `If the turn is interrupted, or the person writes before it ends, the sleep is cancelled.`

export function verdictText(v: SleepVerdict): string {
  switch (v.kind) {
    case 'goingToSleep':
      return `Saved: ${v.saved.diary.file} and ${v.saved.handoff.file}. Your context clears when this turn ends. ${afterText(v.after)}`
    case 'refused':
      return refusalText(v.why)
  }
}

function afterText(a: AfterClear): string {
  switch (a.kind) {
    case 'nap':
      return `Nap: the fresh context starts on your prompt: "${a.prompt.text}"`
    case 'sleep':
      return 'Sleep: the fresh context waits for a person or a peer, or starts on the next item if your home has a queue.'
  }
}

function refusalText(r: Refusal): string {
  switch (r.kind) {
    case 'notReady':
      return `Not going to sleep: ${r.problems.map(notReadyText).join(' ')} Nothing was cleared.`
    case 'subagent':
      return 'Not going to sleep: a subagent can\'t clear a context. Only the main session clears its own; finish and report back instead.'
    case 'alreadyPending':
      return `Not going to sleep twice: a sleep is already pending (${a(r.after)}). It stands; finish your reply and the turn's end clears the context.`
    case 'napNeedsPrompt':
      return 'Not going to sleep: after "nap" needs a `prompt`, the first thing the fresh context works on. Give one, or use after "sleep".'
    case 'unknownAfter':
      return `Not going to sleep: after must be "nap" or "sleep", not ${JSON.stringify(r.given)}.`
  }
}

const a = (after: AfterClear) => (after.kind === 'nap' ? 'a nap' : 'a sleep')

function notReadyText(n: NotReady): string {
  switch (n.kind) {
    case 'diary':
      return `Your diary ${writtenText(n.written)} Write today's entry in diary/<YYYY-MM-DD>.md: what happened, what was decided, what's left.`
    case 'handoff':
      return `Your hand-off ${writtenText(n.written)} Update handoff.md with what a fresh you should do first.`
    case 'homeless':
      return `You (${n.name}) have no home at ${n.home}, so there's no diary or hand-off to wake from. Make that folder, or end the session the usual way.`
    case 'unnamed':
      return `Couldn't tell who you are: ${n.said}. Name the session (claude -n <name>, or start it with \`agent <name>\`).`
  }
}

function writtenText(w: Exclude<Written, { kind: 'fresh' }>): string {
  switch (w.kind) {
    case 'missing':
      return `doesn't exist yet (${w.file}).`
    case 'stale':
      return `was last written ${w.ageMinutes} minutes ago (${w.file}); it must be written in the last ${FRESH_MINUTES}.`
  }
}

export function noticeText(n: Notice): string {
  switch (n.kind) {
    case 'sleepCancelled':
      return `Your sleep was cancelled (${cancelText[n.because]}), so your context was kept. Call sleep again when you're ready.`
    case 'clearFailed':
      return `Your sleep didn't happen: /clear was refused ("${n.why.text}"), so your context was kept. Tell the person, or try again.`
  }
}

const cancelText = {
  turnAborted: 'the turn was interrupted',
  turnRefused: 'the turn ended in a refusal',
  turnErrored: 'the turn ended in an API error',
  personSpoke: 'the person wrote before the turn ended',
} as const

export const DROWSE_HALF = 50
export const DROWSE_FULL = 80
export const DROWSE_IDLE_MINUTES = 45

export type DrowseReason = { kind: 'half'; percent: number } | { kind: 'full'; percent: number } | { kind: 'idle' }

export function drowseText(r: DrowseReason): string {
  const save =
    `Write today's diary entry (diary/<YYYY-MM-DD>.md in your home) and update handoff.md, then call the sleep tool: ` +
    `after "nap" with the next step as the prompt if work is left, after "sleep" if it's done.`
  switch (r.kind) {
    case 'half':
      return (
        `[sleep mod] Your context is ${r.percent}% full. This is an offer, once: at a good stopping point, write today's diary entry ` +
        `(diary/<YYYY-MM-DD>.md in your home) and update handoff.md, then call the sleep tool: "nap" with the next step as the prompt if work is left, ` +
        `"sleep" if it's done. Sleep is for shedding context, never a way to idle through a wait; if you are waiting on someone, keep working or say so.`
      )
    case 'full':
      return `[sleep mod] Your context is ${r.percent}% full. Save now, before anything else: auto-compaction is off, and at 100% the session stops with no room to write. ${save}`
    case 'idle':
      return `[sleep mod] You've been idle ${DROWSE_IDLE_MINUTES} minutes; your prompt cache expires at 60 minutes. Save and sleep so a fresh you wakes cheaply. ${save}`
  }
}

/** The first prompt of a context the home's queue fed. */
export function queueText(item: NextPrompt): string {
  return (
    `Your queue (the \`queue\` script in your home) handed you this next item:\n\n${item.text}\n\n` +
    `Read your hand-off first. Work the item until its check passes, then save your diary and hand-off and sleep; ` +
    `the queue is asked again then. If the queue hands you the same item twice in a row, it counts as no progress and you stay asleep.`
  )
}
