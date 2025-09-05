import React from 'react';
import { clsx } from 'clsx';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}

export const Table: React.FC<TableProps> = ({ children, className }) => {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('min-w-full divide-y divide-gray-200', className)}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<TableHeaderProps> = ({ children, className }) => {
  return (
    <thead className={clsx('bg-gray-50', className)}>
      {children}
    </thead>
  );
};

export const TableBody: React.FC<TableBodyProps> = ({ children, className }) => {
  return (
    <tbody className={clsx('bg-white divide-y divide-gray-200', className)}>
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<TableRowProps> = ({ children, className, hover = true }) => {
  return (
    <tr className={clsx(
      hover && 'hover:bg-gray-50',
      className
    )}>
      {children}
    </tr>
  );
};

export const TableHead: React.FC<TableHeadProps> = ({ 
  children, 
  className, 
  align = 'left',
  sortable = false,
  sortDirection,
  onSort
}) => {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  };

  return (
    <th
      className={clsx(
        'px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider',
        alignClasses[align],
        sortable && 'cursor-pointer select-none hover:bg-gray-100',
        className
      )}
      onClick={sortable ? onSort : undefined}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        {sortable && (
          <div className="flex flex-col">
            <span className={clsx(
              'text-xs',
              sortDirection === 'asc' ? 'text-gray-900' : 'text-gray-400'
            )}>
              ▲
            </span>
            <span className={clsx(
              'text-xs -mt-1',
              sortDirection === 'desc' ? 'text-gray-900' : 'text-gray-400'
            )}>
              ▼
            </span>
          </div>
        )}
      </div>
    </th>
  );
};

export const TableCell: React.FC<TableCellProps> = ({ children, className, align = 'left' }) => {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  };

  return (
    <td className={clsx(
      'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
      alignClasses[align],
      className
    )}>
      {children}
    </td>
  );
};
