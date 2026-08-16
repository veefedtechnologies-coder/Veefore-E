## 2024-10-24 - [Fix XSS Vulnerability in GlobalSearch Component]
**Vulnerability:** Cross-Site Scripting (XSS) vulnerability found in `admin-panel/client/src/components/ui/GlobalSearch.tsx`. User-controlled input (`result.highlighted.title` and `result.highlighted.description`) was passed directly to `dangerouslySetInnerHTML` without proper sanitization.
**Learning:** `dangerouslySetInnerHTML` is used for rendering highlighted search results. When results include user-generated or unvalidated content, it allows arbitrary JS execution.
**Prevention:** Always sanitize input passed to `dangerouslySetInnerHTML` using `dompurify`'s `DOMPurify.sanitize()` method.
