## 2024-05-24 - Cross-Site Scripting (XSS) in GlobalSearch UI
**Vulnerability:** The `GlobalSearch` component in `admin-panel/client` used `dangerouslySetInnerHTML` directly with unsanitized data from search API responses (`result.highlighted.title` and `result.highlighted.description`).
**Learning:** `dangerouslySetInnerHTML` can execute malicious scripts if the input data isn't properly sanitized, particularly when it stems from a third-party or untrusted source.
**Prevention:** Always use `DOMPurify.sanitize()` when using `dangerouslySetInnerHTML` in React components (e.g. `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(input) }}`).
