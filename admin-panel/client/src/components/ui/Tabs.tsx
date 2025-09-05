import React, { useState } from 'react';
import { clsx } from 'clsx';

interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export const Tabs: React.FC<TabsProps> = ({
  items = [],
  defaultTab,
  className,
  variant = 'default'
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || items[0]?.id || '');

  const getTabClasses = (item: TabItem) => {
    const baseClasses = 'px-4 py-2 text-sm font-medium transition-colors';
    const isActive = activeTab === item.id;
    
    switch (variant) {
      case 'pills':
        return clsx(
          baseClasses,
          'rounded-full',
          isActive
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
          item.disabled && 'opacity-50 cursor-not-allowed'
        );
      case 'underline':
        return clsx(
          baseClasses,
          'border-b-2',
          isActive
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          item.disabled && 'opacity-50 cursor-not-allowed'
        );
      default:
        return clsx(
          baseClasses,
          'border-b-2',
          isActive
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          item.disabled && 'opacity-50 cursor-not-allowed'
        );
    }
  };

  const getContentClasses = () => {
    switch (variant) {
      case 'pills':
        return 'mt-4';
      case 'underline':
        return 'mt-4';
      default:
        return 'mt-4';
    }
  };

  // Don't render if no items
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {/* Tab Headers */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => !item.disabled && setActiveTab(item.id)}
              className={getTabClasses(item)}
              disabled={item.disabled}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className={getContentClasses()}>
        {items.find(item => item.id === activeTab)?.content}
      </div>
    </div>
  );
};
