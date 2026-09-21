## 2026-09-21 - Fix XSS in Search Highlighting
**Vulnerability:** XSS vulnerability in `GlobalSearch.tsx` caused by using `dangerouslySetInnerHTML` with unsanitized `highlighted` strings from backend search results.
**Learning:** Even when data originates from an internal API search service, if it contains user-generated content (like user names or descriptions) and is injected as HTML for highlighting, it must be sanitized on the frontend to prevent stored/reflected XSS.
**Prevention:** Always use `DOMPurify.sanitize()` when utilizing `dangerouslySetInnerHTML` in React components, regardless of the data source.
