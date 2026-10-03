## 2024-10-24 - [Title]
**Vulnerability:** Found `dangerouslySetInnerHTML` in React components (`GlobalSearch.tsx` and `DocumentViewer.tsx`) rendering un-sanitized string properties, leading to XSS vulnerabilities.
**Learning:** `dangerouslySetInnerHTML` should only be used when necessary, and when doing so, it must be ensured that the content passed to it is safe, to prevent arbitrary scripts to be executed by malicious payload.
**Prevention:** Always use an HTML sanitization library such as `dompurify` prior to using `dangerouslySetInnerHTML` on any inputs that are untrusted.
