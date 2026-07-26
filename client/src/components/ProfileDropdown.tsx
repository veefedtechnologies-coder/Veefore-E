import React, { useState } from 'react'
import { ChevronDown, User, Settings, LogOut, CreditCard, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUser } from '@/hooks/useUser'
import { logout } from '@/lib/auth'
import { useToast } from '@/hooks/use-toast'
import { useLocation } from 'wouter'
import useSubscription from '@/hooks/useSubscription'

export function ProfileDropdown() {
  const { userData } = useUser()
  const { plan, aiCredits, isLoading: subscriptionLoading } = useSubscription()
  const creditBalance = aiCredits?.remaining
  const creditLabel = creditBalance == null
    ? (subscriptionLoading ? 'Loading…' : 'Unavailable')
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.max(0, creditBalance))
  const { toast } = useToast()
  const [, setLocation] = useLocation()

  const handleLogout = async () => {
    try {
      await logout()
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      })
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getDisplayName = () => {
    if (userData?.displayName) return userData.displayName
    if (userData?.email) {
      // Extract name from email (before @)
      const emailName = userData.email.split('@')[0]
      // Convert username format to readable name
      return emailName.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
    return 'User'
  }

  const displayName = getDisplayName()
  const initials = getInitials(displayName)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center space-x-4 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/80 rounded-2xl px-4 py-3 transition-all duration-300 group shadow-sm hover:shadow-md">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-600 to-blue-700 rounded-2xl shadow-lg group-hover:shadow-xl transition-all duration-300 flex items-center justify-center">
            <span className="text-white font-bold text-lg">{initials}</span>
          </div>
          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-300" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 bg-white dark:bg-gray-800" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-gray-900 dark:text-gray-100">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">{userData?.email}</p>
            <div className="flex items-center space-x-2 mt-2">
              <div className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
                {plan || userData?.plan || 'Free'} Plan
              </div>
              <div className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-1 rounded-full font-medium">
                {creditLabel} Credits
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation('/profile')} className="cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation('/settings')} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation('/plan')} className="cursor-pointer">
          <CreditCard className="mr-2 h-4 w-4" />
          <span>Billing & Plan</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation('/help')} className="cursor-pointer">
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help & Support</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}