/**
 * @fileoverview Pure utility functions and shared configuration for the
 * Waitlist Management feature.  Kept dependency-free (no React imports) so
 * they are easily unit-testable.
 */

import React from 'react';
import {
  User,
  Rocket,
  Building2,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  UserX,
  Pause,
  CalendarX,
} from 'lucide-react';
import type { OrgType, RoleBasedQuestionnaire, WaitlistUser } from './types';

// ============================================
// ORG TYPE CONFIGURATION
// ============================================

/**
 * Visual configuration map for every org-type value.
 * Contains the human-readable label, Tailwind colour classes, and the
 * icon component to render.
 */
export const orgTypeConfig: Record<
  OrgType,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  solo: { label: 'Creator', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: User },
  startup: { label: 'Brand', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Rocket },
  agency: { label: 'Agency', color: 'text-green-700', bgColor: 'bg-green-100', icon: Building2 },
  enterprise: {
    label: 'Enterprise',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    icon: ShieldCheck,
  },
};

/**
 * Visual configuration map for every user status value.
 * Contains the Tailwind colour classes and the icon component to render.
 */
export const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  waitlisted: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  early_access: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
  banned: { color: 'bg-red-100 text-red-800', icon: Ban },
  removed: { color: 'bg-gray-100 text-gray-800', icon: UserX },
  suspended: { color: 'bg-orange-100 text-orange-800', icon: Pause },
  postponed: { color: 'bg-purple-100 text-purple-800', icon: CalendarX },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Resolves the OrgType for a waitlist user by inspecting multiple possible
 * storage locations in priority order:
 *  1. `questionnaire.orgType`
 *  2. `metadata.questionnaire.orgType`
 *  3. `metadata.role` (mapped through roleMap)
 *  4. `questionnaire.role` (mapped through roleMap)
 *
 * @param user - The waitlist user record.
 * @returns The resolved OrgType or `null` if it cannot be determined.
 */
export const getOrgType = (user: WaitlistUser): OrgType | null => {
  if (user.questionnaire?.orgType) return user.questionnaire.orgType;
  if (user.metadata?.questionnaire?.orgType) return user.metadata.questionnaire.orgType;

  const roleMap: Record<string, OrgType> = {
    creator: 'solo',
    solo: 'solo',
    brand: 'startup',
    startup: 'startup',
    agency: 'agency',
    enterprise: 'enterprise',
  };

  if (user.metadata?.role) {
    return roleMap[user.metadata.role.toLowerCase()] ?? null;
  }

  if (user.questionnaire?.role) {
    return roleMap[user.questionnaire.role.toLowerCase()] ?? null;
  }

  return null;
};

/**
 * Merges questionnaire data from the multiple storage locations into a single
 * flat object.  Nested metadata fields take priority over top-level fields.
 *
 * @param user - The waitlist user record.
 * @returns A merged RoleBasedQuestionnaire object.
 */
export const getQuestionnaireData = (user: WaitlistUser): RoleBasedQuestionnaire => {
  const nested = user.metadata?.questionnaire ?? {};
  const direct = user.questionnaire ?? {};

  return {
    ...direct,
    ...nested,
    orgType: nested.orgType ?? direct.orgType ?? (user.metadata?.role as OrgType) ?? undefined,
    role: user.metadata?.role,
  };
};

/**
 * Formats a raw questionnaire field value for display.
 * Handles `undefined`, `null`, empty arrays, and plain arrays.
 *
 * @param value - The raw field value.
 * @returns A human-readable string.
 */
export const formatFieldValue = (value: unknown): string => {
  if (!value) return 'Not answered';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Not answered';
  return String(value);
};
