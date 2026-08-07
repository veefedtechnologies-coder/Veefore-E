## 2025-07-13 - [HIGH] Fix XSS vulnerability in GlobalSearch

**Vulnerability:** Found `dangerouslySetInnerHTML` being used with unsanitized API output (`result.highlighted.title` and `result.highlighted.description`) in `admin-panel/client/src/components/ui/GlobalSearch.tsx`, which could lead to Cross-Site Scripting (XSS) attacks.
**Learning:** React's `dangerouslySetInnerHTML` bypassing its built-in XSS protection can lead to severe security risks if the provided HTML comes from untrusted sources, such as search API responses containing highlighted snippets.
**Prevention:** Always use a sanitization library like DOMPurify (`DOMPurify.sanitize()`) when passing dynamic content into `dangerouslySetInnerHTML`.
