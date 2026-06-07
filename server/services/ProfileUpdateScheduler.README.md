# Profile Update Scheduler Service

## Overview

The `ProfileUpdateScheduler` service implements background jobs for continuous learning and profile optimization in the Authentic Instagram Caption Generation system. It automatically updates voice profiles, learns pattern preferences, analyzes performance correlations, and detects declining acceptance rates to trigger recalibration when needed.

## Requirements Fulfilled

- **Requirement 10.4**: Monthly voice profile updates based on accumulated feedback
- **Requirement 10.5**: Pattern preference learning and performance correlation
- **Requirement 10.6**: Declining acceptance detection with recalibration triggers

## Features

### 1. Monthly Voice Profile Updates

**Schedule**: Runs on the 1st of each month at midnight

**Purpose**: Updates user voice profiles based on accumulated feedback from the past month

**Process**:
- Collects all feedback (selections, edits, published posts) from the last 30 days
- Processes caption selections to learn preferred variations
- Analyzes edits to identify vocabulary, tone, and style adjustments
- Incorporates performance data from published posts
- Updates voice profile incrementally without overwriting existing data

**Example**:
```typescript
const result = await scheduler.updateVoiceProfileFromFeedback(userId, workspaceId);
// Returns: {
//   updateType: 'voice_profile',
//   updatesApplied: 15,
//   improvements: [
//     'Processed 8 caption selections',
//     'Learned from 5 caption edits',
//     'Learned from 12 published posts with performance data'
//   ]
// }
```

### 2. Pattern Preference Learning

**Schedule**: Runs daily at 2 AM

**Purpose**: Learns which viral patterns and hooks users consistently choose or reject

**Process**:
- Analyzes selection feedback from the last 7 days
- Identifies patterns that appear more frequently in selected vs rejected captions
- Updates viral pattern performance scores based on user preferences
- Tracks trending pattern preferences across all users

**Benefits**:
- Future caption generations prioritize patterns the user prefers
- Reduces rejection rates by avoiding patterns user dislikes
- Improves caption quality over time through pattern optimization

### 3. Performance Correlation Analysis

**Purpose**: Correlates caption characteristics with actual engagement performance

**Process**:
- Analyzes captions with actual performance data from the last 90 days
- Calculates engagement rates for each caption
- Identifies patterns and hooks that appear in top-performing vs bottom-performing content
- Updates viral pattern scores based on real performance data
- Identifies consistently high-performing patterns for the user

**Example**:
```typescript
const result = await scheduler.analyzePerformanceCorrelations(userId, workspaceId);
// Returns: {
//   updateType: 'performance_correlation',
//   updatesApplied: 12,
//   improvements: [
//     'Analyzing 48 captions with performance data',
//     'Updated performance scores for 12 patterns',
//     'Identified 4 consistently high-performing patterns',
//     'Higher authenticity scores correlate with 12.5% better performance'
//   ]
// }
```

### 4. Declining Acceptance Detection

**Schedule**: Runs daily at 3 AM

**Purpose**: Detects when users are rejecting too many captions and triggers recalibration

**Thresholds**:
- **Rejection Rate > 30%**: Triggers recalibration
- **Heavy Edit Rate > 40%**: Indicates captions don't match voice
- **Declining Trend**: Recent rejections significantly higher than before

**Severity Levels**:
- **High** (rejection rate > 50%): Urgent recalibration needed
- **Medium** (rejection rate > 40%): Recalibration recommended
- **Low** (rejection rate > 30%): Consider recalibration

**Recalibration Process**:
1. Calculate acceptance metrics for the last 30 days
2. Detect if metrics exceed thresholds
3. If triggered, attempt auto-recalibration with recent published captions
4. If insufficient data, flag for manual recalibration

**Example**:
```typescript
const metrics = await scheduler.calculateAcceptanceMetrics(userId, workspaceId);
// Returns: {
//   totalGenerated: 100,
//   totalAccepted: 55,
//   totalRejected: 35,
//   totalEdited: 10,
//   acceptanceRate: 55,
//   rejectionRate: 35,
//   heavyEditRate: 10,
//   trend: 'declining'
// }

const trigger = await scheduler.detectDecliningAcceptance(metrics);
// Returns: {
//   triggered: true,
//   reason: 'High rejection rate detected: 35.0% (threshold: 30%)',
//   severity: 'low',
//   recommendations: [
//     'Elevated rejection rate detected',
//     'Consider voice profile recalibration',
//     'Suggested actions:',
//     '1. Review and update sample captions with recent successful posts',
//     '2. Recalibrate voice profile to match current writing style',
//     '3. Check if content niche or target audience has changed'
//   ]
// }
```

## Usage

### Starting the Scheduler

```typescript
import { ProfileUpdateScheduler } from './services/ProfileUpdateScheduler';

const scheduler = new ProfileUpdateScheduler(mongoClient, dbName);

// Start all background jobs
scheduler.start();
```

### Stopping the Scheduler

```typescript
// Stop all background jobs
scheduler.stop();
```

### Manual Job Execution

You can also manually trigger specific jobs without waiting for the schedule:

```typescript
// Manually update voice profile from feedback
const result = await scheduler.updateVoiceProfileFromFeedback(
  userId,
  workspaceId
);

// Manually analyze performance correlations
const perfResult = await scheduler.analyzePerformanceCorrelations(
  userId,
  workspaceId
);

// Manually check acceptance metrics
const metrics = await scheduler.calculateAcceptanceMetrics(
  userId,
  workspaceId
);

// Manually detect declining acceptance
const trigger = await scheduler.detectDecliningAcceptance(metrics);

// Manually trigger recalibration
if (trigger.triggered) {
  await scheduler.triggerRecalibration(userId, workspaceId, trigger);
}
```

## Dependencies

### Required Services
- **VoiceProfileService**: Updates user voice profiles
- **ViralPatternService**: Updates viral pattern performance
- **FeedbackCaptureService**: Retrieves user feedback data

### Database Models
- **GeneratedCaptionModel**: Generated captions with variations and performance
- **CaptionFeedbackModel**: User feedback (selections, edits, rejections)

## Scheduling Implementation

The scheduler uses Node.js `setTimeout` and `setInterval` for job scheduling:

- **Monthly jobs**: Calculate time until next month's 1st day, then recur every 30 days
- **Daily jobs**: Calculate time until next occurrence (e.g., 2 AM), then recur every 24 hours
- **Timers**: Stored as instance properties and cleared on `stop()`

## Integration with Existing System

To integrate the ProfileUpdateScheduler with your application:

1. **Initialize in Server Startup**:
```typescript
// server/index.ts or server.ts
import { ProfileUpdateScheduler } from './services/ProfileUpdateScheduler';

const profileUpdateScheduler = new ProfileUpdateScheduler(mongoClient, dbName);
profileUpdateScheduler.start();

// On server shutdown
process.on('SIGTERM', () => {
  profileUpdateScheduler.stop();
});
```

2. **Integration with AIContentGenerator**:
The scheduler automatically updates profiles based on feedback captured through:
- Caption selections (via `FeedbackCaptureService.recordSelection`)
- Caption edits (via `FeedbackCaptureService.analyzeEdit`)
- Published posts with performance data

3. **Monitoring and Logging**:
All scheduler jobs log their execution:
```
[ProfileUpdateScheduler] Starting background profile update jobs
[ProfileUpdateScheduler] Monthly voice profile update scheduled for 2024-02-01T00:00:00.000Z
[ProfileUpdateScheduler] Pattern preference learning scheduled (daily at 2 AM)
[ProfileUpdateScheduler] Declining acceptance check scheduled (daily at 3 AM)
[ProfileUpdateScheduler] Running monthly voice profile update job
[ProfileUpdateScheduler] Found 25 users with feedback this month
[ProfileUpdateScheduler] Updated voice profile for user user123
```

## Performance Considerations

- **Batch Processing**: Monthly updates process all users with feedback in batches
- **Query Optimization**: Uses MongoDB indexes on `userId`, `workspaceId`, `timestamp`
- **Incremental Updates**: Profile updates are incremental, not full rewrites
- **Async Execution**: All jobs run asynchronously without blocking
- **Error Handling**: Individual user failures don't stop batch processing

## Testing

Comprehensive test coverage includes:
- Start/stop scheduler functionality
- Acceptance metrics calculation
- Declining acceptance detection with various thresholds
- Voice profile updates from feedback
- Performance correlation analysis
- Recalibration triggering

Run tests:
```bash
npm test -- ProfileUpdateScheduler.test.ts
```

## Future Enhancements

Potential improvements for production deployment:

1. **Distributed Scheduling**: Use BullMQ/Redis for distributed job scheduling
2. **Job Queue**: Queue individual user updates for parallel processing
3. **Retry Logic**: Add retry mechanisms for failed updates
4. **Monitoring Dashboard**: UI for viewing scheduler job status
5. **User Notifications**: Notify users when recalibration is recommended
6. **A/B Testing**: Test different update frequencies and thresholds
7. **Analytics**: Track scheduler effectiveness metrics

## Troubleshooting

### Job Not Running
- Check server logs for scheduler initialization
- Verify timers are set: `console.log(scheduler)`
- Ensure server hasn't been restarted (timers are in-memory)

### Profile Not Updating
- Verify feedback is being captured (check `captionfeedback` collection)
- Check if user has generated captions in the last 30 days
- Look for error logs in monthly update job

### High Memory Usage
- Reduce batch size in `getRecentFeedback` calls
- Implement pagination for large user bases
- Add memory monitoring and alerts

### Missed Schedules
- Jobs reschedule after server restart
- Consider using persistent job queue (BullMQ) for production
- Add health check endpoint to verify scheduler status
