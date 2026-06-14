/**
 * Reducer for automation flow state management
 * Extracted from useAutomationFlow.ts for better organization
 * 
 * Requirements: 2.2
 */

import type { AutomationFlowState } from '../types/automation.types';
import type { AutomationFlowAction } from '../types/automationFlow.types';
import { getInitialFlowState } from '../constants/automationFlow.constants';

/**
 * Automation flow reducer
 */
export function automationFlowReducer(
  state: AutomationFlowState,
  action: AutomationFlowAction
): AutomationFlowState {
  switch (action.type) {
    case 'UPDATE_TRIGGER':
      return { ...state, ...action.payload };

    case 'ADD_ACTION':
      return { ...state, ...action.payload };

    case 'UPDATE_ADVANCED_SETTINGS':
      return { ...state, ...action.payload };

    case 'UPDATE_FLOW':
      return { ...state, ...action.payload };

    case 'RESET_FLOW':
      return getInitialFlowState();

    case 'ADD_KEYWORD': {
      const keyword = action.payload.trim();
      if (!keyword) return state;

      switch (state.automationType) {
        case 'comment_dm':
          return { 
            ...state, 
            keywords: [...state.keywords, keyword] 
          };
        case 'dm_only':
          return { 
            ...state, 
            dmKeywords: [...state.dmKeywords, keyword] 
          };
        case 'comment_only':
          return { 
            ...state, 
            commentKeywords: [...state.commentKeywords, keyword] 
          };
        default:
          return { 
            ...state, 
            keywords: [...state.keywords, keyword] 
          };
      }
    }

    case 'REMOVE_KEYWORD': {
      const keyword = action.payload;

      switch (state.automationType) {
        case 'comment_dm':
          return { 
            ...state, 
            keywords: state.keywords.filter(k => k !== keyword) 
          };
        case 'dm_only':
          return { 
            ...state, 
            dmKeywords: state.dmKeywords.filter(k => k !== keyword) 
          };
        case 'comment_only':
          return { 
            ...state, 
            commentKeywords: state.commentKeywords.filter(k => k !== keyword) 
          };
        default:
          return { 
            ...state, 
            keywords: state.keywords.filter(k => k !== keyword) 
          };
      }
    }

    case 'ADD_COMMENT_REPLY': {
      const reply = action.payload.trim();
      if (!reply) return state;
      
      return {
        ...state,
        commentReplies: [...state.commentReplies, reply]
      };
    }

    case 'REMOVE_COMMENT_REPLY':
      return {
        ...state,
        commentReplies: state.commentReplies.filter((_, i) => i !== action.payload)
      };

    case 'ADD_DM_BUTTON':
      return {
        ...state,
        dmButtons: [...state.dmButtons, action.payload]
      };

    case 'UPDATE_DM_BUTTON':
      return {
        ...state,
        dmButtons: state.dmButtons.map((btn, i) => 
          i === action.payload.index 
            ? { ...btn, ...action.payload.updates } 
            : btn
        )
      };

    case 'REMOVE_DM_BUTTON':
      return {
        ...state,
        dmButtons: state.dmButtons.filter((_, i) => i !== action.payload)
      };

    case 'LOAD_FROM_CACHE':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}
