import { Request, Response } from 'express';
import Analytics from '../models/Analytics';
import User from '../models/User';
import Subscription from '../models/Subscription';
import SystemMetrics from '../models/SystemMetrics';

// Get analytics overview
export const getAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get analytics data
    const [
      totalRevenue,
      totalUsers,
      pageViews,
      conversions,
      newUsers,
      returningUsers,
      bounceRate,
      avgSessionDuration
    ] = await Promise.all([
      Subscription.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      Analytics.aggregate([
        { $match: { type: 'page_view', timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { type: 'conversion', timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      User.countDocuments({ 
        createdAt: { $gte: startDate },
        lastLogin: { $exists: false }
      }),
      User.countDocuments({ 
        createdAt: { $gte: startDate },
        lastLogin: { $exists: true }
      }),
      // Mock bounce rate calculation
      Promise.resolve(35.2),
      // Mock average session duration
      Promise.resolve(180) // 3 minutes
    ]);

    // Calculate growth rates (mock data for now)
    const revenue = totalRevenue[0]?.total || 0;
    const pageViewCount = pageViews[0]?.count || 0;
    const conversionCount = conversions[0]?.count || 0;
    const conversionRate = pageViewCount > 0 ? (conversionCount / pageViewCount) * 100 : 0;

    res.json({
      totalRevenue: revenue,
      totalUsers,
      pageViews: pageViewCount,
      conversionRate: Math.round(conversionRate * 100) / 100,
      bounceRate,
      avgSessionDuration,
      newUsers,
      returningUsers,
      revenueGrowth: Math.floor(Math.random() * 20) + 5, // 5-25%
      userGrowth: Math.floor(Math.random() * 15) + 8, // 8-23%
      pageViewGrowth: Math.floor(Math.random() * 25) + 10, // 10-35%
      conversionGrowth: Math.floor(Math.random() * 10) + 2 // 2-12%
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
};

// Get traffic sources data
export const getTrafficSources = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
    }

    // Mock traffic sources data
    const trafficSources = [
      {
        source: 'Direct',
        visitors: Math.floor(Math.random() * 5000) + 2000,
        sessions: Math.floor(Math.random() * 6000) + 2500,
        bounceRate: Math.floor(Math.random() * 20) + 30,
        conversionRate: Math.floor(Math.random() * 5) + 3,
        revenue: Math.floor(Math.random() * 10000) + 5000,
        trend: Array.from({ length: 7 }, () => Math.floor(Math.random() * 100))
      },
      {
        source: 'Google',
        visitors: Math.floor(Math.random() * 4000) + 1500,
        sessions: Math.floor(Math.random() * 5000) + 2000,
        bounceRate: Math.floor(Math.random() * 15) + 25,
        conversionRate: Math.floor(Math.random() * 4) + 4,
        revenue: Math.floor(Math.random() * 8000) + 4000,
        trend: Array.from({ length: 7 }, () => Math.floor(Math.random() * 100))
      },
      {
        source: 'Facebook',
        visitors: Math.floor(Math.random() * 2000) + 800,
        sessions: Math.floor(Math.random() * 2500) + 1000,
        bounceRate: Math.floor(Math.random() * 10) + 40,
        conversionRate: Math.floor(Math.random() * 3) + 2,
        revenue: Math.floor(Math.random() * 5000) + 2000,
        trend: Array.from({ length: 7 }, () => Math.floor(Math.random() * 100))
      },
      {
        source: 'Twitter',
        visitors: Math.floor(Math.random() * 1000) + 400,
        sessions: Math.floor(Math.random() * 1200) + 500,
        bounceRate: Math.floor(Math.random() * 8) + 35,
        conversionRate: Math.floor(Math.random() * 2) + 1,
        revenue: Math.floor(Math.random() * 3000) + 1000,
        trend: Array.from({ length: 7 }, () => Math.floor(Math.random() * 100))
      }
    ];

    res.json(trafficSources);
  } catch (error) {
    console.error('Error fetching traffic sources:', error);
    res.status(500).json({ error: 'Failed to fetch traffic sources' });
  }
};

// Get device analytics
export const getDeviceAnalytics = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Mock device data
    const deviceData = [
      {
        device: 'Desktop',
        visitors: Math.floor(Math.random() * 3000) + 2000,
        percentage: 65,
        sessions: Math.floor(Math.random() * 4000) + 2500,
        bounceRate: Math.floor(Math.random() * 10) + 25,
        conversionRate: Math.floor(Math.random() * 3) + 4
      },
      {
        device: 'Mobile',
        visitors: Math.floor(Math.random() * 2000) + 1000,
        percentage: 25,
        sessions: Math.floor(Math.random() * 2500) + 1200,
        bounceRate: Math.floor(Math.random() * 15) + 40,
        conversionRate: Math.floor(Math.random() * 2) + 2
      },
      {
        device: 'Tablet',
        visitors: Math.floor(Math.random() * 500) + 200,
        percentage: 10,
        sessions: Math.floor(Math.random() * 600) + 300,
        bounceRate: Math.floor(Math.random() * 8) + 35,
        conversionRate: Math.floor(Math.random() * 2) + 3
      }
    ];

    res.json(deviceData);
  } catch (error) {
    console.error('Error fetching device analytics:', error);
    res.status(500).json({ error: 'Failed to fetch device analytics' });
  }
};

// Get geographic analytics
export const getGeographicAnalytics = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Mock geographic data
    const geographicData = [
      { country: 'United States', visitors: 4500, revenue: 25000, conversionRate: 4.2, flag: '🇺🇸' },
      { country: 'United Kingdom', visitors: 3200, revenue: 18000, conversionRate: 3.8, flag: '🇬🇧' },
      { country: 'Canada', visitors: 2800, revenue: 15000, conversionRate: 4.1, flag: '🇨🇦' },
      { country: 'Germany', visitors: 2100, revenue: 12000, conversionRate: 3.5, flag: '🇩🇪' },
      { country: 'France', visitors: 1800, revenue: 10000, conversionRate: 3.2, flag: '🇫🇷' },
      { country: 'Australia', visitors: 1500, revenue: 8500, conversionRate: 3.9, flag: '🇦🇺' }
    ];

    res.json(geographicData);
  } catch (error) {
    console.error('Error fetching geographic analytics:', error);
    res.status(500).json({ error: 'Failed to fetch geographic analytics' });
  }
};

// Get conversion funnel
export const getConversionFunnel = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Mock conversion funnel data
    const funnelData = [
      {
        step: 'Landing Page',
        visitors: 10000,
        conversions: 8000,
        rate: 80.0,
        dropoff: 20.0
      },
      {
        step: 'Product Page',
        visitors: 8000,
        conversions: 6000,
        rate: 75.0,
        dropoff: 25.0
      },
      {
        step: 'Add to Cart',
        visitors: 6000,
        conversions: 3000,
        rate: 50.0,
        dropoff: 50.0
      },
      {
        step: 'Checkout',
        visitors: 3000,
        conversions: 2400,
        rate: 80.0,
        dropoff: 20.0
      },
      {
        step: 'Payment',
        visitors: 2400,
        conversions: 2000,
        rate: 83.3,
        dropoff: 16.7
      }
    ];

    res.json(funnelData);
  } catch (error) {
    console.error('Error fetching conversion funnel:', error);
    res.status(500).json({ error: 'Failed to fetch conversion funnel' });
  }
};

// Get real-time analytics
export const getRealTimeAnalytics = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);

    // Get real-time data
    const [activeUsers, pageViews, conversions, topPages, topSources] = await Promise.all([
      User.countDocuments({ 
        lastLogin: { $gte: last5Minutes } 
      }),
      Analytics.aggregate([
        { $match: { type: 'page_view', timestamp: { $gte: last5Minutes } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { type: 'conversion', timestamp: { $gte: last5Minutes } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { type: 'page_view', timestamp: { $gte: last5Minutes } } },
        { $group: { _id: '$metadata.page', views: { $sum: 1 }, users: { $addToSet: '$userId' } } },
        { $project: { page: '$_id', views: 1, users: { $size: '$users' } } },
        { $sort: { views: -1 } },
        { $limit: 5 }
      ]),
      Analytics.aggregate([
        { $match: { type: 'page_view', timestamp: { $gte: last5Minutes } } },
        { $group: { _id: '$metadata.source', visitors: { $addToSet: '$userId' } } },
        { $project: { source: '$_id', visitors: { $size: '$visitors' } } },
        { $sort: { visitors: -1 } },
        { $limit: 5 }
      ])
    ]);

    res.json({
      activeUsers,
      pageViews: pageViews[0]?.count || 0,
      conversions: conversions[0]?.count || 0,
      topPages: topPages.map(p => ({ page: p.page, views: p.views, users: p.users })),
      topSources: topSources.map(s => ({ source: s.source, visitors: s.visitors }))
    });
  } catch (error) {
    console.error('Error fetching real-time analytics:', error);
    res.status(500).json({ error: 'Failed to fetch real-time analytics' });
  }
};

// Get sales analytics
export const getSalesAnalytics = async (req: Request, res: Response) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
    }

    // Get sales data grouped by time periods
    const salesData = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          users: { $addToSet: '$userId' },
          sessions: { $sum: 1 }
        }
      },
      {
        $project: {
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1
                }
              }
            }
          },
          revenue: 1,
          users: { $size: '$users' },
          sessions: 1
        }
      },
      { $sort: { month: 1 } }
    ]);

    res.json(salesData);
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
};

// Export analytics data
export const exportAnalytics = async (req: Request, res: Response) => {
  try {
    const { timeRange, format = 'excel', includeCharts = false } = req.body;

    // Get all analytics data
    const [overview, traffic, devices, geographic, funnel, realTime, sales] = await Promise.all([
      getAnalyticsOverview(req, res),
      getTrafficSources(req, res),
      getDeviceAnalytics(req, res),
      getGeographicAnalytics(req, res),
      getConversionFunnel(req, res),
      getRealTimeAnalytics(req, res),
      getSalesAnalytics(req, res)
    ]);

    // For now, return JSON data
    // In production, you would generate Excel/PDF files here
    res.json({
      overview,
      traffic,
      devices,
      geographic,
      funnel,
      realTime,
      sales,
      exportedAt: new Date().toISOString(),
      format,
      includeCharts
    });
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ error: 'Failed to export analytics data' });
  }
};