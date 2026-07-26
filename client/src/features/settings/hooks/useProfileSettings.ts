/**
 * Profile Settings Hook
 * 
 * Manages profile editing state, form data, avatar upload,
 * and API mutations for updating user profile settings.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { 
  ProfileFormData, 
  AvatarUploadState, 
  ProfileUpdatePayload 
} from '../types/profile.types';
import { deriveFormFromUser } from './deriveFormFromUser';

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

  // Local edits the user has made in this session. Anything not edited falls
  // back to the live user record, so the form always reflects saved data even
  // if it loads after the component mounts.
  const [edits, setEdits] = useState<Partial<ProfileFormData>>({});

  // Effective form values = canonical values from the user record, with the
  // user's in-progress edits layered on top.
  const formData = useMemo<ProfileFormData>(() => {
    return { ...deriveFormFromUser(userData), ...edits };
  }, [userData, edits]);

  // Avatar state
  const [avatarState, setAvatarState] = useState<AvatarUploadState>(INITIAL_AVATAR_STATE);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const payload: ProfileUpdatePayload = {
        displayName: data.displayName,
        username: data.username,
        businessType: data.businessType,
        // Derive the centralized niche from the niche selector shown in the
        // Professional Profile section for the current business type.
        niche: data.businessType === 'agency' ? data.agencyNiche : data.contentNiche,
        preferences: {
          phone: data.phone,
          timezone: data.timezone,
          language: data.language,
          bio: data.bio,
          primaryPlatform: data.primaryPlatform,
          // Keep contentNiche aligned with the centralized niche value.
          contentNiche: (data.businessType === 'agency' ? data.agencyNiche : data.contentNiche),
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
      // Clear local edits so the form reflects the freshly-saved server record.
      setEdits({});
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

  // Form field change handler — records the edit locally; the effective form
  // value is the user record merged with these edits (see formData useMemo).
  const handleFieldChange = useCallback((
    field: keyof ProfileFormData,
    value: string
  ) => {
    setEdits(prev => ({
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
