
## 2024-05-27 - Sanitize dangerouslySetInnerHTML usage
**Vulnerability:** XSS vulnerability due to unsanitized user inputs within `dangerouslySetInnerHTML` in `GlobalSearch.tsx` and `DocumentViewer.tsx`.
**Learning:** `dangerouslySetInnerHTML` can execute scripts if the provided HTML comes from untrusted sources, potentially leading to Cross-Site Scripting (XSS) attacks. React does not sanitize this HTML.
**Prevention:** Always sanitize inputs meant for `dangerouslySetInnerHTML` using a reliable library like `DOMPurify` to ensure no malicious scripts can be executed.
