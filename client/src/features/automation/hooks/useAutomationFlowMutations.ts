/**
 * React Query mutations for automation flow
 * Extracted from useAutomationFlow.ts to reduce file size and improve maintainability
 * 
 * Requirements: 2.2
 */

import { useMutation, QueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { AutomationRule } from '../types/automation.types';

type ResetFlowFn = () => void;
type ClearCacheFn = (userId?: string) => void;

/**
 * Create automation rule mutation
 */
export function useCreateAutomationMutation(
  resetFlow: ResetFlowFn,
  clearCache: ClearCacheFn,
  userId: string | undefined,
  queryClient: QueryClient
) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (automationData: AutomationRule) => {
      return await apiRequest('/api/automation/rules', {
        method: 'POST',
        body: JSON.stringify(automationData)
      });
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Automation rule created successfully",
      });
      
      // Invalidate automation rules query to refetch
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      
      // Reset flow state
      resetFlow();
      
      // Clear cache
      if (userId) {
        clearCache(userId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create automation rule",
        variant: "destructive",
      });
    }
  });
}
