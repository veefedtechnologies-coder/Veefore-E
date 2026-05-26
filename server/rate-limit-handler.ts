import { AxiosResponse } from 'axios';

interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter: number;
  errorMessage: string;
}

export class InstagramRateLimitHandler {
  private static lastCallTime: number = 0;
  private static minInterval: number = 5000; // 5 seconds between calls
  
  static checkRateLimit(error: any): RateLimitInfo {
    const isRateLimit = error.response?.data?.error?.code === 4 && 
                       error.response?.data?.error?.error_subcode === 1349210;
    
    if (isRateLimit) {
      console.log(`[RATE LIMIT] Instagram API rate limit detected`);
      console.log(`[RATE LIMIT] Error: ${error.response?.data?.error?.message}`);
      
      return {
        isRateLimited: true,
        retryAfter: 300000, // 5 minutes default
        errorMessage: `Instagram API rate limit exceeded. Your app has made too many requests and needs to wait before trying again. This typically happens when:\n\n1. Basic Instagram API has very low rate limits (200 requests per hour)\n2. Multiple publishing attempts in short time\n3. App needs Instagram Business API approval for higher limits\n\nSolutions:\n• Wait 5-10 minutes before trying again\n• Request Instagram Business API access for higher limits\n• Reduce publishing frequency\n• Contact Instagram to increase your app's rate limits`
      };
    }
    
    return {
      isRateLimited: false,
      retryAfter: 0,
      errorMessage: ''
    };
  }
  
  static async waitBetweenCalls(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`[RATE LIMIT] Enforcing minimum ${waitTime}ms delay between Instagram API calls`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime = Date.now();
  }
  
  static async handleRateLimitedRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        await this.waitBetweenCalls();
        return await requestFn();
      } catch (error: any) {
        const rateLimitInfo = this.checkRateLimit(error);
        
        if (rateLimitInfo.isRateLimited && retries < maxRetries - 1) {
          console.log(`[RATE LIMIT] Retry ${retries + 1}/${maxRetries} after rate limit, waiting ${rateLimitInfo.retryAfter/1000} seconds`);
          await new Promise(resolve => setTimeout(resolve, rateLimitInfo.retryAfter));
          retries++;
          continue;
        }
        
        if (rateLimitInfo.isRateLimited) {
          throw new Error(rateLimitInfo.errorMessage);
        }
        
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded');
  }
}

export default InstagramRateLimitHandler;