/**
 * Markdown Converter Utility
 * 
 * Provides markdown-to-HTML transformation with sanitization, syntax highlighting,
 * and LaTeX rendering support for chat messages.
 * 
 * Requirements: 14.3 (markdown-to-HTML conversion), 14.5 (code block syntax highlighting)
 */

import { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { PluggableList } from 'react-markdown/lib/react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Supported programming languages for syntax highlighting
 */
export const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'jsx', 'tsx', 'python', 'java', 'c', 'cpp', 
  'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 
  'bash', 'shell', 'json', 'yaml', 'xml', 'html', 'css', 'scss', 
  'markdown', 'diff', 'plaintext'
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Theme configuration for markdown rendering
 */
export interface MarkdownTheme {
  isDark: boolean;
  syntaxHighlightStyle: 'oneDark' | 'oneLight';
}

/**
 * Configuration options for markdown conversion
 */
export interface MarkdownConverterConfig {
  enableSyntaxHighlighting?: boolean;
  enableLatex?: boolean;
  enableSanitization?: boolean;
  theme?: MarkdownTheme;
  maxCodeBlockLines?: number;
}

/**
 * Default configuration for markdown converter
 */
const DEFAULT_CONFIG: Required<MarkdownConverterConfig> = {
  enableSyntaxHighlighting: true,
  enableLatex: true,
  enableSanitization: true,
  theme: {
    isDark: false,
    syntaxHighlightStyle: 'oneLight'
  },
  maxCodeBlockLines: 1000
};

/**
 * Converts text patterns to proper markdown headings
 * 
 * This function preprocesses text content to normalize heading patterns
 * commonly found in AI-generated responses.
 * 
 * @param text - Raw text content to convert
 * @returns Converted text with proper markdown heading syntax
 */
export function convertToMarkdown(text: string): string {
  let result = text;
  
  // Convert "**Title: Something**" or "Title: Something" to "# Something" 
  result = result.replace(/^\*\*Title:\s*(.+)\*\*$/gm, '# $1');
  result = result.replace(/^Title:\s*(.+)$/gm, '# $1');
  
  // Convert "**Job Title: Something**" or "Job Title: Something" to "# Something" (MAIN TITLE)
  result = result.replace(/^\*\*Job Title:\s*(.+)\*\*$/gm, '# $1');
  result = result.replace(/^Job Title:\s*(.+)$/gm, '# $1');
  
  // Convert section headers ending with colon to ## headers (H2 - large) 
  result = result.replace(/^(About Us):\s*$/gm, '## $1');
  result = result.replace(/^(Key Responsibilities):\s*$/gm, '## $1');
  result = result.replace(/^(Position Overview):\s*$/gm, '## $1');
  result = result.replace(/^(Requirements):\s*$/gm, '## $1');
  result = result.replace(/^(Qualifications):\s*$/gm, '## $1');
  result = result.replace(/^(Responsibilities):\s*$/gm, '## $1');
  result = result.replace(/^(Overview):\s*$/gm, '## $1');
  result = result.replace(/^(Summary):\s*$/gm, '## $1');
  result = result.replace(/^(Introduction):\s*$/gm, '## $1');
  result = result.replace(/^(Conclusion):\s*$/gm, '## $1');
  
  // General pattern for any heading ending with colon
  result = result.replace(/^([A-Z][A-Za-z\s]{2,}):\s*$/gm, '## $1');
  result = result.replace(/^(The Evolution of Communication.*)$/gm, '## $1');
  result = result.replace(/^(Community Building and Networking.*)$/gm, '## $1');
  result = result.replace(/^(Content Creation and.*)$/gm, '## $1');
  result = result.replace(/^(Raising Awareness and.*)$/gm, '## $1');
  result = result.replace(/^(Introduction.*)$/gm, '## $1');
  result = result.replace(/^(Conclusion.*)$/gm, '## $1');
  result = result.replace(/^(Overview.*)$/gm, '## $1');
  result = result.replace(/^(Summary.*)$/gm, '## $1');
  
  // Convert sub-headings with colons to ### headers (H3 - medium)
  result = result.replace(/^(\d+\.\s*)?([A-Z][A-Za-z\s&]+):\s*$/gm, '### $2');
  
  // Convert patterns like "Position: Something" to ### headers (but NOT Job Title - that's handled above)
  result = result.replace(/^\*\*(?!Job Title)([A-Z][A-Za-z\s]+):\*\*\s*(.+)$/gm, '### $1\n$2');
  result = result.replace(/^(?!Job Title)([A-Z][A-Za-z\s]+):\s*(.+)$/gm, '### $1\n$2');
  
  // Convert "Effects of Something" and "Causes of Something" patterns
  result = result.replace(/^(Effects? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Causes? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Benefits? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Types? of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Role of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Impact of [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Importance of [A-Za-z\s]+)$/gm, '## $1');
  
  // Convert common action-based headings
  result = result.replace(/^(Raising [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Building [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Creating [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Developing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Promoting [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Understanding [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Addressing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Educating [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Mobilizing [A-Za-z\s]+)$/gm, '## $1');
  result = result.replace(/^(Influencing [A-Za-z\s]+)$/gm, '## $1');
  
  return result;
}

/**
 * Sanitizes markdown content to prevent XSS attacks
 * 
 * @param content - Markdown content to sanitize
 * @returns Sanitized markdown content
 */
export function sanitizeMarkdown(content: string): string {
  // Remove potentially dangerous HTML tags
  let sanitized = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  return sanitized;
}

/**
 * Detects the programming language from a code fence
 * 
 * @param className - CSS class name from code block (e.g., "language-typescript")
 * @returns Detected language or 'plaintext' as fallback
 */
export function detectLanguage(className?: string): SupportedLanguage {
  if (!className) return 'plaintext';
  
  const match = /language-(\w+)/.exec(className);
  if (!match) return 'plaintext';
  
  const lang = match[1].toLowerCase();
  
  // Map common aliases to supported languages
  const languageMap: Record<string, SupportedLanguage> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'sh': 'shell',
    'yml': 'yaml',
    'cs': 'csharp',
    'c++': 'cpp',
    'text': 'plaintext'
  };
  
  const mappedLang = languageMap[lang] || lang;
  
  // Check if it's a supported language
  return SUPPORTED_LANGUAGES.includes(mappedLang as SupportedLanguage)
    ? (mappedLang as SupportedLanguage)
    : 'plaintext';
}

/**
 * Extracts LaTeX expressions from markdown content
 * 
 * Supports both inline ($...$) and block ($$...$$) LaTeX expressions
 * 
 * @param content - Markdown content potentially containing LaTeX
 * @returns Array of LaTeX expressions with their positions
 */
export function extractLatexExpressions(content: string): Array<{
  expression: string;
  isBlock: boolean;
  startIndex: number;
  endIndex: number;
}> {
  const expressions: Array<{
    expression: string;
    isBlock: boolean;
    startIndex: number;
    endIndex: number;
  }> = [];
  
  // Match block LaTeX ($$...$$)
  const blockRegex = /\$\$([^\$]+)\$\$/g;
  let match;
  
  while ((match = blockRegex.exec(content)) !== null) {
    expressions.push({
      expression: match[1].trim(),
      isBlock: true,
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  // Match inline LaTeX ($...$) but not block LaTeX
  const inlineRegex = /(?<!\$)\$([^\$\n]+)\$(?!\$)/g;
  
  while ((match = inlineRegex.exec(content)) !== null) {
    expressions.push({
      expression: match[1].trim(),
      isBlock: false,
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return expressions.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Creates React Markdown component renderers with syntax highlighting
 * 
 * @param config - Configuration options for the markdown components
 * @returns Component configuration object for react-markdown
 */
export function createMarkdownComponents(
  config: MarkdownConverterConfig = {}
): Components {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { theme, enableSyntaxHighlighting, maxCodeBlockLines } = finalConfig;
  
  const syntaxStyle = theme.isDark ? oneDark : oneLight;
  
  return {
    // Headings
    h1: ({ children }) => (
      <h1 
        className="font-black mb-6 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '2.5rem' }}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 
        className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '2rem' }}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 
        className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '1.5rem' }}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 
        className="font-black mb-1 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '1.25rem' }}
      >
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 
        className="font-semibold mb-1 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '1.125rem' }}
      >
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 
        className="font-semibold mb-1 text-gray-900 dark:text-gray-100 leading-tight" 
        style={{ fontSize: '1rem' }}
      >
        {children}
      </h6>
    ),
    
    // Text formatting
    p: ({ children }) => (
      <p 
        className="mb-1 leading-relaxed font-semibold text-gray-900 dark:text-gray-100" 
        style={{ fontSize: '1rem' }}
      >
        {children}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-black text-gray-900 dark:text-gray-100">
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em className="italic text-gray-900 dark:text-gray-100">
        {children}
      </em>
    ),
    
    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-3 space-y-1 text-gray-900 dark:text-gray-100">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-900 dark:text-gray-100">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed font-semibold">
        {children}
      </li>
    ),
    
    // Code blocks and inline code
    code: ({ node, inline, className, children, ...props }) => {
      const content = String(children).replace(/\n$/, '');
      
      // Inline code
      if (inline) {
        return (
          <code 
            className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono font-semibold text-gray-900 dark:text-gray-100" 
            style={{ fontSize: '0.875rem' }}
            {...props}
          >
            {children}
          </code>
        );
      }
      
      // Code block with syntax highlighting
      if (enableSyntaxHighlighting) {
        const language = detectLanguage(className);
        const lines = content.split('\n');
        const isTruncated = maxCodeBlockLines && lines.length > maxCodeBlockLines;
        const displayContent = isTruncated 
          ? lines.slice(0, maxCodeBlockLines).join('\n') + '\n... (truncated)'
          : content;
        
        return (
          <div className="relative mb-3">
            {/* Language badge */}
            {language !== 'plaintext' && (
              <div className="absolute top-2 right-2 z-10">
                <span className="px-2 py-1 text-xs font-mono bg-gray-700 dark:bg-gray-600 text-white rounded">
                  {language}
                </span>
              </div>
            )}
            
            <SyntaxHighlighter
              language={language}
              style={syntaxStyle}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '0.875rem'
              }}
              wrapLongLines={true}
              {...props}
            >
              {displayContent}
            </SyntaxHighlighter>
            
            {isTruncated && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Code truncated at {maxCodeBlockLines} lines
              </div>
            )}
          </div>
        );
      }
      
      // Fallback without syntax highlighting
      return (
        <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto mb-3 font-semibold text-gray-900 dark:text-gray-100">
          <code className="font-mono" style={{ fontSize: '0.875rem' }}>
            {children}
          </code>
        </pre>
      );
    },
    
    // Block elements
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-3 italic text-gray-700 dark:text-gray-300">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-4 border-gray-300 dark:border-gray-600" />
    ),
    
    // Links
    a: ({ href, children }) => (
      <a 
        href={href}
        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    
    // Tables
    table: ({ children }) => (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600 border border-gray-300 dark:border-gray-600">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-100 dark:bg-gray-800">
        {children}
      </thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-300 dark:divide-gray-600 bg-white dark:bg-gray-900">
        {children}
      </tbody>
    ),
    tr: ({ children }) => (
      <tr>{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2 text-left font-bold text-gray-900 dark:text-gray-100">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">
        {children}
      </td>
    )
  };
}

/**
 * Gets the remark and rehype plugins for markdown processing
 * 
 * @param config - Configuration options
 * @returns Array of plugins for react-markdown
 */
export function getMarkdownPlugins(
  config: MarkdownConverterConfig = {}
): {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const remarkPlugins: PluggableList = [remarkGfm];
  const rehypePlugins: PluggableList = [];
  
  // Add LaTeX support if enabled
  if (finalConfig.enableLatex) {
    remarkPlugins.push(remarkMath);
    rehypePlugins.push(rehypeKatex);
  }
  
  return { remarkPlugins, rehypePlugins };
}

/**
 * Main markdown converter class
 * 
 * Provides a complete solution for converting markdown to HTML with
 * sanitization, syntax highlighting, and LaTeX support.
 */
export class MarkdownConverter {
  private config: Required<MarkdownConverterConfig>;
  
  constructor(config: MarkdownConverterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Preprocesses markdown content before rendering
   * 
   * @param content - Raw markdown content
   * @returns Preprocessed markdown content
   */
  preprocess(content: string): string {
    let processed = content;
    
    // Apply sanitization if enabled
    if (this.config.enableSanitization) {
      processed = sanitizeMarkdown(processed);
    }
    
    // Convert text patterns to proper markdown
    processed = convertToMarkdown(processed);
    
    return processed;
  }
  
  /**
   * Gets the component configuration for react-markdown
   * 
   * @returns Component configuration object
   */
  getComponents(): Components {
    return createMarkdownComponents(this.config);
  }
  
  /**
   * Gets the remark and rehype plugins
   * 
   * @returns Plugin configuration for react-markdown
   */
  getPlugins(): {
    remarkPlugins: PluggableList;
    rehypePlugins: PluggableList;
  } {
    return getMarkdownPlugins(this.config);
  }
  
  /**
   * Updates the converter configuration
   * 
   * @param config - Partial configuration to merge with existing config
   */
  updateConfig(config: Partial<MarkdownConverterConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Gets the current theme configuration
   * 
   * @returns Current theme settings
   */
  getTheme(): MarkdownTheme {
    return this.config.theme;
  }
  
  /**
   * Updates the theme configuration
   * 
   * @param theme - New theme settings
   */
  setTheme(theme: Partial<MarkdownTheme>): void {
    this.config.theme = { ...this.config.theme, ...theme };
  }
}

/**
 * Creates a default markdown converter instance
 * 
 * @param config - Optional configuration
 * @returns Configured MarkdownConverter instance
 */
export function createMarkdownConverter(
  config?: MarkdownConverterConfig
): MarkdownConverter {
  return new MarkdownConverter(config);
}

/**
 * Utility function to quickly get markdown components with default config
 * 
 * @param isDark - Whether to use dark theme
 * @returns Component configuration for react-markdown
 */
export function getDefaultMarkdownComponents(isDark: boolean = false): Components {
  return createMarkdownComponents({
    theme: {
      isDark,
      syntaxHighlightStyle: isDark ? 'oneDark' : 'oneLight'
    }
  });
}
