## 2025-02-27 - [Sentinel] Fix XSS in GlobalSearch

**Vulnerability:** XSS vulnerability in `admin-panel/client/src/components/ui/GlobalSearch.tsx` due to `dangerouslySetInnerHTML` taking unsanitized input.
**Learning:** Found that `result.highlighted.title` and `result.highlighted.description` were directly injected into the DOM. Any user with control over search index data could inject malicious scripts.
**Prevention:** Always wrap variables passed into `dangerouslySetInnerHTML` inside `DOMPurify.sanitize()` to ensure that the payload does not contain script tags or malicious code.
