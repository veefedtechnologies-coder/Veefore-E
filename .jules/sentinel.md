## 2024-08-02 - XSS in GlobalSearch component
**Vulnerability:** Found unescaped user inputs rendered via `dangerouslySetInnerHTML` in `GlobalSearch.tsx`.
**Learning:** `dangerouslySetInnerHTML` is commonly used in this codebase to render rich text like search result highlights.
**Prevention:** Make sure to sanitize user inputs with `dompurify` before passing to `dangerouslySetInnerHTML`.
