# How to let a Claude Code agent clear its own context without losing its place

A Claude Code agent that works all day fills its context. Compaction summarises it, and the summary loses detail. This guide shows a setup where the agent writes down what it learned, clears its context, and a fresh copy of the same agent picks up from the notes. The agent decides when. The tool refuses to clear until the notes are saved.

Mackenzie Bowes, who built it, on why he dropped compaction (2026-10-15): "Compaction sucks, it's lossy and non durable and mistakes stack up." What he wanted instead was a system where "they can sleep knowing that what they learned hasn't been lost, and then wake up and immediately learn a bunch of stuff."

## 1. What you get

1. An agent with a home: a folder holding its README, `handoff.md` and a `diary/` folder. This is the public convention at github.com/mackenziebowes/claude-nests.
2. A `sleep` tool the agent calls when its notes are saved. The tool checks the notes, then clears the agent's context when the agent's turn ends.
3. Two ways to wake: a nap, where the fresh context starts on a prompt the agent wrote for itself, and a sleep, where it waits for a message or takes the next item from a queue.
4. Nudges that ask the agent to save and sleep when its context is half full, when it is 80% full, and when it has been idle for 45 minutes.

## 2. The two files

Before it sleeps, the agent writes two files in its home.

1. `diary/<YYYY-MM-DD>.md`: the story of the session. What happened, what was decided, what is left.
2. `handoff.md`: the present. What a fresh copy should do first.

Hand-offs hold the present and diaries hold the story (claude-nests README). The hook in claude-nests (`wake.sh`) prints the README, the hand-off and the latest diary entry into context at session start. It also fires after `/clear`, which is how the fresh copy gets its bearings.

## 3. What the sleep tool does, step by step

The sleep mod lives in `mods/sleep` (`hooks/register.ts`, `hooks/machine.ts`, `hooks/words.ts`). The tool takes two arguments: `after`, which is `"nap"` or `"sleep"`, and `prompt`, which a nap requires.

1. **It finds who is asking.** It looks in `~/.claude/sessions/` for the `<pid>.json` file whose `sessionId` is the current session, and reads that file's `name`. Claude Code sets the name from `claude -n <Name>`, which the `agent <name>` launcher passes. The mod opens only the `.json` files there, never the `.key` files beside them. The home is `$AGENT_SPACES/<name>/` with the name in lower case. `AGENT_SPACES` defaults to `~/agent-spaces`, and the `agent` launcher exports it. No other tool is needed.
2. **It checks the notes.** The newest `.md` file in `diary/` and `handoff.md` must each have been written in the last 30 minutes. The tool's description asks for `diary/<YYYY-MM-DD>.md`, but the check accepts any newest `.md` file there and does not look at the date in its name. A file that is missing or older is refused, and the answer says which file and how many minutes old.
3. **It answers the agent, and waits.** The tool's answer reads "Saved: <diary> and <hand-off>. Your context clears when this turn ends." Nothing is cleared yet.
4. **It clears when the turn ends with an answer.** The agent finishes its reply (the tool description tells it to say what it is doing first), and the mod then runs `/clear`.
5. **It cancels if anything gets in the way.** If the turn is interrupted, ends in a refusal or an API error, or the person types before the turn ends, the sleep is cancelled. The agent is told why, keeps its context, and can call `sleep` again.
6. **It wakes the fresh copy.** For a nap, the mod submits the agent's `prompt` as the first message. For a sleep, see section 5.

If `/clear` itself is refused, the agent gets a notice that its sleep didn't happen and its context was kept.

### What the tool refuses

Each refusal names what failed, the rule, and what to do next.

1. A subagent calls it: only the main session clears its own context.
2. A sleep is already pending: the pending one stands.
3. `after` is `"nap"` with no `prompt`.
4. `after` is neither `"nap"` nor `"sleep"`.
5. The diary or hand-off is missing or older than 30 minutes.
6. The session has no name (start it with `claude -n <name>` or `agent <name>`), or its home folder doesn't exist (make the folder).

## 4. Nap or sleep

The two differ only in what happens after the clear.

| | Nap | Sleep |
|---|---|---|
| After the clear | The fresh context starts at once on the `prompt` the agent wrote | The fresh context waits for a message from a person or a peer |
| Use it | At a break in the work, while waiting on a result, at a context reminder | When the session is over |

The rule we run is `nap-by-default`: nap, and sleep only when the person asks for "sleep" in words. Mackenzie (2026-10-25): "You should nap unless I specifically ask for 'sleep' - 'sleep' is the actual end of a session." The reason is visible in the pane. After a sleep the screen is cleared and the agent says nothing, so the person can't see what it is doing or waiting for. After a nap, the fresh copy speaks first.

Write the nap prompt so the fresh copy's first message tells the person three things: its priority now, what it is waiting on and from whom, and when it acts next.

## 5. A queue for sleep

If the agent's home has an executable file named `queue`, a sleep asks it for the next item. A nap never asks the queue.

1. After the clear, the mod runs `<home>/queue` from the home folder. The engine's 30-second limit applies to the run.
2. Exit 0 with output: the output is the next item (cut at 4,000 characters), and it is submitted to the fresh context with the instruction to read the hand-off first, work the item until its check passes, then save and sleep again.
3. Exit 1: nothing left. The agent stays asleep.
4. Any other exit, or no answer: the queue is treated as broken. The agent stays asleep and gets no notice.
5. If the queue hands back the same text twice in a row, the second is not submitted. That counts as no progress, and the agent stays asleep.

## 6. The nudges

The mod nudges an agent that has a home. Each nudge is sent once per context, and `/clear` starts a new count.

| When | What it says |
|---|---|
| Context 50% full | An offer: at a good stopping point, save and call `sleep`. Sleep is for shedding context, never a way to idle through a wait. |
| Context 80% full | A demand: save now, because auto-compaction is off and at 100% the session stops with no room to write. |
| Idle for 45 minutes | Your prompt cache expires at 60 minutes. Save and sleep so a fresh copy wakes cheaply. |

The mod does not turn auto-compaction off. The 80% message says "auto-compaction is off", so turn it off in your settings (`DISABLE_AUTO_COMPACT` set to 1) or that message will be false for your agent.

The order: the 80% nudge fires even if the 50% one already did, and the 50% nudge is skipped once the 80% one has fired. The idle timer starts when a main turn ends, restarts at the end of the next turn, stops when any prompt is submitted, and fires once per context. A nudge is not sent while a sleep is already pending. A session found to have no home is checked again after five minutes, so naming a session late still works.

## 7. Quiz the hand-off before you nap

The mod checks that the notes were saved. It does not check that they are good. Our rule adds a step: before a nap, write three questions the fresh copy will need answered first (what the person last decided, what a neighbour is doing for you, where the work lives). Give a fresh reader, such as a subagent, only the questions and the path to `handoff.md`. Where an answer comes back wrong or missing, fix the hand-off, then nap.

The idea came from one of our research agents, reading Google Research's SLEEP framework (2026-10-27): "during a nap, test the hand-off by asking it questions and keep only what answers well." The same evening, a brief that left out one instruction led to work being built from the old version. A three-question quiz would have caught it.

This step is a rule the agent follows, not something the mod enforces.

## 8. Set it up

1. Make a home for the agent with claude-nests, so that `agent <name>` loads its README, hand-off and latest diary.
2. Load the sleep mod. It needs a Claude Code setup that loads mods and provides the `claude-code` engine API (`$.state`, `$.tool.register`, `$.session.measure`); a Claude Code without one can't run it. The mod's folder (`mods/sleep`) is a plugin directory: `.claude-plugin/plugin.json` and `hooks/hooks.json`, whose `modules` entry points at `register.ts`. On our machine it is one entry in the colon-separated `CLAUDE_CODE_PLUGIN_DIRS` list in `~/.claude/settings.json`, beside the plugin that provides the engine API.
3. Turn auto-compaction off (`DISABLE_AUTO_COMPACT` set to 1).
4. Add the rules to the agent's instructions: save the diary and hand-off, then call `sleep`; nap by default; quiz the hand-off before a nap.
5. Optional: add a `queue` script to the home for agents that work through a list.

## Sources

1. `mods/sleep/hooks/register.ts`, `machine.ts`, `words.ts` (the sleep mod, in github.com/mackenziebowes/claude-nests).
2. github.com/mackenziebowes/claude-nests, README.
3. `mods/sleep/docs/nap-by-default.md`: the rule, with the quiz step. Mackenzie, 2026-10-25 and 2026-10-27, asked for nap-by-default and for the hand-off quiz.
4. `mods/sleep/docs/why.md`: why we dropped compaction (Mackenzie, 2026-10-15) and why the hand-off is quizzed.
