import React from 'react';
import { clsx } from 'clsx';

// Skeleton component for loading states
export const Skeleton: React.FC<{
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  animated?: boolean;
}> = ({ 
  className, 
  width, 
  height, 
  rounded = false, 
  animated = true 
}) => {
  return (
    <div
      className={clsx(
        'bg-gray-200 dark:bg-gray-700',
        rounded && 'rounded-full',
        animated && 'animate-pulse',
        className
      )}
      style={{ width, height }}
    />
  );
};

// Text skeleton
export const TextSkeleton: React.FC<{
  lines?: number;
  className?: string;
  animated?: boolean;
}> = ({ lines = 1, className, animated = true }) => {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height="1rem"
          width={index === lines - 1 ? '75%' : '100%'}
          animated={animated}
        />
      ))}
    </div>
  );
};

// Card skeleton
export const CardSkeleton: React.FC<{
  className?: string;
  animated?: boolean;
}> = ({ className, animated = true }) => {
  return (
    <div className={clsx('p-4 border border-gray-200 dark:border-gray-700 rounded-lg', className)}>
      <div className="flex items-center space-x-3 mb-4">
        <Skeleton width={40} height={40} rounded animated={animated} />
        <div className="flex-1">
          <Skeleton height="1rem" width="60%" className="mb-2" animated={animated} />
          <Skeleton height="0.75rem" width="40%" animated={animated} />
        </div>
      </div>
      <TextSkeleton lines={3} animated={animated} />
    </div>
  );
};

// Table skeleton
export const TableSkeleton: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
  animated?: boolean;
}> = ({ rows = 5, columns = 4, className, animated = true }) => {
  return (
    <div className={clsx('overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-6 py-3 text-left">
                  <Skeleton height="1rem" width="80%" animated={animated} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <td key={colIndex} className="px-6 py-4">
                    <Skeleton height="1rem" width="90%" animated={animated} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Chart skeleton
export const ChartSkeleton: React.FC<{
  className?: string;
  animated?: boolean;
}> = ({ className, animated = true }) => {
  return (
    <div className={clsx('p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton height="1.5rem" width="200px" animated={animated} />
        <div className="flex space-x-2">
          <Skeleton height="2rem" width="4rem" animated={animated} />
          <Skeleton height="2rem" width="4rem" animated={animated} />
        </div>
      </div>
      <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-end justify-between p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex flex-col items-center space-y-2">
            <Skeleton 
              height={`${Math.random() * 100 + 50}px`} 
              width="20px" 
              animated={animated}
            />
            <Skeleton height="0.75rem" width="30px" animated={animated} />
          </div>
        ))}
      </div>
    </div>
  );
};

// List skeleton
export const ListSkeleton: React.FC<{
  items?: number;
  className?: string;
  animated?: boolean;
}> = ({ items = 5, className, animated = true }) => {
  return (
    <div className={clsx('space-y-3', className)}>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
          <Skeleton width={40} height={40} rounded animated={animated} />
          <div className="flex-1">
            <Skeleton height="1rem" width="60%" className="mb-2" animated={animated} />
            <Skeleton height="0.75rem" width="40%" animated={animated} />
          </div>
          <Skeleton height="2rem" width="4rem" animated={animated} />
        </div>
      ))}
    </div>
  );
};

// Dashboard skeleton
export const DashboardSkeleton: React.FC<{
  className?: string;
  animated?: boolean;
}> = ({ className, animated = true }) => {
  return (
    <div className={clsx('space-y-6', className)}>
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={index} animated={animated} />
        ))}
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton animated={animated} />
        <ChartSkeleton animated={animated} />
      </div>
      
      {/* Table */}
      <TableSkeleton animated={animated} />
    </div>
  );
};

// Loading spinner
export const LoadingSpinner: React.FC<{
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  color?: 'primary' | 'secondary' | 'white';
}> = ({ size = 'md', className, color = 'primary' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  const colorClasses = {
    primary: 'text-blue-600',
    secondary: 'text-gray-600',
    white: 'text-white'
  };

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          'animate-spin rounded-full border-2 border-gray-300 border-t-current',
          sizeClasses[size],
          colorClasses[color]
        )}
      />
    </div>
  );
};

// Loading overlay
export const LoadingOverlay: React.FC<{
  isLoading: boolean;
  children: React.ReactNode;
  message?: string;
  className?: string;
}> = ({ isLoading, children, message = 'Loading...', className }) => {
  if (!isLoading) return <>{children}</>;

  return (
    <div className={clsx('relative', className)}>
      {children}
      <div className="absolute inset-0 bg-white dark:bg-gray-900 bg-opacity-75 flex items-center justify-center z-10">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
      </div>
    </div>
  );
};

// Loading button
export const LoadingButton: React.FC<{
  isLoading: boolean;
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}> = ({
  isLoading,
  children,
  loadingText = 'Loading...',
  className,
  disabled,
  onClick,
  variant = 'primary',
  size = 'md'
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-blue-500'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        (disabled || isLoading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled || isLoading}
      onClick={onClick}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" color="white" className="mr-2" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
};

// Error boundary with loading state
export const ErrorBoundary: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}> = ({ children, fallback, onError }) => {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(new Error(event.message));
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      fallback || (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-red-600 text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
            <p className="text-gray-600 mb-4">
              {error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                setHasError(false);
                setError(null);
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
};

// Suspense wrapper with loading state
export const SuspenseWrapper: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ children, fallback }) => {
  return (
    <React.Suspense
      fallback={
        fallback || (
          <div className="flex items-center justify-center p-8">
            <LoadingSpinner size="lg" />
          </div>
        )
      }
    >
      {children}
    </React.Suspense>
  );
};
