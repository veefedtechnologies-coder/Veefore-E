/**
 * Profile Settings Types
 * 
 * Type definitions for profile editing, avatar management,
 * and professional profile configuration.
 */

export interface ProfileFormData {
  // Basic Information
  displayName: string;
  username: string;
  phone: string;
  timezone: string;
  language: string;
  bio?: string;
  
  // Professional Profile
  businessType: 'solo' | 'startup' | 'agency' | 'enterprise';

  
  // Creator fields
  primaryPlatform?: string;
  contentNiche?: string;
  creatorAudienceSize?: string;
  postingFrequency?: string;
  
  // Startup fields
  startupStage?: string;
  startupTeamSize?: string;
  startupGrowthChannel?: string;
  timeline?: string;
  
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
}

export interface AvatarUploadState {
  file: File | null;
  preview: string | null;
  isUploading: boolean;
  error: string | null;
}

export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface ProfileUpdatePayload {
  displayName?: string;
  username?: string;
  businessType?: string;
  niche?: string;
  avatar?: string;
  preferences?: {
    phone?: string;
    timezone?: string;
    language?: string;
    bio?: string;
    primaryPlatform?: string;
    contentNiche?: string;
    creatorAudienceSize?: string;
    postingFrequency?: string;
    startupStage?: string;
    startupTeamSize?: string;
    startupGrowthChannel?: string;
    timeline?: string;
    agencyClientCount?: string;
    agencyServices?: string;
    agencyNiche?: string;
    agencyMonthlyOutput?: string;
    enterpriseIndustry?: string;
    enterpriseDepartment?: string;
    enterpriseSecurity?: string;
    enterpriseBudget?: string;
  };
}
