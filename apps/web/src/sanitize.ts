const ALLOWED = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'H3', 'H4', 'BLOCKQUOTE', 'SPAN']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'TEXTAREA', 'SELECT', 'TITLE']);

/**
 * 生平富文本白名单过滤：从解析结果重建一棵只含白名单标签、无任何属性的新 DOM，
 * 非白名单标签只保留其（同样经过过滤的）子内容。
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = document.createElement('div');
  const copy = (src: Node, dst: Node) => {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) {
        dst.appendChild(document.createTextNode(n.textContent ?? ''));
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName.toUpperCase();
        if (DROP.has(tag)) continue;
        if (ALLOWED.has(tag)) {
          const el = document.createElement(tag.toLowerCase());
          copy(n, el);
          dst.appendChild(el);
        } else {
          copy(n, dst);
        }
      }
    }
  };
  copy(doc.body, out);
  return out.innerHTML;
}

/** 纯文本 → 段落 HTML */
export function textToHtml(text: string) {
  return text
    .split(/\n+/)
    .filter(Boolean)
    .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('');
}
