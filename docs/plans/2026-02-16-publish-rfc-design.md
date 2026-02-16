# Design: publish-rfc — Google Docs RFC Skill for Claude Code

## Overview

A global Claude Code skill that generates RFC documents from branch code changes and planning artifacts, publishes them to Google Docs, and keeps them in sync as development progresses.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code                        │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Post-commit  │    │    publish-rfc Skill      │   │
│  │    Hook       │───>│                          │   │
│  │ (opt-in)     │    │  1. Read branch diff     │   │
│  └──────────────┘    │  2. Read planning docs   │   │
│                      │  3. Generate RFC markdown │   │
│  Manual invocation──>│  4. POST to Apps Script   │   │
│  "/publish-rfc"      │  5. Update local cache    │   │
│                      └──────────┬───────────────┘   │
│                                 │                    │
│  ┌──────────────────────┐       │                    │
│  │ .claude/rfc-state.json│       │                    │
│  │ { branch: docUrl,    │<──────┘                    │
│  │   lastSyncCommit }   │                            │
│  └──────────────────────┘                            │
│                                                      │
│  ┌──────────────────────┐                            │
│  │ .claude/rfc-config.json│                           │
│  │ { postCommitReminder: │                           │
│  │   false }             │                           │
│  └──────────────────────┘                            │
└─────────────────────────────────┬───────────────────┘
                                  │ HTTP POST (markdown + metadata)
                                  ▼
┌─────────────────────────────────────────────────────┐
│              Google Apps Script Web App               │
│                                                      │
│  Endpoints:                                          │
│  POST /create  — create new doc, return URL + ID     │
│  POST /update  — update existing doc by ID           │
│  GET  /read    — read doc content (for v2 sync)      │
│                                                      │
│  Handles: OAuth (native), markdown→Docs formatting   │
└──────────────────────────────────────────────────────┘
```

### Data Flow

1. On manual invoke (or opt-in reminder after commit): skill activates.
2. Skill runs `git diff main...HEAD`, reads any `.planning/`, `docs/plans/`, or GSD artifacts.
3. Claude generates RFC markdown following the template.
4. Markdown + metadata (branch, repo, docId if updating) sent via curl to Apps Script.
5. Apps Script creates or updates the Google Doc, returns the URL.
6. Local cache at `.claude/rfc-state.json` updated with docId, URL, and last synced commit SHA.

### State Management

**Local cache** (`.claude/rfc-state.json`) — per-branch, keyed by branch name:

```json
{
  "feature/soft-navigation": {
    "docUrl": "https://docs.google.com/document/d/...",
    "docId": "abc123",
    "lastSyncCommit": "a1b2c3d",
    "repo": "DataDog/browser-sdk"
  },
  "feature/session-replay-v2": {
    "docUrl": "https://docs.google.com/document/d/...",
    "docId": "def456",
    "lastSyncCommit": "e4f5g6h",
    "repo": "DataDog/browser-sdk"
  }
}
```

**Google Doc is the source of truth** for the mapping. If someone provides a doc URL, the skill parses the docId from the URL, caches it locally for the current branch. Two developers on the same branch share the same doc.

### Configuration

`.claude/rfc-config.json`:

```json
{
  "postCommitReminder": false
}
```

| Setting | Behavior |
|---------|----------|
| `postCommitReminder: false` (default) | No automatic reminders. Manual `/publish-rfc` only. |
| `postCommitReminder: true` | After commits, checks if RFC is behind HEAD, reminds you. |

## RFC Document Template

Claude generates each section by analyzing the branch diff and planning docs:

```markdown
# RFC: <Title derived from branch name / planning docs>

**Status:** Draft | In Progress | Complete
**Branch:** <branch-name>
**PR:** <link if exists>
**Date:** <created> (updated <last sync date>)
**Google Doc:** <link back to the canonical doc>

## Summary
<Claude-generated from diff + planning docs — 1-2 paragraph overview>

## Problem
<Why this change exists — derived from planning docs, PR description, or commit messages>

## Solution
### Approach
<High-level description of what the code does>

### Architecture
<Component breakdown, data flow — derived from actual code changes>

### Key Components
<List of modified/added files with descriptions of what each does>

## Alternatives Considered
<If planning docs contain alternatives; otherwise omitted>

## Testing
<Derived from test files in the diff — what's covered>

## Implementation Phases
- [x] Phase 1: <from GSD/superpowers plans or diff analysis>
- [x] Phase 2: <completed phases based on what's already committed>
- [ ] Phase 3: <upcoming work>
- [ ] Phase 4: <future phases>

## Future Work
<Derived from planning docs or TODO comments in the code>

## References
<Links to PRs, issues, planning docs, external resources>
```

**Section generation rules:**

- **Summary, Problem, Solution** — Always generated. Planning docs as primary source, diff as secondary.
- **Alternatives Considered** — Only if planning docs contain them; otherwise omitted.
- **Implementation Phases** — Derived from GSD phases > superpowers plans > diff analysis (in priority order). Checked/unchecked based on what code exists on the branch.
- **Testing, Future Work, References** — Best-effort from available artifacts.

## Skill Invocation

| Command | Behavior |
|---------|----------|
| `/publish-rfc` | Generate/update RFC for current branch, create doc if none exists |
| `/publish-rfc <google-doc-url>` | Link an existing Google Doc to current branch, sync to it |
| "update the RFC doc" | Natural language trigger — skill description matches this |
| "enable RFC post-commit reminders" | Sets `postCommitReminder: true` in config |

### First-Time Flow

1. You're on `feature/soft-navigation` and say `/publish-rfc`
2. No entry in `rfc-state.json` for this branch
3. Skill analyzes diff, reads planning docs, generates RFC markdown
4. POSTs to Apps Script → new doc created → URL returned
5. State cached: branch → docId, URL, commit SHA
6. Claude prints: "Published RFC: \<link\>"

### Update Flow

1. You commit some code, optionally get reminded (if enabled)
2. You say "yes" or `/publish-rfc`
3. Skill diffs since `lastSyncCommit`, reads updated planning docs
4. Generates updated RFC (full regeneration — Apps Script replaces doc content)
5. POSTs update to Apps Script → doc updated
6. State updated with new commit SHA

### Link Existing Doc Flow

1. Colleague shares the RFC doc URL
2. You run `/publish-rfc <url>`
3. Skill extracts docId from URL, caches it for current branch
4. Next update syncs to that doc

## Components to Build

### 1. Claude Code Skill (`~/.claude/skills/publish-rfc/SKILL.md`)

- Skill definition with trigger description
- RFC generation instructions (template, section rules, source priority)
- State management logic (read/write `rfc-state.json`, `rfc-config.json`)
- Curl commands for Apps Script communication

### 2. Google Apps Script Web App

- `doPost()` handler — accepts markdown + metadata, creates or updates a Google Doc
- Markdown-to-Google-Docs formatting (headings, code blocks, tables, checkboxes)
- Returns JSON with docId and URL
- `doGet()` handler — reads doc content as markdown (stubbed for v2 doc-to-code sync)

### 3. Post-Commit Hook (optional, opt-in)

- Shell script registered under `Stop` event in `settings.json`
- Checks `rfc-config.json` for `postCommitReminder: true`
- Checks if current branch exists in `rfc-state.json`
- Checks if `lastSyncCommit` is behind HEAD
- Returns reminder message if out of date

## v2 / Future Work (Stubbed)

- **Doc-to-code sync** — Read feedback/edits from the Google Doc, identify changes, and implement them in code. The Apps Script `doGet()` endpoint is prepared for this.
- **MCP server extraction** — If Google Docs tools prove useful beyond RFC publishing, extract the curl calls into a dedicated MCP server for reuse.
- **Doc commenting** — Post inline comments on the Google Doc for review threads.
- **Folder organization** — Auto-organize docs into a shared Google Drive folder per repo.
