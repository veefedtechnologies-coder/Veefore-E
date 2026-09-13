## 2024-09-13 - [GlobalSearch XSS Sanitization]
**Vulnerability:** XSS via improperly sanitized `dangerouslySetInnerHTML` usage in admin-panel search.
**Learning:** React elements utilizing `dangerouslySetInnerHTML` are vulnerable to XSS if inputs contain unsafe HTML.
**Prevention:** Always sanitize inputs with DOMPurify when rendering raw HTML in React components.
