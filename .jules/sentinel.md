## 2026-09-04 - Fix XSS in GlobalSearch
**Vulnerability:** Unsanitized search result highlights rendered via `dangerouslySetInnerHTML` in `GlobalSearch.tsx`.
**Learning:** Search API responses containing highlighted text must be treated as untrusted user input.
**Prevention:** Always use DOMPurify when rendering raw HTML in React components.
