## 2024-05-24 - Cross-Site Scripting (XSS) via Unsanitized Highlighted Search Results
**Vulnerability:** Found an XSS vulnerability in `admin-panel/client/src/components/ui/GlobalSearch.tsx` where unescaped search result highlight fields (`result.highlighted.title` and `result.highlighted.description`) were being directly injected using `dangerouslySetInnerHTML`.
**Learning:** Even internal or admin-facing tools can be vulnerable to XSS if they reflect user input directly. It's crucial to sanitize all dynamic content before rendering it as HTML.
**Prevention:** Always use a robust HTML sanitizer like DOMPurify when rendering untrusted HTML via `dangerouslySetInnerHTML`. Ensure `dompurify` and `@types/dompurify` are included in the project dependencies.
