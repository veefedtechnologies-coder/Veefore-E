## 2023-10-27 - [XSS Fix in Document Viewer and Global Search via DOMPurify]
**Vulnerability:** Found `dangerouslySetInnerHTML` uses in `DocumentViewer.tsx` and `GlobalSearch.tsx` without sanitization, risking Cross-Site Scripting (XSS) if user-provided or external HTML (like `html` or `result.highlighted.title`) contains malicious script tags.
**Learning:** Even internal tool searches or generated documents can be vectors if they reflect external input or AI-generated HTML that hasn't been explicitly sanitized. React's `dangerouslySetInnerHTML` bypasses its native escaping.
**Prevention:** Standardize on `DOMPurify.sanitize()` for all instances of `dangerouslySetInnerHTML` across both frontend (client) and admin components.
