/**
 * P1-4.3 SECURITY: XSS Prevention and HTML Sanitization
 * 
 * Comprehensive XSS protection without external dependencies
 */

import { Request, Response, NextFunction } from 'express';

/**
 * P1-4.3: Custom HTML sanitization without external dependencies
 * Removes dangerous HTML tags and attributes that could execute scripts
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove dangerous tags
  const dangerousTags = [
    'script', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'textarea',
    'select', 'button', 'link', 'meta', 'base', 'style', 'title', 'head', 'html',
    'body', 'frameset', 'frame', 'noframes', 'noscript', 'xml', 'math'
  ];
  
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove dangerous attributes (event handlers, javascript: urls)
  const dangerousAttributes = [
    'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout', 'onmouseenter',
    'onmouseleave', 'onkeydown', 'onkeyup', 'onkeypress', 'onfocus', 'onblur',
    'onchange', 'onsubmit', 'onreset', 'onselect', 'onabort', 'oncanplay',
    'oncanplaythrough', 'ondurationchange', 'onemptied', 'onended', 'onloadeddata',
    'onloadedmetadata', 'onloadstart', 'onpause', 'onplay', 'onplaying', 'onprogress',
    'onratechange', 'onseeked', 'onseeking', 'onstalled', 'onsuspend', 'ontimeupdate',
    'onvolumechange', 'onwaiting', 'onwheel', 'ondrag', 'ondragend', 'ondragenter',
    'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'onscroll'
  ];

  dangerousAttributes.forEach(attr => {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: URLs (except safe image types)
  sanitized = sanitized.replace(/data:(?!image\/(png|jpeg|jpg|gif|svg\+xml))[^;,]*[;,]/gi, '');
  
  // Remove vbscript: URLs
  sanitized = sanitized.replace(/vbscript:/gi, '');
  
  // Remove expression() CSS
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  
  // Remove -moz-binding CSS
  sanitized = sanitized.replace(/-moz-binding/gi, '');

  return sanitized;
}

/**
 * P1-4.3: Sanitize user input for text content
 * More permissive than HTML sanitization, but removes dangerous characters
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Remove HTML tags completely for text content
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Encode potentially dangerous characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized.trim();
}

/**
 * P1-4.3: Sanitize URLs to prevent XSS through href attributes
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const sanitized = url.trim();

  // Allow only safe protocols
  const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:'];
  
  try {
    const urlObj = new URL(sanitized);
    if (!safeProtocols.includes(urlObj.protocol.toLowerCase())) {
      return '';
    }
    return urlObj.toString();
  } catch {
    // If URL parsing fails, check if it's a relative URL
    if (sanitized.startsWith('/') || sanitized.startsWith('./') || sanitized.startsWith('../')) {
      // Simple relative URL validation
      if (!/[<>'"{}|\\^`\[\]]/.test(sanitized)) {
        return sanitized;
      }
    }
    return '';
  }
}

/**
 * P1-4.3: Express middleware for automatic XSS protection
 */
export function xssProtectionMiddleware(options: {
  sanitizeBody?: boolean;
  sanitizeQuery?: boolean;
  sanitizeParams?: boolean;
} = {}) {
  const { sanitizeBody = true, sanitizeQuery = true, sanitizeParams = true } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Sanitize request body
    if (sanitizeBody && req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (sanitizeQuery && req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize route parameters
    if (sanitizeParams && req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    // Add XSS protection headers - allow Replit iframe in development
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-Frame-Options removed for iframe embedding support
    res.setHeader('X-XSS-Protection', '0'); // Disable legacy XSS filter (CSP is better)

    next();
  };
}

/**
 * P1-4.3: Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeText(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeText(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * P1-4.3: Content sanitization for rich text areas
 * Allows safe HTML tags while removing dangerous ones
 */
export function sanitizeRichText(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Allow safe HTML tags for rich text
  const allowedTags = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre'
  ];

  let sanitized = input;

  // First, remove all dangerous content
  sanitized = sanitizeHtml(sanitized);

  // Then allow back only safe tags
  const tagRegex = /<(\/?)([\w]+)([^>]*)>/g;
  sanitized = sanitized.replace(tagRegex, (match, slash, tagName, attributes) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      // Remove any attributes for safety (could be enhanced to allow safe attributes)
      return `<${slash}${tagName.toLowerCase()}>`;
    }
    return '';
  });

  return sanitized;
}

/**
 * P1-4.3: Validate and sanitize file names
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'file';
  }

  let sanitized = fileName;

  // Remove directory traversal attempts
  sanitized = sanitized.replace(/\.\./g, '');
  sanitized = sanitized.replace(/[\/\\]/g, '');

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 255 - ext.length);
    sanitized = name + ext;
  }

  // Ensure not empty
  return sanitized.trim() || 'file';
}

/**
 * P1-4.3: Security headers middleware for XSS protection
 */
export function enhancedXssHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Enhanced security headers for XSS protection
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const isDevelopment = process.env.NODE_ENV !== 'production';
    // X-Frame-Options removed for iframe embedding support
    res.setHeader('X-XSS-Protection', '0'); // CSP is better than legacy XSS filter
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Additional cache control for sensitive pages
    if (req.path.includes('/admin') || req.path.includes('/dashboard')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  };
}