# publish-rfc

A Claude Code skill that generates RFC documents from your branch's code changes and planning artifacts, then publishes them to Google Docs. Keeps the doc in sync as you commit, and supports multiple branches and collaborators sharing the same doc.

## How It Works

1. You run `/publish-rfc` in Claude Code while on a feature branch
2. Claude analyzes your branch diff, commit history, and any planning docs (GSD, superpowers, etc.)
3. Claude generates a structured RFC document (Summary, Problem, Solution, Implementation Phases, etc.)
4. The RFC is published to Google Docs via an Apps Script backend
5. On subsequent runs, the existing doc is updated in place

Two developers on the same branch can share the same Google Doc by linking it with `/publish-rfc <doc-url>`.

## Setup

### Step 1: Deploy the Apps Script Backend

The Apps Script handles Google authentication and converts markdown to formatted Google Docs.

1. Go to [script.google.com](https://script.google.com) and click **New Project**
2. Delete any default code in the editor
3. Copy the entire contents of [`apps-script/Code.gs`](apps-script/Code.gs) from this repo and paste it into the editor
4. **(Recommended)** Set an API key to protect the endpoint:
   - Click the gear icon (**Project Settings**)
   - Scroll to **Script Properties**
   - Click **Add script property**
   - Set Key to `API_KEY` and Value to a secret string of your choice (e.g., generate one with `openssl rand -hex 32`)
5. Click **Deploy** > **New deployment**
6. Click the gear icon next to "Select type" and choose **Web app**
7. Configure:
   - Description: `publish-rfc v1`
   - Execute as: **Me**
   - Who has access: **Anyone** (or **Anyone with Google account** for org use)
8. Click **Deploy**
9. **Copy the Web app URL** — you'll need it in Step 3
10. When prompted, click **Authorize access** and grant permission to manage Google Docs

### Step 2: Install the Skill

Copy the skill file into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/publish-rfc
cp skill/SKILL.md ~/.claude/skills/publish-rfc/SKILL.md
```

Or if you cloned this repo elsewhere, just copy the file manually. The skill must live at `~/.claude/skills/publish-rfc/SKILL.md` to be recognized by Claude Code.

Verify it's installed by starting a new Claude Code session — you should see `publish-rfc` in the available skills list.

### Step 3: Configure Per-Project

In any git repo where you want to use the skill, initialize it with your Apps Script URL:

```
/publish-rfc init https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

If you set an API key in Step 1, include it:

```
/publish-rfc init https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec --key YOUR_API_KEY
```

This creates `.claude/rfc-config.json` in the project root with your settings. You can also create this file manually:

```json
{
  "appsScriptUrl": "https://script.google.com/macros/s/.../exec",
  "apiKey": "your-api-key-if-set",
  "postCommitReminder": false
}
```

You may want to add `.claude/rfc-state.json` to your `.gitignore` (the state file tracks which branches have docs and is local to each developer).

### Step 4: Test It

On any feature branch with commits ahead of `main`/`master`:

```
/publish-rfc
```

Claude will analyze the branch, generate an RFC, and publish it. You should see output like:

```
Published RFC: https://docs.google.com/document/d/1abc.../edit
```

### Step 5: (Optional) Enable Post-Commit Reminders

If you want Claude to remind you to update the RFC after commits:

1. Set `"postCommitReminder": true` in your project's `.claude/rfc-config.json`

2. Install the hook script:
   ```bash
   mkdir -p ~/.claude/hooks/publish-rfc
   cp hooks/check-rfc-state.sh ~/.claude/hooks/publish-rfc/check-rfc-state.sh
   chmod +x ~/.claude/hooks/publish-rfc/check-rfc-state.sh
   ```

3. Register the hook by adding this to the `Stop` event in `~/.claude/settings.json`:
   ```json
   {
     "type": "command",
     "command": "bash ~/.claude/hooks/publish-rfc/check-rfc-state.sh",
     "timeout": 5000
   }
   ```

When enabled, after each commit Claude will check if the RFC is behind HEAD and suggest updating it. The hook exits immediately (<1ms) when reminders are disabled or no doc is tracked.

## Usage

| Command | What It Does |
|---------|-------------|
| `/publish-rfc` | Generate/update the RFC for the current branch |
| `/publish-rfc init <url>` | Initialize project config with your Apps Script URL |
| `/publish-rfc init <url> --key <key>` | Initialize with URL and API key |
| `/publish-rfc <google-doc-url>` | Link an existing Google Doc to the current branch |
| "update the RFC doc" | Natural language trigger (same as `/publish-rfc`) |
| "enable RFC reminders" | Turn on post-commit reminders for this project |
| "disable RFC reminders" | Turn off post-commit reminders |

### Linking an Existing Doc

If a colleague already created an RFC doc for a branch, link it instead of creating a new one:

```
/publish-rfc https://docs.google.com/document/d/1abc.../edit
```

This caches the doc ID locally. The next `/publish-rfc` will update that doc.

### Multiple Branches

Each branch gets its own RFC doc. The mapping is tracked in `.claude/rfc-state.json`:

```json
{
  "feature/soft-navigation": {
    "docUrl": "https://docs.google.com/document/d/...",
    "docId": "abc123",
    "lastSyncCommit": "a1b2c3d",
    "repo": "DataDog/browser-sdk"
  }
}
```

## RFC Document Format

The generated RFC follows this structure:

| Section | Source | Required |
|---------|--------|----------|
| **Summary** | Branch diff + planning docs | Always |
| **Problem** | Planning docs, PR description, commit messages | Always |
| **Solution** (Approach, Architecture, Key Components) | Code changes | Always |
| **Alternatives Considered** | Planning docs | Only if available |
| **Testing** | Test files in the diff | Best-effort |
| **Implementation Phases** | GSD phases > superpowers plans > diff analysis | Always |
| **Future Work** | Planning docs, TODO comments | Best-effort |
| **References** | PRs, issues, external links | Best-effort |

## Project Structure

```
publish-rfc/
  apps-script/
    Code.gs              # Google Apps Script web app (deploy to script.google.com)
    README.md            # Detailed deployment instructions
  skill/
    SKILL.md             # Claude Code skill definition (copy to ~/.claude/skills/publish-rfc/)
  hooks/
    check-rfc-state.sh   # Post-commit reminder hook (optional)
  docs/
    plans/               # Design and implementation docs
  README.md              # This file
```

## Troubleshooting

**"rfc-config.json not found"** — Create `.claude/rfc-config.json` in your project root with the Apps Script URL. See Step 3.

**curl returns an error** — Check that your Apps Script is deployed and the URL is correct. Try the test curl commands in [apps-script/README.md](apps-script/README.md).

**"Unauthorized" error** — Your API key doesn't match. Check that `apiKey` in `rfc-config.json` matches the `API_KEY` script property in Apps Script.

**No `main` branch** — The skill tries `main`, then `master`, then detects the default branch from the remote. If your base branch has a different name, Claude will ask you.

**Google Doc not updating** — Check `.claude/rfc-state.json` to verify the `docId` is correct. If the doc was deleted, remove the entry and run `/publish-rfc` to create a new one.

## Architecture

See [docs/plans/2026-02-16-publish-rfc-design.md](docs/plans/2026-02-16-publish-rfc-design.md) for the full design document.
