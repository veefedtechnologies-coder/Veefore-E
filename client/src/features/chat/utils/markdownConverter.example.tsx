/**
 * Markdown Converter Usage Examples
 * 
 * This file demonstrates various ways to use the markdown converter utility.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import {
  createMarkdownConverter,
  getDefaultMarkdownComponents,
  convertToMarkdown,
  extractLatexExpressions
} from './markdownConverter';
import 'katex/dist/katex.min.css'; // Required for LaTeX rendering

// ============================================================================
// Example 1: Simple Usage with Default Configuration
// ============================================================================

export function SimpleMarkdownExample() {
  const content = `
# Hello World

This is **bold** and *italic* text.

\`\`\`typescript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`
  `;

  const components = getDefaultMarkdownComponents(false); // false = light theme

  return (
    <div className="p-4">
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ============================================================================
// Example 2: Full Configuration with LaTeX and Dark Mode
// ============================================================================

export function FullFeaturedMarkdownExample() {
  const [isDark, setIsDark] = React.useState(false);
  
  const converter = React.useMemo(
    () => createMarkdownConverter({
      enableSyntaxHighlighting: true,
      enableLatex: true,
      enableSanitization: true,
      theme: {
        isDark,
        syntaxHighlightStyle: isDark ? 'oneDark' : 'oneLight'
      },
      maxCodeBlockLines: 500
    }),
    [isDark]
  );

  const content = `
# Mathematical Formulas

Einstein's famous equation: $E = mc^2$

The quadratic formula:

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

## Code Example

\`\`\`python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
\`\`\`
  `;

  const { remarkPlugins, rehypePlugins } = converter.getPlugins();
  const components = converter.getComponents();
  const processedContent = converter.preprocess(content);

  return (
    <div className="p-4">
      <button 
        onClick={() => setIsDark(!isDark)}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Toggle Theme
      </button>
      
      <div className={isDark ? 'dark' : ''}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ============================================================================
// Example 3: Chat Message Rendering
// ============================================================================

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export function ChatMessageExample() {
  const converter = React.useMemo(
    () => createMarkdownConverter({
      enableSyntaxHighlighting: true,
      enableLatex: true,
      theme: { isDark: false, syntaxHighlightStyle: 'oneLight' }
    }),
    []
  );

  const messages: ChatMessage[] = [
    {
      id: '1',
      content: 'Title: Python Tutorial\n\nOverview:\n\nHere is a simple function:\n\n```python\ndef greet(name):\n    return f"Hello, {name}!"\n```',
      role: 'assistant',
      timestamp: new Date()
    },
    {
      id: '2',
      content: 'Can you explain the formula $a^2 + b^2 = c^2$?',
      role: 'user',
      timestamp: new Date()
    }
  ];

  const { remarkPlugins, rehypePlugins } = converter.getPlugins();
  const components = converter.getComponents();

  return (
    <div className="space-y-4 p-4">
      {messages.map(message => {
        const processedContent = converter.preprocess(message.content);
        
        return (
          <div
            key={message.id}
            className={`p-4 rounded ${
              message.role === 'user' 
                ? 'bg-blue-100 ml-8' 
                : 'bg-gray-100 mr-8'
            }`}
          >
            <div className="text-xs text-gray-500 mb-2">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={components}
            >
              {processedContent}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Example 4: Sanitization Demo
// ============================================================================

export function SanitizationExample() {
  const dangerousContent = `
# Security Test

This content has XSS attempts:

<script>alert("XSS")</script>

<iframe src="evil.com"></iframe>

<a href="javascript:alert('XSS')">Click me</a>

<div onclick="alert('XSS')">Dangerous div</div>

This is **safe** content.
  `;

  const [enableSanitization, setEnableSanitization] = React.useState(true);
  
  const converter = React.useMemo(
    () => createMarkdownConverter({
      enableSanitization
    }),
    [enableSanitization]
  );

  const components = converter.getComponents();
  const processedContent = converter.preprocess(dangerousContent);

  return (
    <div className="p-4">
      <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 rounded">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enableSanitization}
            onChange={e => setEnableSanitization(e.target.checked)}
          />
          Enable Sanitization (Recommended)
        </label>
      </div>

      <div className="border p-4 rounded">
        <h3 className="font-bold mb-2">Rendered Content:</h3>
        <ReactMarkdown components={components}>
          {processedContent}
        </ReactMarkdown>
      </div>

      <div className="mt-4 border p-4 rounded bg-gray-50">
        <h3 className="font-bold mb-2">Processed Content (View Source):</h3>
        <pre className="text-xs overflow-auto">{processedContent}</pre>
      </div>
    </div>
  );
}

// ============================================================================
// Example 5: Language Detection and Syntax Highlighting
// ============================================================================

export function SyntaxHighlightingExample() {
  const codeExamples = [
    {
      language: 'typescript',
      code: `interface User {
  id: string;
  name: string;
  email: string;
}

const createUser = (data: Partial<User>): User => {
  return {
    id: crypto.randomUUID(),
    name: data.name || 'Anonymous',
    email: data.email || 'user@example.com'
  };
};`
    },
    {
      language: 'python',
      code: `def factorial(n):
    """Calculate factorial recursively"""
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(5))  # Output: 120`
    },
    {
      language: 'bash',
      code: `#!/bin/bash

# Install dependencies
npm install

# Run tests
npm test

# Build project
npm run build`
    }
  ];

  const converter = createMarkdownConverter();
  const { remarkPlugins, rehypePlugins } = converter.getPlugins();
  const components = converter.getComponents();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Syntax Highlighting Examples</h2>
      
      {codeExamples.map((example, index) => {
        const content = `\`\`\`${example.language}\n${example.code}\n\`\`\``;
        
        return (
          <div key={index} className="border rounded p-4">
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={components}
            >
              {content}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Example 6: LaTeX Expression Extraction
// ============================================================================

export function LatexExtractionExample() {
  const content = `
The Pythagorean theorem states that $a^2 + b^2 = c^2$.

Here's the integral:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

More formulas: $E = mc^2$ and $F = ma$.
  `;

  const expressions = extractLatexExpressions(content);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">LaTeX Expression Extraction</h2>
      
      <div className="mb-4">
        <h3 className="font-bold mb-2">Extracted Expressions:</h3>
        <ul className="space-y-2">
          {expressions.map((expr, index) => (
            <li key={index} className="border p-2 rounded bg-gray-50">
              <div className="text-xs text-gray-500">
                {expr.isBlock ? 'Block' : 'Inline'} formula
              </div>
              <code className="font-mono">{expr.expression}</code>
              <div className="text-xs text-gray-500">
                Position: {expr.startIndex} - {expr.endIndex}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border p-4 rounded">
        <h3 className="font-bold mb-2">Rendered Output:</h3>
        <ReactMarkdown
          remarkPlugins={[...createMarkdownConverter().getPlugins().remarkPlugins]}
          rehypePlugins={[...createMarkdownConverter().getPlugins().rehypePlugins]}
          components={getDefaultMarkdownComponents(false)}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ============================================================================
// Example 7: Text Pattern Conversion
// ============================================================================

export function TextPatternExample() {
  const rawContent = `Title: My Document

Overview:

This is the introduction section.

Benefits of Using Markdown

Building Better Documentation

Position: Software Engineer

Responsibilities:

1. Write clean code
2. Review pull requests
3. Mentor junior developers
  `;

  const convertedContent = convertToMarkdown(rawContent);

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      <div className="border p-4 rounded">
        <h3 className="font-bold mb-2">Raw Content:</h3>
        <pre className="text-xs whitespace-pre-wrap">{rawContent}</pre>
      </div>

      <div className="border p-4 rounded">
        <h3 className="font-bold mb-2">Converted Markdown:</h3>
        <pre className="text-xs whitespace-pre-wrap">{convertedContent}</pre>
      </div>

      <div className="col-span-2 border p-4 rounded">
        <h3 className="font-bold mb-2">Rendered Output:</h3>
        <ReactMarkdown components={getDefaultMarkdownComponents(false)}>
          {convertedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// ============================================================================
// Example 8: Dynamic Theme Switching
// ============================================================================

export function DynamicThemeExample() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
  
  const converter = React.useMemo(
    () => createMarkdownConverter({
      theme: {
        isDark: theme === 'dark',
        syntaxHighlightStyle: theme === 'dark' ? 'oneDark' : 'oneLight'
      }
    }),
    [theme]
  );

  const content = `
# Theme Demo

This content changes appearance based on the theme.

\`\`\`javascript
const theme = '${theme}';
console.log(\`Current theme: \${theme}\`);
\`\`\`

## Math Formula

The formula $f(x) = x^2$ is styled according to the theme.
  `;

  const { remarkPlugins, rehypePlugins } = converter.getPlugins();
  const components = converter.getComponents();

  return (
    <div className={theme === 'dark' ? 'dark bg-gray-900 min-h-screen' : 'bg-white min-h-screen'}>
      <div className="p-4">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTheme('light')}
            className={`px-4 py-2 rounded ${theme === 'light' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Light Theme
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`px-4 py-2 rounded ${theme === 'dark' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          >
            Dark Theme
          </button>
        </div>

        <div className="border p-4 rounded">
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
