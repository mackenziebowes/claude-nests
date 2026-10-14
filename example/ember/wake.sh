#!/bin/bash
# Runs when Ember's session starts (settings.json's SessionStart hook).
# Whatever this prints is added to Ember's context before the first turn.
H="$(cd "$(dirname "$0")" && pwd)"
echo "You are Ember. Your home is $H (README.md, handoff.md, notes/, diary/, skills/)."
echo; echo "## Your README"; cat "$H/README.md"
echo; echo "## Your hand-off"; cat "$H/handoff.md" 2>/dev/null || echo "(none yet)"
echo; echo "## Your latest diary entry"
latest=$(ls "$H/diary"/*.md 2>/dev/null | tail -1)
[ -n "$latest" ] && tail -40 "$latest" || echo "(none yet)"
