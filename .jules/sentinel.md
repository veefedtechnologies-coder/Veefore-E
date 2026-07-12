## 2026-07-12 - [XSS vulnerability via dangerouslySetInnerHTML]
**Vulnerability:** Found a Cross-Site Scripting (XSS) vulnerability in admin-panel/client/src/components/ui/GlobalSearch.tsx, where search result titles and descriptions were rendered using dangerouslySetInnerHTML without any sanitization.
**Learning:** In a React app, directly passing unsanitized input to dangerouslySetInnerHTML is a critical XSS vector if the source data is compromised or user-generated.
**Prevention:** Always use a sanitizer like DOMPurify when rendering raw HTML using dangerouslySetInnerHTML.
