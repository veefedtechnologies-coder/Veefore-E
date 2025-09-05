import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { apiClient } from '../services/api'
import toast from 'react-hot-toast'

interface Admin {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  level: number
  team: string
  permissions: string[]
  twoFactorEnabled: boolean
  lastLogin?: string
}

interface AuthContextType {
  admin: Admin | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string, twoFactorCode?: string) => Promise<void>
  logout: () => void
  updateProfile: (data: Partial<Admin>) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  setup2FA: () => Promise<{ secret: string; qrCode: string; manualEntryKey: string }>
  verify2FA: (token: string) => Promise<void>
  disable2FA: (password: string, token: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Check if user is authenticated on mount
  const { data: profileData, isLoading: profileLoading } = useQuery(
    'admin-profile',
    () => apiClient.get('/auth/profile'),
    {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: !!localStorage.getItem('token'), // Only run if token exists
      onError: () => {
        setAdmin(null)
        localStorage.removeItem('token')
      }
    }
  )

  useEffect(() => {
    // Check both possible response structures
    const adminData = profileData?.data?.admin || profileData?.data?.data?.admin
    if (adminData) {
      setAdmin(adminData)
    }
    // Set loading to false if no token exists or if profile loading is complete
    if (!localStorage.getItem('token') || !profileLoading) {
      setIsLoading(false)
    }
  }, [profileData, profileLoading])

  // Update isAuthenticated to also check for token in localStorage
  const isAuthenticated = !!admin || !!localStorage.getItem('token')

  const loginMutation = useMutation(
    ({ email, password, twoFactorCode }: { email: string; password: string; twoFactorCode?: string }) =>
      apiClient.post('/auth/login', { email, password, twoFactorCode }),
    {
                 onSuccess: (response) => {
             console.log('🔍 Frontend Login Debug:');
             console.log('  - Full response:', response);
             console.log('  - Response data:', response.data);
             console.log('  - Response data.data:', response.data?.data);
             console.log('  - Token exists in data.data:', !!response.data?.data?.token);
             console.log('  - Token length:', response.data?.data?.token?.length);
             console.log('  - Admin data exists in data.data:', !!response.data?.data?.admin);
             
             // Extract from the correct nested structure
             const { token, admin: adminData } = response.data.data || {}
             console.log('  - Extracted token length:', token?.length);
             console.log('  - Extracted token preview:', token?.substring(0, 50) + '...');
             
             if (token && adminData) {
               localStorage.setItem('token', token)
               setAdmin(adminData)
               setIsLoading(false)
               toast.success('Login successful!')
               // Invalidate profile query to refresh admin data
               queryClient.invalidateQueries('admin-profile')
             } else {
               console.error('❌ Missing token or admin data in response');
               toast.error('Login failed: Invalid response format')
             }
           },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Login failed')
      }
    }
  )

  const logoutMutation = useMutation(
    () => apiClient.post('/auth/logout'),
    {
      onSuccess: () => {
        localStorage.removeItem('token')
        setAdmin(null)
        queryClient.clear()
        toast.success('Logged out successfully')
      },
      onError: () => {
        // Even if logout fails on server, clear local state
        localStorage.removeItem('token')
        setAdmin(null)
        queryClient.clear()
      }
    }
  )

  const updateProfileMutation = useMutation(
    (data: Partial<Admin>) => apiClient.put('/auth/profile', data),
    {
      onSuccess: (response) => {
        setAdmin(response.data.admin)
        toast.success('Profile updated successfully')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update profile')
      }
    }
  )

  const changePasswordMutation = useMutation(
    ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      apiClient.post('/auth/change-password', { currentPassword, newPassword }),
    {
      onSuccess: () => {
        toast.success('Password changed successfully')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to change password')
      }
    }
  )

  const setup2FAMutation = useMutation(
    () => apiClient.post('/auth/setup-2fa'),
    {
      onSuccess: (response) => {
        toast.success('2FA setup initiated')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to setup 2FA')
      }
    }
  )

  const verify2FAMutation = useMutation(
    (token: string) => apiClient.post('/auth/verify-2fa', { token }),
    {
      onSuccess: () => {
        toast.success('2FA enabled successfully')
        // Refresh profile to get updated 2FA status
        queryClient.invalidateQueries('admin-profile')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to verify 2FA')
      }
    }
  )

  const disable2FAMutation = useMutation(
    ({ password, token }: { password: string; token: string }) =>
      apiClient.post('/auth/disable-2fa', { password, token }),
    {
      onSuccess: () => {
        toast.success('2FA disabled successfully')
        // Refresh profile to get updated 2FA status
        queryClient.invalidateQueries('admin-profile')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to disable 2FA')
      }
    }
  )

  const login = async (email: string, password: string, twoFactorCode?: string) => {
    await loginMutation.mutateAsync({ email, password, twoFactorCode })
  }

  const logout = () => {
    logoutMutation.mutate()
  }

  const updateProfile = async (data: Partial<Admin>) => {
    await updateProfileMutation.mutateAsync(data)
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await changePasswordMutation.mutateAsync({ currentPassword, newPassword })
  }

  const setup2FA = async () => {
    const response = await setup2FAMutation.mutateAsync()
    return response.data.data
  }

  const verify2FA = async (token: string) => {
    await verify2FAMutation.mutateAsync(token)
  }

  const disable2FA = async (password: string, token: string) => {
    await disable2FAMutation.mutateAsync({ password, token })
  }

  const value: AuthContextType = {
    admin,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateProfile,
    changePassword,
    setup2FA,
    verify2FA,
    disable2FA
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
