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

  docBody.clear();

  renderMarkdown(docBody, markdown);

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

  docBody.clear();

  renderMarkdown(docBody, markdown);

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

    if (line.match(/^```/)) {
      if (inCodeBlock) {
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

    if (inTable && !line.match(/^\|/)) {
      renderTable(body, tableRows);
      tableRows = [];
      inTable = false;
    }

    if (line.match(/^\|/)) {
      if (!line.match(/^\|[\s\-:]+\|/)) {
        var cells = line.split('|').filter(function(c) { return c.trim() !== ''; });
        cells = cells.map(function(c) { return c.trim(); });
        tableRows.push(cells);
      }
      inTable = true;
      i++;
      continue;
    }

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

    if (line.match(/^---+\s*$/) || line.match(/^\*\*\*+\s*$/)) {
      body.appendHorizontalRule();
      i++;
      continue;
    }

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

    var bulletMatch = line.match(/^(\s*)-\s+(.*)/);
    if (bulletMatch) {
      var listItem = body.appendListItem(bulletMatch[2]);
      listItem.setGlyphType(DocumentApp.GlyphType.BULLET);
      var indent = bulletMatch[1].length;
      if (indent >= 4) listItem.setNestingLevel(2);
      else if (indent >= 2) listItem.setNestingLevel(1);
      applyInlineFormatting(listItem);
      i++;
      continue;
    }

    var numberedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (numberedMatch) {
      var listItem = body.appendListItem(numberedMatch[2]);
      listItem.setGlyphType(DocumentApp.GlyphType.NUMBER);
      applyInlineFormatting(listItem);
      i++;
      continue;
    }

    if (line.trim() === '') {
      body.appendParagraph('');
      i++;
      continue;
    }

    var para = body.appendParagraph(line);
    applyInlineFormatting(para);
    i++;
  }

  if (inTable && tableRows.length > 0) {
    renderTable(body, tableRows);
  }
}

function renderTable(body, rows) {
  if (rows.length === 0) return;

  var maxCols = rows.reduce(function(max, row) {
    return Math.max(max, row.length);
  }, 0);

  rows = rows.map(function(row) {
    while (row.length < maxCols) row.push('');
    return row;
  });

  var table = body.appendTable(rows);

  if (rows.length > 0) {
    var headerRow = table.getRow(0);
    for (var c = 0; c < headerRow.getNumCells(); c++) {
      headerRow.getCell(c).editAsText().setBold(true);
    }
  }

  table.setBorderColor('#cccccc');
}

function applyInlineFormatting(element) {
  var text = element.editAsText();
  var content = text.getText();

  var boldRegex = /\*\*(.+?)\*\*/g;
  var match;
  while ((match = boldRegex.exec(content)) !== null) {
    var start = match.index;
    text.deleteText(start, start + 1);
    content = text.getText();
    var end = content.indexOf('**', start);
    if (end >= 0) {
      text.deleteText(end, end + 1);
      content = text.getText();
      text.setBold(start, end - 1, true);
    }
    boldRegex.lastIndex = 0;
    content = text.getText();
  }

  content = text.getText();
  var codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(content)) !== null) {
    var start = match.index;
    text.deleteText(start, start);
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

  content = text.getText();
  var linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(content)) !== null) {
    var fullMatch = match[0];
    var linkText = match[1];
    var url = match[2];
    var start = match.index;

    text.deleteText(start, start + fullMatch.length - 1);
    text.insertText(start, linkText);
    content = text.getText();

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
