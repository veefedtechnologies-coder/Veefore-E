import { useState } from 'react'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { Camera, Mail, User, Calendar, CreditCard, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/useUser'
import { useToast } from '@/hooks/use-toast'

export default function Profile() {
  return (
    <>
      <SEO 
        {...seoConfig.profile}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <ProfileContent />
    </>
  )
}

function ProfileContent() {
  const { userData, loading } = useUser()
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    displayName: userData?.displayName || '',
    email: userData?.email || '',
    avatar: userData?.avatar || ''
  })

  const getDisplayName = () => {
    if (userData?.displayName) return userData.displayName
    if (userData?.email) {
      const emailName = userData.email.split('@')[0]
      return emailName.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    }
    return 'User'
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleSave = () => {
    // TODO: Implement profile update API
    toast({
      title: "Profile updated",
      description: "Your profile has been successfully updated.",
    })
    setIsEditing(false)
  }

  const displayName = getDisplayName()
  const initials = getInitials(displayName)

  const showSkeletons = loading && !userData

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center space-x-6">
          <div className="relative">
            {showSkeletons ? (
              <Skeleton className="w-24 h-24 rounded-full" />
            ) : (
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-600 to-blue-700 rounded-full shadow-lg flex items-center justify-center">
                {userData?.avatar ? (
                  <img 
                    src={userData.avatar} 
                    alt="Profile" 
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <span className="text-white font-bold text-2xl">{initials}</span>
                )}
              </div>
            )}
            {!showSkeletons && (
              <Button
                size="sm"
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 p-0"
              >
                <Camera className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex-1">
            {showSkeletons ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
                <div className="flex items-center space-x-4 mt-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{displayName}</h1>
                <p className="text-gray-600 dark:text-gray-400">{userData?.email}</p>
                <div className="flex items-center space-x-4 mt-2">
                  <div className="text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-3 py-1 rounded-full font-medium">
                    {userData?.plan || 'Free'} Plan
                  </div>
                  <div className="text-sm bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-3 py-1 rounded-full font-medium">
                    {userData?.credits || 0} Credits
                  </div>
                </div>
              </>
            )}
          </div>
          {showSkeletons ? (
            <Skeleton className="h-10 w-28 rounded-lg" />
          ) : (
            <Button
              onClick={() => setIsEditing(!isEditing)}
              variant={isEditing ? "secondary" : "default"}
            >
              {isEditing ? 'Cancel' : 'Edit Profile'}
            </Button>
          )}
        </div>
      </div>

      {/* Profile Information */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Profile Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="flex items-center space-x-2">
              <User className="w-4 h-4" />
              <span>Display Name</span>
            </Label>
            {showSkeletons ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Input
                id="displayName"
                value={isEditing ? formData.displayName : displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                disabled={!isEditing}
                className="w-full"
              />
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>Email Address</span>
            </Label>
            {showSkeletons ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Input
                id="email"
                value={userData?.email || ''}
                disabled
                className="w-full bg-gray-50 dark:bg-gray-700"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center space-x-2">
              <User className="w-4 h-4" />
              <span>Username</span>
            </Label>
            {showSkeletons ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Input
                id="username"
                value={userData?.username || ''}
                disabled
                className="w-full bg-gray-50 dark:bg-gray-700"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="created" className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Member Since</span>
            </Label>
            {showSkeletons ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Input
                id="created"
                value={userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : ''}
                disabled
                className="w-full bg-gray-50 dark:bg-gray-700"
              />
            )}
          </div>
        </div>

        {isEditing && (
          <div className="flex justify-end space-x-4 mt-6">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Account Details */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Account Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            {showSkeletons ? (
              <>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Subscription Plan</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{userData?.plan || 'Free'} Plan</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Upgrade
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">Account Security</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Email verified</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-4">
            {showSkeletons ? (
              <>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-600">
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-600">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-6 w-28 mb-2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-600">
                  <div className="font-medium text-blue-900 dark:text-blue-100">Available Credits</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{userData?.credits || 0}</div>
                  <div className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                    Credits are used for AI content generation and analytics
                  </div>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-600">
                  <div className="font-medium text-purple-900 dark:text-purple-100">Referral Code</div>
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{userData?.referralCode}</div>
                  <div className="text-sm text-purple-700 dark:text-purple-300 mt-2">
                    Share this code to earn referral bonuses
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}