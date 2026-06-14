/**
 * Professional Profile Fields Component
 * 
 * Renders conditional form fields based on business type
 * (Creator, Startup, Agency, Enterprise).
 */

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProfileFormData } from '../types/profile.types';

interface ProfessionalProfileFieldsProps {
  formData: ProfileFormData;
  handleFieldChange: (field: keyof ProfileFormData, value: string) => void;
}

export function ProfessionalProfileFields({
  formData,
  handleFieldChange,
}: ProfessionalProfileFieldsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Professional Profile
      </h3>

      <div className="space-y-6">
        {/* Profile Type Selector */}
        <div className="space-y-2 max-w-md">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Profile Type
          </Label>
          <Select
            value={formData.businessType}
            onValueChange={(value) => handleFieldChange('businessType', value)}
          >
            <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
              <SelectValue placeholder="Select Profile Type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solo">Creator</SelectItem>
              <SelectItem value="startup">Startup</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conditional Fields Based on Business Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700/50">
          {/* Creator Fields */}
          {formData.businessType === 'solo' && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Primary Platform
                </Label>
                <Select
                  value={formData.primaryPlatform}
                  onValueChange={(value) => handleFieldChange('primaryPlatform', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Platform..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content Niche
                </Label>
                <Select
                  value={formData.contentNiche}
                  onValueChange={(value) => handleFieldChange('contentNiche', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Niche..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">Tech & AI</SelectItem>
                    <SelectItem value="lifestyle">Lifestyle</SelectItem>
                    <SelectItem value="education">Education</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Audience Size
                </Label>
                <Select
                  value={formData.creatorAudienceSize}
                  onValueChange={(value) => handleFieldChange('creatorAudienceSize', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Size..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0-1k">Just Starting (0-1k)</SelectItem>
                    <SelectItem value="1k-10k">1k - 10k</SelectItem>
                    <SelectItem value="10k-100k">10k - 100k</SelectItem>
                    <SelectItem value="100k+">100k+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Posting Frequency
                </Label>
                <Select
                  value={formData.postingFrequency}
                  onValueChange={(value) => handleFieldChange('postingFrequency', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Frequency..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="sporadic">Sporadic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Startup Fields */}
          {formData.businessType === 'startup' && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Startup Stage
                </Label>
                <Select
                  value={formData.startupStage}
                  onValueChange={(value) => handleFieldChange('startupStage', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bootstrap">Bootstrapped</SelectItem>
                    <SelectItem value="pre-seed">Pre-Seed</SelectItem>
                    <SelectItem value="seed">Seed</SelectItem>
                    <SelectItem value="series-a">Series A+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Team Size
                </Label>
                <Select
                  value={formData.startupTeamSize}
                  onValueChange={(value) => handleFieldChange('startupTeamSize', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Size..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1 - 10</SelectItem>
                    <SelectItem value="11-50">11 - 50</SelectItem>
                    <SelectItem value="51-200">51 - 200</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Growth Channel
                </Label>
                <Select
                  value={formData.startupGrowthChannel}
                  onValueChange={(value) => handleFieldChange('startupGrowthChannel', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Channel..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organic">Organic Social</SelectItem>
                    <SelectItem value="ads">Paid Ads</SelectItem>
                    <SelectItem value="content">Content Marketing</SelectItem>
                    <SelectItem value="sales">Outbound Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Timeline
                </Label>
                <Select
                  value={formData.timeline}
                  onValueChange={(value) => handleFieldChange('timeline', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Timeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Immediately</SelectItem>
                    <SelectItem value="q3">This Quarter</SelectItem>
                    <SelectItem value="q4">Next Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Agency Fields */}
          {formData.businessType === 'agency' && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Client Count
                </Label>
                <Select
                  value={formData.agencyClientCount}
                  onValueChange={(value) => handleFieldChange('agencyClientCount', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Clients..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1 - 5</SelectItem>
                    <SelectItem value="6-20">6 - 20</SelectItem>
                    <SelectItem value="20+">20+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Primary Service
                </Label>
                <Select
                  value={formData.agencyServices}
                  onValueChange={(value) => handleFieldChange('agencyServices', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Service..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smm">Social Media</SelectItem>
                    <SelectItem value="ads">Paid Media</SelectItem>
                    <SelectItem value="content">Content</SelectItem>
                    <SelectItem value="full">Full Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Agency Niche
                </Label>
                <Select
                  value={formData.agencyNiche}
                  onValueChange={(value) => handleFieldChange('agencyNiche', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Niche..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecom">E-Commerce</SelectItem>
                    <SelectItem value="b2b">B2B Tech</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Monthly Output
                </Label>
                <Select
                  value={formData.agencyMonthlyOutput}
                  onValueChange={(value) => handleFieldChange('agencyMonthlyOutput', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Output..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">&lt; 20 videos</SelectItem>
                    <SelectItem value="medium">20 - 100</SelectItem>
                    <SelectItem value="high">100+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Enterprise Fields */}
          {formData.businessType === 'enterprise' && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Industry
                </Label>
                <Select
                  value={formData.enterpriseIndustry}
                  onValueChange={(value) => handleFieldChange('enterpriseIndustry', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Industry..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fintech">Finance</SelectItem>
                    <SelectItem value="health">Healthcare</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="tech">Technology</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Department
                </Label>
                <Select
                  value={formData.enterpriseDepartment}
                  onValueChange={(value) => handleFieldChange('enterpriseDepartment', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Security Requirement
                </Label>
                <Select
                  value={formData.enterpriseSecurity}
                  onValueChange={(value) => handleFieldChange('enterpriseSecurity', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Security..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soc2">SOC2</SelectItem>
                    <SelectItem value="gdpr">GDPR</SelectItem>
                    <SelectItem value="on-prem">On-Premise</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Budget Range
                </Label>
                <Select
                  value={formData.enterpriseBudget}
                  onValueChange={(value) => handleFieldChange('enterpriseBudget', value)}
                >
                  <SelectTrigger className="w-full h-11 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select Budget..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10k">$10k - $50k</SelectItem>
                    <SelectItem value="50k">$50k - $200k</SelectItem>
                    <SelectItem value="200k+">$200k+</SelectItem>
                    <SelectItem value="undecided">Undecided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
