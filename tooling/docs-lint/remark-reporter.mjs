const getLocation = (message) => {
  const start = message.place?.start || message.position?.start;
  const line = start?.line || message.line || 1;
  const column = start?.column || message.column || 1;

  return `${line}:${column}`;
};

export default function remarkReporter(files) {
  const fileList = Array.isArray(files) ? files : [files];
  const rows = [];

  for (const file of fileList) {
    const filePath = file.path || file.history?.[0] || '<stdin>';

    for (const message of file.messages || []) {
      const severity = message.fatal ? 'error' : 'warning';
      const rule = [message.ruleId, message.source].filter(Boolean).join(' ');

      rows.push(
        `${filePath}:${getLocation(message)} ${severity} ${rule} ${message.reason}`
      );
    }
  }

  return rows.join('\n');
}
