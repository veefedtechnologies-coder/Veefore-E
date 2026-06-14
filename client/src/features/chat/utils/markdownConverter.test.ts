/**
 * Unit tests for markdownConverter utility
 * 
 * Tests markdown conversion, sanitization, syntax highlighting,
 * and LaTeX expression detection.
 */

import { describe, it, expect } from 'vitest';
import {
  convertToMarkdown,
  sanitizeMarkdown,
  detectLanguage,
  extractLatexExpressions,
  createMarkdownComponents,
  getDefaultMarkdownComponents,
  createMarkdownConverter,
  getMarkdownPlugins,
  SUPPORTED_LANGUAGES
} from './markdownConverter';

describe('convertToMarkdown', () => {
  it('should convert "Title: Something" to markdown heading', () => {
    const input = 'Title: My Title';
    const result = convertToMarkdown(input);
    expect(result).toBe('# My Title');
  });

  it('should convert "**Title: Something**" to markdown heading', () => {
    const input = '**Title: My Title**';
    const result = convertToMarkdown(input);
    expect(result).toBe('# My Title');
  });

  it('should convert section headers to H2 headings', () => {
    const input = 'Overview:';
    const result = convertToMarkdown(input);
    expect(result).toBe('## Overview');
  });

  it('should convert common patterns to H2 headings', () => {
    const input = 'Benefits of Social Media';
    const result = convertToMarkdown(input);
    expect(result).toBe('## Benefits of Social Media');
  });

  it('should convert action-based headings to H2', () => {
    const input = 'Building Community';
    const result = convertToMarkdown(input);
    expect(result).toBe('## Building Community');
  });

  it('should not affect regular text', () => {
    const input = 'This is regular text without any special patterns.';
    const result = convertToMarkdown(input);
    expect(result).toBe(input);
  });

  it('should handle multiple conversions in same text', () => {
    const input = `Title: Main Title
Overview:
Some content here
Benefits of Something`;
    const result = convertToMarkdown(input);
    expect(result).toContain('# Main Title');
    expect(result).toContain('## Overview');
    expect(result).toContain('## Benefits of Something');
  });
});

describe('sanitizeMarkdown', () => {
  it('should remove script tags', () => {
    const input = 'Hello <script>alert("xss")</script> World';
    const result = sanitizeMarkdown(input);
    expect(result).toBe('Hello  World');
    expect(result).not.toContain('<script>');
  });

  it('should remove iframe tags', () => {
    const input = 'Content <iframe src="evil.com"></iframe> More';
    const result = sanitizeMarkdown(input);
    expect(result).toBe('Content  More');
    expect(result).not.toContain('<iframe>');
  });

  it('should remove javascript: protocol', () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeMarkdown(input);
    expect(result).not.toContain('javascript:');
  });

  it('should remove event handlers', () => {
    const input = '<div onclick="alert(1)">Click me</div>';
    const result = sanitizeMarkdown(input);
    expect(result).not.toMatch(/onclick\s*=/i);
  });

  it('should preserve safe markdown', () => {
    const input = '# Heading\n\nThis is **bold** and *italic* text.';
    const result = sanitizeMarkdown(input);
    expect(result).toBe(input);
  });
});

describe('detectLanguage', () => {
  it('should detect typescript language', () => {
    const result = detectLanguage('language-typescript');
    expect(result).toBe('typescript');
  });

  it('should detect javascript language', () => {
    const result = detectLanguage('language-javascript');
    expect(result).toBe('javascript');
  });

  it('should map "js" alias to "javascript"', () => {
    const result = detectLanguage('language-js');
    expect(result).toBe('javascript');
  });

  it('should map "ts" alias to "typescript"', () => {
    const result = detectLanguage('language-ts');
    expect(result).toBe('typescript');
  });

  it('should map "py" alias to "python"', () => {
    const result = detectLanguage('language-py');
    expect(result).toBe('python');
  });

  it('should return plaintext for unsupported language', () => {
    const result = detectLanguage('language-unsupported');
    expect(result).toBe('plaintext');
  });

  it('should return plaintext when no className provided', () => {
    const result = detectLanguage();
    expect(result).toBe('plaintext');
  });

  it('should return plaintext for invalid format', () => {
    const result = detectLanguage('invalid-format');
    expect(result).toBe('plaintext');
  });
});

describe('extractLatexExpressions', () => {
  it('should extract inline LaTeX expression', () => {
    const input = 'The formula is $E = mc^2$ in physics.';
    const result = extractLatexExpressions(input);
    
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe('E = mc^2');
    expect(result[0].isBlock).toBe(false);
  });

  it('should extract block LaTeX expression', () => {
    const input = 'Here is a formula:\n$$\\int_0^1 x^2 dx$$\nEnd.';
    const result = extractLatexExpressions(input);
    
    expect(result).toHaveLength(1);
    expect(result[0].expression).toBe('\\int_0^1 x^2 dx');
    expect(result[0].isBlock).toBe(true);
  });

  it('should extract multiple expressions', () => {
    const input = 'Inline $x + y$ and block $$a^2 + b^2 = c^2$$ here.';
    const result = extractLatexExpressions(input);
    
    expect(result).toHaveLength(2);
  });

  it('should not extract double dollar as inline', () => {
    const input = '$$x + y$$';
    const result = extractLatexExpressions(input);
    
    expect(result).toHaveLength(1);
    expect(result[0].isBlock).toBe(true);
  });

  it('should return empty array when no LaTeX found', () => {
    const input = 'Just regular text without any math.';
    const result = extractLatexExpressions(input);
    
    expect(result).toHaveLength(0);
  });

  it('should provide correct start and end indices', () => {
    const input = 'Before $x + y$ After';
    const result = extractLatexExpressions(input);
    
    // The match "$x + y$" starts at index 7 and has length 7
    // So endIndex should be 7 + 7 = 14
    expect(result[0].startIndex).toBe(7);
    expect(result[0].endIndex).toBe(14);
  });
});

describe('createMarkdownComponents', () => {
  it('should create components object', () => {
    const components = createMarkdownComponents();
    
    expect(components).toHaveProperty('h1');
    expect(components).toHaveProperty('h2');
    expect(components).toHaveProperty('h3');
    expect(components).toHaveProperty('p');
    expect(components).toHaveProperty('code');
    expect(components).toHaveProperty('ul');
    expect(components).toHaveProperty('ol');
  });

  it('should accept custom config', () => {
    const components = createMarkdownComponents({
      enableSyntaxHighlighting: false,
      theme: { isDark: true, syntaxHighlightStyle: 'oneDark' }
    });
    
    expect(components).toBeDefined();
  });
});

describe('getDefaultMarkdownComponents', () => {
  it('should return components for light theme', () => {
    const components = getDefaultMarkdownComponents(false);
    expect(components).toBeDefined();
    expect(components).toHaveProperty('h1');
  });

  it('should return components for dark theme', () => {
    const components = getDefaultMarkdownComponents(true);
    expect(components).toBeDefined();
    expect(components).toHaveProperty('h1');
  });
});

describe('getMarkdownPlugins', () => {
  it('should return remark and rehype plugins', () => {
    const { remarkPlugins, rehypePlugins } = getMarkdownPlugins();
    
    expect(Array.isArray(remarkPlugins)).toBe(true);
    expect(Array.isArray(rehypePlugins)).toBe(true);
  });

  it('should include remarkGfm by default', () => {
    const { remarkPlugins } = getMarkdownPlugins();
    expect(remarkPlugins.length).toBeGreaterThan(0);
  });

  it('should include LaTeX plugins when enabled', () => {
    const { remarkPlugins, rehypePlugins } = getMarkdownPlugins({
      enableLatex: true
    });
    
    // remarkGfm + remarkMath = 2 plugins
    expect(remarkPlugins.length).toBe(2);
    // rehypeKatex = 1 plugin
    expect(rehypePlugins.length).toBe(1);
  });

  it('should not include LaTeX plugins when disabled', () => {
    const { remarkPlugins, rehypePlugins } = getMarkdownPlugins({
      enableLatex: false
    });
    
    // Only remarkGfm
    expect(remarkPlugins.length).toBe(1);
    // No rehype plugins
    expect(rehypePlugins.length).toBe(0);
  });
});

describe('MarkdownConverter class', () => {
  it('should create instance with default config', () => {
    const converter = createMarkdownConverter();
    expect(converter).toBeDefined();
  });

  it('should preprocess content', () => {
    const converter = createMarkdownConverter();
    const input = 'Title: Test Title';
    const result = converter.preprocess(input);
    
    expect(result).toBe('# Test Title');
  });

  it('should sanitize content when enabled', () => {
    const converter = createMarkdownConverter({ enableSanitization: true });
    const input = '<script>alert("xss")</script>Safe content';
    const result = converter.preprocess(input);
    
    expect(result).not.toContain('<script>');
    expect(result).toContain('Safe content');
  });

  it('should not sanitize when disabled', () => {
    const converter = createMarkdownConverter({ enableSanitization: false });
    const input = '<script>alert("xss")</script>';
    const result = converter.preprocess(input);
    
    expect(result).toContain('<script>');
  });

  it('should return components', () => {
    const converter = createMarkdownConverter();
    const components = converter.getComponents();
    
    expect(components).toBeDefined();
    expect(components).toHaveProperty('h1');
  });

  it('should return plugins', () => {
    const converter = createMarkdownConverter();
    const plugins = converter.getPlugins();
    
    expect(plugins).toHaveProperty('remarkPlugins');
    expect(plugins).toHaveProperty('rehypePlugins');
  });

  it('should update config', () => {
    const converter = createMarkdownConverter({ enableLatex: false });
    
    converter.updateConfig({ enableLatex: true });
    const plugins = converter.getPlugins();
    
    // Should now have LaTeX plugins
    expect(plugins.remarkPlugins.length).toBe(2);
  });

  it('should get theme', () => {
    const converter = createMarkdownConverter({
      theme: { isDark: true, syntaxHighlightStyle: 'oneDark' }
    });
    
    const theme = converter.getTheme();
    expect(theme.isDark).toBe(true);
    expect(theme.syntaxHighlightStyle).toBe('oneDark');
  });

  it('should set theme', () => {
    const converter = createMarkdownConverter();
    
    converter.setTheme({ isDark: true });
    const theme = converter.getTheme();
    
    expect(theme.isDark).toBe(true);
  });

  it('should merge theme updates', () => {
    const converter = createMarkdownConverter({
      theme: { isDark: false, syntaxHighlightStyle: 'oneLight' }
    });
    
    converter.setTheme({ isDark: true });
    const theme = converter.getTheme();
    
    expect(theme.isDark).toBe(true);
    expect(theme.syntaxHighlightStyle).toBe('oneLight'); // Should preserve
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('should be an array', () => {
    expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true);
  });

  it('should include common languages', () => {
    expect(SUPPORTED_LANGUAGES).toContain('javascript');
    expect(SUPPORTED_LANGUAGES).toContain('typescript');
    expect(SUPPORTED_LANGUAGES).toContain('python');
    expect(SUPPORTED_LANGUAGES).toContain('java');
    expect(SUPPORTED_LANGUAGES).toContain('json');
  });

  it('should have at least 20 languages', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(20);
  });
});

describe('Integration tests', () => {
  it('should handle complete workflow', () => {
    const converter = createMarkdownConverter({
      enableSyntaxHighlighting: true,
      enableLatex: true,
      enableSanitization: true,
      theme: { isDark: false, syntaxHighlightStyle: 'oneLight' }
    });
    
    const input = `Title: Test Document
    
Overview:

This is a test with $E = mc^2$ formula.

\`\`\`typescript
const greeting = "Hello";
\`\`\`

<script>alert("xss")</script>`;
    
    const processed = converter.preprocess(input);
    const components = converter.getComponents();
    const plugins = converter.getPlugins();
    
    // Should convert title
    expect(processed).toContain('# Test Document');
    
    // Should convert section
    expect(processed).toContain('## Overview');
    
    // Should sanitize script tag
    expect(processed).not.toContain('<script>');
    
    // Should have components
    expect(components).toBeDefined();
    
    // Should have plugins
    expect(plugins.remarkPlugins.length).toBeGreaterThan(0);
    expect(plugins.rehypePlugins.length).toBeGreaterThan(0);
  });
});
