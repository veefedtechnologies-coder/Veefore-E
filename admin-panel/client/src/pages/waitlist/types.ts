/**
 * @fileoverview Shared TypeScript types for the Waitlist Management feature.
 * Centralises all type definitions used across WaitlistTable, WaitlistFilters,
 * ApprovalModal, and the WaitlistManagement orchestrator.
 */

// ============================================
// ORG TYPE
// ============================================

/** The type of organisation a waitlist user represents. */
export type OrgType = 'solo' | 'startup' | 'agency' | 'enterprise';

// ============================================
// QUESTIONNAIRE
// ============================================

/**
 * Role-based questionnaire answers collected during waitlist sign-up.
 * Fields are split by org-type but use a single interface to accommodate
 * the multiple storage locations (direct, metadata.questionnaire, metadata.role).
 */
export interface RoleBasedQuestionnaire {
  // Common fields
  orgType?: OrgType;
  timeline?: string;
  referralSource?: string;
  primaryGoal?: string;
  painPoints?: string;

  // Creator/Solo fields
  primaryPlatform?: string;
  contentNiche?: string;
  creatorAudienceSize?: string;
  postingFrequency?: string;

  // Startup/Brand fields
  startupStage?: string;
  startupGrowthChannel?: string;
  startupTeamSize?: string;

  // Agency fields
  agencyClientCount?: string;
  agencyServices?: string;
  agencyNiche?: string;
  agencyMonthlyOutput?: string;

  // Enterprise fields
  enterpriseIndustry?: string;
  enterpriseDepartment?: string;
  enterpriseSecurity?: string;
  enterpriseBudget?: string;

  // Legacy fields (for backward compatibility)
  businessType?: string;
  teamSize?: string;
  currentTools?: string[];
  contentTypes?: string[];
  budget?: string;
  urgency?: string;
  role?: string;
}

// ============================================
// WAITLIST USER
// ============================================

/** A single user in the waitlist with all associated metadata. */
export interface WaitlistUser {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  referredBy: string;
  referralCount: number;
  credits: number;
  status: 'waitlisted' | 'early_access' | 'rejected' | 'banned' | 'removed' | 'suspended' | 'postponed';
  discountCode: string;
  discountExpiresAt: string;
  dailyLogins: number;
  feedbackSubmitted: boolean;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  questionnaire?: RoleBasedQuestionnaire;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    emailVerified?: boolean;
    joinedAt?: string;
    role?: string;
    questionnaire?: RoleBasedQuestionnaire;
    source?: string;
    ip?: string;
  };
}

// ============================================
// STATS
// ============================================

/** Aggregate statistics returned by the waitlist-stats endpoint. */
export interface WaitlistStats {
  totalUsers: number;
  todaySignups: number;
  usersWithQuestionnaire: number;
  statusBreakdown: {
    waitlisted: number;
    early_access: number;
    rejected: number;
    banned: number;
    removed: number;
    suspended: number;
    postponed: number;
  };
}

// ============================================
// ACTION TYPES
// ============================================

/** All user-level action types that can be triggered from the table or detail modal. */
export type ActionType =
  | 'approve'
  | 'reject'
  | 'ban'
  | 'remove'
  | 'suspend'
  | 'postpone'
  | 'restore'
  | 'delete';
