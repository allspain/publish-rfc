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
