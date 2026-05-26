/**
 * P8-2: SECURITY OPERATIONS DASHBOARD API
 * Real-time security monitoring and threat intelligence endpoints
 */

import { Router } from 'express';
import { getThreatIntelligence, activeThreatEvents, ThreatLevel } from '../middleware/threat-detection';

const router = Router();

/**
 * P8-2.1: Real-time Threat Intelligence Dashboard
 */
router.get('/threat-intelligence', (req, res) => {
  try {
    const intelligence = getThreatIntelligence();
    
    res.json({
      success: true,
      data: intelligence,
      meta: {
        lastUpdated: new Date().toISOString(),
        retentionPeriod: '24 hours',
        detectionEngineStatus: 'active'
      }
    });
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Failed to retrieve threat intelligence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve threat intelligence'
    });
  }
});

/**
 * P8-2.2: Active Threats Monitor
 */
router.get('/active-threats', (req, res) => {
  try {
    const { severity, limit = 50, offset = 0 } = req.query;
    
    let threats = [...activeThreatEvents];
    
    // Filter by severity if specified
    if (severity) {
      threats = threats.filter(threat => threat.severity === severity);
    }
    
    // Sort by timestamp (most recent first)
    threats.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedThreats = threats.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        threats: paginatedThreats,
        pagination: {
          total: threats.length,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: endIndex < threats.length
        }
      }
    });
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Failed to retrieve active threats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve active threats'
    });
  }
});

/**
 * P8-2.3: Security Metrics Overview
 */
router.get('/security-metrics', (req, res) => {
  try {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    const last24Hours = now - (24 * 60 * 60 * 1000);
    
    // Calculate metrics for different time periods
    const lastHourThreats = activeThreatEvents.filter(t => t.timestamp > lastHour);
    const last24HourThreats = activeThreatEvents.filter(t => t.timestamp > last24Hours);
    
    const metrics = {
      overview: {
        totalActiveThreats: activeThreatEvents.length,
        threatsLastHour: lastHourThreats.length,
        threatsLast24Hours: last24HourThreats.length,
        averageThreatsPerHour: Math.round(last24HourThreats.length / 24)
      },
      severity: {
        critical: activeThreatEvents.filter(t => t.severity === ThreatLevel.CRITICAL).length,
        high: activeThreatEvents.filter(t => t.severity === ThreatLevel.HIGH).length,
        medium: activeThreatEvents.filter(t => t.severity === ThreatLevel.MEDIUM).length,
        low: activeThreatEvents.filter(t => t.severity === ThreatLevel.LOW).length
      },
      topThreatTypes: getTopThreatTypes(activeThreatEvents, 10),
      geographicalDistribution: getGeographicalDistribution(activeThreatEvents),
      timeSeriesData: getHourlyThreatCounts(last24HourThreats)
    };
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Failed to calculate security metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate security metrics'
    });
  }
});

/**
 * P8-2.4: Threat Hunting Query Interface
 */
router.post('/threat-hunt', (req, res) => {
  try {
    const { 
      ip, 
      threatType, 
      severity, 
      startTime, 
      endTime, 
      endpoint,
      userAgent 
    } = req.body;
    
    let results = [...activeThreatEvents];
    
    // Apply filters
    if (ip) {
      results = results.filter(threat => threat.ip.includes(ip));
    }
    
    if (threatType) {
      results = results.filter(threat => threat.threatType === threatType);
    }
    
    if (severity) {
      results = results.filter(threat => threat.severity === severity);
    }
    
    if (startTime) {
      results = results.filter(threat => threat.timestamp >= new Date(startTime).getTime());
    }
    
    if (endTime) {
      results = results.filter(threat => threat.timestamp <= new Date(endTime).getTime());
    }
    
    if (endpoint) {
      results = results.filter(threat => threat.endpoint.includes(endpoint));
    }
    
    if (userAgent) {
      results = results.filter(threat => 
        threat.userAgent && threat.userAgent.includes(userAgent)
      );
    }
    
    // Sort by timestamp
    results.sort((a, b) => b.timestamp - a.timestamp);
    
    res.json({
      success: true,
      data: {
        threats: results,
        totalFound: results.length,
        query: req.body
      }
    });
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Threat hunting query failed:', error);
    res.status(500).json({
      success: false,
      error: 'Threat hunting query failed'
    });
  }
});

/**
 * P8-2.5: Security Incident Report Generator
 */
router.get('/incident-report/:threatId', (req, res) => {
  try {
    const { threatId } = req.params;
    
    const threat = activeThreatEvents.find(t => t.id === threatId);
    if (!threat) {
      return res.status(404).json({
        success: false,
        error: 'Threat not found'
      });
    }
    
    // Find related threats (same IP, similar time)
    const relatedThreats = activeThreatEvents.filter(t => 
      t.id !== threatId && 
      t.ip === threat.ip &&
      Math.abs(t.timestamp - threat.timestamp) < (60 * 60 * 1000) // Within 1 hour
    );
    
    const report = {
      incident: {
        id: threat.id,
        timestamp: new Date(threat.timestamp).toISOString(),
        severity: threat.severity,
        type: threat.threatType,
        status: 'detected'
      },
      source: {
        ip: threat.ip,
        userAgent: threat.userAgent,
        endpoint: threat.endpoint,
        method: threat.method
      },
      details: threat.details,
      relatedIncidents: relatedThreats.map(t => ({
        id: t.id,
        type: t.threatType,
        severity: t.severity,
        timestamp: new Date(t.timestamp).toISOString()
      })),
      timeline: [
        {
          time: new Date(threat.timestamp).toISOString(),
          event: 'Threat detected',
          details: `${threat.threatType} detected from ${threat.ip}`
        },
        {
          time: new Date().toISOString(),
          event: 'Report generated',
          details: 'Incident report requested and generated'
        }
      ],
      recommendations: generateSecurityRecommendations(threat)
    };
    
    res.json({
      success: true,
      data: report
    });
    
  } catch (error) {
    console.error('🚨 P8-ERROR: Failed to generate incident report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate incident report'
    });
  }
});

// Helper Functions

function getTopThreatTypes(threats: any[], limit: number) {
  const counts = threats.reduce((acc, threat) => {
    acc[threat.threatType] = (acc[threat.threatType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(counts)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, limit)
    .map(([type, count]) => ({ type, count }));
}

function getGeographicalDistribution(threats: any[]) {
  // Simplified geographical distribution based on IP patterns
  const regions = threats.reduce((acc, threat) => {
    let region = 'Unknown';
    const ip = threat.ip;
    
    // Basic IP to region mapping (in production, use proper GeoIP service)
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      region = 'Internal';
    } else if (ip.startsWith('127.')) {
      region = 'Localhost';
    } else {
      region = 'External';
    }
    
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(regions).map(([region, count]) => ({ region, count }));
}

function getHourlyThreatCounts(threats: any[]) {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date();
    hour.setHours(hour.getHours() - (23 - i), 0, 0, 0);
    return { 
      hour: hour.toISOString().substr(11, 2) + ':00',
      timestamp: hour.getTime(),
      count: 0 
    };
  });
  
  threats.forEach(threat => {
    const threatHour = new Date(threat.timestamp);
    threatHour.setMinutes(0, 0, 0);
    
    const hourIndex = hours.findIndex(h => h.timestamp === threatHour.getTime());
    if (hourIndex >= 0) {
      hours[hourIndex].count++;
    }
  });
  
  return hours;
}

function generateSecurityRecommendations(threat: any): string[] {
  const recommendations: string[] = [];
  
  switch (threat.threatType) {
    case 'sql_injection_attempt':
      recommendations.push('Implement parameterized queries and input validation');
      recommendations.push('Enable Web Application Firewall (WAF) rules');
      recommendations.push('Review and audit database access permissions');
      break;
      
    case 'xss_attempt':
      recommendations.push('Implement Content Security Policy (CSP) headers');
      recommendations.push('Enable input sanitization and output encoding');
      recommendations.push('Use secure templating engines with auto-escaping');
      break;
      
    case 'rate_anomaly':
      recommendations.push('Implement progressive rate limiting');
      recommendations.push('Deploy CAPTCHA for suspicious traffic');
      recommendations.push('Consider IP-based blocking for persistent offenders');
      break;
      
    case 'malicious_ip':
      recommendations.push('Block IP address immediately');
      recommendations.push('Review and update threat intelligence feeds');
      recommendations.push('Analyze related traffic patterns');
      break;
      
    case 'coordinated_attack':
      recommendations.push('Activate incident response procedures');
      recommendations.push('Implement network-level blocking');
      recommendations.push('Alert security operations center (SOC)');
      break;
      
    default:
      recommendations.push('Monitor for additional suspicious activity');
      recommendations.push('Review security logs and patterns');
      recommendations.push('Update threat detection rules if necessary');
  }
  
  return recommendations;
}

export default router;