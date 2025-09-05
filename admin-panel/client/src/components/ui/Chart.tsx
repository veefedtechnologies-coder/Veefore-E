import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar
} from 'recharts';

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'radial';

interface ChartProps {
  data: any[];
  type: ChartType;
  dataKey: string;
  nameKey?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  colors?: string[];
  showLegend?: boolean;
  showTooltip?: boolean;
  showGrid?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  xAxisKey?: string;
  yAxisKey?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  animationDuration?: number;
  gradient?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
}

const defaultColors = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
];

export const Chart: React.FC<ChartProps> = ({
  data,
  type,
  dataKey,
  nameKey = 'name',
  width = '100%',
  height = 300,
  className,
  colors = defaultColors,
  showLegend = true,
  showTooltip = true,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  xAxisKey,
  yAxisKey,
  strokeWidth = 2,
  fillOpacity = 0.6,
  animationDuration = 1000,
  gradient = false,
  stacked = false,
  horizontal = false
}) => {
  const chartProps = useMemo(() => ({
    width,
    height,
    data,
    margin: {
      top: 20,
      right: 30,
      left: 20,
      bottom: 5,
    },
  }), [width, height, data]);

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            {showXAxis && <XAxis dataKey={xAxisKey || nameKey} stroke="#666" />}
            {showYAxis && <YAxis stroke="#666" />}
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={colors[0]}
              strokeWidth={strokeWidth}
              dot={{ fill: colors[0], strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: colors[0], strokeWidth: 2 }}
              animationDuration={animationDuration}
            />
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...chartProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            {showXAxis && <XAxis dataKey={xAxisKey || nameKey} stroke="#666" />}
            {showYAxis && <YAxis stroke="#666" />}
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[0]} stopOpacity={0.8} />
                <stop offset="95%" stopColor={colors[0]} stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={colors[0]}
              fill={gradient ? "url(#colorGradient)" : colors[0]}
              fillOpacity={fillOpacity}
              strokeWidth={strokeWidth}
              animationDuration={animationDuration}
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...chartProps} layout={horizontal ? 'horizontal' : 'vertical'}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            {showXAxis && <XAxis dataKey={horizontal ? dataKey : (xAxisKey || nameKey)} stroke="#666" />}
            {showYAxis && <YAxis dataKey={horizontal ? (xAxisKey || nameKey) : dataKey} stroke="#666" />}
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            <Bar
              dataKey={dataKey}
              fill={colors[0]}
              radius={[4, 4, 0, 0]}
              animationDuration={animationDuration}
            />
          </BarChart>
        );

      case 'pie':
        return (
          <PieChart {...chartProps}>
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={dataKey}
              nameKey={nameKey}
              animationDuration={animationDuration}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        );

      case 'radial':
        return (
          <RadialBarChart
            {...chartProps}
            cx="50%"
            cy="50%"
            innerRadius="10%"
            outerRadius="80%"
            startAngle={180}
            endAngle={0}
          >
            {showTooltip && <Tooltip />}
            {showLegend && <Legend />}
            <RadialBar
              dataKey={dataKey}
              cornerRadius={10}
              fill={colors[0]}
              animationDuration={animationDuration}
            />
          </RadialBarChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className={clsx('w-full', className)}>
      <ResponsiveContainer width={width} height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
};

// Multi-series chart component
interface MultiSeriesChartProps extends Omit<ChartProps, 'dataKey'> {
  series: Array<{
    dataKey: string;
    name: string;
    color?: string;
    type?: 'line' | 'bar' | 'area';
  }>;
}

export const MultiSeriesChart: React.FC<MultiSeriesChartProps> = ({
  data,
  type = 'line',
  series,
  width = '100%',
  height = 300,
  className,
  colors = defaultColors,
  showLegend = true,
  showTooltip = true,
  showGrid = true,
  showXAxis = true,
  showYAxis = true,
  xAxisKey,
  nameKey = 'name',
  strokeWidth = 2,
  fillOpacity = 0.6,
  animationDuration = 1000,
  gradient = false,
  stacked = false
}) => {
  const chartProps = useMemo(() => ({
    width,
    height,
    data,
    margin: {
      top: 20,
      right: 30,
      left: 20,
      bottom: 5,
    },
  }), [width, height, data]);

  const renderMultiSeriesChart = () => {
    if (type === 'line') {
      return (
        <LineChart {...chartProps}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
          {showXAxis && <XAxis dataKey={xAxisKey || nameKey} stroke="#666" />}
          {showYAxis && <YAxis stroke="#666" />}
          {showTooltip && <Tooltip />}
          {showLegend && <Legend />}
          {series.map((s, index) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color || colors[index % colors.length]}
              strokeWidth={strokeWidth}
              dot={{ fill: s.color || colors[index % colors.length], strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: s.color || colors[index % colors.length], strokeWidth: 2 }}
              animationDuration={animationDuration}
            />
          ))}
        </LineChart>
      );
    }

    if (type === 'bar') {
      return (
        <BarChart {...chartProps}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
          {showXAxis && <XAxis dataKey={xAxisKey || nameKey} stroke="#666" />}
          {showYAxis && <YAxis stroke="#666" />}
          {showTooltip && <Tooltip />}
          {showLegend && <Legend />}
          {series.map((s, index) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              fill={s.color || colors[index % colors.length]}
              radius={[4, 4, 0, 0]}
              animationDuration={animationDuration}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </BarChart>
      );
    }

    if (type === 'area') {
      return (
        <AreaChart {...chartProps}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
          {showXAxis && <XAxis dataKey={xAxisKey || nameKey} stroke="#666" />}
          {showYAxis && <YAxis stroke="#666" />}
          {showTooltip && <Tooltip />}
          {showLegend && <Legend />}
          <defs>
            {series.map((s, index) => (
              <linearGradient key={s.dataKey} id={`gradient-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color || colors[index % colors.length]} stopOpacity={0.8} />
                <stop offset="95%" stopColor={s.color || colors[index % colors.length]} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          {series.map((s, index) => (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color || colors[index % colors.length]}
              fill={gradient ? `url(#gradient-${s.dataKey})` : (s.color || colors[index % colors.length])}
              fillOpacity={fillOpacity}
              strokeWidth={strokeWidth}
              animationDuration={animationDuration}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </AreaChart>
      );
    }

    return null;
  };

  return (
    <div className={clsx('w-full', className)}>
      <ResponsiveContainer width={width} height={height}>
        {renderMultiSeriesChart()}
      </ResponsiveContainer>
    </div>
  );
};
