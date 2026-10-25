// The one allowlist for preserved ("legacy") HTML. The exporter cleans with it, and the site's
// renderer cleans again with it at build time. Plain options object, no imports, so both sides
// read the same file; each calls its own pinned copy of sanitize-html.
export const cleanOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
    'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'figure', 'figcaption', 'pre', 'code', 'span', 'div',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Script and style bodies are code, not content: drop them entirely.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'svg'],
  transformTags: {
    a: (tagName, attribs) => {
      const out = { ...attribs }
      if (out.target === '_blank') out.rel = 'noopener noreferrer'
      else delete out.target
      return { tagName, attribs: out }
    },
  },
}

/** Largest fragment either side will clean; anything bigger fails instead of being trimmed. */
export const MAX_FRAGMENT_BYTES = 256 * 1024

// NUL and other control characters (tab, newline and carriage return are ordinary whitespace).
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
