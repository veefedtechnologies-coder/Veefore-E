/**
 * P5-5: Background Job Optimization
 * 
 * Production-grade background job optimization with intelligent queue management,
 * priority handling, retry logic, and performance monitoring
 */

import { logger, StructuredLogger } from '../monitoring/structured-logger';
import { MetricsCollector } from '../monitoring/metrics-collector';

/**
 * P5-5.1: Background job configuration
 */
interface JobConfig {
  maxConcurrency: number;
  defaultTimeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
  priorityLevels: number;
  batchSize: number;
  enableBatching: boolean;
}

interface JobStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  queuedJobs: number;
  averageProcessingTime: number;
  retryCount: number;
}

interface Job {
  id: string;
  type: string;
  data: any;
  priority: number;
  attempts: number;
  createdAt: Date;
  processingStartedAt?: Date;
  timeout: number;
  correlationId?: string;
}

/**
 * P5-5.2: Background job optimization system
 */
export class BackgroundJobOptimizer {
  private static config: JobConfig = {
    maxConcurrency: 5,
    defaultTimeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 5000, // 5 seconds
    priorityLevels: 5,
    batchSize: 10,
    enableBatching: true
  };

  private static stats: JobStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    activeJobs: 0,
    queuedJobs: 0,
    averageProcessingTime: 0,
    retryCount: 0
  };

  private static jobQueue: Job[] = [];
  private static activeJobs = new Map<string, Job>();
  private static processingWorkers = new Set<NodeJS.Timeout>();
  private static jobHandlers = new Map<string, (data: any) => Promise<any>>();

  /**
   * P5-5.2a: Initialize background job optimization
   */
  static initialize(config?: Partial<JobConfig>): void {
    this.config = { ...this.config, ...config };

    // Start job processing workers
    this.startProcessingWorkers();

    // Setup periodic cleanup
    setInterval(() => {
      this.cleanupStaleJobs();
    }, 60000); // Every minute

    logger.info({
      event: 'BACKGROUND_JOB_OPTIMIZER_INITIALIZED',
      config: this.config
    }, '🔐 P5-5: Background job optimization system initialized');
  }

  /**
   * P5-5.2b: Register job handler
   */
  static registerJobHandler(
    jobType: string,
    handler: (data: any) => Promise<any>
  ): void {
    this.jobHandlers.set(jobType, handler);
    
    logger.debug({
      event: 'JOB_HANDLER_REGISTERED',
      jobType
    }, `📝 Registered handler for job type: ${jobType}`);
  }

  /**
   * P5-5.2c: Add job to queue
   */
  static async addJob(
    type: string,
    data: any,
    options: {
      priority?: number;
      timeout?: number;
      correlationId?: string;
    } = {}
  ): Promise<string> {
    const job: Job = {
      id: this.generateJobId(),
      type,
      data,
      priority: options.priority || 3, // Default medium priority
      attempts: 0,
      createdAt: new Date(),
      timeout: options.timeout || this.config.defaultTimeout,
      correlationId: options.correlationId
    };

    // Insert job in priority order
    this.insertJobByPriority(job);
    this.stats.totalJobs++;
    this.stats.queuedJobs++;

    StructuredLogger.metric(
      'background_job_queued',
      1,
      'count',
      {
        job_type: type,
        priority: job.priority.toString(),
        queue_size: this.jobQueue.length.toString()
      },
      job.correlationId
    );

    logger.debug({
      event: 'JOB_QUEUED',
      jobId: job.id,
      jobType: type,
      priority: job.priority,
      queueSize: this.jobQueue.length,
      correlationId: job.correlationId
    }, `📋 Job queued: ${type} (${job.id})`);

    return job.id;
  }

  /**
   * P5-5.2d: Insert job maintaining priority order
   */
  private static insertJobByPriority(job: Job): void {
    let insertIndex = 0;
    
    // Find insertion point (higher priority = lower number, processed first)
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (this.jobQueue[i].priority > job.priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }
    
    this.jobQueue.splice(insertIndex, 0, job);
  }

  /**
   * P5-5.2e: Start processing workers
   */
  private static startProcessingWorkers(): void {
    for (let i = 0; i < this.config.maxConcurrency; i++) {
      const worker = setInterval(() => {
        this.processNextJob();
      }, 1000); // Check for jobs every second
      
      this.processingWorkers.add(worker);
    }

    logger.info({
      event: 'JOB_WORKERS_STARTED',
      workerCount: this.config.maxConcurrency
    }, `👷 Started ${this.config.maxConcurrency} job processing workers`);
  }

  /**
   * P5-5.2f: Process next job in queue
   */
  private static async processNextJob(): Promise<void> {
    // Check if we're at max concurrency
    if (this.activeJobs.size >= this.config.maxConcurrency) {
      return;
    }

    // Get next job from queue
    const job = this.jobQueue.shift();
    if (!job) {
      return;
    }

    // Move job to active processing
    this.activeJobs.set(job.id, job);
    this.stats.queuedJobs--;
    this.stats.activeJobs++;
    job.processingStartedAt = new Date();

    logger.debug({
      event: 'JOB_PROCESSING_STARTED',
      jobId: job.id,
      jobType: job.type,
      attempt: job.attempts + 1,
      correlationId: job.correlationId
    }, `🔄 Processing job: ${job.type} (${job.id})`);

    try {
      // Get job handler
      const handler = this.jobHandlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Job timeout after ${job.timeout}ms`));
        }, job.timeout);
      });

      // Process job with timeout
      const jobPromise = handler(job.data);
      await Promise.race([jobPromise, timeoutPromise]);

      // Job completed successfully
      await this.handleJobSuccess(job);

    } catch (error) {
      await this.handleJobFailure(job, error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  /**
   * P5-5.2g: Handle successful job completion
   */
  private static async handleJobSuccess(job: Job): Promise<void> {
    const processingTime = job.processingStartedAt 
      ? Date.now() - job.processingStartedAt.getTime()
      : 0;

    // Update statistics
    this.stats.completedJobs++;
    this.stats.activeJobs--;
    this.updateAverageProcessingTime(processingTime);

    // Remove from active jobs
    this.activeJobs.delete(job.id);

    // Record metrics
    MetricsCollector.observeHistogram(
      'background_job_processing_time_seconds',
      processingTime / 1000,
      { 
        job_type: job.type,
        status: 'success',
        priority: job.priority.toString()
      }
    );

    StructuredLogger.metric(
      'background_job_completed',
      1,
      'count',
      {
        job_type: job.type,
        processing_time: processingTime.toString(),
        attempts: (job.attempts + 1).toString()
      },
      job.correlationId
    );

    logger.info({
      event: 'JOB_COMPLETED',
      jobId: job.id,
      jobType: job.type,
      processingTime,
      attempts: job.attempts + 1,
      correlationId: job.correlationId
    }, `✅ Job completed: ${job.type} (${job.id}) in ${processingTime}ms`);
  }

  /**
   * P5-5.2h: Handle job failure with retry logic
   */
  private static async handleJobFailure(job: Job, error: Error): Promise<void> {
    const processingTime = job.processingStartedAt 
      ? Date.now() - job.processingStartedAt.getTime()
      : 0;

    job.attempts++;
    this.stats.activeJobs--;

    // Remove from active jobs
    this.activeJobs.delete(job.id);

    // Check if we should retry
    if (job.attempts < this.config.retryAttempts) {
      // Schedule retry with exponential backoff
      const retryDelay = this.config.retryDelay * Math.pow(2, job.attempts - 1);
      
      setTimeout(() => {
        this.insertJobByPriority(job);
        this.stats.queuedJobs++;
        this.stats.retryCount++;
        
        logger.warn({
          event: 'JOB_RETRY_SCHEDULED',
          jobId: job.id,
          jobType: job.type,
          attempt: job.attempts,
          retryDelay,
          error: error.message,
          correlationId: job.correlationId
        }, `🔄 Retry scheduled for job: ${job.type} (${job.id}) after ${retryDelay}ms`);
      }, retryDelay);

    } else {
      // Job failed permanently
      this.stats.failedJobs++;

      MetricsCollector.observeHistogram(
        'background_job_processing_time_seconds',
        processingTime / 1000,
        { 
          job_type: job.type,
          status: 'failed',
          priority: job.priority.toString()
        }
      );

      StructuredLogger.metric(
        'background_job_failed',
        1,
        'count',
        {
          job_type: job.type,
          processing_time: processingTime.toString(),
          attempts: job.attempts.toString(),
          error: error.message
        },
        job.correlationId
      );

      logger.error({
        event: 'JOB_FAILED_PERMANENTLY',
        jobId: job.id,
        jobType: job.type,
        processingTime,
        attempts: job.attempts,
        error: error.message,
        correlationId: job.correlationId
      }, `❌ Job failed permanently: ${job.type} (${job.id}) - ${error.message}`);
    }
  }

  /**
   * P5-5.3: Job batching optimization
   */
  static async processBatchJobs(
    jobType: string,
    batchProcessor: (jobs: any[]) => Promise<void>
  ): Promise<void> {
    if (!this.config.enableBatching) return;

    const batchJobs = this.jobQueue
      .filter(job => job.type === jobType)
      .slice(0, this.config.batchSize);

    if (batchJobs.length === 0) return;

    // Remove batch jobs from queue
    batchJobs.forEach(job => {
      const index = this.jobQueue.indexOf(job);
      if (index > -1) {
        this.jobQueue.splice(index, 1);
        this.stats.queuedJobs--;
      }
    });

    try {
      const jobData = batchJobs.map(job => job.data);
      await batchProcessor(jobData);

      // Mark all jobs as successful
      for (const job of batchJobs) {
        await this.handleJobSuccess(job);
      }

      logger.info({
        event: 'BATCH_JOBS_COMPLETED',
        jobType,
        batchSize: batchJobs.length
      }, `✅ Batch processed ${batchJobs.length} ${jobType} jobs`);

    } catch (error) {
      // Mark all jobs as failed
      for (const job of batchJobs) {
        await this.handleJobFailure(job, error instanceof Error ? error : new Error('Batch processing failed'));
      }
    }
  }

  /**
   * P5-5.4: Cleanup and maintenance
   */
  private static cleanupStaleJobs(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let cleanedCount = 0;

    // Remove old jobs from queue
    this.jobQueue = this.jobQueue.filter(job => {
      const age = now - job.createdAt.getTime();
      if (age > maxAge) {
        cleanedCount++;
        this.stats.queuedJobs--;
        return false;
      }
      return true;
    });

    // Check for stuck active jobs
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.processingStartedAt) {
        const processingTime = now - job.processingStartedAt.getTime();
        if (processingTime > job.timeout * 2) { // Double timeout threshold
          logger.warn({
            event: 'STUCK_JOB_DETECTED',
            jobId,
            jobType: job.type,
            processingTime
          }, `⚠️ Stuck job detected: ${job.type} (${jobId})`);
          
          this.activeJobs.delete(jobId);
          this.stats.activeJobs--;
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info({
        event: 'JOB_CLEANUP_COMPLETED',
        cleanedCount,
        queueSize: this.jobQueue.length,
        activeJobs: this.activeJobs.size
      }, `🧹 Cleaned up ${cleanedCount} stale jobs`);
    }
  }

  /**
   * P5-5.5: Statistics and monitoring
   */
  private static updateAverageProcessingTime(processingTime: number): void {
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (this.stats.completedJobs - 1) + processingTime) / 
      this.stats.completedJobs;
  }

  private static generateJobId(): string {
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * P5-5.6: Get optimization recommendations
   */
  static getOptimizationRecommendations(): Array<{
    type: 'concurrency' | 'retry' | 'batching' | 'timeout';
    priority: 'high' | 'medium' | 'low';
    description: string;
    impact: string;
    implementation: string;
  }> {
    const recommendations = [];
    
    // Check failure rate
    const failureRate = this.stats.totalJobs > 0 
      ? (this.stats.failedJobs / this.stats.totalJobs) * 100 
      : 0;
    
    if (failureRate > 10) {
      recommendations.push({
        type: 'retry',
        priority: 'high',
        description: `High job failure rate: ${failureRate.toFixed(1)}%`,
        impact: 'Data processing delays and potential data loss',
        implementation: 'Review job logic and increase retry attempts'
      });
    }

    // Check queue backlog
    if (this.stats.queuedJobs > 100) {
      recommendations.push({
        type: 'concurrency',
        priority: 'high',
        description: `Large job queue: ${this.stats.queuedJobs} pending jobs`,
        impact: 'Delayed processing and poor user experience',
        implementation: 'Increase worker concurrency or optimize job processing'
      });
    }

    // Check processing time
    if (this.stats.averageProcessingTime > 10000) { // 10 seconds
      recommendations.push({
        type: 'timeout',
        priority: 'medium',
        description: `Slow average processing: ${(this.stats.averageProcessingTime / 1000).toFixed(1)}s`,
        impact: 'Resource consumption and delayed job completion',
        implementation: 'Optimize job logic or implement batching'
      });
    }

    // Check retry frequency
    const retryRate = this.stats.completedJobs > 0 
      ? (this.stats.retryCount / this.stats.completedJobs) * 100 
      : 0;
    
    if (retryRate > 20) {
      recommendations.push({
        type: 'retry',
        priority: 'medium',
        description: `High retry rate: ${retryRate.toFixed(1)}%`,
        impact: 'Increased resource usage and processing delays',
        implementation: 'Investigate and fix underlying job failures'
      });
    }

    return recommendations;
  }

  /**
   * P5-5.7: Get comprehensive statistics
   */
  static getStats(): JobStats & {
    failureRate: number;
    retryRate: number;
    queueBacklog: number;
    processingEfficiency: number;
  } {
    const failureRate = this.stats.totalJobs > 0 
      ? (this.stats.failedJobs / this.stats.totalJobs) * 100 
      : 0;
    
    const retryRate = this.stats.completedJobs > 0 
      ? (this.stats.retryCount / this.stats.completedJobs) * 100 
      : 0;
    
    const processingEfficiency = this.stats.totalJobs > 0 
      ? (this.stats.completedJobs / this.stats.totalJobs) * 100 
      : 0;

    return {
      ...this.stats,
      failureRate: Math.round(failureRate * 100) / 100,
      retryRate: Math.round(retryRate * 100) / 100,
      queueBacklog: this.stats.queuedJobs,
      processingEfficiency: Math.round(processingEfficiency * 100) / 100
    };
  }

  /**
   * P5-5.8: Shutdown gracefully
   */
  static async shutdown(): Promise<void> {
    // Stop all workers
    for (const worker of this.processingWorkers) {
      clearInterval(worker);
    }
    this.processingWorkers.clear();

    // Wait for active jobs to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    let waitTime = 0;

    while (this.activeJobs.size > 0 && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    logger.info({
      event: 'BACKGROUND_JOB_SHUTDOWN',
      remainingActiveJobs: this.activeJobs.size,
      remainingQueuedJobs: this.stats.queuedJobs,
      waitTime
    }, '🛑 Background job system shutdown completed');
  }
}

/**
 * P5-5.9: Initialize background job optimization system
 */
export function initializeBackgroundJobOptimization(): void {
  BackgroundJobOptimizer.initialize();

  // Register common job handlers
  BackgroundJobOptimizer.registerJobHandler('analytics_sync', async (data) => {
    // Placeholder for analytics sync job
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { success: true, processed: data.accounts?.length || 0 };
  });

  BackgroundJobOptimizer.registerJobHandler('content_generation', async (data) => {
    // Placeholder for AI content generation job
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { success: true, contentId: data.contentId };
  });

  BackgroundJobOptimizer.registerJobHandler('media_processing', async (data) => {
    // Placeholder for media processing job
    await new Promise(resolve => setTimeout(resolve, 3000));
    return { success: true, mediaUrl: data.mediaUrl };
  });

  // Setup periodic statistics collection
  setInterval(() => {
    const stats = BackgroundJobOptimizer.getStats();
    
    // Record metrics
    MetricsCollector.setGauge('background_jobs_queued', stats.queuedJobs);
    MetricsCollector.setGauge('background_jobs_active', stats.activeJobs);
    MetricsCollector.setGauge('background_jobs_failure_rate_percent', stats.failureRate);
    MetricsCollector.setGauge('background_jobs_processing_time_ms', stats.averageProcessingTime);
    
    // Log performance summary
    if (stats.totalJobs > 0) {
      logger.info({
        event: 'BACKGROUND_JOB_SUMMARY',
        stats
      }, `📊 Background jobs: ${stats.queuedJobs} queued, ${stats.activeJobs} active, ${stats.processingEfficiency.toFixed(1)}% efficiency`);
    }
  }, 60000); // Every minute

  // Setup weekly optimization analysis
  setInterval(() => {
    const recommendations = BackgroundJobOptimizer.getOptimizationRecommendations();
    
    if (recommendations.length > 0) {
      logger.info({
        event: 'BACKGROUND_JOB_RECOMMENDATIONS',
        recommendationCount: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'high').length
      }, '📈 Background job optimization recommendations available');
      
      recommendations.forEach(rec => {
        if (rec.priority === 'high') {
          logger.warn({
            event: 'HIGH_PRIORITY_JOB_RECOMMENDATION',
            recommendation: rec
          }, `⚠️ ${rec.description}`);
        }
      });
    }
  }, 7 * 24 * 60 * 60 * 1000); // Weekly

  logger.info({
    event: 'BACKGROUND_JOB_OPTIMIZATION_INITIALIZED',
    features: [
      'Priority-based job queue',
      'Configurable concurrency control',
      'Intelligent retry logic with exponential backoff',
      'Job batching optimization',
      'Timeout handling and stuck job detection',
      'Performance monitoring and metrics',
      'Graceful shutdown support',
      'Optimization recommendations'
    ]
  }, '🔐 P5-5: Background job optimization system ready for production');
}