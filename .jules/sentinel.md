## 2026-09-23 - [Missing XSS Sanitization]
**Vulnerability:** Found unsanitized `dangerouslySetInnerHTML` usage rendering search highlight results in `admin-panel/client/src/components/ui/GlobalSearch.tsx` which can lead to XSS. Same issue could be present in `client/src/features/chat/components/DocumentViewer.tsx`.
**Learning:** React elements shouldn't use `dangerouslySetInnerHTML` blindly with external/API inputs without sanitization.
**Prevention:** Always use `DOMPurify.sanitize()` before injecting HTML strings into the DOM.
