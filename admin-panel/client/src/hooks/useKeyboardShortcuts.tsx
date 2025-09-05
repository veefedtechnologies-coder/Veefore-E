import React, { useEffect, useCallback, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

export const useKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) => {
  const {
    enabled = true,
    preventDefault = true,
    stopPropagation = false
  } = options;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, ctrlKey, shiftKey, altKey, metaKey } = event;

    for (const shortcut of shortcutsRef.current) {
      const matches = 
        shortcut.key.toLowerCase() === key.toLowerCase() &&
        !!shortcut.ctrlKey === ctrlKey &&
        !!shortcut.shiftKey === shiftKey &&
        !!shortcut.altKey === altKey &&
        !!shortcut.metaKey === metaKey;

      if (matches) {
        if (shortcut.preventDefault ?? preventDefault) {
          event.preventDefault();
        }
        if (shortcut.stopPropagation ?? stopPropagation) {
          event.stopPropagation();
        }
        shortcut.action();
        break;
      }
    }
  }, [enabled, preventDefault, stopPropagation]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
};

// Predefined shortcut combinations
export const SHORTCUTS = {
  // Navigation
  GLOBAL_SEARCH: 'ctrl+k',
  DASHBOARD: 'ctrl+1',
  USERS: 'ctrl+2',
  ANALYTICS: 'ctrl+3',
  SETTINGS: 'ctrl+,',
  
  // Actions
  SAVE: 'ctrl+s',
  REFRESH: 'ctrl+r',
  NEW: 'ctrl+n',
  EDIT: 'ctrl+e',
  DELETE: 'ctrl+d',
  COPY: 'ctrl+c',
  PASTE: 'ctrl+v',
  UNDO: 'ctrl+z',
  REDO: 'ctrl+y',
  
  // UI
  TOGGLE_SIDEBAR: 'ctrl+b',
  TOGGLE_THEME: 'ctrl+shift+t',
  TOGGLE_FULLSCREEN: 'f11',
  ESCAPE: 'escape',
  
  // Modals
  CLOSE_MODAL: 'escape',
  CONFIRM: 'enter',
  CANCEL: 'escape',
  
  // Table/List
  SELECT_ALL: 'ctrl+a',
  SELECT_NONE: 'ctrl+shift+a',
  NEXT_ITEM: 'arrowdown',
  PREV_ITEM: 'arrowup',
  FIRST_ITEM: 'home',
  LAST_ITEM: 'end',
  
  // Search
  FOCUS_SEARCH: 'ctrl+f',
  CLEAR_SEARCH: 'ctrl+shift+f',
  
  // Help
  HELP: 'f1',
  SHORTCUTS: 'ctrl+shift+h'
} as const;

// Helper function to create shortcut objects
export const createShortcut = (
  key: string,
  action: () => void,
  description: string,
  options: Partial<KeyboardShortcut> = {}
): KeyboardShortcut => {
  const [mainKey, ...modifiers] = key.toLowerCase().split('+').reverse();
  
  return {
    key: mainKey,
    ctrlKey: modifiers.includes('ctrl'),
    shiftKey: modifiers.includes('shift'),
    altKey: modifiers.includes('alt'),
    metaKey: modifiers.includes('meta'),
    description,
    action,
    ...options
  };
};

// Hook for common admin panel shortcuts
export const useAdminShortcuts = (handlers: {
  onGlobalSearch?: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onRefresh?: () => void;
  onSave?: () => void;
  onNew?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onHelp?: () => void;
}) => {
  const shortcuts: KeyboardShortcut[] = [
    // Global search
    ...(handlers.onGlobalSearch ? [createShortcut(
      SHORTCUTS.GLOBAL_SEARCH,
      handlers.onGlobalSearch,
      'Open global search'
    )] : []),
    
    // Toggle sidebar
    ...(handlers.onToggleSidebar ? [createShortcut(
      SHORTCUTS.TOGGLE_SIDEBAR,
      handlers.onToggleSidebar,
      'Toggle sidebar'
    )] : []),
    
    // Toggle theme
    ...(handlers.onToggleTheme ? [createShortcut(
      SHORTCUTS.TOGGLE_THEME,
      handlers.onToggleTheme,
      'Toggle theme'
    )] : []),
    
    // Refresh
    ...(handlers.onRefresh ? [createShortcut(
      SHORTCUTS.REFRESH,
      handlers.onRefresh,
      'Refresh current page'
    )] : []),
    
    // Save
    ...(handlers.onSave ? [createShortcut(
      SHORTCUTS.SAVE,
      handlers.onSave,
      'Save changes'
    )] : []),
    
    // New
    ...(handlers.onNew ? [createShortcut(
      SHORTCUTS.NEW,
      handlers.onNew,
      'Create new item'
    )] : []),
    
    // Edit
    ...(handlers.onEdit ? [createShortcut(
      SHORTCUTS.EDIT,
      handlers.onEdit,
      'Edit selected item'
    )] : []),
    
    // Delete
    ...(handlers.onDelete ? [createShortcut(
      SHORTCUTS.DELETE,
      handlers.onDelete,
      'Delete selected item'
    )] : []),
    
    // Help
    ...(handlers.onHelp ? [createShortcut(
      SHORTCUTS.HELP,
      handlers.onHelp,
      'Show help'
    )] : [])
  ];

  useKeyboardShortcuts(shortcuts);
};

// Hook for modal shortcuts
export const useModalShortcuts = (handlers: {
  onClose?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) => {
  const shortcuts: KeyboardShortcut[] = [
    // Close modal
    ...(handlers.onClose ? [createShortcut(
      SHORTCUTS.CLOSE_MODAL,
      handlers.onClose,
      'Close modal'
    )] : []),
    
    // Confirm
    ...(handlers.onConfirm ? [createShortcut(
      SHORTCUTS.CONFIRM,
      handlers.onConfirm,
      'Confirm action'
    )] : []),
    
    // Cancel
    ...(handlers.onCancel ? [createShortcut(
      SHORTCUTS.CANCEL,
      handlers.onCancel,
      'Cancel action'
    )] : [])
  ];

  useKeyboardShortcuts(shortcuts);
};

// Hook for table/list shortcuts
export const useTableShortcuts = (handlers: {
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onNextItem?: () => void;
  onPrevItem?: () => void;
  onFirstItem?: () => void;
  onLastItem?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) => {
  const shortcuts: KeyboardShortcut[] = [
    // Select all
    ...(handlers.onSelectAll ? [createShortcut(
      SHORTCUTS.SELECT_ALL,
      handlers.onSelectAll,
      'Select all items'
    )] : []),
    
    // Select none
    ...(handlers.onSelectNone ? [createShortcut(
      SHORTCUTS.SELECT_NONE,
      handlers.onSelectNone,
      'Deselect all items'
    )] : []),
    
    // Next item
    ...(handlers.onNextItem ? [createShortcut(
      SHORTCUTS.NEXT_ITEM,
      handlers.onNextItem,
      'Select next item'
    )] : []),
    
    // Previous item
    ...(handlers.onPrevItem ? [createShortcut(
      SHORTCUTS.PREV_ITEM,
      handlers.onPrevItem,
      'Select previous item'
    )] : []),
    
    // First item
    ...(handlers.onFirstItem ? [createShortcut(
      SHORTCUTS.FIRST_ITEM,
      handlers.onFirstItem,
      'Select first item'
    )] : []),
    
    // Last item
    ...(handlers.onLastItem ? [createShortcut(
      SHORTCUTS.LAST_ITEM,
      handlers.onLastItem,
      'Select last item'
    )] : []),
    
    // Edit
    ...(handlers.onEdit ? [createShortcut(
      SHORTCUTS.EDIT,
      handlers.onEdit,
      'Edit selected item'
    )] : []),
    
    // Delete
    ...(handlers.onDelete ? [createShortcut(
      SHORTCUTS.DELETE,
      handlers.onDelete,
      'Delete selected item'
    )] : [])
  ];

  useKeyboardShortcuts(shortcuts);
};

// Keyboard shortcuts help component
export const KeyboardShortcutsHelp: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
  className?: string;
}> = ({ isOpen, onClose, shortcuts, className }) => {
  if (!isOpen) return null;

  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.description.split(' ')[0].toLowerCase();
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className="absolute inset-4 bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XIcon />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto h-full pb-20">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category} className="mb-6">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 capitalize">
                {category}
              </h4>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center space-x-1">
                      {shortcut.ctrlKey && <Kbd>Ctrl</Kbd>}
                      {shortcut.shiftKey && <Kbd>Shift</Kbd>}
                      {shortcut.altKey && <Kbd>Alt</Kbd>}
                      {shortcut.metaKey && <Kbd>Cmd</Kbd>}
                      <Kbd>{shortcut.key.toUpperCase()}</Kbd>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Kbd component for displaying keys
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-2 py-1 text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600">
    {children}
  </kbd>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
