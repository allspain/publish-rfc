#!/usr/bin/env bash
# publish-rfc post-commit reminder hook
# Checks if the current branch has an RFC doc that's behind HEAD.
# Only active when postCommitReminder is true in rfc-config.json.

set -euo pipefail

# Find the git repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

CONFIG_FILE="$REPO_ROOT/.claude/rfc-config.json"
STATE_FILE="$REPO_ROOT/.claude/rfc-state.json"

# Check if config exists and reminders are enabled
if [ ! -f "$CONFIG_FILE" ]; then
  exit 0
fi

REMINDER_ENABLED=$(python3 -c "
import json, sys
try:
    c = json.load(open('$CONFIG_FILE'))
    print('true' if c.get('postCommitReminder', False) else 'false')
except:
    print('false')
" 2>/dev/null)

if [ "$REMINDER_ENABLED" != "true" ]; then
  exit 0
fi

# Check if state file exists
if [ ! -f "$STATE_FILE" ]; then
  exit 0
fi

# Get current branch
BRANCH=$(git branch --show-current 2>/dev/null) || exit 0
if [ -z "$BRANCH" ]; then
  exit 0
fi

# Check if this branch has a tracked doc
LAST_SYNC=$(python3 -c "
import json, sys
try:
    s = json.load(open('$STATE_FILE'))
    entry = s.get('$BRANCH', {})
    print(entry.get('lastSyncCommit', ''))
except:
    print('')
" 2>/dev/null)

if [ -z "$LAST_SYNC" ]; then
  exit 0
fi

# Check if HEAD is ahead of last sync
HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null)
SYNC_SHORT=$(echo "$LAST_SYNC" | cut -c1-7)

if [ "$HEAD_SHA" != "$SYNC_SHORT" ]; then
  # Check if last sync commit is an ancestor of HEAD
  if git merge-base --is-ancestor "$LAST_SYNC" HEAD 2>/dev/null; then
    DOC_URL=$(python3 -c "
import json
s = json.load(open('$STATE_FILE'))
print(s.get('$BRANCH', {}).get('docUrl', ''))
" 2>/dev/null)
    echo "RFC doc for branch '$BRANCH' is out of date (last synced at $SYNC_SHORT, HEAD is now $HEAD_SHA). Run /publish-rfc to update. Doc: $DOC_URL"
  fi
fi
