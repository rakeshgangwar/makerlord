import { browser } from '$app/environment';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/** Agent prose is model output: render markdown, sanitised, always. */
export function md(text) {
  if (!browser) return text;
  return DOMPurify.sanitize(marked.parse(text, { async: false }));
}
