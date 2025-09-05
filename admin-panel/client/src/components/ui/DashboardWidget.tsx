import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { 
  MoreHorizontal, 
  RefreshCw, 
  Settings, 
  Maximize2, 
  Minimize2,
  X,
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { Chart } from './Chart';

export type WidgetType = 'chart' | 'metric' | 'table' | 'list' | 'custom';
export type WidgetSize = 'small' | 'medium' | 'large' | 'full';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: { x: number; y: number };
  data?: any;
  config?: any;
  refreshInterval?: number;
  lastUpdated?: Date;
  isMinimized?: boolean;
  isFullscreen?: boolean;
}

export interface DashboardWidgetProps {
  widget: WidgetConfig;
  onUpdate: (widget: WidgetConfig) => void;
  onRemove: (id: string) => void;
  onRefresh?: (id: string) => void;
  className?: string;
}

const sizeClasses = {
  small: 'col-span-1 row-span-1',
  medium: 'col-span-2 row-span-1',
  large: 'col-span-2 row-span-2',
  full: 'col-span-4 row-span-2'
};

const iconMap = {
  chart: BarChart3,
  metric: TrendingUp,
  table: Users,
  list: Activity,
  custom: Settings
};

export const DashboardWidget: React.FC<DashboardWidgetProps> = ({
  widget,
  onUpdate,
  onRemove,
  onRefresh,
  className
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    
    setIsLoading(true);
    try {
      await onRefresh(widget.id);
      onUpdate({
        ...widget,
        lastUpdated: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  }, [widget, onUpdate, onRefresh]);

  const handleMinimize = () => {
    onUpdate({
      ...widget,
      isMinimized: !widget.isMinimized
    });
  };

  const handleFullscreen = () => {
    onUpdate({
      ...widget,
      isFullscreen: !widget.isFullscreen
    });
  };

  const handleRemove = () => {
    onRemove(widget.id);
  };

  const Icon = iconMap[widget.type] || Settings;

  const renderWidgetContent = () => {
    if (widget.isMinimized) {
      return (
        <div className="flex items-center justify-center h-16 text-gray-500">
          <Icon className="h-6 w-6" />
          <span className="ml-2 text-sm font-medium">{widget.title}</span>
        </div>
      );
    }

    switch (widget.type) {
      case 'chart':
        return (
          <div className="h-full">
            <Chart
              data={widget.data || []}
              type={widget.config?.chartType || 'line'}
              dataKey={widget.config?.dataKey || 'value'}
              nameKey={widget.config?.nameKey || 'name'}
              height="100%"
              showLegend={widget.config?.showLegend !== false}
              showTooltip={widget.config?.showTooltip !== false}
            />
          </div>
        );

      case 'metric':
        return (
          <div className="h-full flex flex-col justify-center">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {widget.data?.value || '0'}
            </div>
            <div className="text-sm text-gray-600 mb-1">
              {widget.data?.label || 'Metric'}
            </div>
            {widget.data?.change && (
              <div className={clsx(
                'text-sm flex items-center',
                widget.data.change > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                <TrendingUp className={clsx(
                  'h-4 w-4 mr-1',
                  widget.data.change < 0 && 'rotate-180'
                )} />
                {Math.abs(widget.data.change)}%
              </div>
            )}
          </div>
        );

      case 'table':
        return (
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {widget.data?.columns?.map((col: string, index: number) => (
                    <th key={index} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {widget.data?.rows?.map((row: any[], rowIndex: number) => (
                  <tr key={rowIndex}>
                    {row.map((cell: any, cellIndex: number) => (
                      <td key={cellIndex} className="px-4 py-2 text-sm text-gray-900">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'list':
        return (
          <div className="h-full overflow-auto">
            <div className="space-y-2">
              {widget.data?.items?.map((item: any, index: number) => (
                <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                  {item.icon && <item.icon className="h-4 w-4 text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-500 truncate">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                  {item.value && (
                    <div className="text-sm text-gray-600">
                      {item.value}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'custom':
        return (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Settings className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Custom Widget</p>
              <p className="text-xs">Configure in settings</p>
            </div>
          </div>
        );

      default:
        return (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Icon className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">No data available</p>
            </div>
          </div>
        );
    }
  };

  return (
    <Card
      className={clsx(
        'relative group',
        sizeClasses[widget.size],
        widget.isFullscreen && 'fixed inset-4 z-50',
        className
      )}
    >
      {/* Widget Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Icon className="h-5 w-5 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">
            {widget.title}
          </h3>
          {widget.lastUpdated && (
            <span className="text-xs text-gray-500">
              {widget.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1"
            >
              <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleMinimize}
            className="p-1"
          >
            {widget.isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleFullscreen}
            className="p-1"
          >
            {widget.isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
            className="p-1"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleRemove}
            className="p-1 text-red-600 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Widget Content */}
      <div className="p-4 h-full">
        {renderWidgetContent()}
      </div>

      {/* Widget Settings */}
      {showSettings && (
        <div className="absolute top-12 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10 min-w-48">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Widget Settings</h4>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={widget.title}
                onChange={(e) => onUpdate({ ...widget, title: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Size
              </label>
              <select
                value={widget.size}
                onChange={(e) => onUpdate({ ...widget, size: e.target.value as WidgetSize })}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="full">Full</option>
              </select>
            </div>

            {widget.type === 'chart' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Chart Type
                </label>
                <select
                  value={widget.config?.chartType || 'line'}
                  onChange={(e) => onUpdate({
                    ...widget,
                    config: { ...widget.config, chartType: e.target.value }
                  })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                  <option value="area">Area</option>
                  <option value="pie">Pie</option>
                </select>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="showLegend"
                checked={widget.config?.showLegend !== false}
                onChange={(e) => onUpdate({
                  ...widget,
                  config: { ...widget.config, showLegend: e.target.checked }
                })}
                className="rounded"
              />
              <label htmlFor="showLegend" className="text-xs text-gray-700">
                Show Legend
              </label>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

// Dashboard Grid Component
export const DashboardGrid: React.FC<{
  widgets: WidgetConfig[];
  onUpdateWidget: (widget: WidgetConfig) => void;
  onRemoveWidget: (id: string) => void;
  onRefreshWidget?: (id: string) => void;
  className?: string;
}> = ({ widgets, onUpdateWidget, onRemoveWidget, onRefreshWidget, className }) => {
  return (
    <div className={clsx(
      'grid grid-cols-4 gap-4 auto-rows-min',
      className
    )}>
      {widgets.map(widget => (
        <DashboardWidget
          key={widget.id}
          widget={widget}
          onUpdate={onUpdateWidget}
          onRemove={onRemoveWidget}
          onRefresh={onRefreshWidget}
        />
      ))}
    </div>
  );
};

// Widget Library Component
export const WidgetLibrary: React.FC<{
  onAddWidget: (type: WidgetType) => void;
  className?: string;
}> = ({ onAddWidget, className }) => {
  const widgetTypes = [
    { type: 'chart' as WidgetType, name: 'Chart', icon: BarChart3, description: 'Display data in various chart formats' },
    { type: 'metric' as WidgetType, name: 'Metric', icon: TrendingUp, description: 'Show key performance indicators' },
    { type: 'table' as WidgetType, name: 'Table', icon: Users, description: 'Display tabular data' },
    { type: 'list' as WidgetType, name: 'List', icon: Activity, description: 'Show a list of items' },
    { type: 'custom' as WidgetType, name: 'Custom', icon: Settings, description: 'Custom widget configuration' }
  ];

  return (
    <div className={clsx('space-y-4', className)}>
      <h3 className="text-lg font-semibold text-gray-900">Widget Library</h3>
      <div className="grid grid-cols-2 gap-4">
        {widgetTypes.map(({ type, name, icon: Icon, description }) => (
          <button
            key={type}
            onClick={() => onAddWidget(type)}
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <div className="flex items-center space-x-3 mb-2">
              <Icon className="h-6 w-6 text-gray-600" />
              <h4 className="font-medium text-gray-900">{name}</h4>
            </div>
            <p className="text-sm text-gray-600">{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
