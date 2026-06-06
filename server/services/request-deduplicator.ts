import crypto from 'crypto';
import { ApiMonitorService } from './api-monitor';

export class RequestDeduplicator {
  private static instance: RequestDeduplicator;
  
  // Maps a deterministic key to a Promise of the pending API request
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  private constructor() {}

  public static getInstance(): RequestDeduplicator {
    if (!RequestDeduplicator.instance) {
      RequestDeduplicator.instance = new RequestDeduplicator();
    }
    return RequestDeduplicator.instance;
  }

  /**
   * Generates a deterministic hash for an endpoint and its parameters.
   * We exclude dynamic things like timestamps if they are passed, but usually 
   * for GET requests the full URL is sufficient.
   */
  private generateKey(url: string, params?: any, method: string = 'GET'): string {
    const data = JSON.stringify({ url, params, method });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Executes a network call or returns an existing in-flight Promise for the exact same call.
   * 
   * @param requestKey A unique identifier for this request (e.g. the URL)
   * @param executeFn The function that returns the Promise for the actual network call
   * @param timeoutMs Safety timeout to prevent hanging promises
   * @returns The result of the network call
   */
  public async execute<T>(
    requestKey: string, 
    executeFn: () => Promise<T>, 
    timeoutMs: number = 30000,
    dedupeTrackCount: number = 1
  ): Promise<{ data: T, shared: boolean }> {
    
    // Create a safe hash to avoid massive memory keys if URLs are huge
    const hash = this.generateKey(requestKey);

    if (this.inFlightRequests.has(hash)) {
      console.log(`[DEDUPLICATOR] Shared in-flight API request for: ${requestKey.split('?')[0]}`);
      try {
        ApiMonitorService.getInstance().trackDeduplicated(dedupeTrackCount);
      } catch (e) {}
      
      // If we already have this exact request in flight, wait for it instead of firing a new one!
      try {
        const data = await this.inFlightRequests.get(hash);
        return { data: data as T, shared: true };
      } catch (error) {
        // If the shared request fails, we should let the caller handle it.
        // It's already removed from the map by the original executor's finally block.
        throw error;
      }
    }

    // No existing request, so we must execute it.
    // Wrap it in a timeout for safety.
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request deduplicator safety timeout exceeded')), timeoutMs);
    });

    const executionPromise = Promise.race([executeFn(), timeoutPromise]);

    // Store it so others can piggyback
    this.inFlightRequests.set(hash, executionPromise);

    try {
      const data = await executionPromise;
      return { data: data as T, shared: false };
    } finally {
      // Always clean up when done, whether success or failure
      this.inFlightRequests.delete(hash);
    }
  }
}
