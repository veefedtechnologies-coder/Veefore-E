## 2024-05-18 - XSS in dangerouslySetInnerHTML
**Vulnerability:** Found `dangerouslySetInnerHTML` used without sanitization in `GlobalSearch.tsx` in the admin panel client.
**Learning:** `dangerouslySetInnerHTML` executes any raw HTML injected into it, creating an XSS vulnerability if the input is not strictly controlled or sanitized. In this case, `result.highlighted.title` and `result.highlighted.description` come from user-controlled search results.
**Prevention:** Always use `DOMPurify.sanitize()` or a similar HTML sanitization library before passing data to `dangerouslySetInnerHTML`, especially if the data originates from an external source or user input.
