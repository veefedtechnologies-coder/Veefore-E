import { Request, Response } from 'express';
import Admin from '../models/Admin';
import User from '../models/User';
import Subscription from '../models/Subscription';
import Analytics from '../models/Analytics';
import SystemMetrics from '../models/SystemMetrics';

// Get dashboard statistics
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { timeRange = '7d' } = req.query;
    
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
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get real data from database
    const [
      totalUsers,
      totalRevenue,
      activeSessions,
      pageViews,
      downloads,
      tasksCompleted
    ] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: startDate } }),
      Subscription.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.countDocuments({ 
        lastLogin: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
      }),
      Analytics.aggregate([
        { $match: { type: 'page_view', timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { type: 'download', timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { type: 'task_completed', timestamp: { $gte: startDate } } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ])
    ]);

    const revenue = totalRevenue[0]?.total || 0;
    const views = pageViews[0]?.count || 0;
    const downloadCount = downloads[0]?.count || 0;
    const tasks = tasksCompleted[0]?.count || 0;

    // Calculate growth rate
    const previousPeriod = new Date(startDate);
    previousPeriod.setTime(previousPeriod.getTime() - (now.getTime() - startDate.getTime()));
    
    const [previousUsers, previousRevenue] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: previousPeriod, $lt: startDate } }),
      Subscription.aggregate([
        { $match: { createdAt: { $gte: previousPeriod, $lt: startDate }, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const previousRevenueAmount = previousRevenue[0]?.total || 0;
    const growthRate = previousRevenueAmount > 0 
      ? Math.round(((revenue - previousRevenueAmount) / previousRevenueAmount) * 100)
      : 0;

    const conversionRate = totalUsers > 0 ? Math.round((revenue / totalUsers) * 100) / 100 : 0;

    res.json({
      totalUsers,
      totalRevenue: revenue,
      activeSessions,
      conversionRate,
      growthRate,
      pageViews: views,
      downloads: downloadCount,
      tasksCompleted: tasks
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

// Get sales analytics data
export const getSalesData = async (req: Request, res: Response) => {
  try {
    const { timeRange = '7d' } = req.query;
    
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
          sales: { $sum: 1 },
          revenue: { $sum: '$amount' },
          users: { $addToSet: '$userId' }
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
          sales: 1,
          revenue: 1,
          users: { $size: '$users' }
        }
      },
      { $sort: { month: 1 } }
    ]);

    res.json(salesData);
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ error: 'Failed to fetch sales data' });
  }
};

// Get user activities
export const getUserActivities = async (req: Request, res: Response) => {
  try {
    const activities = await Analytics.find({
      type: { $in: ['user_login', 'user_signup', 'user_action', 'purchase'] },
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .populate('userId', 'name email')
    .sort({ timestamp: -1 })
    .limit(10);

    const formattedActivities = activities.map(activity => ({
      id: activity._id.toString(),
      user: activity.userId?.name || 'Unknown User',
      action: activity.description || 'Performed an action',
      timestamp: activity.timestamp,
      avatar: activity.userId?.name?.charAt(0) || 'U',
      status: 'online'
    }));

    res.json(formattedActivities);
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({ error: 'Failed to fetch user activities' });
  }
};

// Get project risk data
export const getProjectRisk = async (req: Request, res: Response) => {
  try {
    // Get system metrics to calculate risk level
    const systemMetrics = await SystemMetrics.findOne().sort({ timestamp: -1 });
    
    let riskLevel = 5; // Default balanced risk
    let status = 'Balanced';
    
    if (systemMetrics) {
      // Calculate risk based on system metrics
      const cpuUsage = systemMetrics.cpuUsage || 0;
      const memoryUsage = systemMetrics.memoryUsage || 0;
      const diskUsage = systemMetrics.diskUsage || 0;
      
      if (cpuUsage > 80 || memoryUsage > 90 || diskUsage > 95) {
        riskLevel = 8;
        status = 'High Risk';
      } else if (cpuUsage > 60 || memoryUsage > 70 || diskUsage > 80) {
        riskLevel = 6;
        status = 'Medium Risk';
      } else if (cpuUsage < 30 && memoryUsage < 50 && diskUsage < 60) {
        riskLevel = 3;
        status = 'Low Risk';
      }
    }

    // Get AWS instances count (mock data for now)
    const awsInstances = Math.floor(Math.random() * 1000) + 2000;
    
    res.json({
      level: riskLevel,
      status,
      awsInstances,
      createdDate: '30th Sep'
    });
  } catch (error) {
    console.error('Error fetching project risk:', error);
    res.status(500).json({ error: 'Failed to fetch project risk data' });
  }
};

// Get application sales data
export const getApplicationSales = async (req: Request, res: Response) => {
  try {
    const { timeRange = '7d' } = req.query;
    
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

    // Get subscription data grouped by plan type
    const applicationSales = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$planType',
          sales: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          avgPrice: { $avg: '$amount' }
        }
      },
      {
        $project: {
          name: '$_id',
          sales: 1,
          change: { $multiply: [{ $rand: {} }, 20] }, // Random change percentage
          avgPrice: { $round: ['$avgPrice', 2] },
          total: { $round: ['$totalRevenue', 2] },
          trend: [
            { $multiply: [{ $rand: {} }, 100] },
            { $multiply: [{ $rand: {} }, 100] },
            { $multiply: [{ $rand: {} }, 100] },
            { $multiply: [{ $rand: {} }, 100] },
            { $multiply: [{ $rand: {} }, 100] }
          ]
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 5 }
    ]);

    res.json(applicationSales);
  } catch (error) {
    console.error('Error fetching application sales:', error);
    res.status(500).json({ error: 'Failed to fetch application sales data' });
  }
};

// Export dashboard data
export const exportDashboard = async (req: Request, res: Response) => {
  try {
    const { timeRange, format = 'pdf' } = req.body;
    
    // Get all dashboard data
    const [stats, salesData, activities, risk, applications] = await Promise.all([
      getDashboardStats(req, res),
      getSalesData(req, res),
      getUserActivities(req, res),
      getProjectRisk(req, res),
      getApplicationSales(req, res)
    ]);

    // For now, return JSON data
    // In production, you would generate PDF/Excel files here
    res.json({
      stats,
      salesData,
      activities,
      risk,
      applications,
      exportedAt: new Date().toISOString(),
      format
    });
  } catch (error) {
    console.error('Error exporting dashboard:', error);
    res.status(500).json({ error: 'Failed to export dashboard data' });
  }
};
