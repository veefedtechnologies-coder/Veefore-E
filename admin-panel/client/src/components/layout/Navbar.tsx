import React, { useState } from 'react';
import { clsx } from 'clsx';
import { 
  Menu, 
  Bell, 
  Search, 
  User, 
  Settings, 
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  Keyboard,
  HelpCircle
} from 'lucide-react';
import { GlobalSearch } from '../ui/GlobalSearch';
import { NotificationBell, NotificationPanel, useNotificationToast } from '../ui/NotificationSystem';
import { ThemeToggle, ThemeSettingsPanel } from '../../contexts/ThemeContext';
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from '../../hooks/useKeyboardShortcuts';
import { useAuth } from '../../contexts/AuthContext';

interface NavbarProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onMenuClick, isSidebarOpen }) => {
  const { admin, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { success, error, warning, info } = useNotificationToast();

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrlKey: true,
      description: 'Open global search',
      action: () => setShowGlobalSearch(true)
    },
    {
      key: 'b',
      ctrlKey: true,
      description: 'Toggle sidebar',
      action: onMenuClick
    },
    {
      key: 'h',
      ctrlKey: true,
      shiftKey: true,
      description: 'Show keyboard shortcuts',
      action: () => setShowShortcuts(true)
    }
  ]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleSave = () => {
    success('Changes saved', 'Your changes have been saved successfully');
  };

  const handleNew = () => {
    info('New item', 'Create a new item');
  };

  const handleEdit = () => {
    warning('Edit mode', 'Entering edit mode');
  };

  const handleDelete = () => {
    error('Delete item', 'Are you sure you want to delete this item?');
  };

  const handleHelp = () => {
    setShowShortcuts(true);
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold text-gray-900">
              {isSidebarOpen ? '' : 'VeeFore Admin Panel'}
            </h1>
          </div>
        </div>

        {/* Center - Search */}
        <div className="flex-1 max-w-lg mx-4 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users, orders, analytics..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onClick={() => setShowGlobalSearch(true)}
              readOnly
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Global Search Button */}
          <button
            onClick={() => setShowGlobalSearch(true)}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            title="Global search (Ctrl+K)"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Notifications */}
          <NotificationBell
            count={3}
            onClick={() => setShowNotifications(true)}
          />

          {/* Help */}
          <button
            onClick={handleHelp}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            title="Keyboard shortcuts (Ctrl+Shift+H)"
          >
            <HelpCircle className="h-5 w-5" />
          </button>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {admin?.firstName?.[0] || 'A'}{admin?.lastName?.[0] || ''}
                </span>
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-900">
                  {admin?.firstName} {admin?.lastName}
                </p>
                <p className="text-xs text-gray-500">
                  {admin?.role}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {/* Dropdown menu */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {admin?.firstName} {admin?.lastName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {admin?.email}
                  </p>
                </div>
                
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </button>
                
                <button 
                  onClick={() => setShowThemeSettings(true)}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Theme Settings</span>
                </button>
                
                <div className="border-t border-gray-100 my-1"></div>
                
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <div className="mt-3 md:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onClick={() => setShowGlobalSearch(true)}
            readOnly
          />
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearch
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
      />

      {/* Notifications Panel */}
      <NotificationPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />

      {/* Theme Settings Panel */}
      <ThemeSettingsPanel
        isOpen={showThemeSettings}
        onClose={() => setShowThemeSettings(false)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={[
          { key: 'k', ctrlKey: true, description: 'Open global search', action: () => {} },
          { key: 'b', ctrlKey: true, description: 'Toggle sidebar', action: () => {} },
          { key: 'h', ctrlKey: true, shiftKey: true, description: 'Show keyboard shortcuts', action: () => {} },
          { key: 's', ctrlKey: true, description: 'Save changes', action: () => {} },
          { key: 'r', ctrlKey: true, description: 'Refresh page', action: () => {} },
          { key: 'n', ctrlKey: true, description: 'Create new item', action: () => {} },
          { key: 'e', ctrlKey: true, description: 'Edit selected item', action: () => {} },
          { key: 'd', ctrlKey: true, description: 'Delete selected item', action: () => {} }
        ]}
      />
    </nav>
  );
};