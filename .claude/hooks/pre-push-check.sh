#!/bin/bash
# Blocks `git push` from Claude Code unless the fast CI suite passes.
# Uses test:ci (not `npm test`) because full e2e needs a manually started server on :8130.
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
case "$cmd" in
  *"git push"*)
    cd "$CLAUDE_PROJECT_DIR" || exit 0
    if ! npm run test:ci; then
      echo "test:ci failed - push blocked." >&2
      exit 2
    fi
    ;;
esac
exit 0
