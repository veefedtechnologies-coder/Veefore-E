export interface EndpointStats {
  urlPattern: string;
  hits: number;
  totalTimeMs: number;
  averageTimeMs: number;
  duplicateCalls: number;
  lastAccessed: Date;
}

export class ApiMonitorService {
  private static instance: ApiMonitorService;
  
  private stats: Map<string, EndpointStats> = new Map();
  private inFlightRequests: Map<string, number> = new Map();
  private totalApiCalls = 0;
  private totalDuplicates = 0;
  private totalDeduplicated = 0;

  private constructor() {}

  public static getInstance(): ApiMonitorService {
    if (!ApiMonitorService.instance) {
      ApiMonitorService.instance = new ApiMonitorService();
    }
    return ApiMonitorService.instance;
  }

  // Normalize URL to prevent query parameter explosion
  private normalizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.delete('access_token');
      
      const metric = parsedUrl.searchParams.get('metric');
      const fields = parsedUrl.searchParams.get('fields');
      const batch = parsedUrl.searchParams.get('batch');
      
      let pattern = `${parsedUrl.origin}${parsedUrl.pathname}`;
      
      const extraParams = [];
      if (metric) extraParams.push(`metric=${metric}`);
      if (fields) extraParams.push(`fields=${fields}`);
      if (batch) extraParams.push(`batch=true`); // Just indicate it's a batch
      
      if (extraParams.length > 0) {
        pattern += `?${extraParams.join('&')}`;
      }
      
      return pattern;
    } catch (e) {
      // If it's not a full URL (e.g. relative or missing protocol), just return the raw string
      return url.replace(/access_token=[^&]*/, 'access_token=HIDDEN').replace(/batch=[^&]*/, 'batch=HIDDEN');
    }
  }

  public startRequest(url: string): { finish: (success: boolean) => void, isDuplicate: boolean, normalizedUrl: string } {
    const normalizedUrl = this.normalizeUrl(url);
    const startTime = Date.now();
    
    // Check if duplicate (exact same normalized URL is already inflight)
    const activeCount = this.inFlightRequests.get(normalizedUrl) || 0;
    const isDuplicate = activeCount > 0;
    
    if (isDuplicate) {
      this.totalDuplicates++;
    }
    
    this.totalApiCalls++;
    this.inFlightRequests.set(normalizedUrl, activeCount + 1);

    return {
      normalizedUrl,
      isDuplicate,
      finish: (success: boolean) => {
        const duration = Date.now() - startTime;
        
        // Decrement inflight
        const currentActive = this.inFlightRequests.get(normalizedUrl) || 1;
        this.inFlightRequests.set(normalizedUrl, Math.max(0, currentActive - 1));
        if (this.inFlightRequests.get(normalizedUrl) === 0) {
          this.inFlightRequests.delete(normalizedUrl);
        }

        // Update stats
        const currentStats = this.stats.get(normalizedUrl) || {
          urlPattern: normalizedUrl,
          hits: 0,
          totalTimeMs: 0,
          averageTimeMs: 0,
          duplicateCalls: 0,
          lastAccessed: new Date(),
        };

        currentStats.hits++;
        currentStats.totalTimeMs += duration;
        currentStats.averageTimeMs = currentStats.totalTimeMs / currentStats.hits;
        currentStats.lastAccessed = new Date();
        if (isDuplicate) {
          currentStats.duplicateCalls++;
        }

        this.stats.set(normalizedUrl, currentStats);
      }
    };
  }

  public trackBatchRequests(count: number, isDuplicate: boolean = false) {
    this.totalApiCalls += count;
    if (isDuplicate) {
      this.totalDuplicates += count;
    }
  }

  public attachToAxios(axiosInstance: any) {
    axiosInstance.interceptors.request.use((config: any) => {
      // Only track Meta APIs
      if (config.url && (config.url.includes('graph.instagram.com') || config.url.includes('graph.facebook.com') || config.url.includes('api.instagram.com'))) {
        const monitor = this.startRequest(config.url);
        config.metadata = { ...config.metadata, monitor };
        if (monitor.isDuplicate) {
          console.log(`[API MONITOR] Warning: Duplicate simultaneous request detected for: ${monitor.normalizedUrl}`);
        }
      }
      return config;
    });

    axiosInstance.interceptors.response.use(
      (response: any) => {
        if (response.config?.metadata?.monitor) {
          response.config.metadata.monitor.finish(true);
        }
        return response;
      },
      (error: any) => {
        if (error.config?.metadata?.monitor) {
          error.config.metadata.monitor.finish(false);
        }
        return Promise.reject(error);
      }
    );
  }

  public trackDeduplicated(count: number = 1) {
    this.totalDeduplicated += count;
  }

  public getReport() {
    const endpoints = Array.from(this.stats.values());
    
    // Sort by most expensive (average time)
    const bottlenecks = [...endpoints].sort((a, b) => b.averageTimeMs - a.averageTimeMs).slice(0, 10);
    
    // Sort by duplicates
    const mostDuplicates = [...endpoints].sort((a, b) => b.duplicateCalls - a.duplicateCalls).filter(e => e.duplicateCalls > 0).slice(0, 10);

    // Sort by hits
    const mostFrequent = [...endpoints].sort((a, b) => b.hits - a.hits).slice(0, 10);

    return {
      overview: {
        totalApiCalls: this.totalApiCalls,
        totalDuplicates: this.totalDuplicates,
        totalDeduplicated: this.totalDeduplicated,
        uniqueEndpointsTracked: this.stats.size,
        currentlyInFlight: Array.from(this.inFlightRequests.entries()).map(([url, count]) => ({url, count})),
        timestamp: new Date().toISOString()
      },
      bottlenecks,
      mostDuplicates,
      mostFrequent
    };
  }
}
