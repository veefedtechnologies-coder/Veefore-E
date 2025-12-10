import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'wouter'
import { 
  Search, 
  Filter, 
  Users, 
  CheckCircle, 
  XCircle, 
  Ban, 
  Trash2, 
  Eye,
  Mail,
  Calendar,
  Clock,
  User,
  Shield,
  TrendingUp,
  AlertTriangle,
  MoreVertical,
  ChevronDown,
  Download,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { apiRequest } from '@/lib/queryClient'
import { Skeleton } from '@/components/ui/skeleton'

function AdminPanelSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-8">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center space-x-4">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>

        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table Card Skeleton */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters Skeleton */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 w-[200px] rounded-md" />
            </div>

            {/* Table Skeleton */}
            <div className="rounded-md border">
              <div className="border-b bg-gray-50 px-4 py-3">
                <div className="flex items-center space-x-8">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-4 py-4 border-b last:border-0">
                  <div className="flex items-center space-x-8">
                    <div className="flex flex-col space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-8 rounded" />
                    <Skeleton className="h-6 w-8 rounded" />
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-8 w-8 rounded" />
                      <Skeleton className="h-8 w-8 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Skeleton */}
            <div className="flex items-center justify-between mt-4">
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center space-x-2">
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface WaitlistUser {
  id: string
  name: string
  email: string
  status: 'waitlisted' | 'approved' | 'rejected' | 'banned' | 'early_access' | 'removed'
  referralCode: string
  referralCount: number
  credits: number
  joinedAt: string
  updatedAt: string
  metadata?: {
    questionnaire?: {
      goals?: string[]
      businessType?: string
      teamSize?: string
      experience?: string
      primaryUse?: string
      industry?: string
      budget?: string
    }
    deviceFingerprint?: {
      ip: string
      userAgent: string
    }
    rejectionReason?: string
    banReason?: string
    bannedAt?: string
    bannedBy?: string
  }
}

interface WaitlistStats {
  totalUsers: number
  todaySignups: number
  totalReferrals: number
  averageReferrals: number
  statusBreakdown: { [key: string]: number }
}

export default function AdminPanel() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  
  // Check admin authentication
  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken')
    console.log('Admin token:', adminToken ? 'exists' : 'missing')
    if (!adminToken) {
      console.log('No admin token found, redirecting to admin-login')
      setLocation('/admin-login')
      return
    }
  }, [setLocation])
  
  // State
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState<WaitlistUser | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [showUserDetails, setShowUserDetails] = useState(false)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'ban' | 'remove' | 'grant-early-access' | null>(null)
  const [showActionDialog, setShowActionDialog] = useState(false)
  
  const pageSize = 20

  // Custom API request with admin token (bypass Firebase auth)
  const adminApiRequest = async (url: string, options: any = {}) => {
    const adminToken = localStorage.getItem('adminToken')
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        Authorization: `Bearer ${adminToken}`
      }
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(errorData || `${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      return response.json()
    }
    
    return response.text()
  }

  // Fetch waitlist users
  const { data: waitlistData, isLoading: isLoadingUsers, refetch: refetchUsers, error: waitlistError } = useQuery({
    queryKey: ['/api/admin/waitlist', currentPage, searchTerm, statusFilter],
    queryFn: () => {
      console.log('Fetching waitlist data...')
      return adminApiRequest(`/api/admin/waitlist?page=${currentPage}&limit=${pageSize}&search=${searchTerm}&filter=${statusFilter}`)
    },
    retry: false
  })

  // Log any errors
  if (waitlistError) {
    console.error('Waitlist fetch error:', waitlistError)
  }

  // Fetch waitlist stats
  const { data: stats, isLoading: isLoadingStats, error: statsError } = useQuery({
    queryKey: ['/api/admin/waitlist/stats'],
    queryFn: () => {
      console.log('Fetching stats data...')
      return adminApiRequest('/api/admin/waitlist/stats')
    },
    retry: false
  })

  // Log any errors
  if (statsError) {
    console.error('Stats fetch error:', statsError)
  }

  // User action mutations
  const userActionMutation = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: string, action: string, reason?: string }) => {
      const body = reason ? { reason } : {}
      return adminApiRequest(`/api/admin/waitlist/${userId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body)
      })
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['/api/admin/waitlist/stats'] })
      setShowActionDialog(false)
      setSelectedUser(null)
      setActionReason('')
      setActionType(null)
      
      toast({
        title: "Action completed",
        description: data.message || `User ${variables.action.replace('-', ' ')} successfully`
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to perform action",
        variant: "destructive"
      })
    }
  })

  const getStatusBadge = (status: string) => {
    const variants = {
      waitlisted: { variant: "secondary" as const, color: "text-blue-600", bg: "bg-blue-100" },
      approved: { variant: "default" as const, color: "text-green-600", bg: "bg-green-100" },
      early_access: { variant: "default" as const, color: "text-purple-600", bg: "bg-purple-100" },
      rejected: { variant: "destructive" as const, color: "text-red-600", bg: "bg-red-100" },
      banned: { variant: "destructive" as const, color: "text-red-800", bg: "bg-red-200" },
      removed: { variant: "outline" as const, color: "text-gray-600", bg: "bg-gray-100" }
    }
    
    const config = variants[status as keyof typeof variants] || variants.waitlisted
    
    return (
      <Badge className={`${config.bg} ${config.color} border-none`}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    )
  }

  const handleUserAction = (user: WaitlistUser, action: typeof actionType) => {
    setSelectedUser(user)
    setActionType(action)
    setShowActionDialog(true)
  }

  const confirmAction = () => {
    if (!selectedUser || !actionType) return
    
    userActionMutation.mutate({
      userId: selectedUser.id,
      action: actionType,
      reason: actionReason || undefined
    })
  }

  const exportUsers = () => {
    // Create CSV content
    const headers = ['Name', 'Email', 'Status', 'Joined Date', 'Referral Code', 'Referrals', 'Credits']
    const csvContent = [
      headers.join(','),
      ...(waitlistData?.users || []).map((user: WaitlistUser) => [
        `"${user.name}"`,
        `"${user.email}"`,
        user.status,
        new Date(user.joinedAt).toLocaleDateString(),
        user.referralCode,
        user.referralCount,
        user.credits
      ].join(','))
    ].join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `waitlist-users-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export completed",
      description: "Waitlist users exported successfully"
    })
  }

  // Show skeleton loading state while data is being fetched
  if (isLoadingUsers || isLoadingStats) {
    return <AdminPanelSkeleton />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-600 mt-2">Manage waitlist users and applications</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button onClick={() => refetchUsers()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={exportUsers} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Today's Signups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.todaySignups || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.totalReferrals || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Approved Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.statusBreakdown?.approved || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.statusBreakdown?.waitlisted || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Waitlist Users</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search by name, email, or referral code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="waitlisted">Waitlisted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="early_access">Early Access</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitlistData?.users?.map((user: WaitlistUser) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-sm text-gray-500">{user.email}</span>
                          <span className="text-xs text-gray-400">ID: {user.referralCode}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm">{new Date(user.joinedAt).toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.referralCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.credits}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedUser(user)
                              setShowUserDetails(true)
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {user.status === 'waitlisted' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleUserAction(user, 'approve')}>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleUserAction(user, 'grant-early-access')}>
                                    <Shield className="w-4 h-4 mr-2" />
                                    Grant Early Access
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleUserAction(user, 'reject')}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject
                                  </DropdownMenuItem>
                                </>
                              )}
                              {user.status !== 'banned' && (
                                <DropdownMenuItem onClick={() => handleUserAction(user, 'ban')}>
                                  <Ban className="w-4 h-4 mr-2" />
                                  Ban User
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleUserAction(user, 'remove')}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {waitlistData?.pagination && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Showing {((waitlistData.pagination.page - 1) * waitlistData.pagination.limit) + 1} to{' '}
                  {Math.min(waitlistData.pagination.page * waitlistData.pagination.limit, waitlistData.pagination.total)} of{' '}
                  {waitlistData.pagination.total} results
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {waitlistData.pagination.page} of {waitlistData.pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(waitlistData.pagination.pages, currentPage + 1))}
                    disabled={currentPage === waitlistData.pagination.pages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Details Dialog */}
        <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>User Details</DialogTitle>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Name</Label>
                    <p className="text-sm">{selectedUser.name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Email</Label>
                    <p className="text-sm">{selectedUser.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Status</Label>
                    <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Referral Code</Label>
                    <p className="text-sm">{selectedUser.referralCode}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Joined Date</Label>
                    <p className="text-sm">{new Date(selectedUser.joinedAt).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">Credits</Label>
                    <p className="text-sm">{selectedUser.credits}</p>
                  </div>
                </div>

                {/* Questionnaire Responses */}
                {selectedUser.metadata?.questionnaire && (
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Questionnaire Responses</Label>
                    <div className="mt-4 space-y-4 bg-gray-50 p-4 rounded-lg">
                      {selectedUser.metadata.questionnaire.goals && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Goals</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.goals.join(', ')}</p>
                        </div>
                      )}
                      {selectedUser.metadata.questionnaire.businessType && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Business Type</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.businessType}</p>
                        </div>
                      )}
                      {selectedUser.metadata.questionnaire.teamSize && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Team Size</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.teamSize}</p>
                        </div>
                      )}
                      {selectedUser.metadata.questionnaire.experience && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Experience Level</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.experience}</p>
                        </div>
                      )}
                      {selectedUser.metadata.questionnaire.industry && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Industry</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.industry}</p>
                        </div>
                      )}
                      {selectedUser.metadata.questionnaire.primaryUse && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">Primary Use Case</Label>
                          <p className="text-sm">{selectedUser.metadata.questionnaire.primaryUse}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Device Info */}
                {selectedUser.metadata?.deviceFingerprint && (
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Device Information</Label>
                    <div className="mt-4 space-y-2 bg-gray-50 p-4 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-gray-600">IP Address</Label>
                        <p className="text-sm font-mono">{selectedUser.metadata.deviceFingerprint.ip}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-600">User Agent</Label>
                        <p className="text-xs text-gray-600 break-all">{selectedUser.metadata.deviceFingerprint.userAgent}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action History */}
                {(selectedUser.metadata?.rejectionReason || selectedUser.metadata?.banReason) && (
                  <div>
                    <Label className="text-lg font-semibold text-gray-800">Action History</Label>
                    <div className="mt-4 space-y-2 bg-red-50 p-4 rounded-lg">
                      {selectedUser.metadata.rejectionReason && (
                        <div>
                          <Label className="text-sm font-medium text-red-600">Rejection Reason</Label>
                          <p className="text-sm">{selectedUser.metadata.rejectionReason}</p>
                        </div>
                      )}
                      {selectedUser.metadata.banReason && (
                        <div>
                          <Label className="text-sm font-medium text-red-600">Ban Reason</Label>
                          <p className="text-sm">{selectedUser.metadata.banReason}</p>
                          {selectedUser.metadata.bannedAt && (
                            <p className="text-xs text-gray-600">Banned on: {new Date(selectedUser.metadata.bannedAt).toLocaleDateString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Action Confirmation Dialog */}
        <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Action</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>
                Are you sure you want to <strong>{actionType?.replace('-', ' ')}</strong> user <strong>{selectedUser?.name}</strong>?
              </p>
              {(actionType === 'reject' || actionType === 'ban') && (
                <div>
                  <Label htmlFor="reason">Reason (optional)</Label>
                  <Textarea
                    id="reason"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={`Enter reason for ${actionType}...`}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowActionDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={confirmAction}
                disabled={userActionMutation.isPending}
                variant={actionType === 'ban' || actionType === 'remove' || actionType === 'reject' ? 'destructive' : 'default'}
              >
                {userActionMutation.isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}