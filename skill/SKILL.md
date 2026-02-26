---
name: publish-rfc
description: Use when publishing or updating an RFC document to Google Docs, as a GitHub PR comment, or as a local markdown file. Also use when linking an existing Google Doc to the current branch, enabling/disabling post-commit RFC reminders, or when user says "update the RFC doc."
user_invocable: true
---

# publish-rfc

Generate an RFC document from the current branch's code changes and planning artifacts, then publish or update it in Google Docs, as a GitHub PR comment, or as a local markdown file.

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
- Authenticated with a Google account that has access to Google Docs
- Google Docs API and Google Drive API enabled on a GCP project linked to your account
- A quota project set: `gcloud auth application-default set-quota-project <PROJECT_ID>`

### Obtaining an access token

The skill supports two gcloud credential methods. The `authMethod` field in `.claude/rfc-config.json` controls which is used:

- `"gcloud-adc"` (recommended) — Application Default Credentials: `gcloud auth application-default print-access-token`
- `"gcloud-user"` — User credentials: `gcloud auth print-access-token`

**Resolution order** (used everywhere the skill needs a token):

1. Read `authMethod` from `.claude/rfc-config.json`
2. If `"gcloud-adc"`, run `gcloud auth application-default print-access-token 2>/dev/null`
3. If `"gcloud-user"` (or `authMethod` is absent), run `gcloud auth print-access-token 2>/dev/null`
4. If the chosen method fails, try the other method as a fallback
5. If both fail, fall back to markdown-only and tell the user to re-authenticate

**Why ADC is recommended:** `gcloud auth login` tokens often lack Drive/Docs API scopes unless `--enable-gdrive-access` is passed. Application Default Credentials (`gcloud auth application-default login`) are scoped more broadly and work reliably with the Drive API.

When the skill instructions say "get an access token" or show `TOKEN=$(gcloud auth print-access-token)`, always use this resolution logic instead of the literal command.

## Invocation Modes

### 1. `/publish-rfc` — Generate/update RFC for current branch

### 2. `/publish-rfc init` — First-time setup and project initialization

Run through each step in order, skipping any that are already done.

**Step A: Check for `gcloud` CLI**

Run `gcloud --version`. If not found, tell the user to install it from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install) and run `/publish-rfc init` again.

If not found, ask: "Do you want to set up in markdown-only mode instead? You can add Google Docs publishing later."

If the user chooses markdown-only, skip to Step D with `publishMode` set to `"markdown-only"`.

**Step B: Check Google authentication and determine auth method**

Try both credential methods and pick the one that works with the Drive API. Test ADC first (recommended), then fall back to user credentials:

```bash
# Try ADC first
ADC_TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null)
if [ -n "$ADC_TOKEN" ]; then
  ADC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ADC_TOKEN" \
    "https://www.googleapis.com/drive/v3/about?fields=user")
fi

# Try user credentials
USER_TOKEN=$(gcloud auth print-access-token 2>/dev/null)
if [ -n "$USER_TOKEN" ]; then
  USER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $USER_TOKEN" \
    "https://www.googleapis.com/drive/v3/about?fields=user")
fi
```

**If ADC returns 200:** Set `authMethod` to `"gcloud-adc"` and proceed to Step D.

**If only user credentials return 200:** Set `authMethod` to `"gcloud-user"` and proceed to Step D.

**If neither returns 200 but tokens were obtained (401/403):**

The tokens exist but lack Drive API access. Tell the user:

> "Your gcloud credentials don't have Google Drive access. Run one of these to fix it:"
>
> **Option 1 (recommended):** Application Default Credentials
> ```bash
> gcloud auth application-default login
> gcloud auth application-default set-quota-project <YOUR_GCP_PROJECT_ID>
> ```
>
> **Option 2:** User credentials with Drive scope
> ```bash
> gcloud auth login --enable-gdrive-access
> ```
>
> "Also ensure the **Google Drive API** and **Google Docs API** are enabled in your GCP project."
>
> "Then run `/publish-rfc init` again."

Stop here — auth requires a browser interaction.

**If no tokens at all:** Tell the user:

> "No gcloud credentials found. Run this to authenticate:"
> ```bash
> gcloud auth application-default login
> ```
> "Then run `/publish-rfc init` again."

Stop here.

**Step C: Check GitHub CLI (for `github-pr` mode)**

Verify that `gh` is installed and authenticated:

```bash
gh auth status 2>/dev/null
```

If `gh` is not found or not authenticated, note this — `github-pr` mode won't be available.

**Step D: Initialize project config**

1. Find the project root: `git rev-parse --show-toplevel`
2. Create `.claude/` directory if it doesn't exist
3. Create `.claude/rfc-config.json` if it doesn't exist:
   ```json
   {
     "authMethod": "gcloud-adc",
     "postCommitReminder": false
   }
   ```
   Set `authMethod` to whichever method succeeded in Step B (`"gcloud-adc"` or `"gcloud-user"`). Omit if gcloud is not set up.
4. If gcloud auth succeeded, ask the user for their GCP quota project ID and add it:
   ```json
   {
     "authMethod": "gcloud-adc",
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

### Step 1: Read configuration and choose publish destination

Read `.claude/rfc-config.json` from the project root (the git repo root). If it doesn't exist, stop and tell the user to run `/publish-rfc init`.

**Prompt the user for where to publish.** Use the AskUserQuestion tool to ask:

> "Where should I publish the RFC?"

Offer these options (only show options that are available based on tooling):

- **Google Docs** — Publish to a Google Doc (only if gcloud auth works)
- **PR Comment** — Post as a comment on the PR (only if `gh` is available and a PR exists for this branch)
- **Markdown only** — Save to `.claude/rfc-output.md`

For Google Docs: obtain an access token using the resolution logic from "Obtaining an access token" above (check `authMethod` in config, try primary method, fall back to the other). If both methods fail, remove this option from the prompt.

For PR Comment: check if `gh auth status` succeeds and `gh pr view` finds a PR. If either fails, remove this option from the prompt.

If only one option is available, skip the prompt and use it automatically.

### Step 2: Check for existing doc/comment

Read `.claude/rfc-state.json` from the project root. Check if the current branch has an entry. If yes, this is an UPDATE. If no, this is a CREATE.

For Google Docs: look for `docId`/`docUrl` in the entry.
For PR Comment: look for `commentId`/`prNumber` in the entry.

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

## Alternatives Considered

<Only include if planning docs contain alternatives. Otherwise omit this section entirely.>

## Testing

<What test coverage exists. Derive from test files in the diff.>

## Implementation Phases

<ONLY include this section if Status is "Draft" or "In Progress". OMIT entirely for "Complete" RFCs.

Derive from the commit history on the branch (`git log --oneline main..HEAD`). Each commit
becomes a phase entry. Use the commit message as the phase description — rewrite into plain,
human-readable language if needed. Mark commits that exist on the branch as completed.
If there is planned work not yet committed, add unchecked entries for upcoming steps.>

- [x] <Description derived from commit, e.g. "Add soft navigation detection listener">
- [x] <Another committed change>
- [ ] <Upcoming work not yet committed>

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
- Implementation Phases: ONLY include when Status is "Draft" or "In Progress" — OMIT entirely for "Complete" RFCs. When included, derive from the commit history on the branch (`git log --oneline main..HEAD`), not from planning artifacts. Each commit becomes a phase entry.
- Do NOT use markdown tables (`| col | col |`). They render poorly in Google Docs. Use bold labels with bullet lists instead.
- Be thorough but concise. Match the tone of a senior engineer writing for other senior engineers.
- Wrap URLs, URL paths, file paths, function names, variable names, type names, field names, CLI commands, and any code references in backticks (`` ` ``). For example: `https://example.com/api/v1`, `/src/utils/helper.ts`, `handleClick()`, `is_active`, `RumViewEvent`.
- Each header metadata field (Status, Branch, Last updated, PR) MUST be on its own line, separated by blank lines so they render as separate paragraphs — not one run-on line.
- PR links MUST use markdown link syntax: `[PR #123](https://github.com/...)` — not a raw URL.
- Always put a blank line before and after fenced code blocks (```). Without blank lines, code blocks merge visually with surrounding text in Google Docs.

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

**If any claim cannot be verified from the code, either:**
1. Remove it
2. Rewrite it based on what the code actually shows
3. Flag it as "Unverified: ..." for the author to confirm

Do NOT proceed to publishing until verification is complete.

### Step 5: Save markdown and publish

**Always: Save the markdown file**

Write the generated RFC markdown to `<project-root>/.claude/rfc-output.md`. This file is a local working file, not committed by default. Ensure it is excluded from git by adding `.claude/rfc-output.md` to `.git/info/exclude` (the local-only gitignore that is never committed) if not already present.

Print: "Saved RFC markdown to `.claude/rfc-output.md`"

**If user chose "Markdown only", stop here.** The markdown file is the deliverable. Skip to Step 7.

**If user chose "PR Comment": Publish as a PR comment**

This mode posts the RFC markdown directly as a comment on the branch's PR. GitHub renders the markdown natively.

Find the PR for the current branch:

```bash
PR_NUMBER=$(gh pr view --json number -q '.number' 2>/dev/null)
```

Prepend a marker comment to the body so subsequent updates can find and replace it:

```
<!-- rfc-publish: <branch-name> -->
```

**For CREATE (no existing comment):**

Check `rfc-state.json` for a `commentId` for this branch. If none exists:

```bash
gh pr comment $PR_NUMBER --body-file /tmp/rfc-pr-comment.md
```

(Write the marker + RFC markdown to `/tmp/rfc-pr-comment.md` first.)

After creating the comment, retrieve the comment ID:

```bash
COMMENT_ID=$(gh api repos/<owner>/<repo>/issues/$PR_NUMBER/comments \
  --jq '[.[] | select(.body | test("rfc-publish: <branch-name>")) | .id] | last')
```

**For UPDATE (existing comment):**

If `rfc-state.json` has a `commentId` for this branch, update the existing comment:

```bash
gh api repos/<owner>/<repo>/issues/comments/$COMMENT_ID \
  -X PATCH \
  -f body=@/tmp/rfc-pr-comment.md
```

If the update returns a 404 (comment was deleted), fall back to CREATE.

If the API returns an error, print the error and tell the user: "PR comment publishing failed. The RFC markdown is still available at `.claude/rfc-output.md`."

**If user chose "Google Docs": Publish via Google Drive API**

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

**Document title:** Extract the RFC title from the `# RFC: <Title>` heading in the generated markdown. Use this as the Google Doc document name (the `name` field in Drive API metadata). For example, if the heading is `# RFC: Remove FID Tracking`, the document name should be `RFC: Remove FID Tracking`.

**For CREATE (no existing doc):**

Obtain a token using the "Obtaining an access token" resolution logic above, then:

```bash
curl -s -X POST \
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: <quotaProject>" \
  -F "metadata={\"name\":\"<extracted-title>\",\"mimeType\":\"application/vnd.google-apps.document\"};type=application/json;charset=UTF-8" \
  -F "file=@/tmp/rfc-publish.html;type=text/html"
```

Parse the JSON response to extract `id` (the docId) and `webViewLink` (the doc URL).

**For UPDATE (existing doc):**

Obtain a token using the "Obtaining an access token" resolution logic above. First, update the document content:

```bash
curl -s -X PATCH \
  "https://www.googleapis.com/upload/drive/v3/files/<docId>?uploadType=media&fields=id,webViewLink" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: <quotaProject>" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/rfc-publish.html
```

Then update the document title (in case the RFC title changed):

```bash
curl -s -X PATCH \
  "https://www.googleapis.com/drive/v3/files/<docId>?fields=name" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-user-project: <quotaProject>" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"<extracted-title>\"}"
```

If the API returns an error, print the error and tell the user: "Google Docs publishing failed. The RFC markdown is still available at `.claude/rfc-output.md`."

### Step 6: Update local state

Only update state if publishing succeeded (skip for markdown-only mode).

Update `.claude/rfc-state.json` with the document info.

**For Google Docs:**

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

**For PR Comment:**

```json
{
  "<branch-name>": {
    "commentId": "<comment-id>",
    "prNumber": <pr-number>,
    "lastSyncCommit": "<current-HEAD-sha>",
    "repo": "<repo-name>"
  }
}
```

For CREATE, store the comment ID retrieved after posting. For UPDATE, preserve the existing comment ID and update `lastSyncCommit`.

If the file already has entries for other branches, preserve them.

### Step 7: Report to user

Print:
- For Google Docs CREATE: "Published RFC: <doc-url>"
- For Google Docs UPDATE: "Updated RFC: <doc-url> (synced to <short-sha>)"
- For PR Comment CREATE: "Published RFC as PR comment: <comment-url>"
- For PR Comment UPDATE: "Updated RFC PR comment: <comment-url> (synced to <short-sha>)"
- For markdown-only: "RFC saved to `.claude/rfc-output.md`"

## Post-Commit Reminder (Opt-In)

When `postCommitReminder` is `true` in the config and the skill detects it was invoked after a commit-related action:

1. Check if current branch has an entry in `rfc-state.json`
2. If yes, check if `lastSyncCommit` matches HEAD
3. If behind, suggest: "The RFC doc for this branch is out of date. Want me to update it?"

This check is passive — it only reminds, never auto-publishes.

## Error Handling

- If config is missing, tell the user to run `/publish-rfc init`.
- If both auth methods fail (ADC and user credentials), fall back to markdown-only and suggest: `gcloud auth application-default login` (for ADC) or `gcloud auth login --enable-gdrive-access` (for user credentials).
- If the Drive API returns `401`, the token lacks required scopes. Try the other auth method. If both fail, suggest re-authenticating with `gcloud auth application-default login`.
- If the Drive API returns `403`, check if the quota project is set. Suggest: `gcloud auth application-default set-quota-project <PROJECT_ID>` and verify that the Google Drive API and Google Docs API are enabled in the GCP project.
- If the Drive API returns `404` on UPDATE, the doc may have been deleted. Tell the user and offer to create a new one.
- If git commands fail (e.g., no `main` branch), explain what happened and ask the user for the correct base branch.
