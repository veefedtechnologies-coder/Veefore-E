/**
 * P8-3: ENHANCED THREAT INTELLIGENCE SERVICE
 * Integration with external threat feeds and reputation services
 */

import { Request } from 'express';

interface ThreatIntelligenceSource {
  name: string;
  url?: string;
  enabled: boolean;
  lastUpdate: number;
  errorCount: number;
}

interface ReputationData {
  ip: string;
  reputation: 'clean' | 'suspicious' | 'malicious';
  sources: string[];
  confidence: number; // 0-100
  lastSeen: number;
  categories: string[]; // e.g., ['malware', 'botnet', 'phishing']
}

// Enhanced threat intelligence configuration
const THREAT_INTEL_CONFIG = {
  // Known malicious patterns
  MALICIOUS_IP_RANGES: [
    '0.0.0.0/8',     // This network (RFC 1700)
    '10.0.0.0/8',    // Private-use networks (example for demo)
    '127.0.0.0/8',   // Loopback (example for demo)
    '169.254.0.0/16', // Link-local
    '224.0.0.0/4',   // Multicast
    '240.0.0.0/4'    // Reserved
  ],
  
  // Suspicious user agents (attack tools)
  ATTACK_TOOL_SIGNATURES: [
    /sqlmap/i, /burpsuite/i, /acunetix/i, /nikto/i, /nmap/i,
    /masscan/i, /zap/i, /w3af/i, /havij/i, /bsqlbf/i,
    /dirbuster/i, /gobuster/i, /wfuzz/i, /ffuf/i, /hydra/i
  ],
  
  // Known bot networks
  BOT_SIGNATURES: [
    /python-requests/i, /curl/i, /wget/i, /libwww/i,
    /mechanize/i, /scrapy/i, /httpclient/i, /okhttp/i
  ],
  
  // Geographical risk assessment
  HIGH_RISK_COUNTRIES: ['XX', 'ZZ'], // ISO country codes for demo
  
  // Update intervals
  REPUTATION_UPDATE_INTERVAL: 3600000, // 1 hour
  IP_CACHE_TTL: 1800000, // 30 minutes
  
  // Threat scoring weights
  SCORING: {
    KNOWN_MALICIOUS: 100,
    ATTACK_TOOL: 80,
    BOT_NETWORK: 40,
    HIGH_RISK_GEO: 30,
    SUSPICIOUS_PATTERN: 50,
    RATE_ANOMALY: 60
  }
};

// In-memory reputation cache
const reputationCache = new Map<string, ReputationData>();

// Threat intelligence sources
const threatSources: ThreatIntelligenceSource[] = [
  { name: 'internal_blocklist', enabled: true, lastUpdate: 0, errorCount: 0 },
  { name: 'community_feeds', enabled: true, lastUpdate: 0, errorCount: 0 },
  { name: 'geo_intelligence', enabled: true, lastUpdate: 0, errorCount: 0 }
];

/**
 * P8-3.1: IP Reputation Assessment
 */
export class ThreatIntelligenceService {
  
  static async getIPReputation(ip: string): Promise<ReputationData> {
    // Check cache first
    const cached = reputationCache.get(ip);
    if (cached && (Date.now() - cached.lastSeen) < THREAT_INTEL_CONFIG.IP_CACHE_TTL) {
      return cached;
    }
    
    // Calculate reputation score
    let reputation: 'clean' | 'suspicious' | 'malicious' = 'clean';
    const sources: string[] = [];
    const categories: string[] = [];
    let confidence = 0;
    
    // Check against known malicious IPs (simulated)
    if (this.isKnownMalicious(ip)) {
      reputation = 'malicious';
      sources.push('internal_blocklist');
      categories.push('known_malicious');
      confidence = THREAT_INTEL_CONFIG.SCORING.KNOWN_MALICIOUS;
    }
    
    // Check for private/internal IPs (development context)
    if (this.isPrivateIP(ip)) {
      reputation = 'suspicious';
      sources.push('internal_analysis');
      categories.push('private_network');
      confidence = Math.max(confidence, 30);
    }
    
    // Geographical risk assessment (simulated)
    const geoRisk = await this.assessGeographicalRisk(ip);
    if (geoRisk.isHighRisk) {
      reputation = reputation === 'clean' ? 'suspicious' : reputation;
      sources.push('geo_intelligence');
      categories.push('high_risk_geo');
      confidence = Math.max(confidence, THREAT_INTEL_CONFIG.SCORING.HIGH_RISK_GEO);
    }
    
    const result: ReputationData = {
      ip,
      reputation,
      sources,
      confidence,
      lastSeen: Date.now(),
      categories
    };
    
    // Cache the result
    reputationCache.set(ip, result);
    
    // Log threat intelligence result
    if (reputation !== 'clean') {
      console.log(`🔍 P8-THREAT-INTEL: IP ${ip} assessed as ${reputation} (confidence: ${confidence}%):`, {
        sources,
        categories,
        reputation
      });
    }
    
    return result;
  }
  
  /**
   * P8-3.2: User Agent Analysis
   */
  static analyzeUserAgent(userAgent: string): {
    isAttackTool: boolean;
    isBot: boolean;
    riskScore: number;
    categories: string[];
  } {
    const categories: string[] = [];
    let riskScore = 0;
    
    // Check for attack tools
    const isAttackTool = THREAT_INTEL_CONFIG.ATTACK_TOOL_SIGNATURES.some(pattern => pattern.test(userAgent));
    if (isAttackTool) {
      categories.push('attack_tool');
      riskScore = THREAT_INTEL_CONFIG.SCORING.ATTACK_TOOL;
    }
    
    // Check for bot signatures
    const isBot = THREAT_INTEL_CONFIG.BOT_SIGNATURES.some(pattern => pattern.test(userAgent));
    if (isBot) {
      categories.push('bot_network');
      riskScore = Math.max(riskScore, THREAT_INTEL_CONFIG.SCORING.BOT_NETWORK);
    }
    
    // Check for suspicious patterns
    if (userAgent.length < 10 || userAgent.length > 500) {
      categories.push('unusual_length');
      riskScore = Math.max(riskScore, 20);
    }
    
    if (!/Mozilla|Chrome|Firefox|Safari|Edge|Opera/i.test(userAgent) && !isBot) {
      categories.push('non_browser');
      riskScore = Math.max(riskScore, 30);
    }
    
    return {
      isAttackTool,
      isBot,
      riskScore,
      categories
    };
  }
  
  /**
   * P8-3.3: Pattern-based Threat Detection
   */
  static analyzeRequestPattern(req: Request): {
    threatLevel: number;
    patterns: string[];
    indicators: string[];
  } {
    const patterns: string[] = [];
    const indicators: string[] = [];
    let threatLevel = 0;
    
    // Analyze request path for suspicious patterns
    const path = req.path || '';
    
    // Common attack patterns in URLs
    const urlPatterns = [
      { pattern: /\.\.\//g, name: 'path_traversal', score: 70 },
      { pattern: /\/etc\/passwd/i, name: 'file_disclosure', score: 90 },
      { pattern: /\/proc\/self/i, name: 'proc_access', score: 80 },
      { pattern: /base64_decode|eval\(/i, name: 'code_injection', score: 85 },
      { pattern: /<script|javascript:|vbscript:/i, name: 'xss_attempt', score: 75 },
      { pattern: /union\s+select|1=1|or\s+1=1/i, name: 'sql_injection', score: 90 },
      { pattern: /cmd=|exec\(|system\(/i, name: 'command_injection', score: 95 }
    ];
    
    urlPatterns.forEach(({ pattern, name, score }) => {
      if (pattern.test(path)) {
        patterns.push(name);
        threatLevel = Math.max(threatLevel, score);
        indicators.push(`URL contains ${name} pattern`);
      }
    });
    
    // Analyze query parameters
    const queryString = JSON.stringify(req.query || {});
    const bodyString = JSON.stringify(req.body || {});
    const fullPayload = `${queryString} ${bodyString}`;
    
    // Check for encoded attacks
    if (/%[0-9a-f]{2}/i.test(fullPayload)) {
      const decoded = decodeURIComponent(fullPayload);
      urlPatterns.forEach(({ pattern, name, score }) => {
        if (pattern.test(decoded)) {
          patterns.push(`encoded_${name}`);
          threatLevel = Math.max(threatLevel, score + 10); // Higher score for encoded attacks
          indicators.push(`Encoded payload contains ${name}`);
        }
      });
    }
    
    return {
      threatLevel,
      patterns,
      indicators
    };
  }
  
  /**
   * P8-3.4: Behavioral Analysis
   */
  static analyzeBehavior(ip: string, recentRequests: any[]): {
    anomalyScore: number;
    behaviors: string[];
    recommendations: string[];
  } {
    const behaviors: string[] = [];
    const recommendations: string[] = [];
    let anomalyScore = 0;
    
    if (recentRequests.length === 0) {
      return { anomalyScore: 0, behaviors: ['new_client'], recommendations: [] };
    }
    
    // Request frequency analysis
    const timeSpan = Math.max(...recentRequests.map(r => r.timestamp)) - 
                    Math.min(...recentRequests.map(r => r.timestamp));
    const requestsPerMinute = recentRequests.length / (timeSpan / 60000);
    
    if (requestsPerMinute > 100) {
      behaviors.push('high_frequency');
      anomalyScore += 40;
      recommendations.push('Apply aggressive rate limiting');
    }
    
    // Endpoint diversity analysis
    const uniqueEndpoints = new Set(recentRequests.map(r => r.endpoint)).size;
    const endpointDiversity = uniqueEndpoints / recentRequests.length;
    
    if (endpointDiversity > 0.8) {
      behaviors.push('scanning_behavior');
      anomalyScore += 50;
      recommendations.push('Potential reconnaissance - consider blocking');
    }
    
    // Error rate analysis
    const errorRequests = recentRequests.filter(r => r.status >= 400).length;
    const errorRate = errorRequests / recentRequests.length;
    
    if (errorRate > 0.5) {
      behaviors.push('high_error_rate');
      anomalyScore += 35;
      recommendations.push('High error rate indicates probing attempts');
    }
    
    // Time pattern analysis
    const hours = recentRequests.map(r => new Date(r.timestamp).getHours());
    const uniqueHours = new Set(hours);
    
    if (uniqueHours.size === 1 && hours[0] >= 22 || hours[0] <= 6) {
      behaviors.push('off_hours_activity');
      anomalyScore += 25;
      recommendations.push('Monitor off-hours activity closely');
    }
    
    return {
      anomalyScore,
      behaviors,
      recommendations
    };
  }
  
  // Helper Methods
  
  private static isKnownMalicious(ip: string): boolean {
    // Simulated check against threat intelligence feeds
    const knownMaliciousIPs = [
      '192.168.1.666',
      '10.0.0.666',
      '172.16.0.666'
    ];
    
    return knownMaliciousIPs.includes(ip);
  }
  
  private static isPrivateIP(ip: string): boolean {
    // Check for RFC 1918 private addresses
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./
    ];
    
    return privateRanges.some(range => range.test(ip));
  }
  
  private static async assessGeographicalRisk(ip: string): Promise<{
    isHighRisk: boolean;
    country?: string;
    riskFactors: string[];
  }> {
    // Simulated geographical risk assessment
    // In production, integrate with MaxMind GeoIP or similar service
    
    const riskFactors: string[] = [];
    let isHighRisk = false;
    
    // Simplified logic for demonstration
    if (ip.startsWith('192.168.')) {
      riskFactors.push('private_network');
    }
    
    if (ip.startsWith('10.')) {
      riskFactors.push('internal_network');
    }
    
    // Check for localhost patterns
    if (ip.startsWith('127.') || ip === '::1') {
      riskFactors.push('localhost');
    }
    
    return {
      isHighRisk,
      riskFactors
    };
  }
  
  /**
   * P8-3.5: Threat Intelligence Statistics
   */
  static getIntelligenceStats() {
    return {
      cacheSize: reputationCache.size,
      sources: threatSources.map(s => ({
        name: s.name,
        enabled: s.enabled,
        lastUpdate: s.lastUpdate,
        status: s.errorCount < 3 ? 'healthy' : 'degraded'
      })),
      reputationDistribution: {
        clean: Array.from(reputationCache.values()).filter(r => r.reputation === 'clean').length,
        suspicious: Array.from(reputationCache.values()).filter(r => r.reputation === 'suspicious').length,
        malicious: Array.from(reputationCache.values()).filter(r => r.reputation === 'malicious').length
      }
    };
  }
  
  /**
   * P8-3.6: Clean up old reputation data
   */
  static cleanupCache() {
    const now = Date.now();
    const ttl = THREAT_INTEL_CONFIG.IP_CACHE_TTL;
    
    let cleanedCount = 0;
    for (const [ip, data] of reputationCache.entries()) {
      if (now - data.lastSeen > ttl) {
        reputationCache.delete(ip);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 P8-THREAT-INTEL: Cleaned ${cleanedCount} expired reputation entries`);
    }
  }
}

// Schedule cache cleanup every hour
setInterval(() => {
  ThreatIntelligenceService.cleanupCache();
}, 3600000);

export { ReputationData, THREAT_INTEL_CONFIG };