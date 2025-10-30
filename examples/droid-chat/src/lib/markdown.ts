const ANSI_REGEX = /\u001B\[[0-9;?]*[ -\/]*[@-~]/g;
const BEL_REGEX = /\u0007/g;
const CR_REGEX = /\r/g;
const CTRL_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function sanitize(text: string) {
  return String(text ?? '')
    .replace(ANSI_REGEX, '')
    .replace(BEL_REGEX, '')
    .replace(CR_REGEX, '\n')
    .replace(CTRL_REGEX, '');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInline(text: string) {
  const code = /`([^`]+)`/g;
  const bold1 = /\*\*(.+?)\*\*/g;
  const bold2 = /__(.+?)__/g;
  const ital1 = /\*(.+?)\*/g;
  const ital2 = /\b_(.+?)_\b/g;

  const withCode = text.replace(code, (_, content) => `<code class="md-inline-code">${escapeHtml(content)}</code>`);
  const withBold = withCode
    .replace(bold1, '<strong>$1</strong>')
    .replace(bold2, '<strong>$1</strong>');
  return withBold
    .replace(ital1, '<em>$1</em>')
    .replace(ital2, '<em>$1</em>');
}

export function renderMarkdown(raw: string) {
  const cleaned = sanitize(raw || '');
  // normalize any inline ``` fences so they stand on their own lines
  const normalized = cleaned
    .replace(/([^\n])```/g, '$1\n```')
    .replace(/```([^\n])/g, '```\n$1');
  const lines = normalized.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        const escaped = escapeHtml(codeLines.join('\n'));
        html += `<pre class="md-code">${escaped}</pre>`;
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith('### ')) {
      html += `<div class="md-h3">${formatInline(line.slice(4))}</div>`;
    } else if (line.startsWith('## ')) {
      html += `<div class="md-h2">${formatInline(line.slice(3))}</div>`;
    } else if (line.startsWith('# ')) {
      html += `<div class="md-h1">${formatInline(line.slice(2))}</div>`;
    } else if (/^\s*[-*]\s/.test(line)) {
      const bulletLine = line.replace(/^\s*[-*]\s/, '\u2022 ');
      html += `<div class="md-li">${formatInline(bulletLine)}</div>`;
    } else if (line.trim()) {
      html += `<div>${formatInline(line)}</div>`;
    } else {
      html += '<div>&nbsp;</div>';
    }
  }

  return html;
}
