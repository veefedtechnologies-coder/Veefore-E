# Chat Utilities

This directory contains utility functions for the chat feature.

## Markdown Converter

The `markdownConverter` utility provides comprehensive markdown-to-HTML transformation with sanitization, syntax highlighting, and LaTeX rendering support.

### Features

- **Text Preprocessing**: Converts common text patterns to proper markdown headings
- **Sanitization**: Removes potentially dangerous HTML tags and scripts (XSS protection)
- **Syntax Highlighting**: Code blocks with 25+ supported programming languages
- **LaTeX Support**: Inline (`$...$`) and block (`$$...$$`) mathematical expressions
- **Dark Mode**: Theme-aware syntax highlighting and styling
- **TypeScript**: Full type safety with comprehensive interfaces

### Quick Start

```typescript
import { 
  createMarkdownConverter, 
  getDefaultMarkdownComponents 
} from '@/features/chat/utils';
import ReactMarkdown from 'react-markdown';

// Simple usage with defaults
const components = getDefaultMarkdownComponents(false); // false = light mode

<ReactMarkdown components={components}>
  {content}
</ReactMarkdown>
```

### Advanced Usage

```typescript
import { 
  createMarkdownConverter,
  MarkdownConverter 
} from '@/features/chat/utils';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css'; // Required for LaTeX rendering

// Create a configured converter
const converter = createMarkdownConverter({
  enableSyntaxHighlighting: true,
  enableLatex: true,
  enableSanitization: true,
  theme: {
    isDark: false,
    syntaxHighlightStyle: 'oneLight'
  },
  maxCodeBlockLines: 1000
});

// Preprocess content
const processedContent = converter.preprocess(rawContent);

// Get plugins and components
const { remarkPlugins, rehypePlugins } = converter.getPlugins();
const components = converter.getComponents();

// Render with ReactMarkdown
<ReactMarkdown
  remarkPlugins={remarkPlugins}
  rehypePlugins={rehypePlugins}
  components={components}
>
  {processedContent}
</ReactMarkdown>
```

### API Reference

#### `createMarkdownConverter(config?)`

Creates a new `MarkdownConverter` instance.

**Parameters:**
- `config` (optional): `MarkdownConverterConfig` - Configuration options

**Returns:** `MarkdownConverter` instance

#### `MarkdownConverter`

Main converter class with the following methods:

##### `preprocess(content: string): string`

Preprocesses markdown content by applying sanitization and text pattern conversion.

```typescript
const processed = converter.preprocess('Title: My Document\n\n<script>alert("xss")</script>');
// Returns: '# My Document\n\n'
```

##### `getComponents(): Components`

Returns React Markdown component renderers with syntax highlighting.

```typescript
const components = converter.getComponents();
```

##### `getPlugins(): { remarkPlugins, rehypePlugins }`

Returns remark and rehype plugins for markdown processing.

```typescript
const { remarkPlugins, rehypePlugins } = converter.getPlugins();
```

##### `updateConfig(config: Partial<MarkdownConverterConfig>): void`

Updates the converter configuration.

```typescript
converter.updateConfig({ enableLatex: true });
```

##### `setTheme(theme: Partial<MarkdownTheme>): void`

Updates the theme configuration.

```typescript
converter.setTheme({ isDark: true, syntaxHighlightStyle: 'oneDark' });
```

##### `getTheme(): MarkdownTheme`

Returns the current theme configuration.

```typescript
const theme = converter.getTheme();
```

#### Utility Functions

##### `convertToMarkdown(text: string): string`

Converts text patterns to proper markdown headings.

```typescript
import { convertToMarkdown } from '@/features/chat/utils';

const result = convertToMarkdown('Title: My Title\n\nOverview:');
// Returns: '# My Title\n\n## Overview'
```

##### `sanitizeMarkdown(content: string): string`

Sanitizes markdown content to prevent XSS attacks.

```typescript
import { sanitizeMarkdown } from '@/features/chat/utils';

const safe = sanitizeMarkdown('<script>alert("xss")</script>Safe content');
// Returns: 'Safe content'
```

##### `detectLanguage(className?: string): SupportedLanguage`

Detects programming language from CSS class name.

```typescript
import { detectLanguage } from '@/features/chat/utils';

const lang = detectLanguage('language-typescript');
// Returns: 'typescript'
```

##### `extractLatexExpressions(content: string): Array<{ expression, isBlock, startIndex, endIndex }>`

Extracts LaTeX expressions from markdown content.

```typescript
import { extractLatexExpressions } from '@/features/chat/utils';

const expressions = extractLatexExpressions('Formula: $E = mc^2$');
// Returns: [{ expression: 'E = mc^2', isBlock: false, startIndex: 9, endIndex: 18 }]
```

##### `getDefaultMarkdownComponents(isDark: boolean): Components`

Quick helper to get markdown components with default configuration.

```typescript
import { getDefaultMarkdownComponents } from '@/features/chat/utils';

const components = getDefaultMarkdownComponents(true); // dark theme
```

### Configuration

#### `MarkdownConverterConfig`

```typescript
interface MarkdownConverterConfig {
  enableSyntaxHighlighting?: boolean;  // Default: true
  enableLatex?: boolean;               // Default: true
  enableSanitization?: boolean;        // Default: true
  theme?: MarkdownTheme;               // See below
  maxCodeBlockLines?: number;          // Default: 1000
}
```

#### `MarkdownTheme`

```typescript
interface MarkdownTheme {
  isDark: boolean;                                  // Dark mode flag
  syntaxHighlightStyle: 'oneDark' | 'oneLight';    // Code highlight style
}
```

### Supported Languages

The utility supports 25+ programming languages for syntax highlighting:

- `javascript`, `typescript`, `jsx`, `tsx`
- `python`, `java`, `c`, `cpp`, `csharp`
- `go`, `rust`, `ruby`, `php`, `swift`, `kotlin`
- `sql`, `bash`, `shell`
- `json`, `yaml`, `xml`, `html`, `css`, `scss`
- `markdown`, `diff`, `plaintext`

Language aliases are automatically mapped:
- `js` → `javascript`
- `ts` → `typescript`
- `py` → `python`
- `sh` → `shell`
- `yml` → `yaml`
- `cs` → `csharp`
- `c++` → `cpp`

### LaTeX Support

The converter supports both inline and block LaTeX expressions:

**Inline Math:**
```
The famous equation $E = mc^2$ from Einstein.
```

**Block Math:**
```
Here's the integral:

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$
```

**Important:** Include KaTeX CSS in your app:

```typescript
import 'katex/dist/katex.min.css';
```

### Security

The converter includes XSS protection by default:

- Removes `<script>`, `<iframe>`, `<object>`, `<embed>` tags
- Strips `javascript:` protocol from URLs
- Removes inline event handlers (`onclick`, `onerror`, etc.)

Sanitization can be disabled if you trust the content source:

```typescript
const converter = createMarkdownConverter({
  enableSanitization: false
});
```

### Text Pattern Conversions

The utility automatically converts common text patterns to markdown headings:

| Pattern | Converts To | Example |
|---------|-------------|---------|
| `Title: Something` | `# Something` | Main document title |
| `**Title: Something**` | `# Something` | Main document title |
| `Overview:` | `## Overview` | Section header |
| `Benefits of X` | `## Benefits of X` | Section header |
| `Building Something` | `## Building Something` | Section header |
| `Position: Manager` | `### Position\nManager` | Sub-heading |

### Styling

All components use Tailwind CSS classes with dark mode support:

```typescript
// Light mode
<h1 className="text-gray-900">Heading</h1>

// Dark mode (automatically applied)
<h1 className="dark:text-gray-100">Heading</h1>
```

### Performance

- Code blocks are truncated at `maxCodeBlockLines` (default: 1000) to prevent performance issues
- Syntax highlighting uses Prism with optimized styles
- Components use semantic HTML for better accessibility

### Testing

The utility includes comprehensive unit tests covering:
- Text pattern conversion
- Sanitization
- Language detection
- LaTeX expression extraction
- Component creation
- Theme management
- Integration workflows

Run tests:
```bash
npm test -- client/src/features/chat/utils/markdownConverter.test.ts
```

### Requirements Coverage

This utility fulfills the following spec requirements:

- **Requirement 14.3**: Markdown-to-HTML transformation with sanitization
- **Requirement 14.5**: Code block syntax highlighting

### Migration from Inline Implementation

If you're currently using inline markdown rendering in components, migrate like this:

**Before:**
```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const convertToMarkdown = (text: string) => {
  // ... inline conversion logic
};

<ReactMarkdown 
  remarkPlugins={[remarkGfm]}
  components={{
    h1: ({children}) => <h1 className="...">{children}</h1>,
    // ... more components
  }}
>
  {convertToMarkdown(content)}
</ReactMarkdown>
```

**After:**
```typescript
import ReactMarkdown from 'react-markdown';
import { createMarkdownConverter } from '@/features/chat/utils';

const converter = createMarkdownConverter();
const { remarkPlugins, rehypePlugins } = converter.getPlugins();
const components = converter.getComponents();

<ReactMarkdown 
  remarkPlugins={remarkPlugins}
  rehypePlugins={rehypePlugins}
  components={components}
>
  {converter.preprocess(content)}
</ReactMarkdown>
```

### Examples

See the test file for comprehensive examples of all features:
- `client/src/features/chat/utils/markdownConverter.test.ts`

### Dependencies

- `react-markdown` - Markdown rendering
- `remark-gfm` - GitHub Flavored Markdown support
- `remark-math` - LaTeX/math support (remark plugin)
- `rehype-katex` - LaTeX/math rendering (rehype plugin)
- `katex` - LaTeX rendering library
- `react-syntax-highlighter` - Code syntax highlighting

All dependencies are already installed in the project.

### File Size

The utility is approximately **200 lines** as specified in the task requirements, providing comprehensive functionality in a compact, maintainable module.
