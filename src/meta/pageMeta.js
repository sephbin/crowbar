// Page file format:
//   <script type="application/json" id="page-meta">{...}</script>
//   <html content...>
//
// The meta script is NEVER in the contenteditable — it lives alongside the content.

const META_OPEN = '<script type="application/json" id="page-meta">';
const META_CLOSE = '</script>';

export function parsePage(raw) {
  if (!raw) return { meta: {}, content: '' };
  const start = raw.indexOf(META_OPEN);
  if (start === -1) return { meta: {}, content: raw };

  const end = raw.indexOf(META_CLOSE, start + META_OPEN.length);
  if (end === -1) return { meta: {}, content: raw };

  let meta = {};
  try {
    meta = JSON.parse(raw.slice(start + META_OPEN.length, end));
  } catch {}

  const content = raw.slice(end + META_CLOSE.length).replace(/^\n/, '');
  return { meta, content };
}

export function serializePage(meta, content) {
  return `${META_OPEN}${JSON.stringify(meta)}${META_CLOSE}\n${content}`;
}

// Extract just meta from raw file content (server-side, no DOM)
export function extractMeta(raw) {
  return parsePage(raw).meta;
}
