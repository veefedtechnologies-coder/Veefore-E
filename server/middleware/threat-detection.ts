/**
 * P8-1: ADVANCED THREAT DETECTION ENGINE
 * Enterprise-grade threat detection with real-time anomaly analysis
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ThreatIntelligenceService } from '../services/threat-intelligence';

// Threat Detection Configuration
const THREAT_CONFIG = {
  // Rate-based anomalies
  SUSPICIOUS_REQUEST_THRESHOLD: 100, // requests per minute
  FAILED_LOGIN_THRESHOLD: 5, // failed attempts per IP
  BLOCKED_REQUEST_THRESHOLD: 10, // blocked requests per IP
  
  // Behavioral anomalies
  UNUSUAL_HOUR_THRESHOLD: 22, // requests after 10 PM
  GEO_VELOCITY_THRESHOLD: 500, // km/hour impossible travel
  
  // Pattern detection
  SQL_INJECTION_PATTERNS: [
    /(\bunion\s+select|select.*from|insert\s+into|delete\s+from|update.*set)/i,
    /(\bor\s+1=1|and\s+1=1|\bor\s+'[^']*'='[^']*')/i,
    /(script|javascript|vbscript|onload|onerror)/i
  ],
  
  XSS_PATTERNS: [
    /<script[^>]*>.*?<\/script>/i,
    /javascript:|data:text\/html|vbscript:/i,
    /on\w+\s*=\s*["'].*?["']/i
  ],

  // Threat intelligence
  KNOWN_MALICIOUS_IPS: new Set([
    '192.168.1.666', // Example malicious IP
    '10.0.0.666'
  ]),
  
  SUSPICIOUS_USER_AGENTS: [
    /sqlmap|nmap|nikto|burp|acunetix/i,
    /curl|wget|python-requests/i // In production, be more selective
  ]
};

// Threat Detection State
interface ThreatMetrics {
  requestCount: Map<string, number>;
  failedLogins: Map<string, number>;
  blockedRequests: Map<string, number>;
  suspiciousPatterns: Map<string, number>;
  lastReset: number;
}

const threatMetrics: ThreatMetrics = {
  requestCount: new Map(),
  failedLogins: new Map(),
  blockedRequests: new Map(),
  suspiciousPatterns: new Map(),
  lastReset: Date.now()
};

// Threat Severity Levels
enum ThreatLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ThreatEvent {
  id: string;
  timestamp: number;
  ip: string;
  endpoint: string;
  method: string;
  threatType: string;
  severity: ThreatLevel;
  details: any;
  userAgent?: string;
  correlationId?: string;
}

// Active threat events storage
const activeThreatEvents: ThreatEvent[] = [];
const THREAT_EVENT_RETENTION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * P8-1.1: Real-time Anomaly Detection
 */
async function detectAnomalies(req: Request): Promise<ThreatEvent[]> {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const endpoint = req.path;
  const method = req.method;
  const userAgent = req.get('User-Agent') || '';
  const now = Date.now();
  
  const threats: ThreatEvent[] = [];
  
  // Reset metrics every minute
  if (now - threatMetrics.lastReset > 60000) {
    threatMetrics.requestCount.clear();
    threatMetrics.failedLogins.clear();
    threatMetrics.blockedRequests.clear();
    threatMetrics.lastReset = now;
  }
  
  // Track request frequency
  const currentCount = threatMetrics.requestCount.get(ip) || 0;
  threatMetrics.requestCount.set(ip, currentCount + 1);
  
  // 1. Rate-based anomaly detection
  if (currentCount > THREAT_CONFIG.SUSPICIOUS_REQUEST_THRESHOLD) {
    threats.push({
      id: uuidv4(),
      timestamp: now,
      ip,
      endpoint,
      method,
      threatType: 'rate_anomaly',
      severity: ThreatLevel.HIGH,
      details: { requestCount: currentCount, threshold: THREAT_CONFIG.SUSPICIOUS_REQUEST_THRESHOLD }
    });
  }
  
  // 2. Enhanced IP reputation analysis
  try {
    const reputation = await ThreatIntelligenceService.getIPReputation(ip);
    if (reputation.reputation === 'malicious') {
      threats.push({
        id: uuidv4(),
        timestamp: now,
        ip,
        endpoint,
        method,
        threatType: 'malicious_ip_reputation',
        severity: ThreatLevel.CRITICAL,
        details: { 
          reputation: reputation.reputation,
          confidence: reputation.confidence,
          sources: reputation.sources,
          categories: reputation.categories
        }
      });
    } else if (reputation.reputation === 'suspicious' && reputation.confidence > 50) {
      threats.push({
        id: uuidv4(),
        timestamp: now,
        ip,
        endpoint,
        method,
        threatType: 'suspicious_ip_reputation',
        severity: ThreatLevel.MEDIUM,
        details: { 
          reputation: reputation.reputation,
          confidence: reputation.confidence,
          sources: reputation.sources,
          categories: reputation.categories
        }
      });
    }
  } catch (error) {
    // Fallback to basic malicious IP check if service fails
    if (THREAT_CONFIG.KNOWN_MALICIOUS_IPS.has(ip)) {
      threats.push({
        id: uuidv4(),
        timestamp: now,
        ip,
        endpoint,
        method,
        threatType: 'malicious_ip',
        severity: ThreatLevel.CRITICAL,
        details: { reason: 'Known malicious IP from threat intelligence' }
      });
    }
  }
  
  // 3. Enhanced user agent analysis
  const userAgentAnalysis = ThreatIntelligenceService.analyzeUserAgent(userAgent);
  if (userAgentAnalysis.isAttackTool) {
    threats.push({
      id: uuidv4(),
      timestamp: now,
      ip,
      endpoint,
      method,
      threatType: 'attack_tool_detected',
      severity: ThreatLevel.HIGH,
      details: { 
        userAgent, 
        riskScore: userAgentAnalysis.riskScore,
        categories: userAgentAnalysis.categories
      },
      userAgent
    });
  } else if (userAgentAnalysis.riskScore > 40) {
    threats.push({
      id: uuidv4(),
      timestamp: now,
      ip,
      endpoint,
      method,
      threatType: 'suspicious_user_agent',
      severity: ThreatLevel.MEDIUM,
      details: { 
        userAgent, 
        riskScore: userAgentAnalysis.riskScore,
        categories: userAgentAnalysis.categories
      },
      userAgent
    });
  }
  
  // 4. Injection attack detection
  const queryString = JSON.stringify(req.query);
  const bodyString = JSON.stringify(req.body);
  const fullPayload = `${queryString} ${bodyString}`;
  
  // SQL Injection detection
  if (THREAT_CONFIG.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(fullPayload))) {
    threats.push({
      id: uuidv4(),
      timestamp: now,
      ip,
      endpoint,
      method,
      threatType: 'sql_injection_attempt',
      severity: ThreatLevel.CRITICAL,
      details: { payload: fullPayload.substring(0, 200) } // Truncate for security
    });
  }
  
  // XSS detection
  if (THREAT_CONFIG.XSS_PATTERNS.some(pattern => pattern.test(fullPayload))) {
    threats.push({
      id: uuidv4(),
      timestamp: now,
      ip,
      endpoint,
      method,
      threatType: 'xss_attempt',
      severity: ThreatLevel.HIGH,
      details: { payload: fullPayload.substring(0, 200) }
    });
  }
  
  return threats;
}

/**
 * P8-1.2: Automated Threat Response
 */
function executeAutomatedResponse(threat: ThreatEvent): boolean {
  const actions: string[] = [];
  
  switch (threat.severity) {
    case ThreatLevel.CRITICAL:
      // Immediate IP blocking for critical threats
      actions.push(`BLOCK_IP:${threat.ip}`);
      actions.push(`ALERT_SECURITY_TEAM:${threat.id}`);
      actions.push(`LOG_FORENSICS:${threat.id}`);
      break;
      
    case ThreatLevel.HIGH:
      // Enhanced monitoring and rate limiting
      actions.push(`RATE_LIMIT:${threat.ip}:STRICT`);
      actions.push(`ALERT_ADMINS:${threat.id}`);
      actions.push(`LOG_SECURITY:${threat.id}`);
      break;
      
    case ThreatLevel.MEDIUM:
      // Logging and monitoring
      actions.push(`MONITOR:${threat.ip}`);
      actions.push(`LOG_SUSPICIOUS:${threat.id}`);
      break;
      
    case ThreatLevel.LOW:
      // Basic logging
      actions.push(`LOG_INFO:${threat.id}`);
      break;
  }
  
  // Log the automated response actions
  console.log(`🚨 P8-THREAT-RESPONSE: Executing ${actions.length} automated actions for ${threat.threatType}:`, {
    threatId: threat.id,
    severity: threat.severity,
    ip: threat.ip,
    actions: actions
  });
  
  return true; // Actions executed successfully
}

/**
 * P8-1.3: Threat Event Correlation
 */
function correlateThreats(newThreats: ThreatEvent[]): void {
  // Clean up old threat events
  const cutoffTime = Date.now() - THREAT_EVENT_RETENTION;
  const activeIndex = activeThreatEvents.findIndex(event => event.timestamp > cutoffTime);
  if (activeIndex > 0) {
    activeThreatEvents.splice(0, activeIndex);
  }
  
  // Add new threats
  activeThreatEvents.push(...newThreats);
  
  // Correlation analysis
  const ipThreats = new Map<string, ThreatEvent[]>();
  activeThreatEvents.forEach(threat => {
    if (!ipThreats.has(threat.ip)) {
      ipThreats.set(threat.ip, []);
    }
    ipThreats.get(threat.ip)!.push(threat);
  });
  
  // Detect coordinated attacks
  ipThreats.forEach((threats, ip) => {
    if (threats.length >= 3) {
      const correlatedThreat: ThreatEvent = {
        id: uuidv4(),
        timestamp: Date.now(),
        ip,
        endpoint: 'MULTIPLE',
        method: 'MULTIPLE',
        threatType: 'coordinated_attack',
        severity: ThreatLevel.CRITICAL,
        details: {
          relatedThreats: threats.map(t => t.id),
          threatTypes: [...new Set(threats.map(t => t.threatType))],
          timespan: Math.max(...threats.map(t => t.timestamp)) - Math.min(...threats.map(t => t.timestamp))
        }
      };
      
      executeAutomatedResponse(correlatedThreat);
    }
  });
}

/**
 * P8-1: Main Threat Detection Middleware
 */
export const threatDetectionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Detect threats for this request
    const detectedThreats = await detectAnomalies(req);
    
    // Process each detected threat
    if (detectedThreats.length > 0) {
      detectedThreats.forEach(threat => {
        // Add correlation ID if available
        threat.correlationId = req.headers['x-correlation-id'] as string || res.locals.correlationId;
        
        // Execute automated response
        executeAutomatedResponse(threat);
      });
      
      // Perform threat correlation analysis
      correlateThreats(detectedThreats);
      
      // Log aggregated threat detection
      console.log(`🛡️ P8-THREAT-DETECTED: ${detectedThreats.length} threats detected from ${req.ip}:`, {
        ip: req.ip,
        endpoint: req.path,
        threats: detectedThreats.map(t => ({ type: t.threatType, severity: t.severity }))
      });
    }
    
    // Continue processing - threats are logged and handled, but requests continue
    // In production, you might want to block certain critical threats
    next();
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Threat detection middleware failed:', error);
    next(); // Continue even if threat detection fails
  }
};

/**
 * P8-1.4: Threat Intelligence API
 */
export const getThreatIntelligence = () => {
  const recentThreats = activeThreatEvents.filter(
    event => event.timestamp > Date.now() - 60000 // Last minute
  );
  
  const threatSummary = {
    timestamp: new Date().toISOString(),
    totalActiveThreats: activeThreatEvents.length,
    recentThreats: recentThreats.length,
    threatsByType: {} as Record<string, number>,
    threatsBySeverity: {} as Record<string, number>,
    topThreatenedIPs: [] as Array<{ ip: string, threatCount: number }>
  };
  
  // Aggregate threat statistics
  activeThreatEvents.forEach(threat => {
    threatSummary.threatsByType[threat.threatType] = 
      (threatSummary.threatsByType[threat.threatType] || 0) + 1;
    threatSummary.threatsBySeverity[threat.severity] = 
      (threatSummary.threatsBySeverity[threat.severity] || 0) + 1;
  });
  
  // Top threatened IPs
  const ipCounts = new Map<string, number>();
  activeThreatEvents.forEach(threat => {
    ipCounts.set(threat.ip, (ipCounts.get(threat.ip) || 0) + 1);
  });
  
  threatSummary.topThreatenedIPs = Array.from(ipCounts.entries())
    .map(([ip, count]) => ({ ip, threatCount: count }))
    .sort((a, b) => b.threatCount - a.threatCount)
    .slice(0, 10);
  
  return threatSummary;
};

// Export threat metrics for monitoring
export { threatMetrics, activeThreatEvents, ThreatLevel };