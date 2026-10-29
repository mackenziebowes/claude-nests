# sleep

A mod for Claude Code that lets an agent with a nest (see the root README) save a diary and hand-off, clear its own context and wake on the hand-off.

(Draft layout. The full usage guide replaces this section.)

1. `hooks/` holds the mod: `register.ts` (the engine adapters), `machine.ts` (one transition function) and `words.ts` (everything the mod says).
2. `types/index.d.ts` holds the states, events and effects.
3. `docs/nap-by-default.md` is the rule the agent follows; `docs/why.md` is the reasoning.
4. The mod finds the agent's name in its own `~/.claude/sessions/<pid>.json` and its home in `$AGENT_SPACES/<name>/` (default `~/agent-spaces`), the same folder `agent` uses. No other tool is needed.
5. The quiz in rule 4 is text only; the mod does not check it.

Plugin type declarations are not vendored here; install them from your Claude Code mod template.
