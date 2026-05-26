/**
 * Instagram URL Converter - Direct URL handling system
 * Converts any URL format to Instagram-compatible URLs for seamless publishing
 */

export class InstagramURLConverter {
  
  /**
   * Environment-agnostic URL generation helper
   */
  private static getBaseUrl(): string {
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    if (process.env.VITE_APP_URL) return process.env.VITE_APP_URL;
    return process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:5000';
  }
  
  /**
   * Convert any URL to Instagram-compatible format
   */
  static convertToInstagramURL(inputUrl: string): string {
    console.log(`[URL CONVERTER] Converting URL: ${inputUrl}`);
    
    // Handle blob URLs - extract the actual media ID
    if (inputUrl.startsWith('blob:')) {
      const blobParts = inputUrl.split('/');
      const mediaId = blobParts[blobParts.length - 1];
      
      // Convert to direct server URL
      const convertedUrl = `${this.getBaseUrl()}/uploads/${mediaId}`;
      console.log(`[URL CONVERTER] Blob URL converted: ${convertedUrl}`);
      return convertedUrl;
    }
    
    // Handle Replit dev URLs - clean them up
    if (inputUrl.includes('replit.dev') || inputUrl.includes('repl.co')) {
      // Extract the media ID from the URL
      const urlParts = inputUrl.split('/');
      const mediaId = urlParts[urlParts.length - 1];
      
      // Convert to clean server URL
      const convertedUrl = `${this.getBaseUrl()}/uploads/${mediaId}`;
      console.log(`[URL CONVERTER] Replit URL converted: ${convertedUrl}`);
      return convertedUrl;
    }
    
    // Handle localhost URLs
    if (inputUrl.includes('localhost') || inputUrl.includes('127.0.0.1')) {
      const urlParts = inputUrl.split('/');
      const mediaId = urlParts[urlParts.length - 1];
      
      const convertedUrl = `${this.getBaseUrl()}/uploads/${mediaId}`;
      console.log(`[URL CONVERTER] Localhost URL converted: ${convertedUrl}`);
      return convertedUrl;
    }
    
    // For already valid URLs, return as-is
    if (inputUrl.startsWith('https://') && !inputUrl.includes('blob:')) {
      console.log(`[URL CONVERTER] URL already valid: ${inputUrl}`);
      return inputUrl;
    }
    
    // Fallback: try to extract filename and create server URL
    const filename = inputUrl.split('/').pop() || 'media';
    const fallbackUrl = `${this.getBaseUrl()}/uploads/${filename}`;
    console.log(`[URL CONVERTER] Fallback URL created: ${fallbackUrl}`);
    return fallbackUrl;
  }
  
  /**
   * Validate that URL is accessible by Instagram
   */
  static async validateInstagramURL(url: string): Promise<boolean> {
    try {
      console.log(`[URL VALIDATOR] Checking URL accessibility: ${url}`);
      
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type') || '';
      const isValid = response.ok && (contentType.includes('video') || contentType.includes('image'));
      
      console.log(`[URL VALIDATOR] URL ${url} is ${isValid ? 'valid' : 'invalid'}`);
      return isValid;
      
    } catch (error: any) {
      console.log(`[URL VALIDATOR] URL validation failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get Instagram-optimized URL with fallbacks
   */
  static async getOptimizedInstagramURL(inputUrl: string): Promise<string> {
    console.log(`[URL OPTIMIZER] Optimizing URL for Instagram: ${inputUrl}`);
    
    // Step 1: Convert URL to Instagram format
    const convertedUrl = this.convertToInstagramURL(inputUrl);
    
    // Step 2: Validate URL accessibility
    const isValid = await this.validateInstagramURL(convertedUrl);
    
    if (isValid) {
      console.log(`[URL OPTIMIZER] URL optimization successful: ${convertedUrl}`);
      return convertedUrl;
    }
    
    // Step 3: Try alternative formats if validation fails
    console.log(`[URL OPTIMIZER] URL validation failed, trying alternatives...`);
    
    // Try with different file extensions
    const baseUrl = convertedUrl.split('.')[0];
    const alternatives = [
      `${baseUrl}.mp4`,
      `${baseUrl}.mov`,
      `${baseUrl}.jpg`,
      `${baseUrl}.png`,
      convertedUrl // Original as final fallback
    ];
    
    for (const altUrl of alternatives) {
      const isAltValid = await this.validateInstagramURL(altUrl);
      if (isAltValid) {
        console.log(`[URL OPTIMIZER] Alternative URL works: ${altUrl}`);
        return altUrl;
      }
    }
    
    // If all else fails, return the converted URL
    console.log(`[URL OPTIMIZER] Using converted URL as final option: ${convertedUrl}`);
    return convertedUrl;
  }
  
  /**
   * Prepare media URL specifically for Instagram publishing
   */
  static async prepareForInstagramPublishing(
    mediaUrl: string, 
    contentType: 'video' | 'photo' | 'reel'
  ): Promise<{
    url: string;
    isOptimized: boolean;
    originalUrl: string;
  }> {
    
    console.log(`[INSTAGRAM PREP] Preparing ${contentType} URL: ${mediaUrl}`);
    
    const originalUrl = mediaUrl;
    const optimizedUrl = await this.getOptimizedInstagramURL(mediaUrl);
    
    // Additional Instagram-specific optimizations
    let finalUrl = optimizedUrl;
    
    // Ensure HTTPS
    if (!finalUrl.startsWith('https://')) {
      finalUrl = finalUrl.replace('http://', 'https://');
    }
    
    // Remove any query parameters that might interfere
    if (finalUrl.includes('?')) {
      finalUrl = finalUrl.split('?')[0];
    }
    
    // For videos, ensure proper extension
    if (contentType === 'video' || contentType === 'reel') {
      if (!finalUrl.match(/\.(mp4|mov|avi)$/i)) {
        finalUrl = `${finalUrl}.mp4`;
      }
    }
    
    // For photos, ensure proper extension
    if (contentType === 'photo') {
      if (!finalUrl.match(/\.(jpg|jpeg|png)$/i)) {
        finalUrl = `${finalUrl}.jpg`;
      }
    }
    
    console.log(`[INSTAGRAM PREP] Final optimized URL: ${finalUrl}`);
    
    return {
      url: finalUrl,
      isOptimized: finalUrl !== originalUrl,
      originalUrl: originalUrl
    };
  }
}