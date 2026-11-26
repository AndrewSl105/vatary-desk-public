#!/bin/sh
# PreToolUse guard (Bash): the repo never runs prettier.
# Reads the tool input JSON on stdin; a non-zero BLOCK exit stops the call
# and shows the message to the agent.

ALLOW=0
BLOCK=2

cmd=$(cat | sed -n 's/.*"command":"\([^"]*\)".*/\1/p' | head -1)

case "$cmd" in
  *prettier*|*"npm run format"*|*"npm run lint"*" --fix"*)
    echo "Blocked: prettier never runs in this repo. Use eslint with 'prettier/prettier: off' or fix by hand." >&2
    exit "$BLOCK" ;;
esac

exit "$ALLOW"
