/**
 * PRODUCTION-LEVEL WORKSPACE VALIDATION SYSTEM
 * 
 * Prevents workspace ID mismatches by validating localStorage against actual user workspaces.
 * Auto-corrects invalid workspace IDs to prevent data loss and confusion.
 */

import { apiRequest } from './queryClient';

interface Workspace {
  id: string;
  _id?: string;  // MongoDB returns _id, we normalize to id
  name: string;
  isDefault?: boolean;
}

// ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
const normalizeWorkspace = (ws: any): Workspace => ({
  ...ws,
  id: ws.id || ws._id,  // Use id if exists, fallback to _id
});

const normalizeWorkspaces = (workspaces: any[]): Workspace[] => {
  if (!Array.isArray(workspaces)) return [];
  return workspaces.map(normalizeWorkspace);
};

class WorkspaceValidator {
  private static instance: WorkspaceValidator;
  private validatedWorkspaceId: string | null = null;
  private workspacesCache: Workspace[] = [];
  private lastValidation: number = 0;
  private readonly VALIDATION_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): WorkspaceValidator {
    if (!WorkspaceValidator.instance) {
      WorkspaceValidator.instance = new WorkspaceValidator();
    }
    return WorkspaceValidator.instance;
  }

  /**
   * Validates and auto-corrects workspace ID from localStorage
   * Returns the validated workspace ID that is guaranteed to exist
   */
  async validateAndCorrectWorkspaceId(): Promise<string | null> {
    try {
      // Check if we have a recent validation
      const now = Date.now();
      if (this.validatedWorkspaceId && (now - this.lastValidation < this.VALIDATION_TTL)) {
        console.log('[WORKSPACE VALIDATOR] ✅ Using cached validated workspace:', this.validatedWorkspaceId);
        return this.validatedWorkspaceId;
      }

      console.log('[WORKSPACE VALIDATOR] 🔍 Fetching user workspaces for validation...');
      
      // Fetch user's actual workspaces from backend
      // ✅ CRITICAL FIX: Normalize workspace data to ensure 'id' field exists (MongoDB returns _id)
      const rawWorkspaces = await apiRequest('/api/workspaces');
      const workspaces: Workspace[] = normalizeWorkspaces(rawWorkspaces?.data || rawWorkspaces || []);
      this.workspacesCache = workspaces;

      if (!workspaces || workspaces.length === 0) {
        console.warn('[WORKSPACE VALIDATOR] ⚠️ No workspaces found for user');
        localStorage.removeItem('currentWorkspaceId');
        return null;
      }

      // Get workspace ID from localStorage
      const storedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      console.log('[WORKSPACE VALIDATOR] 📦 LocalStorage workspace ID:', storedWorkspaceId);

      // Validate that the stored workspace ID exists in user's workspaces
      const isValid = storedWorkspaceId && workspaces.some(ws => ws.id === storedWorkspaceId);

      if (isValid) {
        console.log('[WORKSPACE VALIDATOR] ✅ Workspace ID is VALID:', storedWorkspaceId);
        this.validatedWorkspaceId = storedWorkspaceId;
        this.lastValidation = now;
        return storedWorkspaceId;
      }

      // INVALID WORKSPACE ID - Auto-correct to default or first workspace
      console.warn('[WORKSPACE VALIDATOR] ❌ INVALID workspace ID in localStorage:', storedWorkspaceId);
      console.warn('[WORKSPACE VALIDATOR] 🔧 Auto-correcting to valid workspace...');

      const defaultWorkspace = workspaces.find(ws => ws.isDefault) || workspaces[0];
      const correctedWorkspaceId = defaultWorkspace.id;

      console.log('[WORKSPACE VALIDATOR] ✅ Auto-corrected to workspace:', {
        id: correctedWorkspaceId,
        name: defaultWorkspace.name,
        isDefault: defaultWorkspace.isDefault
      });

      // Update localStorage with correct workspace ID
      localStorage.setItem('currentWorkspaceId', correctedWorkspaceId);
      
      // Dispatch event to notify React components
      window.dispatchEvent(new Event('workspace-changed'));
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'currentWorkspaceId',
        newValue: correctedWorkspaceId,
        oldValue: storedWorkspaceId,
        storageArea: localStorage
      }));

      this.validatedWorkspaceId = correctedWorkspaceId;
      this.lastValidation = now;

      return correctedWorkspaceId;
    } catch (error) {
      console.error('[WORKSPACE VALIDATOR] ❌ Error validating workspace:', error);
      return null;
    }
  }

  /**
   * Get the current validated workspace ID (cached)
   */
  getValidatedWorkspaceId(): string | null {
    return this.validatedWorkspaceId;
  }

  /**
   * Get cached workspaces
   */
  getCachedWorkspaces(): Workspace[] {
    return this.workspacesCache;
  }

  /**
   * Clear validation cache (force revalidation on next call)
   */
  clearCache(): void {
    this.validatedWorkspaceId = null;
    this.workspacesCache = [];
    this.lastValidation = 0;
    console.log('[WORKSPACE VALIDATOR] 🗑️ Cache cleared');
  }

  /**
   * Force immediate validation (bypasses cache)
   */
  async forceValidate(): Promise<string | null> {
    this.clearCache();
    return this.validateAndCorrectWorkspaceId();
  }
}

export const workspaceValidator = WorkspaceValidator.getInstance();

/**
 * Hook-friendly function to ensure workspace ID is valid before making API calls
 */
export async function ensureValidWorkspaceId(): Promise<string | null> {
  return workspaceValidator.validateAndCorrectWorkspaceId();
}

/**
 * Sync function to get last validated workspace ID (use in components)
 */
export function getLastValidatedWorkspaceId(): string | null {
  return workspaceValidator.getValidatedWorkspaceId();
}

