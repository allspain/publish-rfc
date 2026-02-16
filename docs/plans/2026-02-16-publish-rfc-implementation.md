# publish-rfc Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code skill that generates RFC documents from branch code changes and publishes them to Google Docs via an Apps Script web app.

**Architecture:** A Claude Code skill orchestrates RFC generation (analyzing git diff + planning docs), POSTs markdown to a Google Apps Script web app that handles auth and doc creation/updating, and maintains local state mapping branches to doc URLs.

**Tech Stack:** Claude Code Skill (Markdown), Google Apps Script (JavaScript), Shell (hook script), curl (HTTP calls)

---

### Task 1: Create Apps Script — Markdown-to-Google-Docs Converter

**Files:**
- Create: `apps-script/Code.gs`

**Step 1: Write the Apps Script code**

Create the full Apps Script with doPost/doGet handlers and markdown parsing:

```javascript
// ============================================================
// publish-rfc Google Apps Script Web App
// ============================================================
// Endpoints:
//   POST ?action=create  — create new Google Doc from markdown
//   POST ?action=update  — update existing Google Doc by ID
//   GET  ?action=read    — read doc content (stubbed for v2)
// ============================================================

var API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY') || '';

function doPost(e) {
  try {
    var params = e.parameter;
    var body = JSON.parse(e.postData.contents);

    // API key check
    if (API_KEY && body.apiKey !== API_KEY) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    var action = params.action || body.action || 'create';

    if (action === 'create') {
      return handleCreate(body);
    } else if (action === 'update') {
      return handleUpdate(body);
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack }, 500);
  }
}

function doGet(e) {
  var params = e.parameter;

  if (API_KEY && params.apiKey !== API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  var action = params.action || 'read';

  if (action === 'read' && params.docId) {
    return handleRead(params.docId);
  }

  return jsonResponse({ error: 'Provide ?action=read&docId=...' }, 400);
}

// ---- Handlers ----

function handleCreate(body) {
  var markdown = body.markdown || '';
  var title = body.title || 'Untitled RFC';
  var metadata = body.metadata || {};

  var doc = DocumentApp.create(title);
  var docBody = doc.getBody();

  // Clear default empty paragraph
  docBody.clear();

  // Parse and render markdown
  renderMarkdown(docBody, markdown);

  // Add metadata as document properties
  var props = PropertiesService.getDocumentProperties();
  if (metadata.branch) props.setProperty('rfc_branch', metadata.branch);
  if (metadata.repo) props.setProperty('rfc_repo', metadata.repo);

  doc.saveAndClose();

  return jsonResponse({
    docId: doc.getId(),
    docUrl: doc.getUrl(),
    title: doc.getName()
  });
}

function handleUpdate(body) {
  var docId = body.docId;
  var markdown = body.markdown || '';
  var metadata = body.metadata || {};

  if (!docId) {
    return jsonResponse({ error: 'docId is required for update' }, 400);
  }

  var doc = DocumentApp.openById(docId);
  var docBody = doc.getBody();

  // Clear all content
  docBody.clear();

  // Re-render from markdown
  renderMarkdown(docBody, markdown);

  // Update metadata
  var props = PropertiesService.getDocumentProperties();
  if (metadata.branch) props.setProperty('rfc_branch', metadata.branch);
  if (metadata.repo) props.setProperty('rfc_repo', metadata.repo);
  if (metadata.lastSyncCommit) props.setProperty('rfc_lastSyncCommit', metadata.lastSyncCommit);

  doc.saveAndClose();

  return jsonResponse({
    docId: doc.getId(),
    docUrl: doc.getUrl(),
    title: doc.getName()
  });
}

function handleRead(docId) {
  // v2 stub — returns basic doc info for now
  try {
    var doc = DocumentApp.openById(docId);
    var props = PropertiesService.getDocumentProperties();
    return jsonResponse({
      docId: doc.getId(),
      docUrl: doc.getUrl(),
      title: doc.getName(),
      metadata: {
        branch: props.getProperty('rfc_branch') || '',
        repo: props.getProperty('rfc_repo') || '',
        lastSyncCommit: props.getProperty('rfc_lastSyncCommit') || ''
      },
      body: 'v2: full markdown export not yet implemented'
    });
  } catch (err) {
    return jsonResponse({ error: 'Could not open doc: ' + err.message }, 404);
  }
}

// ---- Markdown Renderer ----

function renderMarkdown(body, markdown) {
  var lines = markdown.split('\n');
  var i = 0;
  var inCodeBlock = false;
  var codeBlockLines = [];
  var inTable = false;
  var tableRows = [];

  while (i < lines.length) {
    var line = lines[i];

    // Fenced code block toggle
    if (line.match(/^```/)) {
      if (inCodeBlock) {
        // End code block — render accumulated lines
        var codePara = body.appendParagraph(codeBlockLines.join('\n'));
        codePara.setFontFamily('Roboto Mono');
        codePara.setFontSize(9);
        codePara.setBackgroundColor('#f5f5f5');
        codePara.setLineSpacing(1.15);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      i++;
      continue;
    }

    // Flush table if we're leaving table context
    if (inTable && !line.match(/^\|/)) {
      renderTable(body, tableRows);
      tableRows = [];
      inTable = false;
    }

    // Table rows
    if (line.match(/^\|/)) {
      // Skip separator rows like |---|---|
      if (!line.match(/^\|[\s\-:]+\|/)) {
        var cells = line.split('|').filter(function(c) { return c.trim() !== ''; });
        cells = cells.map(function(c) { return c.trim(); });
        tableRows.push(cells);
      }
      inTable = true;
      i++;
      continue;
    }

    // Headings
    var headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      var text = headingMatch[2];
      var para = body.appendParagraph(text);

      if (level === 1) {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      } else if (level === 2) {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      } else if (level === 3) {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING3);
      } else if (level === 4) {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING4);
      } else if (level === 5) {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING5);
      } else {
        para.setHeading(DocumentApp.ParagraphHeading.HEADING6);
      }

      applyInlineFormatting(para);
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+\s*$/) || line.match(/^\*\*\*+\s*$/)) {
      body.appendHorizontalRule();
      i++;
      continue;
    }

    // Checkbox list items
    var checkboxMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)/);
    if (checkboxMatch) {
      var checked = checkboxMatch[2] !== ' ';
      var itemText = (checked ? '\u2611 ' : '\u2610 ') + checkboxMatch[3];
      var listItem = body.appendListItem(itemText);
      listItem.setGlyphType(DocumentApp.GlyphType.BULLET);
      applyInlineFormatting(listItem);
      i++;
      continue;
    }

    // Bullet list items
    var bulletMatch = line.match(/^(\s*)-\s+(.*)/);
    if (bulletMatch) {
      var listItem = body.appendListItem(bulletMatch[2]);
      listItem.setGlyphType(DocumentApp.GlyphType.BULLET);
      // Handle nesting based on indent
      var indent = bulletMatch[1].length;
      if (indent >= 4) listItem.setNestingLevel(2);
      else if (indent >= 2) listItem.setNestingLevel(1);
      applyInlineFormatting(listItem);
      i++;
      continue;
    }

    // Numbered list items
    var numberedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (numberedMatch) {
      var listItem = body.appendListItem(numberedMatch[2]);
      listItem.setGlyphType(DocumentApp.GlyphType.NUMBER);
      applyInlineFormatting(listItem);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      body.appendParagraph('');
      i++;
      continue;
    }

    // Regular paragraph
    var para = body.appendParagraph(line);
    applyInlineFormatting(para);
    i++;
  }

  // Flush remaining table
  if (inTable && tableRows.length > 0) {
    renderTable(body, tableRows);
  }
}

function renderTable(body, rows) {
  if (rows.length === 0) return;

  var maxCols = rows.reduce(function(max, row) {
    return Math.max(max, row.length);
  }, 0);

  // Pad rows to same length
  rows = rows.map(function(row) {
    while (row.length < maxCols) row.push('');
    return row;
  });

  var table = body.appendTable(rows);

  // Style header row (first row bold)
  if (rows.length > 0) {
    var headerRow = table.getRow(0);
    for (var c = 0; c < headerRow.getNumCells(); c++) {
      headerRow.getCell(c).editAsText().setBold(true);
    }
  }

  // Set table style
  table.setBorderColor('#cccccc');
}

function applyInlineFormatting(element) {
  var text = element.editAsText();
  var content = text.getText();

  // Bold: **text**
  var boldRegex = /\*\*(.+?)\*\*/g;
  var match;
  while ((match = boldRegex.exec(content)) !== null) {
    var start = match.index;
    var boldText = match[1];
    // Remove the ** markers and apply bold
    text.deleteText(start, start + 1); // first **
    content = text.getText();
    var end = content.indexOf('**', start);
    if (end >= 0) {
      text.deleteText(end, end + 1);
      content = text.getText();
      text.setBold(start, end - 1, true);
    }
    // Reset regex since content changed
    boldRegex.lastIndex = 0;
    content = text.getText();
  }

  // Inline code: `text`
  content = text.getText();
  var codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(content)) !== null) {
    var start = match.index;
    text.deleteText(start, start); // first backtick
    content = text.getText();
    var end = content.indexOf('`', start);
    if (end >= 0) {
      text.deleteText(end, end);
      content = text.getText();
      text.setFontFamily(start, end - 1, 'Roboto Mono');
      text.setFontSize(start, end - 1, 9);
      text.setBackgroundColor(start, end - 1, '#f0f0f0');
    }
    codeRegex.lastIndex = 0;
    content = text.getText();
  }

  // Links: [text](url)
  content = text.getText();
  var linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(content)) !== null) {
    var fullMatch = match[0];
    var linkText = match[1];
    var url = match[2];
    var start = match.index;

    // Replace [text](url) with just text
    text.deleteText(start, start + fullMatch.length - 1);
    text.insertText(start, linkText);
    content = text.getText();

    // Apply link
    text.setLinkUrl(start, start + linkText.length - 1, url);
    text.setForegroundColor(start, start + linkText.length - 1, '#1a73e8');

    linkRegex.lastIndex = 0;
    content = text.getText();
  }
}

// ---- Utilities ----

function jsonResponse(data, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
```

**Step 2: Commit**

```bash
git add apps-script/Code.gs
git commit -m "feat: add Apps Script web app for Google Docs RFC management"
```

---

### Task 2: Create Apps Script Deployment Guide

**Files:**
- Create: `apps-script/README.md`

**Step 1: Write deployment instructions**

```markdown
# Apps Script Deployment Guide

## First-Time Setup

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Replace the contents of `Code.gs` with the code from this directory
4. (Optional) Set an API key:
   - Go to **Project Settings** (gear icon)
   - Scroll to **Script Properties**
   - Add property: Key = `API_KEY`, Value = `<your-secret-key>`
5. Click **Deploy** > **New deployment**
6. Select type: **Web app**
7. Set:
   - Description: `publish-rfc v1`
   - Execute as: **Me**
   - Who has access: **Anyone** (or **Anyone with Google account** for more security)
8. Click **Deploy**
9. Copy the **Web app URL** — you'll need this for the skill config
10. When prompted, authorize the app to access Google Docs on your behalf

## Updating the Script

1. Edit `Code.gs` in the Apps Script editor
2. Click **Deploy** > **Manage deployments**
3. Click the edit (pencil) icon on your deployment
4. Set version to **New version**
5. Click **Deploy**

## Testing

### Create a doc:
```bash
curl -X POST 'YOUR_APPS_SCRIPT_URL?action=create' \
  -H 'Content-Type: application/json' \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "title": "RFC: Test Document",
    "markdown": "# Test RFC\n\n**Status:** Draft\n\n## Summary\n\nThis is a test.",
    "metadata": { "branch": "test-branch", "repo": "test/repo" }
  }'
```

### Update a doc:
```bash
curl -X POST 'YOUR_APPS_SCRIPT_URL?action=update' \
  -H 'Content-Type: application/json' \
  -d '{
    "apiKey": "YOUR_API_KEY",
    "docId": "DOC_ID_FROM_CREATE",
    "markdown": "# Test RFC\n\n**Status:** Updated\n\n## Summary\n\nThis has been updated.",
    "metadata": { "branch": "test-branch", "repo": "test/repo" }
  }'
```

### Read doc info:
```bash
curl 'YOUR_APPS_SCRIPT_URL?action=read&docId=DOC_ID&apiKey=YOUR_API_KEY'
```
```

**Step 2: Commit**

```bash
git add apps-script/README.md
git commit -m "docs: add Apps Script deployment guide"
```

---

### Task 3: Deploy Apps Script and Verify

This is a manual task. No code to write — follow the README.

**Step 1: Deploy the Apps Script**

Follow `apps-script/README.md` steps 1-9.

**Step 2: Test the create endpoint**

Run the curl command from the README with your actual URL and API key. Expected response:

```json
{
  "docId": "1abc...",
  "docUrl": "https://docs.google.com/document/d/1abc.../edit",
  "title": "RFC: Test Document"
}
```

**Step 3: Open the doc URL and verify formatting**

Check that the test doc has:
- H1 heading rendered
- Bold text rendered
- Normal paragraph text

**Step 4: Test the update endpoint**

Run the update curl command with the docId from step 2. Verify the doc content changed.

**Step 5: Delete the test doc from Google Drive**

---

### Task 4: Create the Skill File

**Files:**
- Create: `~/.claude/skills/publish-rfc/SKILL.md`

**Step 1: Write the skill definition**

```markdown
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

If `rfc-config.json` doesn't exist or is missing `appsScriptUrl`, tell the user they need to set it up first and link them to the deployment guide.

## Invocation Modes

### 1. `/publish-rfc` — Generate/update RFC for current branch

### 2. `/publish-rfc <google-doc-url>` — Link existing doc to current branch

If the argument is a Google Docs URL:
1. Extract the docId from the URL (the segment between `/d/` and `/edit` or next `/`)
2. Get the current branch name: `git branch --show-current`
3. Read or create `.claude/rfc-state.json` in the project root
4. Add/update the entry for this branch with the docId and URL
5. Confirm to the user: "Linked [branch] to [url]. Next `/publish-rfc` will update this doc."
6. Do NOT generate or push content — just link it.

### 3. "enable/disable RFC reminders" — Toggle postCommitReminder

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
  -d '{
    "apiKey": "API_KEY",
    "title": "RFC: <title>",
    "markdown": "<escaped-markdown-content>",
    "metadata": {
      "branch": "<branch-name>",
      "repo": "<repo-name>"
    }
  }'
```

**For UPDATE (existing doc):**

```bash
curl -s -X POST 'APPS_SCRIPT_URL?action=update' \
  -H 'Content-Type: application/json' \
  -d '{
    "apiKey": "API_KEY",
    "docId": "<docId-from-state>",
    "markdown": "<escaped-markdown-content>",
    "metadata": {
      "branch": "<branch-name>",
      "repo": "<repo-name>",
      "lastSyncCommit": "<HEAD-sha>"
    }
  }'
```

IMPORTANT: The markdown content will contain special characters (quotes, newlines, backticks). When constructing the JSON payload for curl:
- Write the JSON payload to a temp file first, then use `curl -d @/tmp/rfc-payload.json`
- This avoids shell escaping issues with inline JSON

```bash
# Write payload to temp file
cat > /tmp/rfc-payload.json << 'PAYLOAD_EOF'
{ ... the JSON payload ... }
PAYLOAD_EOF

# POST it
curl -s -X POST 'APPS_SCRIPT_URL?action=create' \
  -H 'Content-Type: application/json' \
  -d @/tmp/rfc-payload.json

# Clean up
rm /tmp/rfc-payload.json
```

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
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/publish-rfc/SKILL.md
git commit -m "feat: add publish-rfc skill definition"
```

---

### Task 5: Initialize Project Git Repo and Config Templates

**Files:**
- Create: `publish-rfc/.gitignore`
- Create: `publish-rfc/README.md`

**Step 1: Initialize git repo**

```bash
cd /Users/richard.klein/Development/publish-rfc
git init
```

**Step 2: Write .gitignore**

```
.DS_Store
/tmp/
```

**Step 3: Write project README**

```markdown
# publish-rfc

A Claude Code skill that generates RFC documents from branch code changes and publishes them to Google Docs.

## Setup

### 1. Deploy the Apps Script

See [apps-script/README.md](apps-script/README.md) for deployment instructions.

### 2. Install the Skill

The skill file lives at `~/.claude/skills/publish-rfc/SKILL.md`. It is installed globally and works across all projects.

### 3. Configure Per-Project

In each git repo where you want to use the skill, create `.claude/rfc-config.json`:

```json
{
  "appsScriptUrl": "https://script.google.com/macros/s/.../exec",
  "apiKey": "your-api-key-if-set",
  "postCommitReminder": false
}
```

## Usage

| Command | Description |
|---------|-------------|
| `/publish-rfc` | Generate/update RFC for current branch |
| `/publish-rfc <url>` | Link existing Google Doc to current branch |
| "update the RFC doc" | Natural language trigger |
| "enable RFC reminders" | Turn on post-commit reminders |

## Architecture

See [docs/plans/2026-02-16-publish-rfc-design.md](docs/plans/2026-02-16-publish-rfc-design.md).
```

**Step 4: Commit all files**

```bash
git add -A
git commit -m "feat: initial project structure with design docs, Apps Script, and skill"
```

---

### Task 6: End-to-End Test on a Real Branch

This is a manual verification task.

**Step 1: Deploy the Apps Script**

Follow Task 3 if not already done.

**Step 2: Configure a test project**

Navigate to any git repo with an active feature branch. Create `.claude/rfc-config.json` with the Apps Script URL.

**Step 3: Test CREATE flow**

On the feature branch, invoke `/publish-rfc`. Verify:
- [ ] Claude analyzes the branch diff
- [ ] Claude reads any planning docs that exist
- [ ] Claude generates RFC markdown with correct sections
- [ ] curl POST succeeds and returns a doc URL
- [ ] `.claude/rfc-state.json` is created with the branch entry
- [ ] The Google Doc is accessible and formatted correctly

**Step 4: Make a commit, then test UPDATE flow**

Make a small change, commit it, then invoke `/publish-rfc` again. Verify:
- [ ] Claude detects existing doc for this branch
- [ ] Claude generates updated RFC
- [ ] curl POST updates the existing doc (same URL)
- [ ] `lastSyncCommit` in state file is updated

**Step 5: Test LINK flow**

Create a fresh branch, then run `/publish-rfc <url-from-step-3>`. Verify:
- [ ] The doc is linked in `rfc-state.json` without pushing content
- [ ] Next `/publish-rfc` updates that linked doc

---

### Task 7: Create Opt-In Post-Commit Hook Script

**Files:**
- Create: `~/.claude/hooks/publish-rfc/check-rfc-state.sh`

**Step 1: Write the hook script**

```bash
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
```

**Step 2: Make it executable**

```bash
chmod +x ~/.claude/hooks/publish-rfc/check-rfc-state.sh
```

**Step 3: Register the hook in settings.json**

Add to the `Stop` event hooks in `~/.claude/settings.json`:

```json
{
  "type": "command",
  "command": "bash ~/.claude/hooks/publish-rfc/check-rfc-state.sh",
  "timeout": 5000
}
```

Note: This hook runs on every `Stop` event but exits immediately (< 1ms) if:
- No `rfc-config.json` exists
- `postCommitReminder` is false
- No state file or no tracked doc for the current branch
- The doc is already in sync

**Step 4: Commit**

```bash
git add ~/.claude/hooks/publish-rfc/check-rfc-state.sh
git commit -m "feat: add opt-in post-commit RFC reminder hook"
```

---

### Task 8: Test the Hook

**Step 1: Enable reminders in a test project**

Set `postCommitReminder: true` in `.claude/rfc-config.json`.

**Step 2: Publish an RFC first**

Run `/publish-rfc` to create a doc and populate the state file.

**Step 3: Make a commit**

Make a small code change and commit. After Claude's next action completes (Stop event), verify:
- [ ] The hook outputs a reminder message about the RFC being out of date
- [ ] The reminder includes the doc URL

**Step 4: Update the RFC, then commit again**

Run `/publish-rfc`, then make another commit. Verify:
- [ ] No reminder (RFC is in sync)

**Step 5: Disable reminders**

Set `postCommitReminder: false`. Make a commit. Verify:
- [ ] No reminder output
