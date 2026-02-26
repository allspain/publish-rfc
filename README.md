# publish-rfc

A Claude Code skill that generates RFC documents from your branch's code changes and planning artifacts. Publish to Google Docs, as a GitHub PR comment, or save as a local markdown file.

## How It Works

1. You run `/publish-rfc` in Claude Code while on a feature branch
2. Claude analyzes your branch diff, commit history, and any planning docs (GSD, superpowers, etc.)
3. Claude generates a structured RFC document (Summary, Motivation, Solution, Schema, etc.)
4. Claude verifies every claim against the actual source code before publishing
5. Claude asks where to publish: **Google Docs**, **PR comment**, or **markdown only**
6. The RFC is saved as markdown locally and published to your chosen destination

Two developers on the same branch can share the same Google Doc by linking it with `/publish-rfc <doc-url>`.

## Quick Start

### Option A: Markdown Only (no setup required)

If you just want RFC markdown files without external publishing:

**1. Install the skill:**
```bash
mkdir -p ~/.claude/skills/publish-rfc
curl -fsSL https://raw.githubusercontent.com/allspain/publish-rfc/master/skill/SKILL.md \
  -o ~/.claude/skills/publish-rfc/SKILL.md
```

**2. Initialize your project:**
```
/publish-rfc init
```
When asked, choose **markdown-only** mode. This creates `.claude/rfc-config.json` in your project:
```json
{
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
- Authenticate with Application Default Credentials (recommended):
  ```bash
  gcloud auth application-default login
  ```
- Enable the **Google Drive API** and **Google Docs API** in your GCP project ([console.cloud.google.com](https://console.cloud.google.com) > APIs & Services > Library)
- Set a quota project:
  ```bash
  gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
  ```

**2. Install the skill:**
```bash
mkdir -p ~/.claude/skills/publish-rfc
curl -fsSL https://raw.githubusercontent.com/allspain/publish-rfc/master/skill/SKILL.md \
  -o ~/.claude/skills/publish-rfc/SKILL.md
```

**3. Initialize your project:**
```
/publish-rfc init
```
The init command checks your `gcloud` setup and creates `.claude/rfc-config.json`:
```json
{
  "authMethod": "gcloud-adc",
  "quotaProject": "your-gcp-project-id",
  "postCommitReminder": false
}
```

**4. Generate and publish:**
```
/publish-rfc
```
Claude will analyze your branch, generate the RFC, and ask where to publish. If you choose Google Docs, it creates a new doc with the RFC title as the document name. Output:
```
Saved RFC markdown to .claude/rfc-output.md
Published RFC: https://docs.google.com/document/d/1abc.../edit
```

On subsequent runs, the same doc is updated in place.

---

### Option C: Publish as a PR Comment

If you have the [GitHub CLI](https://cli.github.com/) (`gh`) installed and a PR open for your branch, you can publish the RFC as a comment on the PR.

No additional setup is needed beyond `gh auth login`. When you run `/publish-rfc`, choose **PR Comment** from the publish prompt.

The comment includes a hidden marker (`<!-- rfc-publish: branch-name -->`) so subsequent runs update the same comment instead of creating duplicates.

## Usage

**Commands:**
- `/publish-rfc` — Generate/update the RFC for the current branch
- `/publish-rfc init` — Set up the skill for this project
- `/publish-rfc <google-doc-url>` — Link an existing Google Doc to the current branch
- `"update the RFC doc"` — Natural language trigger (same as `/publish-rfc`)
- `"enable RFC reminders"` / `"disable RFC reminders"` — Toggle post-commit update reminders

### Publish Destinations

Each time you run `/publish-rfc`, Claude prompts you to choose where to publish (options depend on available tooling):

| Destination | Requires | Behavior |
|-------------|----------|----------|
| **Google Docs** | `gcloud` CLI with ADC | Creates/updates a Google Doc with the RFC title |
| **PR Comment** | `gh` CLI + open PR | Posts/updates a comment on the branch's PR |
| **Markdown only** | Nothing | Saves to `.claude/rfc-output.md` |

### Linking an Existing Doc

If a colleague already created an RFC doc for a branch, link it instead of creating a new one:

```
/publish-rfc https://docs.google.com/document/d/1abc.../edit
```

The next `/publish-rfc` will update that doc.

### Multiple Branches

Each branch gets its own RFC doc/comment. The mapping is tracked in `.claude/rfc-state.json`:

```json
{
  "feature/soft-navigation": {
    "docUrl": "https://docs.google.com/document/d/...",
    "docId": "abc123",
    "lastSyncCommit": "a1b2c3d",
    "repo": "my-org/my-repo"
  },
  "feature/remove-fid": {
    "commentId": 123456789,
    "prNumber": 42,
    "lastSyncCommit": "d4e5f6g",
    "repo": "my-org/my-repo"
  }
}
```

You may want to add `.claude/rfc-state.json` to your `.gitignore` (it's local to each developer).

## RFC Document Format

The generated RFC includes:

- **Summary** — 1-2 paragraph overview (always)
- **Motivation** — Problem statement, verified against actual code (always)
- **Solution** — Approach, Architecture, Schema with exact types from source (always)
- **Alternatives Considered** — Only if planning docs contain them
- **Testing** — Derived from test files in the diff
- **Implementation Phases** — Only for in-progress RFCs; derived from the branch's commit history
- **Open Questions** — Unresolved decisions or risks
- **Future Work** — From planning docs or TODO/FIXME comments
- **References** — PRs, issues, external resources

All claims are verified against the actual source code before publishing. Schema sections contain exact type definitions copied from the code, not paraphrased summaries.

## Authentication

The skill supports two `gcloud` credential methods, controlled by `authMethod` in `.claude/rfc-config.json`:

| Method | Config value | Command | Notes |
|--------|-------------|---------|-------|
| **ADC** (recommended) | `"gcloud-adc"` | `gcloud auth application-default print-access-token` | Broader scopes, works reliably with Drive API |
| **User credentials** | `"gcloud-user"` | `gcloud auth print-access-token` | Requires `--enable-gdrive-access` flag during `gcloud auth login` |

The skill tries the configured method first, falls back to the other, and drops to markdown-only if both fail.

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

**`gcloud auth application-default print-access-token` fails**
Re-authenticate: `gcloud auth application-default login`. The skill will fall back to markdown-only mode if auth expires.

**`gcloud auth print-access-token` returns 401 for Drive API**
User credentials often lack Drive scopes. Either switch to ADC (recommended) or re-authenticate with: `gcloud auth login --enable-gdrive-access`.

**Google Drive API returns 403**
You likely need to enable the API or set a quota project:
```bash
gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
```
Also verify that **Google Drive API** and **Google Docs API** are enabled in your GCP project.

**Google Doc not updating (404)**
The doc may have been deleted. Remove the branch entry from `.claude/rfc-state.json` and run `/publish-rfc` to create a new one.

**PR comment not updating (404)**
The comment may have been deleted. Remove the `commentId` from the branch entry in `.claude/rfc-state.json` and run `/publish-rfc` to create a new one.

**No `main` branch**
The skill tries `main`, then `master`, then detects the default branch from the remote. If your base branch has a different name, Claude will ask.

## Architecture

The skill uses three publishing modes:

- **Markdown-only**: Generates RFC markdown and saves to `.claude/rfc-output.md`. No external dependencies.
- **Google Docs**: Converts RFC to HTML with inline styles, then uploads via the Google Drive API using `gcloud` credentials. New docs are created via multipart upload; existing docs are updated via media upload. The document title is set from the RFC heading. The Drive API handles HTML-to-Google-Docs format conversion automatically.
- **PR Comment**: Posts the RFC markdown as a comment on the branch's PR using the `gh` CLI. A hidden HTML marker enables idempotent updates to the same comment.

See [docs/plans/2026-02-16-publish-rfc-design.md](docs/plans/2026-02-16-publish-rfc-design.md) for the original design document.
