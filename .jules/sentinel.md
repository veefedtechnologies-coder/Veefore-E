## 2024-05-24 - Sanitize dangerouslySetInnerHTML

**Vulnerability:** Found `dangerouslySetInnerHTML` usage without sanitization in `admin-panel/client/src/components/ui/GlobalSearch.tsx`, which can lead to XSS vulnerabilities.

**Learning:** Unsanitized user inputs passed to `dangerouslySetInnerHTML` directly renders HTML, making it a prime vector for XSS attacks.

**Prevention:** Always use a sanitization library like `dompurify` before rendering HTML content via `dangerouslySetInnerHTML`.
