import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WorkspaceContextValue {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  invalidateWorkspaceData: () => void;
}

const ActiveWorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function ActiveWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(
    () => {
      try { return localStorage.getItem('currentWorkspaceId'); } catch { return null; }
    }
  );
  const queryClient = useQueryClient();

  const setActiveWorkspaceId = useCallback((id: string) => {
    try { localStorage.setItem('currentWorkspaceId', id); } catch { /* ignore */ }
    setActiveWorkspaceIdState(id);
    // Notify existing WorkspaceValidator singleton (backward compatibility)
    try { window.dispatchEvent(new Event('workspace-changed')); } catch { /* ignore */ }
  }, []);

  const invalidateWorkspaceData = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && (
        key.some(k => typeof k === 'string' && [
          'analytics', 'social-accounts', 'posts', 'calendar', 'inbox', 'settings'
        ].includes(k))
      );
    }});
  }, [queryClient]);

  return (
    <ActiveWorkspaceContext.Provider value={{ activeWorkspaceId, setActiveWorkspaceId, invalidateWorkspaceData }}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}

export function useActiveWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(ActiveWorkspaceContext);
  if (!ctx) throw new Error('useActiveWorkspaceContext must be used within ActiveWorkspaceProvider');
  return ctx;
}
