#!/bin/sh
# Stop hook: while a refactor phase is open, remind the agent to record the
# block's state in PROGRESS.md when source changed but PROGRESS.md did not.

PROGRESS_FILE="docs/refactor/PROGRESS.md"
OPEN_PHASE_MARKER="status: in-progress"
SOURCE_DIRS="client/src|server/src|ai-runtime|workflow-runtime|docsvc"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
grep -q "$OPEN_PHASE_MARKER" "$PROGRESS_FILE" 2>/dev/null || exit 0

if git status --short | grep -qE "^( M|A |M ) ($SOURCE_DIRS)/" \
  && ! git status --short | grep -q "$PROGRESS_FILE"; then
  echo "refactor: source changed but $PROGRESS_FILE was not updated — record the block state before ending." >&2
fi

exit 0
