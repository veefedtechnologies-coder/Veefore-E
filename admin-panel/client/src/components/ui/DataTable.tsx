import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, MoreHorizontal, Filter, Download, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Badge } from './Badge';

interface Column<T> {
  key: string;
  title: string;
  dataIndex: string;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  sorter?: boolean;
  filterable?: boolean;
  width?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
  selection?: {
    selectedRowKeys: string[];
    onChange: (selectedRowKeys: string[], selectedRows: T[]) => void;
  };
  onRow?: (record: T, index: number) => {
    onClick?: () => void;
    onDoubleClick?: () => void;
    onContextMenu?: () => void;
  };
  rowKey: string | ((record: T) => string);
  size?: 'small' | 'middle' | 'large';
  bordered?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  pagination,
  selection,
  onRow,
  rowKey,
  size = 'middle',
  bordered = false,
  striped = false,
  hoverable = true,
  className
}: DataTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Get row key
  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') {
      return rowKey(record);
    }
    return record[rowKey] || index.toString();
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  // Filter data
  const filteredData = useMemo(() => {
    return sortedData.filter(record => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const recordValue = record[key];
        return String(recordValue).toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [sortedData, filters]);

  // Handle sort
  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' 
          ? { key, direction: 'desc' }
          : null;
      }
      return { key, direction: 'asc' };
    });
  };

  // Handle filter change
  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
  };

  // Handle row selection
  const handleRowSelection = (record: T, checked: boolean) => {
    if (!selection) return;

    const key = getRowKey(record, 0);
    const newSelectedKeys = checked
      ? [...selection.selectedRowKeys, key]
      : selection.selectedRowKeys.filter(k => k !== key);

    const newSelectedRows = data.filter(record => 
      newSelectedKeys.includes(getRowKey(record, 0))
    );

    selection.onChange(newSelectedKeys, newSelectedRows);
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (!selection) return;

    const keys = checked ? filteredData.map(record => getRowKey(record, 0)) : [];
    const rows = checked ? filteredData : [];

    selection.onChange(keys, rows);
  };

  const sizeClasses = {
    small: 'text-xs',
    middle: 'text-sm',
    large: 'text-base'
  };

  const isAllSelected = selection && filteredData.length > 0 && 
    filteredData.every(record => selection.selectedRowKeys.includes(getRowKey(record, 0)));

  return (
    <div className={clsx('bg-white rounded-lg shadow', className)}>
      {/* Table Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Data Table ({filteredData.length} records)
            </h3>
            {Object.keys(filters).some(key => filters[key]) && (
              <Badge variant="info" size="sm">
                Filtered
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-1"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {columns
                .filter(col => col.filterable)
                .map(column => (
                  <div key={column.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {column.title}
                    </label>
                    <Input
                      placeholder={`Filter by ${column.title.toLowerCase()}...`}
                      value={filters[column.dataIndex] || ''}
                      onChange={(e) => handleFilterChange(column.dataIndex, e.target.value)}
                    />
                  </div>
                ))}
            </div>
            
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className={clsx(
          'min-w-full divide-y divide-gray-200',
          sizeClasses[size]
        )}>
          <thead className="bg-gray-50">
            <tr>
              {selection && (
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded"
                  />
                </th>
              )}
              
              {columns.map(column => (
                <th
                  key={column.key}
                  className={clsx(
                    'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                    column.fixed === 'left' && 'sticky left-0 bg-gray-50 z-10',
                    column.fixed === 'right' && 'sticky right-0 bg-gray-50 z-10'
                  )}
                  style={{ width: column.width }}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.title}</span>
                    {column.sorter && (
                      <button
                        onClick={() => handleSort(column.dataIndex)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {sortConfig?.key === column.dataIndex ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )
                        ) : (
                          <div className="flex flex-col">
                            <ChevronUp className="h-3 w-3 -mb-1" />
                            <ChevronDown className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                </th>
              ))}
              
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          
          <tbody className={clsx(
            'bg-white divide-y divide-gray-200',
            striped && 'divide-y divide-gray-100',
            hoverable && 'hover:bg-gray-50'
          )}>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (selection ? 1 : 0) + 1}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                    Loading...
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selection ? 1 : 0) + 1}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  No data available
                </td>
              </tr>
            ) : (
              filteredData.map((record, index) => {
                const key = getRowKey(record, index);
                const rowProps = onRow ? onRow(record, index) : {};
                const isSelected = selection?.selectedRowKeys.includes(key);

                return (
                  <tr
                    key={key}
                    className={clsx(
                      'hover:bg-gray-50 cursor-pointer',
                      isSelected && 'bg-blue-50',
                      bordered && 'border border-gray-200'
                    )}
                    onClick={rowProps.onClick}
                    onDoubleClick={rowProps.onDoubleClick}
                    onContextMenu={rowProps.onContextMenu}
                  >
                    {selection && (
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleRowSelection(record, e.target.checked)}
                          className="rounded"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    
                    {columns.map(column => (
                      <td
                        key={column.key}
                        className={clsx(
                          'px-6 py-4 whitespace-nowrap',
                          column.align === 'center' && 'text-center',
                          column.align === 'right' && 'text-right',
                          column.fixed === 'left' && 'sticky left-0 bg-white z-10',
                          column.fixed === 'right' && 'sticky right-0 bg-white z-10'
                        )}
                        style={{ width: column.width }}
                      >
                        {column.render
                          ? column.render(record[column.dataIndex], record, index)
                          : record[column.dataIndex]
                        }
                      </td>
                    ))}
                    
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle action
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((pagination.current - 1) * pagination.pageSize) + 1} to{' '}
              {Math.min(pagination.current * pagination.pageSize, pagination.total)} of{' '}
              {pagination.total} results
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.current === 1}
                onClick={() => pagination.onChange(pagination.current - 1, pagination.pageSize)}
              >
                Previous
              </Button>
              
              <span className="text-sm text-gray-700">
                Page {pagination.current} of {Math.ceil(pagination.total / pagination.pageSize)}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.current >= Math.ceil(pagination.total / pagination.pageSize)}
                onClick={() => pagination.onChange(pagination.current + 1, pagination.pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
