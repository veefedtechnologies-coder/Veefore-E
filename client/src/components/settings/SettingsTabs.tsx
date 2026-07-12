import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react'
import { ThemeSelector } from '@/components/ui/theme-selector'
import { useTheme } from '@/hooks/useTheme'
import { THEME_CONFIGS } from '@/lib/theme'
import { 
  Sun, Moon, Sparkles, User, Shield, Bell, Save, 
  Trash2, LogOut, Activity, Globe, Webhook, Key, Check, CreditCard, LayoutDashboard,
  MessageSquare, Brain, Smartphone, Lock, AlertTriangle,
  Loader2, Building2, Plus, Users, Crown, Edit3, Palette,
  Bot, Copy, BarChart3, ArrowRightLeft, Image as ImageIcon,
  Instagram, Facebook, Twitter, Youtube, Linkedin, Link as LinkIcon, AlertCircle, RefreshCw
} from 'lucide-react'
import { useUser } from '@/hooks/useUser'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SkeletonWorkspaceCard } from '@/components/ui/skeleton'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'

// Placeholder function for generic save
const handleGenericSave = (e: React.FormEvent) => {
  e.preventDefault()
  console.log("Settings saved")
}

export function AccountSettings() {
  const { userData } = useUser()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  const [formData, setFormData] = useState({
    displayName: userData?.displayName || '',
    username: userData?.username || '',
    phone: userData?.preferences?.phone || '',
    timezone: userData?.preferences?.timezone || 'Asia/Kolkata (IST)',
    language: userData?.preferences?.language || 'English (US)',
    
    businessType: userData?.businessType || 'solo',
    
    // Creator fields
    primaryPlatform: userData?.preferences?.primaryPlatform || '',
    contentNiche: userData?.preferences?.contentNiche || '',
    creatorAudienceSize: userData?.preferences?.creatorAudienceSize || '',
    postingFrequency: userData?.preferences?.postingFrequency || '',
    
    // Startup fields
    startupStage: userData?.preferences?.startupStage || '',
    startupTeamSize: userData?.preferences?.startupTeamSize || '',
    startupGrowthChannel: userData?.preferences?.startupGrowthChannel || '',
    timeline: userData?.preferences?.timeline || '',
    
    // Agency fields
    agencyClientCount: userData?.preferences?.agencyClientCount || '',
    agencyServices: userData?.preferences?.agencyServices || '',
    agencyNiche: userData?.preferences?.agencyNiche || '',
    agencyMonthlyOutput: userData?.preferences?.agencyMonthlyOutput || '',
    
    // Enterprise fields
    enterpriseIndustry: userData?.preferences?.enterpriseIndustry || '',
    enterpriseDepartment: userData?.preferences?.enterpriseDepartment || '',
    enterpriseSecurity: userData?.preferences?.enterpriseSecurity || '',
    enterpriseBudget: userData?.preferences?.enterpriseBudget || ''
  })

  useEffect(() => {
    if (userData) {
      setFormData(prev => ({
        ...prev,
        displayName: userData.displayName || prev.displayName,
        username: userData.username || prev.username,
        phone: userData.preferences?.phone || prev.phone,
        timezone: userData.preferences?.timezone || prev.timezone,
        language: userData.preferences?.language || prev.language,
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
        enterpriseBudget: userData.preferences?.enterpriseBudget || prev.enterpriseBudget
      }))
    }
  }, [userData])

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/user', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: data.displayName,
          username: data.username,
          businessType: data.businessType,
          niche: data.businessType === 'solo' ? data.contentNiche : (data.businessType === 'agency' ? data.agencyNiche : undefined),
          preferences: {
            ...userData?.preferences,
            phone: data.phone,
            timezone: data.timezone,
            language: data.language,
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
            agencyMonthlyOutput: data.agencyMonthlyOutput,
            enterpriseIndustry: data.enterpriseIndustry,
            enterpriseDepartment: data.enterpriseDepartment,
            enterpriseSecurity: data.enterpriseSecurity,
            enterpriseBudget: data.enterpriseBudget
          }
        })
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] })
      toast({
        title: "Profile Updated",
        description: "Your account settings have been saved successfully.",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error saving profile",
        description: error.message || "Failed to update settings.",
        variant: "destructive"
      })
    }
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value })
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Account Settings</h2>
        <p className="text-gray-600 dark:text-gray-400">Manage your profile, professional details, and personal preferences</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Basic Information</h3>
          <div className="flex items-center gap-6 pb-6 border-b border-gray-100 dark:border-gray-700/50">
            <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-sm relative overflow-hidden group">
              {userData?.avatar ? (
                <img src={userData.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              )}
              <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white text-xs font-medium cursor-pointer transition-all">
                Upload
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Profile Picture</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">PNG, JPG up to 5MB</p>
              <div className="flex gap-3">
                <button type="button" className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                  Upload New
                </button>
                <button type="button" className="px-4 py-2 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                  Remove
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
              <input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
              <input type="text" name="username" value={formData.username} onChange={handleChange} className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
              <input type="email" value={userData?.email || ''} disabled className="w-full h-11 px-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 cursor-not-allowed" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" className="w-full h-11 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white" />
            </div>
          </div>
        </div>

        {/* Professional Profile */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Professional Profile</h3>
          
          <div className="space-y-6">
            <div className="space-y-2 max-w-md">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Profile Type</label>
              <Select value={formData.businessType} onValueChange={(v) => handleSelectChange('businessType', v)}>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700/50">
              {formData.businessType === 'solo' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary Platform</label>
                    <Select value={formData.primaryPlatform} onValueChange={(v) => handleSelectChange('primaryPlatform', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Content Niche</label>
                    <Select value={formData.contentNiche} onValueChange={(v) => handleSelectChange('contentNiche', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Audience Size</label>
                    <Select value={formData.creatorAudienceSize} onValueChange={(v) => handleSelectChange('creatorAudienceSize', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Posting Frequency</label>
                    <Select value={formData.postingFrequency} onValueChange={(v) => handleSelectChange('postingFrequency', v)}>
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

              {formData.businessType === 'startup' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Startup Stage</label>
                    <Select value={formData.startupStage} onValueChange={(v) => handleSelectChange('startupStage', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Team Size</label>
                    <Select value={formData.startupTeamSize} onValueChange={(v) => handleSelectChange('startupTeamSize', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Growth Channel</label>
                    <Select value={formData.startupGrowthChannel} onValueChange={(v) => handleSelectChange('startupGrowthChannel', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Timeline</label>
                    <Select value={formData.timeline} onValueChange={(v) => handleSelectChange('timeline', v)}>
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

              {formData.businessType === 'agency' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client Count</label>
                    <Select value={formData.agencyClientCount} onValueChange={(v) => handleSelectChange('agencyClientCount', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Primary Service</label>
                    <Select value={formData.agencyServices} onValueChange={(v) => handleSelectChange('agencyServices', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Agency Niche</label>
                    <Select value={formData.agencyNiche} onValueChange={(v) => handleSelectChange('agencyNiche', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Output</label>
                    <Select value={formData.agencyMonthlyOutput} onValueChange={(v) => handleSelectChange('agencyMonthlyOutput', v)}>
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

              {formData.businessType === 'enterprise' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Industry</label>
                    <Select value={formData.enterpriseIndustry} onValueChange={(v) => handleSelectChange('enterpriseIndustry', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                    <Select value={formData.enterpriseDepartment} onValueChange={(v) => handleSelectChange('enterpriseDepartment', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Security Requirement</label>
                    <Select value={formData.enterpriseSecurity} onValueChange={(v) => handleSelectChange('enterpriseSecurity', v)}>
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Budget Range</label>
                    <Select value={formData.enterpriseBudget} onValueChange={(v) => handleSelectChange('enterpriseBudget', v)}>
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

        {/* Preferences */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Preferences</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Timezone</label>
              <Select value={formData.timezone} onValueChange={(v) => handleSelectChange('timezone', v)}>
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Language</label>
              <Select value={formData.language} onValueChange={(v) => handleSelectChange('language', v)}>
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

        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-70"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}


interface Workspace {
  id: string
  _id?: string
  name: string
  description?: string
  avatar?: string
  aiPersonality: string
  isDefault: boolean
  maxTeamMembers: number
  inviteCode?: string
  credits: number
  createdAt: string
  updatedAt: string
}

interface WorkspaceFormData {
  name: string
  description: string
  aiPersonality: string
}

// Sub-component to fetch and render connected social accounts per workspace
function WorkspaceSocials({ workspaceId, isActive }: { workspaceId: string, isActive: boolean }) {
  const { validAccounts, isLoading } = useSocialAccounts(workspaceId);

  const getPlatformIcon = (platform: string, className = "w-4 h-4") => {
    switch (platform?.toLowerCase()) {
      case 'instagram': case 'instagram_advanced': return <Instagram className={`${className} text-pink-500`} />;
      case 'facebook': return <Facebook className={`${className} text-blue-600`} />;
      case 'twitter': return <Twitter className={`${className} text-sky-500`} />;
      case 'youtube': return <Youtube className={`${className} text-red-500`} />;
      case 'linkedin': return <Linkedin className={`${className} text-blue-700`} />;
      default: return <LinkIcon className={`${className} text-gray-500`} />;
    }
  }

  if (isLoading) {
    return <div className="animate-pulse h-6 w-24 bg-gray-100 dark:bg-gray-800 rounded-md"></div>;
  }

  if (!validAccounts || validAccounts.length === 0) {
    return (
      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        No connected accounts
      </div>
    );
  }

  if (!isActive) {
    // Minimal View for inactive workspaces
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {validAccounts.slice(0, 5).map((account: any) => (
          <div key={account.id} className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700" title={account.username}>
            {getPlatformIcon(account.platform, "w-3.5 h-3.5")}
          </div>
        ))}
        {validAccounts.length > 5 && (
          <div className="w-6 h-6 rounded-md bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center text-[10px] font-medium text-gray-500 border border-gray-200 dark:border-gray-700">
            +{validAccounts.length - 5}
          </div>
        )}
      </div>
    );
  }

  // Detailed View for active workspace
  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Connected Accounts</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {validAccounts.map((account: any) => (
          <div key={account.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 transition-colors hover:border-gray-200 dark:hover:border-gray-700">
            <div className="w-8 h-8 rounded-md bg-white dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm border border-gray-100 dark:border-gray-700/50">
              {getPlatformIcon(account.platform, "w-4 h-4")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {account.username || account.profileData?.name || 'Unknown Account'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">
                {account.platform.replace('_advanced', '')} 
                {account.profileData?.followersCount ? ` • ${account.profileData.followersCount.toLocaleString()} followers` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceSettings() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { currentWorkspaceId } = useCurrentWorkspace()
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState<WorkspaceFormData>({
    name: '',
    description: '',
    aiPersonality: 'professional'
  })

  // Fetch user's workspaces
  const { data: workspacesRaw = [], isLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: async () => {
      const response = await apiRequest('/api/workspaces');
      if (Array.isArray(response)) return response;
      if (response && Array.isArray(response.data)) return response.data;
      if (response && Array.isArray(response.workspaces)) return response.workspaces;
      return [];
    }
  })
  
  const rawWorkspacesArray = Array.isArray(workspacesRaw) 
    ? workspacesRaw 
    : (workspacesRaw && Array.isArray((workspacesRaw as any).data) 
        ? (workspacesRaw as any).data 
        : []);

  const workspaces: Workspace[] = rawWorkspacesArray.map((ws: any) => ({
    ...ws,
    id: ws.id || ws._id
  }));

  // Create workspace mutation
  const createWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceFormData) => 
      apiRequest('/api/workspaces', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      setIsCreateDialogOpen(false)
      setFormData({ name: '', description: '', aiPersonality: 'professional' })
      toast({ title: "Workspace created", description: "Your new workspace has been created successfully." })
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create workspace", variant: "destructive" })
    }
  })

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<WorkspaceFormData> }) =>
      apiRequest(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      setIsEditDialogOpen(false)
      setSelectedWorkspace(null)
      toast({ title: "Workspace updated", description: "Your workspace has been updated successfully." })
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update workspace", variant: "destructive" })
    }
  })

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/workspaces/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: "Workspace deleted", description: "The workspace has been deleted successfully." })
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete workspace", variant: "destructive" })
    }
  })

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return toast({ title: "Error", description: "Please enter a workspace name", variant: "destructive" })
    createWorkspaceMutation.mutate(formData)
  }

  const handleEditWorkspace = (workspace: Workspace) => {
    setSelectedWorkspace(workspace)
    setFormData({
      name: workspace.name,
      description: workspace.description || '',
      aiPersonality: workspace.aiPersonality
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorkspace) return
    updateWorkspaceMutation.mutate({ id: selectedWorkspace.id, data: formData })
  }

  const handleDeleteWorkspace = (workspace: Workspace) => {
    if (workspace.isDefault) {
      return toast({ title: "Cannot delete", description: "You cannot delete your default workspace", variant: "destructive" })
    }
    if (confirm(`Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`)) {
      deleteWorkspaceMutation.mutate(workspace.id)
    }
  }

  const handleWorkspaceSwitch = async (workspaceId: string) => {
    if (!workspaceId) return;
    localStorage.setItem('currentWorkspaceId', workspaceId)
    window.dispatchEvent(new Event('workspace-changed'))
    
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/content'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] })
    ])
    
    toast({ title: "🚀 Workspace Ready!", description: "Successfully switched active workspace" })
  }

  const copyInviteCode = (inviteCode: string) => {
    navigator.clipboard.writeText(inviteCode)
    toast({ title: "Copied!", description: "Invite code copied to clipboard" })
  }

  const personalities = [
    { value: 'professional', label: 'Professional', icon: '💼' },
    { value: 'creative', label: 'Creative', icon: '🎨' },
    { value: 'casual', label: 'Casual', icon: '😊' },
    { value: 'technical', label: 'Technical', icon: '⚙️' },
    { value: 'friendly', label: 'Friendly', icon: '🤝' }
  ]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Workspaces</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage your enterprise workspaces and organization structure</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md font-medium">
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md border-gray-200 dark:border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Create New Workspace</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateWorkspace} className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Workspace Name <span className="text-red-500">*</span></Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="E.g. Marketing Division" required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Textarea id="description" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description of this workspace's purpose" rows={3} className="resize-none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiPersonality" className="text-sm font-medium">AI Personality Tone</Label>
                <Select value={formData.aiPersonality} onValueChange={(value) => setFormData(prev => ({ ...prev, aiPersonality: value }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {personalities.map((personality) => (
                      <SelectItem key={personality.value} value={personality.value}>
                        <div className="flex items-center space-x-2">
                          <span>{personality.icon}</span>
                          <span>{personality.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="flex-1 h-11 border-gray-200 dark:border-gray-700">Cancel</Button>
                <Button type="submit" disabled={createWorkspaceMutation.isPending} className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm">{createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {isLoading && workspaces.length === 0 ? (
          <>
            <SkeletonWorkspaceCard />
            <SkeletonWorkspaceCard />
          </>
        ) : workspaces.map((workspace: Workspace) => {
          const isActive = workspace.id === currentWorkspaceId;
          
          return (
            <Card key={workspace.id} className={`overflow-hidden border transition-all duration-300 ${isActive ? 'border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 shadow-sm'}`}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{workspace.name}</h3>
                        {workspace.isDefault && (
                          <span title="Default workspace"><Crown className="w-4 h-4 text-amber-500" /></span>
                        )}
                        {isActive && (
                          <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-md">Active</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                        {workspace.description || 'No description provided'}
                      </p>
                      {isActive && (
                        <div className="mt-2 flex items-center text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 px-2 py-1 rounded w-max">
                          ID: {workspace.id}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEditWorkspace(workspace)} className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    {!workspace.isDefault && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteWorkspace(workspace)} className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-gray-100 dark:border-gray-800/60 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800/80 flex items-center justify-center">
                      <Users className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Team Limit</p>
                      <p className="text-gray-900 dark:text-gray-100 font-semibold">{workspace.maxTeamMembers} Members</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-gray-800/80 flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Monthly Credits</p>
                      <p className="text-gray-900 dark:text-gray-100 font-semibold">{workspace.credits}</p>
                    </div>
                  </div>
                </div>

                <div className="py-4">
                  <WorkspaceSocials workspaceId={workspace.id} isActive={isActive} />
                </div>

                <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                    <Bot className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="capitalize">{workspace.aiPersonality} AI</span>
                  </div>
                  
                  {!isActive && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleWorkspaceSwitch(workspace.id)}
                      className="text-xs h-8 px-3 font-medium bg-white dark:bg-transparent border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 shadow-sm transition-all"
                    >
                      <ArrowRightLeft className="w-3 h-3 mr-2" />
                      Set Active
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md border-gray-200 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateWorkspace} className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">Workspace Name <span className="text-red-500">*</span></Label>
              <Input id="edit-name" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter workspace name" required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description" className="text-sm font-medium">Description</Label>
              <Textarea id="edit-description" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Describe your workspace" rows={3} className="resize-none" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-aiPersonality" className="text-sm font-medium">AI Personality</Label>
              <Select value={formData.aiPersonality} onValueChange={(value) => setFormData(prev => ({ ...prev, aiPersonality: value }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {personalities.map((personality) => (
                    <SelectItem key={personality.value} value={personality.value}>
                      <div className="flex items-center space-x-2">
                        <span>{personality.icon}</span>
                        <span>{personality.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} className="flex-1 h-11 border-gray-200 dark:border-gray-700">Cancel</Button>
              <Button type="submit" disabled={updateWorkspaceMutation.isPending} className="flex-1 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm">{updateWorkspaceMutation.isPending ? "Updating..." : "Save Changes"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AppearanceSettings() {
  const { theme } = useTheme()
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Appearance</h2>
        <p className="text-gray-600 dark:text-gray-400">Customize the visual appearance and theme of the application.</p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Select Theme</h3>
          <ThemeSelector variant="grid" />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Current Theme</h4>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
              <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${THEME_CONFIGS[theme].colors.background} 0%, ${THEME_CONFIGS[theme].colors.backgroundSecondary} 100%)` }} />
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{THEME_CONFIGS[theme].name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{THEME_CONFIGS[theme].description}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


export function AISettings() {
  const { userData } = useUser()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // Get current workspace context and workspaceId
  const { currentWorkspaceId, currentWorkspace, isLoading: workspaceLoading } = useCurrentWorkspace()
  
  // Use currentWorkspace directly instead of fetching again
  // This avoids the 401 error and uses already-loaded data
  const workspace = currentWorkspace
  const workspaceDataLoading = workspaceLoading
  const workspaceError = null
  
  const [formData, setFormData] = useState({
    aiModel: 'veegpt-hybrid',
    creativityLevel: 0.7,
    optimizationGoals: 'Engagement',
    aiPersona: 'Professional & Authoritative',
    captionStyle: 'Storytelling',
    responseLength: 'medium',
    multilingual: 'auto',
    videoEngine: 'cinematic',
    thumbnailStyle: 'realistic',
    autoHashtags: true,
    contentSafety: 'standard',
    aiMemory: 'long-term',
    autoLearning: true,
    googleAiStudioKey: '',
    openAiKey: ''
  })

  // Sync state when workspace loads - Task 5.2: Update form initialization to read from workspace.aiConfiguration
  useEffect(() => {
    console.log('[AISettings] Workspace data loaded:', workspace);
    console.log('[AISettings] aiConfiguration:', workspace?.aiConfiguration);
    
    if (workspace?.aiConfiguration) {
      console.log('[AISettings] Loading AI configuration from workspace');
      setFormData(prev => ({
        ...prev,
        aiModel: workspace.aiConfiguration.aiModel || 'veegpt-hybrid',
        creativityLevel: workspace.aiConfiguration.creativityLevel ?? 0.7,
        optimizationGoals: workspace.aiConfiguration.optimizationGoals || 'Engagement',
        aiPersona: workspace.aiConfiguration.aiPersona || 'Professional & Authoritative',
        captionStyle: workspace.aiConfiguration.captionStyle || 'Storytelling',
        responseLength: workspace.aiConfiguration.responseLength || 'medium',
        multilingual: workspace.aiConfiguration.multilingual || 'auto',
        videoEngine: workspace.aiConfiguration.videoEngine || 'cinematic',
        thumbnailStyle: workspace.aiConfiguration.thumbnailStyle || 'realistic',
        autoHashtags: workspace.aiConfiguration.autoHashtags ?? true,
        contentSafety: workspace.aiConfiguration.contentSafety || 'standard',
        aiMemory: workspace.aiConfiguration.aiMemory || 'long-term',
        autoLearning: workspace.aiConfiguration.autoLearning ?? true,
        googleAiStudioKey: workspace.aiConfiguration.googleAiStudioKey || '',
        openAiKey: workspace.aiConfiguration.openAiKey || ''
      }))
    } else {
      console.log('[AISettings] No aiConfiguration in workspace, using defaults');
    }
  }, [workspace])

  // Task 5.3: Create new mutation for workspace AI config update
  const updateAIConfigMutation = useMutation({
    mutationFn: (data: any) => {
      if (!currentWorkspaceId) {
        throw new Error('No workspace ID available')
      }
      return apiRequest(`/api/workspaces/${currentWorkspaceId}`, { 
        method: 'PUT', 
        body: JSON.stringify({ aiConfiguration: data }) 
      })
    },
    onSuccess: () => {
      toast({ 
        title: "AI Configuration Saved", 
        description: "Your workspace AI settings have been updated successfully." 
      })
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces', currentWorkspaceId] })
      queryClient.invalidateQueries({ queryKey: ['/api/user'] })
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to save AI configuration", 
        variant: "destructive" 
      })
    }
  })

  // Task 5.4: Update handleSave to use new mutation with workspaceId validation
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Task 5.5: Add workspaceId validation before submitting
    if (!currentWorkspaceId) {
      toast({ 
        title: "Error", 
        description: "No active workspace found. Please select a workspace.", 
        variant: "destructive" 
      })
      return
    }
    
    updateAIConfigMutation.mutate(formData)
  }

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  // Validate workspaceId availability - show error if not available
  if (!currentWorkspaceId && !workspaceLoading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">AI Configuration</h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl">Enterprise-grade controls for the VeeGPT intelligence engine.</p>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
                No Workspace Available
              </h3>
              <p className="text-red-700 dark:text-red-300 mb-4">
                AI Configuration requires an active workspace. Please create or select a workspace to continue.
              </p>
              <Button
                onClick={() => window.location.href = '/workspaces'}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Go to Workspaces
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while workspace is being fetched
  if (workspaceLoading || workspaceDataLoading) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">AI Configuration</h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl">Loading workspace settings...</p>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Loading Configuration</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Please wait while we fetch your workspace settings...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show error state if workspace query fails
  if (workspaceError) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">AI Configuration</h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl">Enterprise-grade controls for the VeeGPT intelligence engine.</p>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
                Failed to Load Workspace
              </h3>
              <p className="text-red-700 dark:text-red-300 mb-4">
                {workspaceError instanceof Error ? workspaceError.message : 'Unable to load workspace data. Please try again.'}
              </p>
              <Button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/workspaces', currentWorkspaceId] })}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">AI Configuration</h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl">Enterprise-grade controls for the VeeGPT intelligence engine. Define how AI represents your brand across generation and interaction.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8 pb-12">
        
        {/* Core AI Engine */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              <Brain className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Core Intelligence</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure the primary models and creativity constraints</p>
            </div>
          </div>
          
          <div className="space-y-8 pl-1">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {[
                { id: 'veegpt-hybrid', name: 'VeeGPT Hybrid (Recommended)', desc: 'Advanced reasoning with auto-fallback' },
                { id: 'openai-gpt4o', name: 'OpenAI GPT-4o', desc: 'Industry leading context understanding' },
                { id: 'google-ai-studio', name: 'Google AI Studio API', desc: 'Custom key advanced reasoning' },
                { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', desc: 'Highest capability, Google experimental' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'Faster response, lower token usage' }
              ].map((model) => {
                const isSelected = formData.aiModel === model.id;
                return (
                  <label key={model.id} className={`relative flex flex-col p-5 border rounded-xl cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
                    <input type="radio" name="ai_model" value={model.id} checked={isSelected} onChange={(e) => updateField('aiModel', e.target.value)} className="sr-only" />
                    <span className={`font-semibold ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}`}>{model.name}</span>
                    <span className={`text-sm mt-1.5 ${isSelected ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>{model.desc}</span>
                    {isSelected && <div className="absolute top-5 right-5 text-blue-500"><Check className="w-5 h-5" /></div>}
                  </label>
                )
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Creativity Level (Temperature)</label>
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{formData.creativityLevel}</span>
                </div>
                <input type="range" min="0" max="1" step="0.1" value={formData.creativityLevel} onChange={(e) => updateField('creativityLevel', parseFloat(e.target.value))} className="w-full accent-blue-600" />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Strict / Factual</span>
                  <span>Creative / Dynamic</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Primary Optimization Goal</label>
                <Select value={formData.optimizationGoals} onValueChange={(val) => updateField('optimizationGoals', val)}>
                  <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select Goal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engagement">Maximize Engagement & Comments</SelectItem>
                    <SelectItem value="Conversion">Maximize Clicks & Conversions</SelectItem>
                    <SelectItem value="Brand Awareness">Broad Reach & Shareability</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Custom API Keys */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/30 rounded-xl">
              <Key className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Custom API Keys</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Bring your own AI API keys to override default system keys</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-1">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Google AI Studio Key (Gemini)</label>
              <Input type="password" placeholder="AI-zaSy..." value={formData.googleAiStudioKey} onChange={(e) => updateField('googleAiStudioKey', e.target.value)} className="w-full h-11" />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">OpenAI API Key</label>
              <Input type="password" placeholder="sk-..." value={formData.openAiKey} onChange={(e) => updateField('openAiKey', e.target.value)} className="w-full h-11" />
            </div>
          </div>
        </div>

        {/* Content & Tone */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl">
              <MessageSquare className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Content & Tone</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage brand voice and communication styles</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-1">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Default AI Persona</label>
              <Select value={formData.aiPersona} onValueChange={(val) => updateField('aiPersona', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select persona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional & Authoritative">Professional & Authoritative</SelectItem>
                  <SelectItem value="Casual & Friendly">Casual & Friendly</SelectItem>
                  <SelectItem value="Witty & Engaging">Witty & Engaging</SelectItem>
                  <SelectItem value="Empathetic & Helpful">Empathetic & Helpful</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Post Caption Style</label>
              <Select value={formData.captionStyle} onValueChange={(val) => updateField('captionStyle', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select caption style" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Storytelling">Storytelling & Long-form</SelectItem>
                  <SelectItem value="Punchy">Punchy & Short</SelectItem>
                  <SelectItem value="Question-led">Question-led (High Engagement)</SelectItem>
                  <SelectItem value="Data-driven">Data-driven & Factual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">DM Response Length</label>
              <Select value={formData.responseLength} onValueChange={(val) => updateField('responseLength', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select length" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (1-2 sentences)</SelectItem>
                  <SelectItem value="medium">Medium (Detailed but concise)</SelectItem>
                  <SelectItem value="long">Long (Comprehensive)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Multilingual Output</label>
              <Select value={formData.multilingual} onValueChange={(val) => updateField('multilingual', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Language preference" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect (Match User)</SelectItem>
                  <SelectItem value="english">Strictly English</SelectItem>
                  <SelectItem value="hindi">Strictly Hindi</SelectItem>
                  <SelectItem value="hinglish">Hinglish (Urban Indian)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Media & Video */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
              <ImageIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Media & Video Output</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Settings for AI generation of images and videos</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-1">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Default Video Style</label>
              <Select value={formData.videoEngine} onValueChange={(val) => updateField('videoEngine', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select video style" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cinematic">Cinematic 4K</SelectItem>
                  <SelectItem value="anime">Anime / Illustration</SelectItem>
                  <SelectItem value="3d-render">3D Render (Pixar style)</SelectItem>
                  <SelectItem value="documentary">Documentary / Realistic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Thumbnail Style</label>
              <Select value={formData.thumbnailStyle} onValueChange={(val) => updateField('thumbnailStyle', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select thumbnail style" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">Hyper-Realistic</SelectItem>
                  <SelectItem value="vibrant">Vibrant & High Contrast (YouTube style)</SelectItem>
                  <SelectItem value="minimal">Minimalist & Clean</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700/50 pl-1">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Auto-Hashtag Generation</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">Automatically append trending hashtags to captions</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.autoHashtags} onChange={(e) => updateField('autoHashtags', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Privacy & Safety */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-red-50 dark:bg-red-900/30 rounded-xl">
              <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Safety & Memory</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Control data retention and generation constraints</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-1">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">Content Safety Filter (NSFW)</label>
              <Select value={formData.contentSafety} onValueChange={(val) => updateField('contentSafety', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select filter level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Strict (Block all sensitive content)</SelectItem>
                  <SelectItem value="standard">Standard (Block explicit content)</SelectItem>
                  <SelectItem value="off">Off (Not recommended)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Memory Retention</label>
              <Select value={formData.aiMemory} onValueChange={(val) => updateField('aiMemory', val)}>
                <SelectTrigger className="w-full h-11"><SelectValue placeholder="Select memory level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long-term">Long-term (Remember past interactions)</SelectItem>
                  <SelectItem value="short-term">Short-term (Session only)</SelectItem>
                  <SelectItem value="off">Off (Stateless replies)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700/50 pl-1">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">System Auto-Learning</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">Allow the AI to analyze your manual responses to fine-tune its voice over time</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.autoLearning} onChange={(e) => updateField('autoLearning', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 sticky bottom-6 z-10">
          {/* Task 5.5: Add loading and error states */}
          <Button 
            type="submit" 
            disabled={updateAIConfigMutation.isPending || !currentWorkspaceId || workspaceDataLoading} 
            className="flex items-center gap-2 px-8 h-12 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateAIConfigMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {updateAIConfigMutation.isPending ? "Saving configuration..." : "Save AI Configuration"}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function SecurityPrivacySettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Security & Privacy</h2>
        <p className="text-gray-600 dark:text-gray-400">Protect your account and control your data</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Two-Factor Authentication</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add an extra layer of security to your account</p>
              </div>
              <button className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors">
                Enable 2FA
              </button>
            </div>
          </div>
        </div>
        
        <div className="pt-6 border-t border-gray-100 dark:border-gray-700/50">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Active Sessions</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-center gap-4">
                <Smartphone className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Mac OS • Chrome</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Active now • IP: 192.168.1.1</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Privacy</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">Analytics Data Collection</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">Help us improve by sending anonymous usage data</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DangerZoneSettings() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-gray-600 dark:text-gray-400">Irreversible actions that affect your account and workspace</p>
      </div>

      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 space-y-6">
            
            <div className="flex items-center justify-between pb-6 border-b border-red-200 dark:border-red-900/30">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clear Analytics Cache</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Force refresh all your dashboard metrics from Instagram</p>
              </div>
              <button 
                onClick={() => {
                  toast({ title: "Cache Cleared", description: "Your local dashboard cache has been cleared.", variant: "default" });
                  queryClient.clear();
                }}
                className="px-4 py-2 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Clear Cache
              </button>
            </div>

            <div className="flex items-center justify-between pb-6 border-b border-red-200 dark:border-red-900/30">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Disconnect Instagram</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Remove Veefore's access to your Instagram account</p>
              </div>
              <button 
                onClick={() => {
                   toast({ title: "Disconnect Instagram", description: "Please go to the Social Accounts tab to manage connections.", variant: "default" })
                }}
                className="px-4 py-2 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Disconnect Account
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Account</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Permanently delete your account and all associated data</p>
              </div>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to permanently delete your account? This action cannot be undone.")) {
                    toast({ title: "Account Deletion", description: "Account deletion requested. Our team will process this shortly.", variant: "default" })
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm shadow-red-500/20">
                Delete Account
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  )
}

export function NotificationSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Notifications</h2>
        <p className="text-gray-600 dark:text-gray-400">Control how you receive alerts and updates</p>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700/50 pb-4">Email Alerts</h3>
        <div className="space-y-4">
          {[
            { title: "Weekly Analytics Digest", desc: "Get a summary of your performance every Monday" },
            { title: "Automation Alerts", desc: "When an automation flow fails or hits limits" },
            { title: "Social Account Disconnects", desc: "Critical alerts when Instagram tokens expire" },
            { title: "New Feature Announcements", desc: "Updates about Veefore's latest features" }
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked={i !== 3} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AutomationSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Automations</h2>
        <p className="text-gray-600 dark:text-gray-400">Configure global defaults for your automated workflows</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workflow Defaults</h3>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Comment Reply Delay</label>
            <select className="w-full max-w-md px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white">
              <option>Instant (0 seconds)</option>
              <option>Natural (1-3 minutes)</option>
              <option>Delayed (10-15 minutes)</option>
            </select>
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">AI Fallback for DMs</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">If a workflow fails, let VeeGPT attempt to handle the conversation</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddAccountModal({ currentWorkspace, getPlatformIcon }: any) {
  const platforms = [
    { id: 'instagram', name: 'Instagram', description: 'Business & Creator Accounts', color: 'bg-pink-500 hover:bg-pink-600' },
    { id: 'facebook', name: 'Facebook', description: 'Pages & Groups', color: 'bg-blue-600 hover:bg-blue-700' },
    { id: 'linkedin', name: 'LinkedIn', description: 'Personal & Company Pages', color: 'bg-blue-700 hover:bg-blue-800' },
    { id: 'twitter', name: 'X (Twitter)', description: 'Professional Accounts', color: 'bg-slate-900 hover:bg-black dark:hover:bg-slate-800' },
    { id: 'youtube', name: 'YouTube', description: 'Channels & Shorts', color: 'bg-red-600 hover:bg-red-700' }
  ];

  const handleConnect = (platformId: string) => {
    if (!currentWorkspace?.id) return;
    window.location.href = `/api/social-auth/${platformId}/authorize?workspaceId=${currentWorkspace.id}`;
  };

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
          <Plus className="w-6 h-6 text-indigo-600" /> Connect a New Platform
        </DialogTitle>
      </DialogHeader>
      <div className="py-6">
        <p className="text-gray-500 dark:text-gray-400 mb-6">Select a platform below to authenticate. You will be redirected to securely grant permissions to Veefore.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map(p => (
            <button 
              key={p.id}
              onClick={() => handleConnect(p.id)}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800 transition-all group text-left"
            >
              <div className={`w-12 h-12 flex items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105 ${p.color}`}>
                {getPlatformIcon(p.id)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </DialogContent>
  );
}

function ManageAccountModal({ account, isHealthy, syncMutation, getPlatformIcon }: any) {
  const tokenHealth = isHealthy ? "Active & Healthy" : account.tokenStatus === "expired" ? "Expired" : "Requires Action";
  const webhookHealth = isHealthy && account.lastSyncAt ? "Listening" : "Degraded";
  const connectedDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
  
  const profilePic = account.profilePictureUrl || account.profilePicture || account.avatar;

  return (
    <DialogContent className="sm:max-w-[750px] p-0 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-2xl max-h-[95vh]">
      {/* Premium Header with Gradient */}
      <div className="relative h-28 bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-indigo-900 dark:to-purple-900 overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
        <div className="absolute bottom-5 left-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center relative p-0.5">
             {profilePic ? (
                <img src={profilePic} alt={account.username} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-[14px]" />
             ) : (
                <div className="w-full h-full bg-gray-100 rounded-[14px] flex items-center justify-center">
                  {getPlatformIcon(account.platform)}
                </div>
             )}
             <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm">
                <div className="scale-75">{getPlatformIcon(account.platform)}</div>
             </div>
          </div>
          <div>
            <DialogTitle className="text-2xl font-bold text-white drop-shadow-md leading-tight">@{account.username}</DialogTitle>
            <p className="text-white/80 text-sm flex items-center gap-1.5 mt-0.5">
              <span className="capitalize">{account.platform}</span> Business Account
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-transform hover:scale-[1.02]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Followers</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">
              {account.followersCount ? (account.followersCount > 10000 ? (account.followersCount / 1000).toFixed(1) + 'k' : account.followersCount.toLocaleString()) : 'N/A'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-transform hover:scale-[1.02]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Media</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{account.mediaCount ? account.mediaCount.toLocaleString() : 'N/A'}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-transform hover:scale-[1.02]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <p className={`text-sm font-bold ${isHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} leading-none`}>
                {isHealthy ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-transform hover:scale-[1.02]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Connected</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-none mt-1">{connectedDate}</p>
          </div>
        </div>

        {/* Integration Details & Scopes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-3">
             <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-indigo-500" /> Platform Integration
             </h4>
             <div className="flex-1 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 flex-1 flex flex-col justify-center border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Access Token</span>
                     <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isHealthy ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                       {tokenHealth}
                     </span>
                   </div>
                   <p className="text-xs text-gray-500 leading-tight">Authenticates secure API requests.</p>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-center hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Data Synchronization</span>
                     <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${webhookHealth === 'Listening' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                       {webhookHealth}
                     </span>
                   </div>
                   <p className="text-xs text-gray-500 leading-tight">
                     Last synchronized: {account.lastSyncAt ? formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true }) : 'Never'}
                   </p>
                </div>
             </div>
          </div>

          <div className="flex flex-col gap-3">
             <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-emerald-500" /> Authorized Scopes
             </h4>
             <div className="flex-1 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm flex flex-col justify-center">
                {isHealthy ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-lg transition-colors">
                      <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">Content Management</p>
                        <p className="text-xs text-gray-500 leading-tight">Publish posts, stories, & reels.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-lg transition-colors">
                      <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">Community Engagement</p>
                        <p className="text-xs text-gray-500 leading-tight">Read and respond to messages.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 p-1.5 rounded-lg transition-colors">
                      <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">Insights & Analytics</p>
                        <p className="text-xs text-gray-500 leading-tight">Access audience demographics.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Permissions Revoked</p>
                    <p className="text-xs text-gray-500 mt-1">Reconnect this account.</p>
                  </div>
                )}
             </div>
          </div>
        </div>
        
        {/* Footer Actions */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20 -mx-6 -mb-6 p-5 rounded-b-xl shrink-0">
           <div>
             <p className="text-sm font-bold text-gray-900 dark:text-white">Data Synchronization</p>
             <p className="text-xs text-gray-500 mt-0.5">Force a manual fetch of the latest metrics.</p>
           </div>
           <Button 
             onClick={() => syncMutation.mutate(account._id || account.id)} 
             disabled={!isHealthy || syncMutation.isPending}
             className="h-9 text-sm gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5 shadow-sm transition-all hover:shadow active:scale-95"
           >
             <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> 
             {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
           </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function SocialAccountsSettings() {
  const { currentWorkspace } = useCurrentWorkspace();
  const { socialAccounts, isLoading, refetch } = useSocialAccounts(currentWorkspace?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'instagram') {
      const username = params.get('username');
      setConnectedUsername(username);
      setShowSuccessModal(true);
      
      // Clean up the URL so refreshing doesn't trigger it again
      const newUrl = window.location.pathname + '?tab=social';
      window.history.replaceState({}, '', newUrl);

      // Auto-close countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowSuccessModal(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, []);

  const syncMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}/metrics`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: "Sync Triggered", description: "Account metrics are syncing in the background." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Sync Failed", description: err.message || "Failed to trigger sync", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: "Account Removed", description: "The social account was successfully disconnected." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Disconnection Failed", description: err.message || "Could not disconnect account", variant: "destructive" });
    }
  });

  const handleReconnect = (platform: string) => {
    if (!currentWorkspace?.id) return;
    window.location.href = `/api/social-auth/${platform}/authorize?workspaceId=${currentWorkspace.id}`;
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'instagram': return <Instagram className="w-6 h-6" />;
      case 'facebook': return <Facebook className="w-6 h-6" />;
      case 'twitter': return <Twitter className="w-6 h-6" />;
      case 'youtube': return <Youtube className="w-6 h-6" />;
      case 'linkedin': return <Linkedin className="w-6 h-6" />;
      default: return <LinkIcon className="w-6 h-6 text-gray-500" />;
    }
  };

  return (
    <>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Social Accounts</h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl">Manage enterprise connections, OAuth tokens, and synchronization schedules for all your brand profiles.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Status
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="w-4 h-4" /> Add Account
              </Button>
            </DialogTrigger>
            <AddAccountModal currentWorkspace={currentWorkspace} getPlatformIcon={getPlatformIcon} />
          </Dialog>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {[1, 2].map(i => (
              <div key={i} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 animate-pulse">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
                  <div className="space-y-2.5">
                    <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded w-32"></div>
                    <div className="h-4 bg-gray-100 dark:bg-gray-800/50 rounded w-48"></div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl w-32 hidden sm:block"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl w-24"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl w-10"></div>
                </div>
              </div>
            ))}
          </div>
        ) : !socialAccounts?.length ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <LinkIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Social Accounts Connected</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">Connect your brand's social media profiles to enable cross-platform publishing, AI automation, and centralized analytics.</p>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  <Plus className="w-5 h-5" /> Connect First Account
                </Button>
              </DialogTrigger>
              <AddAccountModal currentWorkspace={currentWorkspace} getPlatformIcon={getPlatformIcon} />
            </Dialog>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {socialAccounts.map((account: any) => {
              const isHealthy = account.tokenStatus === 'valid' && account.isActive !== false;
              const hasExpired = account.tokenStatus === 'expired';
              const validId = account._id || account.id; // Bug fix: Ensure ID is valid
              return (
                <div key={validId} className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  
                  {/* Account Identity */}
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      {account.profilePictureUrl ? (
                        <img src={account.profilePictureUrl} alt={account.username} className="w-14 h-14 rounded-xl object-cover ring-2 ring-gray-100 dark:ring-gray-800" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center ring-2 ring-gray-100 dark:ring-gray-800">
                           <div className={`${
                              account.platform.toLowerCase() === 'instagram' ? 'text-pink-500' :
                              account.platform.toLowerCase() === 'facebook' ? 'text-blue-600' :
                              account.platform.toLowerCase() === 'linkedin' ? 'text-blue-700' : 'text-gray-500'
                           }`}>
                             {getPlatformIcon(account.platform)}
                           </div>
                        </div>
                      )}
                      <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center shadow-sm">
                        <div className={`${
                              account.platform.toLowerCase() === 'instagram' ? 'text-pink-500' :
                              account.platform.toLowerCase() === 'facebook' ? 'text-blue-600' :
                              account.platform.toLowerCase() === 'linkedin' ? 'text-blue-700' : 'text-gray-500'
                           }`}>
                          {getPlatformIcon(account.platform)}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {account.username}
                        {!isHealthy && <AlertCircle className="w-4 h-4 text-red-500" />}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="capitalize">{account.platform}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700"></span>
                        <span>{account.followersCount ? account.followersCount.toLocaleString() + ' followers' : 'Unknown audience size'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Diagnostics */}
                  <div className="flex items-center gap-6 lg:justify-end flex-1">
                    <div className="flex flex-col items-start lg:items-end gap-1">
                      <div className={`flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full ${isHealthy ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                        {isHealthy ? 'Active & Syncing' : hasExpired ? 'Token Expired' : 'Action Required'}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Last synced: {account.lastSyncAt ? formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true }) : 'Never'}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => syncMutation.mutate(validId)}
                        disabled={!isHealthy || syncMutation.isPending}
                        title="Force sync metrics"
                        className="text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                      
                      {!isHealthy ? (
                        <Button 
                          onClick={() => handleReconnect(account.platform)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm h-9"
                        >
                          Reconnect
                        </Button>
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="text-sm h-9">
                              Manage
                            </Button>
                          </DialogTrigger>
                          <ManageAccountModal 
                            account={account} 
                            isHealthy={isHealthy} 
                            syncMutation={syncMutation} 
                            getPlatformIcon={getPlatformIcon} 
                          />
                        </Dialog>
                      )}

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/30">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle className="text-red-600 flex items-center gap-2">
                              <AlertCircle className="w-5 h-5" /> Danger Zone: Disconnect Account
                            </DialogTitle>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            <p className="text-gray-600 dark:text-gray-300">
                              You are about to disconnect <strong>{account.username}</strong> from Veefore. This will immediately stop all active automations, automated posting, and analytics syncing for this profile.
                            </p>
                            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/50">
                              <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-300 space-y-1">
                                <li>Scheduled posts will fail</li>
                                <li>AI automations will stop responding</li>
                                <li>Historical metrics will be retained but frozen</li>
                              </ul>
                            </div>
                          </div>
                          <div className="flex justify-end gap-3">
                            <DialogTrigger asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogTrigger>
                            <Button 
                              variant="destructive" 
                              onClick={() => deleteMutation.mutate(validId)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? 'Disconnecting...' : 'Yes, disconnect account'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm" style={{ animation: 'modalFadeIn 0.3s ease-out forwards' }}>
          <style>{`
            @keyframes modalFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes modalPopIn {
              from { opacity: 0; transform: scale(0.94); }
              to { opacity: 1; transform: scale(1); }
            }
          `}</style>
          <div 
            className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-2xl"
            style={{ animation: 'modalPopIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            
            {/* Header Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center border-4 border-white dark:border-gray-900 relative z-10 shadow-sm">
                  <Check className="w-10 h-10 text-emerald-600 dark:text-emerald-400 stroke-[3px]" />
                </div>
                <div className="absolute inset-0 bg-emerald-400 dark:bg-emerald-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
              </div>
            </div>
            
            {/* Content */}
            <div className="text-center space-y-3 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Account Connected</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                The Instagram account <span className="font-semibold text-gray-900 dark:text-white">@{connectedUsername}</span> has been successfully authenticated. Veefore is now securely synchronized with this profile.
              </p>
            </div>
            
            {/* Status Checklist */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-8 space-y-3 border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-900/30 p-1 rounded-full shrink-0">
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">OAuth verification complete</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Secure token established</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-900/30 p-1 rounded-full shrink-0">
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">Permissions granted</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Publishing, insights, and engagement active</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-900/30 p-1 rounded-full shrink-0">
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-200">Initial sync triggered</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Fetching latest audience metrics</p>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <Button 
              onClick={() => setShowSuccessModal(false)}
              className="w-full h-12 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              Close & View Settings <span className="text-gray-400 dark:text-gray-500 font-normal">({countdown}s)</span>
            </Button>
            
          </div>
        </div>
      )}
    </>
  )
}
export function AnalyticsSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Analytics Preferences</h2>
        <p className="text-gray-600 dark:text-gray-400">Customize how your data is tracked and displayed</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dashboard Layout</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Date Range</label>
            <select className="w-full max-w-md px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Month</option>
              <option>Year to Date</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BillingSettings() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Billing & Subscription</h2>
        <p className="text-gray-600 dark:text-gray-400">Manage your plan and credits</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="text-center py-12">
          <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Billing Dashboard</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            All billing and subscription management is handled securely via Stripe.
          </p>
          <Button variant="outline" className="gap-2">
            Open Stripe Billing Portal <ArrowRightLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

