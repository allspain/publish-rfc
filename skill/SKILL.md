---
name: publish-rfc
description: Use when publishing or updating an RFC document to Google Docs from the current branch's code changes and planning docs. Also use when linking an existing Google Doc to the current branch, enabling/disabling post-commit RFC reminders, or when user says "update the RFC doc."
user_invocable: true
---

# publish-rfc

Generate an RFC document from the current branch's code changes and planning artifacts, then publish or update it in Google Docs.

## Prerequisites

Before first use, the user must:
1. Deploy the Apps Script web app (see project README)
2. Configure the Apps Script URL by creating/editing `$PROJECT_ROOT/.claude/rfc-config.json`:

```json
{
  "appsScriptUrl": "https://script.google.com/macros/s/.../exec",
  "apiKey": "optional-api-key",
  "postCommitReminder": false
}
```

If `rfc-config.json` doesn't exist or is missing `appsScriptUrl`, suggest running `/publish-rfc init <apps-script-url>` to set it up.

## Invocation Modes

### 1. `/publish-rfc` — Generate/update RFC for current branch

### 2. `/publish-rfc init <apps-script-url>` — Initialize project config

If the argument starts with `https://script.google.com/`:
1. Find the project root: `git rev-parse --show-toplevel`
2. Create `.claude/` directory if it doesn't exist
3. Create or update `.claude/rfc-config.json` with:
   ```json
   {
     "appsScriptUrl": "<the-provided-url>",
     "postCommitReminder": false
   }
   ```
4. If the file already exists, preserve existing fields (like `apiKey`) and only update `appsScriptUrl`.
5. Confirm to the user: "Initialized publish-rfc for this project. You can now run `/publish-rfc` to generate an RFC."

Optionally, the user can provide an API key inline:
- `/publish-rfc init <apps-script-url> --key <api-key>`
- If `--key` is provided, also set `"apiKey": "<api-key>"` in the config.

### 3. `/publish-rfc <google-doc-url>` — Link existing doc to current branch

If the argument is a Google Docs URL:
1. Extract the docId from the URL (the segment between `/d/` and `/edit` or next `/`)
2. Get the current branch name: `git branch --show-current`
3. Read or create `.claude/rfc-state.json` in the project root
4. Add/update the entry for this branch with the docId and URL
5. Confirm to the user: "Linked [branch] to [url]. Next `/publish-rfc` will update this doc."
6. Do NOT generate or push content — just link it.

### 4. "enable/disable RFC reminders" — Toggle postCommitReminder

Update `postCommitReminder` in `.claude/rfc-config.json`.

## Generate/Update Flow

When invoked without a URL argument:

### Step 1: Read configuration

Read `.claude/rfc-config.json` from the project root (the git repo root). If it doesn't exist, stop and tell the user to configure it.

### Step 2: Check for existing doc

Read `.claude/rfc-state.json` from the project root. Check if the current branch has an entry. If yes, this is an UPDATE. If no, this is a CREATE.

### Step 3: Gather source material

Run these commands and read these files to understand the branch:

**Git information:**
```bash
git branch --show-current
git log --oneline main..HEAD
git diff --stat main...HEAD
git diff main...HEAD
```

If `main` doesn't exist as a base branch, try `master`, then fall back to `git merge-base HEAD $(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')`.

**Planning artifacts (read if they exist, skip if they don't):**
- `.planning/` directory (GSD planning docs)
- `docs/plans/` directory (superpowers design docs)
- Any `PLAN.md`, `ROADMAP.md`, `RESEARCH.md` in `.planning/`
- PR description if available: `gh pr view --json title,body 2>/dev/null`

### Step 4: Generate RFC markdown

Using the gathered material, generate a complete RFC document following this template:

```
# RFC: <Title>

**Status:** Draft | In Progress | Complete
**Branch:** <branch-name>
**PR:** <PR link if exists, otherwise omit>
**Date:** <today's date> (updated <today's date>)

## Summary
<1-2 paragraph overview of what this branch does and why>

## Problem
<Why this change exists. Derive from planning docs, PR description, commit messages.>

## Solution

### Approach
<High-level description of the approach taken>

### Architecture
<Component breakdown, data flow. Derive from actual code changes.>

### Key Components
<List modified/added files with 1-sentence descriptions of what each does>

## Alternatives Considered
<Only include if planning docs contain alternatives. Otherwise omit this section entirely.>

## Testing
<What test coverage exists. Derive from test files in the diff.>

## Implementation Phases
<Derive from: GSD phases > superpowers plans > diff analysis (priority order).
Mark completed phases based on what code exists on the branch.>
- [x] Phase 1: <description>
- [ ] Phase 2: <description>

## Future Work
<Derive from planning docs, TODO/FIXME comments, or omit if nothing obvious.>

## References
<Links to PRs, issues, planning docs, external resources mentioned in code/docs.>
```

**Rules:**
- Summary, Problem, Solution sections are ALWAYS generated.
- Alternatives Considered: only if planning docs contain them.
- Implementation Phases: use GSD phases if available, superpowers plans if available, otherwise analyze the diff to infer phases.
- Testing, Future Work, References: best-effort from available artifacts.
- Be thorough but concise. Match the tone of a senior engineer writing for other senior engineers.

### Step 5: Publish to Google Docs

**For CREATE (no existing doc):**

```bash
curl -s -X POST 'APPS_SCRIPT_URL?action=create' \
  -H 'Content-Type: application/json' \
  -d @/tmp/rfc-payload.json
```

**For UPDATE (existing doc):**

```bash
curl -s -X POST 'APPS_SCRIPT_URL?action=update' \
  -H 'Content-Type: application/json' \
  -d @/tmp/rfc-payload.json
```

IMPORTANT: The markdown content will contain special characters (quotes, newlines, backticks). When constructing the JSON payload for curl:
- Write the JSON payload to a temp file first using python3 or node to properly escape the JSON
- Then use `curl -d @/tmp/rfc-payload.json`
- This avoids shell escaping issues

Example using python3 to construct the payload:
```bash
python3 -c "
import json
payload = {
    'apiKey': 'API_KEY_HERE',
    'title': 'RFC: Title Here',
    'markdown': '''THE_MARKDOWN_CONTENT_HERE''',
    'metadata': {
        'branch': 'BRANCH_NAME',
        'repo': 'REPO_NAME'
    }
}
with open('/tmp/rfc-payload.json', 'w') as f:
    json.dump(payload, f)
"
```

For UPDATE, add `docId` and `lastSyncCommit` to the payload.

### Step 6: Update local state

Parse the response JSON. Update `.claude/rfc-state.json`:

```json
{
  "<branch-name>": {
    "docUrl": "<url-from-response>",
    "docId": "<docId-from-response>",
    "lastSyncCommit": "<current-HEAD-sha>",
    "repo": "<repo-name>"
  }
}
```

If the file already has entries for other branches, preserve them.

### Step 7: Report to user

Print:
- For CREATE: "Published RFC: <doc-url>"
- For UPDATE: "Updated RFC: <doc-url> (synced to <short-sha>)"

## Post-Commit Reminder (Opt-In)

When `postCommitReminder` is `true` in the config and the skill detects it was invoked after a commit-related action:

1. Check if current branch has an entry in `rfc-state.json`
2. If yes, check if `lastSyncCommit` matches HEAD
3. If behind, suggest: "The RFC doc for this branch is out of date. Want me to update it?"

This check is passive — it only reminds, never auto-publishes.

## Error Handling

- If curl fails or returns an error, show the error to the user and suggest checking the Apps Script deployment.
- If git commands fail (e.g., no `main` branch), explain what happened and ask the user for the correct base branch.
- If the Google Doc can't be opened (deleted, permissions changed), tell the user and offer to create a new one.
