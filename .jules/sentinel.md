## 2024-05-24 - Cross-Site Scripting (XSS) via dangerouslySetInnerHTML
**Vulnerability:** Found uses of dangerouslySetInnerHTML in `client/src/features/chat/components/DocumentViewer.tsx` and `admin-panel/client/src/components/ui/GlobalSearch.tsx` without sanitization. This is an XSS vulnerability if the content includes malicious scripts.
**Learning:** `dangerouslySetInnerHTML` must always be used with sanitized data to prevent script injection attacks.
**Prevention:** Use a library like `DOMPurify` to sanitize HTML content before passing it to `dangerouslySetInnerHTML`.
