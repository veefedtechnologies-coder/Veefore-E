## 2024-05-18 - Fix XSS in dangerouslySetInnerHTML
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability via unsanitized data used in `dangerouslySetInnerHTML` in React components, specifically in GlobalSearch.tsx.
**Learning:** External API results or dynamic content that includes highlighted HTML structures directly passed into `dangerouslySetInnerHTML` allows for arbitrary script execution if the content is malicious.
**Prevention:** Always use a sanitization library, such as `DOMPurify` (`DOMPurify.sanitize()`), to strip dangerous tags and attributes before passing content to `dangerouslySetInnerHTML`.
