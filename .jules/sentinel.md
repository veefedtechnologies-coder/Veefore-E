## 2023-10-01 - Prevent XSS in Document Viewer and Search Results
**Vulnerability:** XSS vulnerability via `dangerouslySetInnerHTML` in `GlobalSearch.tsx` and `DocumentViewer.tsx`. Unsanitized search result highlights and generated HTML were being rendered directly in the DOM.
**Learning:** React's `dangerouslySetInnerHTML` will execute script tags if present in the data payload, leaving the app susceptible to XSS injections from malicious user input or untrusted document content.
**Prevention:** Always sanitize any untrusted or dynamic HTML payloads before rendering them via `dangerouslySetInnerHTML`, utilizing established sanitization libraries like `DOMPurify.sanitize()`.
