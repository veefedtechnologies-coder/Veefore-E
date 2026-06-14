/**
 * Profile Settings Component
 * 
 * Handles profile editing including basic information, avatar upload,
 * professional profile configuration, and user preferences.
 * 
 * Requirements: 11.2, 11.3, 11.6
 */

import { User, Loader2, Save, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfileSettings } from '../hooks/useProfileSettings';
import { AvatarUpload } from './AvatarUpload';
import { ProfessionalProfileFields } from './ProfessionalProfileFields';

export function ProfileSettings() {
  const {
    formData,
    handleFieldChange,
    avatarState,
    handleAvatarSelect,
    handleAvatarUpload,
    handleAvatarRemove,
    handleAvatarCancel,
    handleSubmit,
    isSaving,
    isUploadingAvatar,
    isRemovingAvatar,
    userData,
  } = useProfileSettings();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Profile Settings
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your profile, professional details, and personal preferences
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Basic Information
          </h3>

          {/* Avatar Upload Section */}
          <AvatarUpload
            currentAvatar={userData?.avatar}
            avatarState={avatarState}
            onAvatarSelect={handleAvatarSelect}
            onAvatarUpload={handleAvatarUpload}
            onAvatarRemove={handleAvatarRemove}
            onAvatarCancel={handleAvatarCancel}
            isUploading={isUploadingAvatar}
            isRemoving={isRemovingAvatar}
          />

          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Full Name
              </Label>
              <Input
                type="text"
                value={formData.displayName}
                onChange={(e) => handleFieldChange('displayName', e.target.value)}
                className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </Label>
              <Input
                type="text"
                value={formData.username}
                onChange={(e) => handleFieldChange('username', e.target.value)}
                className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Email Address
              </Label>
              <Input
                type="email"
                value={userData?.email || ''}
                disabled
                className="w-full h-11 px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Phone Number
              </Label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Bio
              </Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => handleFieldChange('bio', e.target.value)}
                placeholder="Tell us a little about yourself..."
                rows={3}
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white resize-none"
              />
            </div>
          </div>
        </div>

        {/* Professional Profile */}
        <ProfessionalProfileFields
          formData={formData}
          handleFieldChange={handleFieldChange}
        />

        {/* Preferences */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Preferences
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Timezone
              </Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => handleFieldChange('timezone', value)}
              >
                <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                  <SelectValue placeholder="Select Timezone..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="America/New_York (EST)">America/New_York (EST)</SelectItem>
                  <SelectItem value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</SelectItem>
                  <SelectItem value="Europe/London (GMT)">Europe/London (GMT)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Language
              </Label>
              <Select
                value={formData.language}
                onValueChange={(value) => handleFieldChange('language', value)}
              >
                <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                  <SelectValue placeholder="Select Language..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English (US)">English (US)</SelectItem>
                  <SelectItem value="English (UK)">English (UK)</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-70"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
