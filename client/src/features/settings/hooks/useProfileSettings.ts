/**
 * Profile Settings Hook
 * 
 * Manages profile editing state, form data, avatar upload,
 * and API mutations for updating user profile settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { 
  ProfileFormData, 
  AvatarUploadState, 
  ProfileUpdatePayload 
} from '../types/profile.types';

const INITIAL_AVATAR_STATE: AvatarUploadState = {
  file: null,
  preview: null,
  isUploading: false,
  error: null,
};

export const useProfileSettings = () => {
  const { userData } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState<ProfileFormData>({
    displayName: '',
    username: '',
    phone: '',
    timezone: 'Asia/Kolkata (IST)',
    language: 'English (US)',
    bio: '',
    businessType: 'solo',
    primaryPlatform: '',
    contentNiche: '',
    creatorAudienceSize: '',
    postingFrequency: '',
    startupStage: '',
    startupTeamSize: '',
    startupGrowthChannel: '',
    timeline: '',
    agencyClientCount: '',
    agencyServices: '',
    agencyNiche: '',
    agencyMonthlyOutput: '',
    enterpriseIndustry: '',
    enterpriseDepartment: '',
    enterpriseSecurity: '',
    enterpriseBudget: '',
  });

  // Avatar state
  const [avatarState, setAvatarState] = useState<AvatarUploadState>(INITIAL_AVATAR_STATE);

  // Initialize form data from user data
  useEffect(() => {
    if (userData) {
      setFormData(prev => ({
        ...prev,
        displayName: userData.displayName || prev.displayName,
        username: userData.username || prev.username,
        phone: userData.preferences?.phone || prev.phone,
        timezone: userData.preferences?.timezone || prev.timezone,
        language: userData.preferences?.language || prev.language,
        bio: userData.preferences?.bio || prev.bio,
        businessType: userData.businessType || prev.businessType,
        primaryPlatform: userData.preferences?.primaryPlatform || prev.primaryPlatform,
        contentNiche: userData.preferences?.contentNiche || prev.contentNiche,
        creatorAudienceSize: userData.preferences?.creatorAudienceSize || prev.creatorAudienceSize,
        postingFrequency: userData.preferences?.postingFrequency || prev.postingFrequency,
        startupStage: userData.preferences?.startupStage || prev.startupStage,
        startupTeamSize: userData.preferences?.startupTeamSize || prev.startupTeamSize,
        startupGrowthChannel: userData.preferences?.startupGrowthChannel || prev.startupGrowthChannel,
        timeline: userData.preferences?.timeline || prev.timeline,
        agencyClientCount: userData.preferences?.agencyClientCount || prev.agencyClientCount,
        agencyServices: userData.preferences?.agencyServices || prev.agencyServices,
        agencyNiche: userData.preferences?.agencyNiche || prev.agencyNiche,
        agencyMonthlyOutput: userData.preferences?.agencyMonthlyOutput || prev.agencyMonthlyOutput,
        enterpriseIndustry: userData.preferences?.enterpriseIndustry || prev.enterpriseIndustry,
        enterpriseDepartment: userData.preferences?.enterpriseDepartment || prev.enterpriseDepartment,
        enterpriseSecurity: userData.preferences?.enterpriseSecurity || prev.enterpriseSecurity,
        enterpriseBudget: userData.preferences?.enterpriseBudget || prev.enterpriseBudget,
      }));
    }
  }, [userData]);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const payload: ProfileUpdatePayload = {
        displayName: data.displayName,
        username: data.username,
        businessType: data.businessType,
        niche: data.businessType === 'solo' 
          ? data.contentNiche 
          : (data.businessType === 'agency' ? data.agencyNiche : undefined),
        preferences: {
          phone: data.phone,
          timezone: data.timezone,
          language: data.language,
          bio: data.bio,
          primaryPlatform: data.primaryPlatform,
          contentNiche: data.contentNiche,
          creatorAudienceSize: data.creatorAudienceSize,
          postingFrequency: data.postingFrequency,
          startupStage: data.startupStage,
          startupTeamSize: data.startupTeamSize,
          startupGrowthChannel: data.startupGrowthChannel,
          timeline: data.timeline,
          agencyClientCount: data.agencyClientCount,
          agencyServices: data.agencyServices,
          agencyNiche: data.agencyNiche,
          agencyMonthlyOutput: data.agencyMonthlyOutput,
          enterpriseIndustry: data.enterpriseIndustry,
          enterpriseDepartment: data.enterpriseDepartment,
          enterpriseSecurity: data.enterpriseSecurity,
          enterpriseBudget: data.enterpriseBudget,
        },
      };

      return apiRequest('/api/user', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile settings have been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving profile',
        description: error.message || 'Failed to update settings.',
        variant: 'destructive',
      });
    },
  });

  // Avatar upload mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);

      return apiRequest('/api/user/avatar', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setAvatarState(INITIAL_AVATAR_STATE);
      toast({
        title: 'Avatar Updated',
        description: 'Your profile picture has been updated successfully.',
      });
    },
    onError: (error: any) => {
      setAvatarState(prev => ({
        ...prev,
        isUploading: false,
        error: error.message || 'Failed to upload avatar',
      }));
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload avatar.',
        variant: 'destructive',
      });
    },
  });

  // Avatar removal mutation
  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/user/avatar', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Avatar Removed',
        description: 'Your profile picture has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove avatar.',
        variant: 'destructive',
      });
    },
  });

  // Form field change handler
  const handleFieldChange = useCallback((
    field: keyof ProfileFormData,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  // Avatar file selection handler
  const handleAvatarSelect = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file (PNG, JPG, or JPEG).',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: 'File Too Large',
        description: 'Please select an image smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    // Create preview URL
    const preview = URL.createObjectURL(file);

    setAvatarState({
      file,
      preview,
      isUploading: false,
      error: null,
    });
  }, [toast]);

  // Avatar upload handler
  const handleAvatarUpload = useCallback(async () => {
    if (!avatarState.file) return;

    setAvatarState(prev => ({ ...prev, isUploading: true, error: null }));
    uploadAvatarMutation.mutate(avatarState.file);
  }, [avatarState.file, uploadAvatarMutation]);

  // Avatar removal handler
  const handleAvatarRemove = useCallback(() => {
    removeAvatarMutation.mutate();
  }, [removeAvatarMutation]);

  // Cancel avatar selection
  const handleAvatarCancel = useCallback(() => {
    if (avatarState.preview) {
      URL.revokeObjectURL(avatarState.preview);
    }
    setAvatarState(INITIAL_AVATAR_STATE);
  }, [avatarState.preview]);

  // Form submission handler
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  }, [formData, updateProfileMutation]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarState.preview) {
        URL.revokeObjectURL(avatarState.preview);
      }
    };
  }, [avatarState.preview]);

  return {
    // Form data
    formData,
    setFormData,
    handleFieldChange,
    
    // Avatar state
    avatarState,
    handleAvatarSelect,
    handleAvatarUpload,
    handleAvatarRemove,
    handleAvatarCancel,
    
    // Form submission
    handleSubmit,
    
    // Loading states
    isSaving: updateProfileMutation.isPending,
    isUploadingAvatar: uploadAvatarMutation.isPending,
    isRemovingAvatar: removeAvatarMutation.isPending,
    
    // User data
    userData,
  };
};
