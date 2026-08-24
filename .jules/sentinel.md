## 2025-02-19 - [GlobalSearch XSS Vulnerability]
**Vulnerability:** The GlobalSearch component in the admin panel client was directly rendering `highlighted.title` and `highlighted.description` from search results using `dangerouslySetInnerHTML` without proper sanitization.
**Learning:** React components that use `dangerouslySetInnerHTML` on content received from backend search highlight APIs can introduce Cross-Site Scripting (XSS) risks if the backend output is improperly sanitized or if it accidentally includes malicious tags/scripts.
**Prevention:** Always sanitize dynamically constructed HTML before passing it to `dangerouslySetInnerHTML`. The `dompurify` library is the standard mechanism to achieve this safely in React components.
