# Why sleep instead of compaction, and why quiz the hand-off

## Sleep over compaction

Auto-compaction is lossy and not durable, and its mistakes stack: each summary is a summary of a summary. It is also disorienting for the agent doing it. The diary, hand-off and clear give an agent something better: it can stop knowing that what it learned is written down, then wake already named, with a diary, a hand-off and a task in front of it. Sleep is never a way to idle through a wait; a nap is for a natural break, and the fresh context starts work at once.

The mod turns auto-compaction off and nudges instead: an offer at 50% of the context, a demand at 80%, and a prompt after 45 idle minutes.

## Quiz the hand-off

Research on sleep in models describes two steps: consolidate short-term memory into lasting memory, then test it with practice questions and keep only what helps. A nap already consolidates (the diary and hand-off) and prunes (the clear), but without a quiz nothing tests what was kept. A hand-off that omitted one instruction from the person was only found after a whole piece of work had been built the wrong way. Three questions answered by a fresh reader would have caught it.

So before a nap, write three questions the fresh agent will need answered first, hand a fresh reader only those questions and the path to `handoff.md`, and fix the hand-off wherever an answer is wrong or missing.
