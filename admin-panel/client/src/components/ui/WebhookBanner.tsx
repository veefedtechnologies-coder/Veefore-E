import React, { useState, useEffect } from 'react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Badge } from './Badge';
import { X, ExternalLink, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface Banner {
  _id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  displayOptions: {
    showOnLogin: boolean;
    showOnDashboard: boolean;
    showOnAllPages: boolean;
    dismissible: boolean;
    autoHide: boolean;
    autoHideDelay?: number;
  };
  actions?: Array<{
    label: string;
    url?: string;
    action?: string;
    style: 'primary' | 'secondary' | 'danger';
  }>;
  stats: {
    views: number;
    dismissals: number;
    clicks: number;
  };
}

interface WebhookBannerProps {
  location: 'login' | 'dashboard' | 'all';
  userId?: string;
  userRoles?: string[];
}

export const WebhookBanner: React.FC<WebhookBannerProps> = ({ 
  location, 
  userId, 
  userRoles = [] 
}) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveBanners();
  }, [location, userId, userRoles]);

  const fetchActiveBanners = async () => {
    try {
      const response = await api.get('/maintenance-banners/active', {
        params: { userId, roles: userRoles }
      });
      setBanners(response.data.data || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (bannerId: string) => {
    setDismissedBanners(prev => new Set([...prev, bannerId]));
    
    try {
      await api.post(`/maintenance-banners/${bannerId}/interaction`, {
        action: 'dismiss'
      });
    } catch (error) {
      console.error('Error recording dismissal:', error);
    }
  };

  const handleAction = async (bannerId: string, action: any) => {
    try {
      await api.post(`/maintenance-banners/${bannerId}/interaction`, {
        action: 'click'
      });

      if (action.url) {
        window.open(action.url, '_blank');
      } else if (action.action) {
        // Handle custom action
        console.log('Custom action:', action.action);
      }
    } catch (error) {
      console.error('Error recording action:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info className="h-5 w-5" />;
      case 'warning': return <AlertTriangle className="h-5 w-5" />;
      case 'error': return <AlertTriangle className="h-5 w-5" />;
      case 'success': return <CheckCircle className="h-5 w-5" />;
      default: return <Info className="h-5 w-5" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-gray-600';
      case 'medium': return 'text-blue-600';
      case 'high': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const shouldShowBanner = (banner: Banner) => {
    // Check if banner is dismissed
    if (dismissedBanners.has(banner._id)) return false;

    // Check location-based display
    switch (location) {
      case 'login':
        return banner.displayOptions.showOnLogin;
      case 'dashboard':
        return banner.displayOptions.showOnDashboard;
      case 'all':
        return banner.displayOptions.showOnAllPages;
      default:
        return false;
    }
  };

  if (loading) {
    return null;
  }

  const visibleBanners = banners.filter(shouldShowBanner);

  if (visibleBanners.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {visibleBanners.map((banner) => (
        <div
          key={banner._id}
          className={`relative rounded-lg border p-4 ${
            banner.type === 'error' ? 'bg-red-50 border-red-200' :
            banner.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
            banner.type === 'success' ? 'bg-green-50 border-green-200' :
            'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 ${getPriorityColor(banner.priority)}`}>
              {getTypeIcon(banner.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="text-sm font-medium text-gray-900">
                  {banner.title}
                </h3>
                <Badge 
                  variant={banner.priority === 'critical' ? 'destructive' : 'default'}
                  size="sm"
                >
                  {banner.priority}
                </Badge>
              </div>
              
              <p className="text-sm text-gray-700 mb-3">
                {banner.message}
              </p>
              
              {banner.actions && banner.actions.length > 0 && (
                <div className="flex space-x-2">
                  {banner.actions.map((action, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant={action.style === 'primary' ? 'default' : 'outline'}
                      onClick={() => handleAction(banner._id, action)}
                      className="flex items-center space-x-1"
                    >
                      <span>{action.label}</span>
                      {action.url && <ExternalLink className="h-3 w-3" />}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            
            {banner.displayOptions.dismissible && (
              <button
                onClick={() => handleDismiss(banner._id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
