## 2024-05-24 - [Title]
**Vulnerability:** XSS vulnerability through dangerouslySetInnerHTML in GlobalSearch.tsx. `result.highlighted.title` and `result.highlighted.description` are passed without sanitization.
**Learning:** React dangerouslySetInnerHTML requires explicit sanitization when using user-generated content or input derived from it (like search highlighting).
**Prevention:** Always use `DOMPurify.sanitize()` before passing dynamic HTML to `dangerouslySetInnerHTML`.
