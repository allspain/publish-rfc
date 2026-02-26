---
name: publish-rfc
description: Use when publishing or updating an RFC document to Google Docs from the current branch's code changes and planning docs. Also use when linking an existing Google Doc to the current branch, enabling/disabling post-commit RFC reminders, or when user says "update the RFC doc."
user_invocable: true
---

# publish-rfc

Generate an RFC document from the current branch's code changes and planning artifacts, then publish or update it in Google Docs — or save it as a local markdown file.

## Prerequisites

Install the skill file:
```bash
mkdir -p ~/.claude/skills/publish-rfc
curl -fsSL https://raw.githubusercontent.com/allspain/publish-rfc/master/skill/SKILL.md \
  -o ~/.claude/skills/publish-rfc/SKILL.md
```

Then run `/publish-rfc init` in any project to complete setup.

**For Google Docs publishing** (optional — the skill works in markdown-only mode without this):
- `gcloud` CLI installed ([cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install))
- Authenticated with a Google account that has access to Google Docs: `gcloud auth login`
- Google Docs API and Google Drive API enabled on a GCP project linked to your account
- A quota project set: `gcloud auth application-default set-quota-project <PROJECT_ID>`

## Invocation Modes

### 1. `/publish-rfc` — Generate/update RFC for current branch

### 2. `/publish-rfc init` — First-time setup and project initialization

Run through each step in order, skipping any that are already done.

**Step A: Check for `gcloud` CLI**

Run `gcloud --version`. If not found, tell the user to install it from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install) and run `/publish-rfc init` again.

If not found, ask: "Do you want to set up in markdown-only mode instead? You can add Google Docs publishing later."

If the user chooses markdown-only, skip to Step D with `publishMode` set to `"markdown-only"`.

**Step B: Check Google authentication**

Run `gcloud auth print-access-token 2>/dev/null`. If this fails, tell the user:

> "Run this in your terminal to authenticate with Google:"
> ```bash
> gcloud auth login
> ```
> "Then run `/publish-rfc init` again."

Stop here — auth requires a browser interaction.

**Step C: Verify API access**

Test that the Google Drive API is accessible:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://www.googleapis.com/drive/v3/about?fields=user"
```

If this returns `403`, the user likely needs to enable the Drive API or set a quota project. Tell them:

> "The Google Drive API returned 403. You may need to:"
> 1. Enable the **Google Drive API** and **Google Docs API** in your GCP project
> 2. Set a quota project: `gcloud auth application-default set-quota-project <PROJECT_ID>`
>
> "Then run `/publish-rfc init` again."

If this returns `200`, proceed.

**Step D: Initialize project config**

1. Find the project root: `git rev-parse --show-toplevel`
2. Create `.claude/` directory if it doesn't exist
3. Create `.claude/rfc-config.json` if it doesn't exist:
   ```json
   {
     "publishMode": "google-docs",
     "postCommitReminder": false
   }
   ```
   Use `"markdown-only"` for `publishMode` if the user skipped gcloud setup.
4. If `publishMode` is `"google-docs"`, ask the user for their GCP quota project ID and add it:
   ```json
   {
     "publishMode": "google-docs",
     "quotaProject": "<project-id>",
     "postCommitReminder": false
   }
   ```
5. Confirm: "Setup complete. You can now run `/publish-rfc` to generate an RFC for the current branch."

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

Read `.claude/rfc-config.json` from the project root (the git repo root). If it doesn't exist, stop and tell the user to run `/publish-rfc init`.

If `publishMode` is `"google-docs"`, verify gcloud auth still works:
```bash
gcloud auth print-access-token 2>/dev/null
```
If this fails, warn the user and fall back to markdown-only for this run:
> "gcloud auth expired. Falling back to markdown-only. Run `gcloud auth login` to re-authenticate."

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

**Branch:** `<branch-name>`

**Last updated:** <today's date>

**PR:** [PR #<number>](<github-pr-url>) (omit if no PR exists)

## Summary

<1-2 paragraph overview of what this branch does and why>

## Motivation

<Why this change exists. What problem does it solve? What is the current state
and why is it insufficient? Derive from planning docs, PR description, commit
messages — but VERIFY every claim against the actual code (see Verification Rules below).>

## Solution

### Approach

<High-level description of the approach taken>

### Architecture

<Component breakdown, data flow. Derive from actual code changes.>

### Schema

<If the change introduces or modifies types/interfaces/APIs, show the actual
type definitions as code blocks copied from the source. Do NOT paraphrase or
summarize types — use the exact field names, types, and nesting from the code.
Each schema entry should have a description line, then a BLANK LINE, then the
fenced code block, then a BLANK LINE after the closing fence.>

Example format:

The `RumSoftNavigationEntry` interface added in `packages/rum-core/src/browser/performanceObservable.ts`:

```typescript
export interface RumSoftNavigationEntry {
  entryType: RumPerformanceEntryType.SOFT_NAVIGATION
  name: string
}
```

### Key Files

<List modified/added files. If a PR exists, link each file to its SPECIFIC diff in the PR.
GitHub PR file diff URLs use the format:
  PR_URL/files#diff-<sha256-of-filepath>
To compute the hash for each file path, run:
  echo -n "path/to/file.ts" | shasum -a 256 | cut -d' ' -f1
Then construct the link as: PR_URL/files#diff-<that-hash>
Code references within the description should be in backticks.>

- **[`path/to/file.ts`](PR_URL/files#diff-HASH)** — Description mentioning `relevantFunction()`
- **[`path/to/other.ts`](PR_URL/files#diff-HASH)** — Description

<If no PR exists, fall back to bold without links:>

- **`path/to/file.ts`** — Description mentioning `relevantFunction()`
- **`path/to/other.ts`** — Description

## Alternatives Considered

<Only include if planning docs contain alternatives. Otherwise omit this section entirely.>

## Testing

<What test coverage exists. Derive from test files in the diff.>

## Implementation Phases

<Derive from: GSD phases, superpowers plans, or diff analysis (in that priority order).
Mark completed phases based on what code exists on the branch.
IMPORTANT: Rewrite phase names into plain, human-readable descriptions. Strip any
tooling-specific identifiers (phase numbers like "Phase 72", requirement IDs like
"TYPE-01", agent names, skill references). A reader who has never used Claude, GSD,
or superpowers should understand every line.>

- [x] <Plain description of what was built, e.g. "Add soft navigation detection listener">
- [x] <Another completed phase>
- [ ] <Upcoming work, e.g. "Wire detection results into view telemetry">

## Open Questions

<Any unresolved decisions, risks, or areas needing feedback. Omit if none.>

## Future Work

<Derive from planning docs, TODO/FIXME comments, or omit if nothing obvious.>

## References

<Links to PRs, issues, planning docs, external resources mentioned in code/docs.>
```

**Rules:**
- Summary, Motivation, Solution sections are ALWAYS generated.
- Alternatives Considered: only if planning docs contain them.
- Open Questions, Future Work, References: best-effort from available artifacts.
- Implementation Phases: derive from GSD phases, superpowers plans, or diff analysis — but rewrite into plain human-readable descriptions. Strip all tooling jargon (phase numbers, requirement IDs, agent names). Do NOT include a "Requirements Traceability" section.
- Do NOT use markdown tables (`| col | col |`). They render poorly in Google Docs. Use bold labels with bullet lists instead.
- Be thorough but concise. Match the tone of a senior engineer writing for other senior engineers.
- Wrap URLs, URL paths, file paths, function names, variable names, type names, field names, CLI commands, and any code references in backticks (`` ` ``). For example: `https://example.com/api/v1`, `/src/utils/helper.ts`, `handleClick()`, `is_active`, `RumViewEvent`.
- Each header metadata field (Status, Branch, Last updated, PR) MUST be on its own line, separated by blank lines so they render as separate paragraphs — not one run-on line.
- PR links MUST use markdown link syntax: `[PR #123](https://github.com/...)` — not a raw URL.
- Always put a blank line before and after fenced code blocks (```). Without blank lines, code blocks merge visually with surrounding text in Google Docs.
- In the Key Files section, file paths in backticks must be visually distinct from the description. Use an em-dash ` — ` (not a hyphen) to separate the path from the description.

### Step 4b: Verify accuracy before publishing

This step is CRITICAL. The generated RFC must be factually accurate. Before proceeding to publish, verify every substantive claim:

**Motivation/Problem section:**
- Read the actual source code referenced in the diff to confirm the "current state" description is correct.
- If the RFC says "the system cannot do X" or "there is no way to Y", verify by searching the codebase. Do not assume limitations — confirm them.
- If the RFC says "X works by doing Y", read the code to confirm that's how it actually works.

**Schema/Type section:**
- Copy type definitions and field names directly from the source code. Do not paraphrase or rename fields.
- If the RFC says "added field `foo` to type `Bar`", open the actual file and confirm the field name, type, and location.
- Show types as code blocks with the exact syntax from the source.

**Architecture section:**
- Verify that described data flows match the actual code. If the RFC says "component A calls B", confirm A actually calls B in the diff.
- Verify file paths and function names are correct.

**If any claim cannot be verified from the code, either:**
1. Remove it
2. Rewrite it based on what the code actually shows
3. Flag it as "Unverified: ..." for the author to confirm

Do NOT proceed to publishing until verification is complete.

### Step 5: Save markdown and publish

**Always: Save the markdown file**

Write the generated RFC markdown to `<project-root>/.claude/rfc-output.md`.

Print: "Saved RFC markdown to `.claude/rfc-output.md`"

**If `publishMode` is `"markdown-only"` or gcloud auth is unavailable, stop here.** The markdown file is the deliverable. Skip to Step 7.

**If `publishMode` is `"google-docs"`: Publish via Google Drive API**

Convert the RFC markdown to an HTML document with inline styles for Google Docs compatibility. Use these styles:

- `<h1>` — `style="font-size: 24pt; font-weight: bold;"`
- `<h2>` — `style="font-size: 18pt; font-weight: bold;"`
- `<h3>` — `style="font-size: 14pt; font-weight: bold;"`
- `<code>` (inline) — `style="font-family: 'Roboto Mono', monospace; font-size: 9pt; background-color: #f0f0f0; padding: 2px 4px;"`
- `<pre>` (code blocks) — `style="font-family: 'Roboto Mono', monospace; font-size: 9pt; background-color: #f5f5f5; padding: 12px; margin: 12px 0; border-radius: 4px; white-space: pre-wrap;"`
- `<a>` links — `style="color: #1a73e8;"`
- Bold — `<strong>`
- Each metadata field (Status, Branch, Last updated, PR) as a separate `<p>` tag
- Checkboxes — use &#9745; (checked) and &#9744; (unchecked) HTML entities
- Wrap everything in `<html><body>...</body></html>`

Write the HTML to `/tmp/rfc-publish.html`.

Read the `quotaProject` from `.claude/rfc-config.json`. Build the quota project header: `-H "x-goog-user-project: <quotaProject>"`. If no `quotaProject` is set, omit this header.

**For CREATE (no existing doc):**

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -X POST \
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: <quotaProject>" \
  -F "metadata={\"name\":\"RFC: <Title>\",\"mimeType\":\"application/vnd.google-apps.document\"};type=application/json;charset=UTF-8" \
  -F "file=@/tmp/rfc-publish.html;type=text/html"
```

Parse the JSON response to extract `id` (the docId) and `webViewLink` (the doc URL).

**For UPDATE (existing doc):**

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -X PATCH \
  "https://www.googleapis.com/upload/drive/v3/files/<docId>?uploadType=media&fields=id,webViewLink" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: <quotaProject>" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/rfc-publish.html
```

If the API returns an error, print the error and tell the user: "Google Docs publishing failed. The RFC markdown is still available at `.claude/rfc-output.md`."

### Step 6: Update local state

Only update state if Google Docs publishing succeeded (skip for markdown-only mode).

Update `.claude/rfc-state.json` with the document info:

```json
{
  "<branch-name>": {
    "docUrl": "<webViewLink-from-response>",
    "docId": "<id-from-response>",
    "lastSyncCommit": "<current-HEAD-sha>",
    "repo": "<repo-name>"
  }
}
```

For CREATE, use the `id` and `webViewLink` from the API response. For UPDATE, preserve the existing URL and update `lastSyncCommit`.

If the file already has entries for other branches, preserve them.

### Step 7: Report to user

Print:
- For Google Docs CREATE: "Published RFC: <doc-url>"
- For Google Docs UPDATE: "Updated RFC: <doc-url> (synced to <short-sha>)"
- For markdown-only: "RFC saved to `.claude/rfc-output.md`"

## Post-Commit Reminder (Opt-In)

When `postCommitReminder` is `true` in the config and the skill detects it was invoked after a commit-related action:

1. Check if current branch has an entry in `rfc-state.json`
2. If yes, check if `lastSyncCommit` matches HEAD
3. If behind, suggest: "The RFC doc for this branch is out of date. Want me to update it?"

This check is passive — it only reminds, never auto-publishes.

## Error Handling

- If config is missing, tell the user to run `/publish-rfc init`.
- If `gcloud auth print-access-token` fails, fall back to markdown-only and suggest: `gcloud auth login`
- If the Drive API returns `403`, check if the quota project is set. Suggest: `gcloud auth application-default set-quota-project <PROJECT_ID>` and verify that the Google Drive API and Google Docs API are enabled in the GCP project.
- If the Drive API returns `404` on UPDATE, the doc may have been deleted. Tell the user and offer to create a new one.
- If git commands fail (e.g., no `main` branch), explain what happened and ask the user for the correct base branch.
