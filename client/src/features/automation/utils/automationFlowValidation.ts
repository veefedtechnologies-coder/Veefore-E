/**
 * Validation utilities for automation flow
 * Extracted from useAutomationFlow.ts for better organization
 * 
 * Requirements: 2.2
 */

import type { AutomationFlowState } from '../types/automation.types';
import type { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning 
} from '../types/automationFlow.types';
import { getCurrentKeywords } from './automationHelpers';

/**
 * Validate the current automation flow
 */
export function validateAutomationFlow(flow: AutomationFlowState): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Step 1 validation
  if (!flow.selectedAccount) {
    errors.push({
      field: 'selectedAccount',
      message: 'Please select a social account',
      step: 1
    });
  }

  if (!flow.contentType) {
    errors.push({
      field: 'contentType',
      message: 'Please select content type',
      step: 1
    });
  }

  if (!flow.selectedPost) {
    errors.push({
      field: 'selectedPost',
      message: 'Please select a post to automate',
      step: 1
    });
  }

  // Step 2 validation
  if (!flow.automationType) {
    errors.push({
      field: 'automationType',
      message: 'Please select automation type',
      step: 2
    });
  }

  const keywords = getCurrentKeywords(flow);
  if (keywords.length === 0) {
    errors.push({
      field: 'keywords',
      message: 'Please add at least one trigger keyword',
      step: 2
    });
  }

  // Automation-type specific validation
  if (flow.automationType === 'comment_dm') {
    if (!flow.commentReplies || flow.commentReplies.filter(r => r.trim()).length === 0) {
      errors.push({
        field: 'commentReplies',
        message: 'Please add at least one comment reply',
        step: 2
      });
    }

    if (!flow.dmMessage || flow.dmMessage.trim().length === 0) {
      errors.push({
        field: 'dmMessage',
        message: 'Please add a DM message',
        step: 3
      });
    }
  }

  if (flow.automationType === 'dm_only') {
    if (!flow.dmAutoReply || flow.dmAutoReply.trim().length === 0) {
      errors.push({
        field: 'dmAutoReply',
        message: 'Please add a DM auto-reply message',
        step: 2
      });
    }
  }

  if (flow.automationType === 'comment_only') {
    if (!flow.publicReply || flow.publicReply.trim().length === 0) {
      errors.push({
        field: 'publicReply',
        message: 'Please add a public reply message',
        step: 2
      });
    }
  }

  // Warnings
  if (flow.dmButtons.some(btn => btn.type === 'web_url' && !btn.url)) {
    warnings.push({
      field: 'dmButtons',
      message: 'Some DM buttons have empty URLs',
      step: 3
    });
  }

  if (flow.followerGateEnabled && !flow.followerGateMessage) {
    warnings.push({
      field: 'followerGateMessage',
      message: 'Follower gate is enabled but message is empty',
      step: 3
    });
  }

  if (flow.maxRepliesPerDay < 1) {
    errors.push({
      field: 'maxRepliesPerDay',
      message: 'Max replies per day must be at least 1',
      step: 4
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
