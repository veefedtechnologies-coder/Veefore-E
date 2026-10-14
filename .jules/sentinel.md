## 2024-05-24 - [Fix Stored/Reflected XSS in GlobalSearch and DocumentViewer]
**Vulnerability:** The application was using React's `dangerouslySetInnerHTML` directly with unsanitized dynamic user content (`html`, `result.highlighted.title`, `result.highlighted.description`), exposing the frontend to XSS vulnerabilities if malicious content is processed.
**Learning:** Raw dynamic HTML content, especially content sourced from user generation (e.g. chat/documents) or search queries, must always be sanitized before injection to prevent XSS payloads from executing in the browser context.
**Prevention:** Integrate `dompurify` and consistently wrap injected HTML inside `dangerouslySetInnerHTML` with `DOMPurify.sanitize(...)`.
