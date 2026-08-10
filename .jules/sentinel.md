## 2025-02-12 - [HIGH] Fix XSS vulnerability in GlobalSearch
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability found in `GlobalSearch.tsx` due to `dangerouslySetInnerHTML` being used to render search result titles and descriptions without sanitization.
**Learning:** React's `dangerouslySetInnerHTML` will bypass standard XSS protections if the raw HTML string is not sanitized before insertion. The data for search results could potentially include user-controlled content containing malicious scripts.
**Prevention:** Always use a library like `DOMPurify` to sanitize HTML content before passing it to `dangerouslySetInnerHTML`.
