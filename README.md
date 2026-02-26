# publish-rfc

A Claude Code skill that generates RFC documents from your branch's code changes and planning artifacts. Publish directly to Google Docs, or save as a local markdown file.

## How It Works

1. You run `/publish-rfc` in Claude Code while on a feature branch
2. Claude analyzes your branch diff, commit history, and any planning docs (GSD, superpowers, etc.)
3. Claude generates a structured RFC document (Summary, Motivation, Solution, Schema, Implementation Phases, etc.)
4. Claude verifies every claim against the actual source code before publishing
5. The RFC is saved as markdown and optionally published to Google Docs

Two developers on the same branch can share the same Google Doc by linking it with `/publish-rfc <doc-url>`.

## Quick Start

### Option A: Markdown Only (no setup required)

If you just want RFC markdown files without Google Docs publishing:

**1. Install the skill:**
```bash
mkdir -p ~/.claude/skills/publish-rfc
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/publish-rfc/main/skill/SKILL.md \
  -o ~/.claude/skills/publish-rfc/SKILL.md
```

**2. Initialize your project:**
```
/publish-rfc init
```
When asked, choose **markdown-only** mode. This creates `.claude/rfc-config.json` in your project:
```json
{
  "publishMode": "markdown-only",
  "postCommitReminder": false
}
```

**3. Generate an RFC:**
```
/publish-rfc
```
Claude will analyze your branch and save the RFC to `.claude/rfc-output.md`.

---

### Option B: Publish to Google Docs (via `gcloud` CLI)

For automatic Google Docs publishing, you need the `gcloud` CLI authenticated with a Google account that can create Docs.

**1. Install prerequisites:**

- Install the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) if you don't have it
- Authenticate: `gcloud auth login`
- Enable the **Google Drive API** and **Google Docs API** in your GCP project ([console.cloud.google.com](https://console.cloud.google.com) > APIs & Services > Library)
- Set a quota project: `gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>`

**2. Install the skill:**
```bash
mkdir -p ~/.claude/skills/publish-rfc
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/publish-rfc/main/skill/SKILL.md \
  -o ~/.claude/skills/publish-rfc/SKILL.md
```

**3. Initialize your project:**
```
/publish-rfc init
```
The init command checks your `gcloud` setup and creates `.claude/rfc-config.json`:
```json
{
  "publishMode": "google-docs",
  "quotaProject": "your-gcp-project-id",
  "postCommitReminder": false
}
```

**4. Generate and publish:**
```
/publish-rfc
```
Claude will analyze your branch, generate the RFC, and publish it to a new Google Doc. Output:
```
Saved RFC markdown to .claude/rfc-output.md
Published RFC: https://docs.google.com/document/d/1abc.../edit
```

On subsequent runs, the same doc is updated in place.

## Usage

**Commands:**
- `/publish-rfc` — Generate/update the RFC for the current branch
- `/publish-rfc init` — Set up the skill for this project (choose markdown-only or Google Docs mode)
- `/publish-rfc <google-doc-url>` — Link an existing Google Doc to the current branch
- `"update the RFC doc"` — Natural language trigger (same as `/publish-rfc`)
- `"enable RFC reminders"` / `"disable RFC reminders"` — Toggle post-commit update reminders

### Linking an Existing Doc

If a colleague already created an RFC doc for a branch, link it instead of creating a new one:

```
/publish-rfc https://docs.google.com/document/d/1abc.../edit
```

The next `/publish-rfc` will update that doc.

### Multiple Branches

Each branch gets its own RFC doc. The mapping is tracked in `.claude/rfc-state.json`:

```json
{
  "feature/soft-navigation": {
    "docUrl": "https://docs.google.com/document/d/...",
    "docId": "abc123",
    "lastSyncCommit": "a1b2c3d",
    "repo": "my-org/my-repo"
  }
}
```

You may want to add `.claude/rfc-state.json` to your `.gitignore` (it's local to each developer).

## RFC Document Format

The generated RFC includes:

- **Summary** — 1-2 paragraph overview (always)
- **Motivation** — Problem statement, verified against actual code (always)
- **Solution** — Approach, Architecture, Schema (exact types from source), Key Files with PR diff links (always)
- **Alternatives Considered** — Only if planning docs contain them
- **Testing** — Derived from test files in the diff
- **Implementation Phases** — From GSD/superpowers phases or diff analysis, in plain human-readable language
- **Open Questions** — Unresolved decisions or risks
- **Future Work** — From planning docs or TODO/FIXME comments
- **References** — PRs, issues, external resources

All claims are verified against the actual source code before publishing. Schema sections contain exact type definitions copied from the code, not paraphrased summaries.

## Post-Commit Reminders (Optional)

When `postCommitReminder` is `true` in your config, Claude will check if the RFC is behind HEAD after commits and suggest updating it. This is passive — it only reminds, never auto-publishes.

To enable:
1. Set `"postCommitReminder": true` in `.claude/rfc-config.json`
2. Install the hook:
   ```bash
   mkdir -p ~/.claude/hooks/publish-rfc
   cp hooks/check-rfc-state.sh ~/.claude/hooks/publish-rfc/check-rfc-state.sh
   chmod +x ~/.claude/hooks/publish-rfc/check-rfc-state.sh
   ```
3. Register the hook in `~/.claude/settings.json` under the `Stop` event:
   ```json
   {
     "type": "command",
     "command": "bash ~/.claude/hooks/publish-rfc/check-rfc-state.sh",
     "timeout": 5000
   }
   ```

## Project Structure

```
publish-rfc/
  skill/
    SKILL.md             # Claude Code skill (copy to ~/.claude/skills/publish-rfc/)
  hooks/
    check-rfc-state.sh   # Post-commit reminder hook (optional)
  docs/
    plans/               # Design docs
  README.md              # This file
```

## Troubleshooting

**"rfc-config.json not found"**
Run `/publish-rfc init` to create the config file.

**`gcloud auth print-access-token` fails**
Re-authenticate: `gcloud auth login`. The skill will fall back to markdown-only mode if auth expires.

**Google Drive API returns 403**
You likely need to enable the API or set a quota project:
```bash
gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
```
Also verify that **Google Drive API** and **Google Docs API** are enabled in your GCP project.

**Google Doc not updating (404)**
The doc may have been deleted. Remove the branch entry from `.claude/rfc-state.json` and run `/publish-rfc` to create a new one.

**No `main` branch**
The skill tries `main`, then `master`, then detects the default branch from the remote. If your base branch has a different name, Claude will ask.

## Architecture

The skill uses two publishing modes:

- **Markdown-only**: Generates RFC markdown and saves to `.claude/rfc-output.md`. No external dependencies.
- **Google Docs**: Converts RFC to HTML with inline styles, then uploads via the Google Drive API using `gcloud` ADC (Application Default Credentials). New docs are created via multipart upload; existing docs are updated via media upload. The Drive API handles HTML-to-Google-Docs format conversion automatically.

See [docs/plans/2026-02-16-publish-rfc-design.md](docs/plans/2026-02-16-publish-rfc-design.md) for the original design document.
