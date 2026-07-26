import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useActiveWorkspaceContext } from '@/contexts/ActiveWorkspaceContext';

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  status: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

export interface WorkspaceLimits {
  currentCount: number;
  planLimit: number | null;
  remainingCapacity: number | null;
}

export interface AuthorizedBrand {
  pageId: string;
  pageName: string;
  pageProfilePictureUrl: string;
  linkedInstagramAccountId: string | null;
  status: 'INACTIVE' | 'IMPORTED' | 'EXPIRED';
  tokenExpiresAt: string;
}

export interface UseWorkspaceReturn {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  workspaceLimits: WorkspaceLimits | null;
  isLoadingWorkspace: boolean;
  switchWorkspace: (id: string) => Promise<void>;
  inactiveBrands: AuthorizedBrand[];
  isAtLimit: boolean;
}

// Normalize MongoDB _id to id to match workspaceValidator.ts pattern
function normalizeWorkspace(ws: any): Workspace {
  return {
    ...ws,
    id: ws.id || ws._id,
  };
}

export function useWorkspace(): UseWorkspaceReturn {
  const { activeWorkspaceId, setActiveWorkspaceId, invalidateWorkspaceData } = useActiveWorkspaceContext();
  const queryClient = useQueryClient();

  const { data: rawWorkspaces, isLoading: isLoadingWorkspace } = useQuery<Workspace[]>({
    queryKey: ['workspaces-v2'],
    queryFn: async () => {
      const result = await apiRequest('/api/workspaces-v2');
      const list: any[] = Array.isArray(result) ? result : (result?.data ?? []);
      return list.map(normalizeWorkspace);
    },
    staleTime: 5 * 60 * 1000,
  });

  const workspaces: Workspace[] = rawWorkspaces ?? [];

  const { data: workspaceLimits = null } = useQuery<WorkspaceLimits | null>({
    queryKey: ['workspace-limits-v2'],
    queryFn: async () => {
      const result = await apiRequest('/api/workspaces-v2/limits');
      return (result?.data ?? result) as WorkspaceLimits;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: rawBrands } = useQuery<AuthorizedBrand[]>({
    queryKey: ['authorized-brands'],
    queryFn: async () => {
      const result = await apiRequest('/api/authorized-brands');
      const list: any[] = Array.isArray(result) ? result : (result?.data ?? []);
      return list as AuthorizedBrand[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const inactiveBrands: AuthorizedBrand[] = (rawBrands ?? []).filter(
    (b) => b.status === 'INACTIVE',
  );

  const activeWorkspace: Workspace | null =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const switchWorkspace = async (id: string): Promise<void> => {
    await apiRequest('/api/workspaces-v2/active', {
      method: 'POST',
      body: JSON.stringify({ workspaceId: id }),
    });
    setActiveWorkspaceId(id);
    invalidateWorkspaceData();
  };

  const isAtLimit: boolean =
    workspaceLimits !== null &&
    workspaceLimits.planLimit !== null &&
    workspaceLimits.currentCount >= workspaceLimits.planLimit;

  return {
    activeWorkspace,
    workspaces,
    workspaceLimits,
    isLoadingWorkspace,
    switchWorkspace,
    inactiveBrands,
    isAtLimit,
  };
}
