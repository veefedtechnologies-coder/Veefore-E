import React from 'react';
import { clsx } from 'clsx';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon?: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number;
    period: string;
  };
  className?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-blue-600',
  trend,
  className
}) => {
  const getChangeColor = (type: string) => {
    switch (type) {
      case 'increase':
        return 'text-green-600 bg-green-100';
      case 'decrease':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'increase':
        return '↗';
      case 'decrease':
        return '↘';
      default:
        return '→';
    }
  };

  return (
    <div className={clsx(
      'bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow',
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          
          {change && (
            <div className="flex items-center mt-2">
              <span className={clsx(
                'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                getChangeColor(change.type)
              )}>
                <span className="mr-1">{getChangeIcon(change.type)}</span>
                {Math.abs(change.value)}%
              </span>
              {trend && (
                <span className="ml-2 text-xs text-gray-500">
                  vs {trend.period}
                </span>
              )}
            </div>
          )}
        </div>
        
        {Icon && (
          <div className={clsx('p-3 rounded-lg', iconColor.replace('text-', 'bg-').replace('-600', '-100'))}>
            <Icon className={clsx('h-6 w-6', iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
};
