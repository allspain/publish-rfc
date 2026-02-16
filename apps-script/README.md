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
