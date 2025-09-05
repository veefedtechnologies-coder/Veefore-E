import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DataTable } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingStates';
import { apiClient } from '../../services/api';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  UserCheck,
  UserX,
  Download,
  Upload,
  RefreshCw,
  Settings,
  ArrowUpDown,
  ChevronDown,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Crown,
  Star,
  Zap,
  Target,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Globe,
  CreditCard,
  MessageSquare,
  BarChart3,
  PieChart,
  LineChart,
  Users2,
  UserPlus,
  UserMinus,
  Ban,
  Unlock,
  Mail as MailIcon,
  Send,
  Copy,
  ExternalLink,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Flag,
  AlertCircle,
  Info,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  Grid,
  List,
  SortAsc,
  SortDesc,
  Filter as FilterIcon,
  X as XIcon,
  Plus as PlusIcon,
  Minus as MinusIcon,
  RotateCcw,
  Save,
  Edit3,
  Trash,
  MoreHorizontal as MoreHorizontalIcon,
  User,
  UserCheck as UserCheckIcon,
  UserX as UserXIcon,
  Shield as ShieldIcon,
  Crown as CrownIcon,
  Star as StarIcon,
  Zap as ZapIcon,
  Target as TargetIcon,
  Activity as ActivityIcon,
  DollarSign as DollarSignIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Globe as GlobeIcon,
  CreditCard as CreditCardIcon,
  MessageSquare as MessageSquareIcon,
  BarChart3 as BarChart3Icon,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Users2 as Users2Icon,
  UserPlus as UserPlusIcon,
  UserMinus as UserMinusIcon,
  Ban as BanIcon,
  Unlock as UnlockIcon,
  Mail as MailIconIcon,
  Send as SendIcon,
  Copy as CopyIcon,
  ExternalLink as ExternalLinkIcon,
  Heart as HeartIcon,
  ThumbsUp as ThumbsUpIcon,
  ThumbsDown as ThumbsDownIcon,
  Flag as FlagIcon,
  AlertCircle as AlertCircleIcon,
  Info as InfoIcon,
  Check as CheckIcon,
  X as XIconIcon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
  Grid as GridIcon,
  List as ListIcon,
  SortAsc as SortAscIcon,
  SortDesc as SortDescIcon,
  Filter as FilterIconIcon,
  X as XIconIconIcon,
  Plus as PlusIconIcon,
  Minus as MinusIconIcon,
  RotateCcw as RotateCcwIcon,
  Save as SaveIcon,
  Edit3 as Edit3Icon,
  Trash as TrashIcon,
  MoreHorizontal as MoreHorizontalIconIcon
} from 'lucide-react';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isBanned: boolean;
  banReason?: string;
  subscription: {
    plan: string;
    status: string;
  };
  credits: {
    total: number;
    used: number;
    remaining: number;
  };
  socialMedia: {
    platforms: Record<string, any>;
  };
  preferences: {
    language: string;
    timezone: string;
  };
  lastLogin?: string;
  loginCount: number;
  createdAt: string;
  avatar?: string;
  totalSpent?: number;
  ordersCount?: number;
  lastActivity?: string;
  isVerified?: boolean;
  performance?: number;
  riskScore?: number;
  engagementScore?: number;
  socialConnections?: number;
  subscriptionStatus?: string;
  subscriptionPlan?: string;
  creditsRemaining?: number;
  creditsUsed?: number;
  location?: string;
  language?: string;
  lastLoginFormatted?: string;
  createdAtFormatted?: string;
  status?: string;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  bannedUsers: number;
  emailVerifiedUsers: number;
  pendingUsers: number;
  totalRevenue: number;
  avgOrderValue: number;
  conversionRate: number;
  churnRate: number;
  growthRate: number;
  activeSubscriptions: number;
  totalOrders: number;
  avgLoginCount: number;
  usersWithSocialConnections: number;
  totalCreditsUsed: number;
  totalCreditsRemaining: number;
  subscriptionBreakdown: Record<string, number>;
}

const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pages: 1
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSubscription, setFilterSubscription] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch users data
  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        sortBy,
        sortOrder,
        search: searchTerm,
        status: filterStatus,
        subscription: filterSubscription
      });

      const response = await apiClient.get(`/users?${params}`);
      console.log('🔍 UsersPage fetchUsers Debug:');
      console.log('  - Full response:', response);
      console.log('  - Response data:', response.data);
      console.log('  - Users array:', response.data.users);
      console.log('  - Users count:', response.data.users?.length);
      console.log('  - Pagination:', response.data.pagination);
      
      setUsers(response.data.users || []);
      setPagination(response.data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, sortBy, sortOrder, searchTerm, filterStatus, filterSubscription]);

  // Fetch user statistics
  const fetchUserStats = useCallback(async () => {
    try {
      const response = await apiClient.get('/users/stats');
      setUserStats(response.data);
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchUserStats();
  }, [fetchUsers, fetchUserStats]);

  // Debug state changes
  useEffect(() => {
    console.log('🔍 UsersPage State Debug:');
    console.log('  - Users count:', users.length);
    console.log('  - Users array:', users);
    console.log('  - Pagination:', pagination);
    console.log('  - Is loading:', isLoading);
  }, [users, pagination, isLoading]);

  const handleCreateUser = async (userData: Partial<User>) => {
    try {
      await apiClient.post('/users', userData);
      setShowCreateModal(false);
      fetchUsers();
      fetchUserStats();
    } catch (error) {
      console.error('Error creating user:', error);
    }
  };

  const handleUpdateUser = async (userId: string, userData: Partial<User>) => {
    try {
      await apiClient.put(`/users/${userId}`, userData);
      setShowEditModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await apiClient.delete(`/users/${userId}`);
      setShowDeleteModal(false);
      fetchUsers();
      fetchUserStats();
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleBulkAction = async (action: string) => {
    try {
      await apiClient.post('/users/bulk', {
        userIds: selectedUsers,
        action
      });
      setSelectedUsers([]);
      setShowBulkActions(false);
      fetchUsers();
      fetchUserStats();
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  // Export users to CSV
  const handleExport = async () => {
    try {
      const response = await apiClient.get('/users/export');
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting users:', error);
    }
  };

  const getStatusBadge = (user: User) => {
    // Use the new status field from backend with time-based logic
    const status = user.status || 'inactive';
    
    switch (status) {
      case 'banned':
        return (
          <Badge variant="danger" className="flex items-center space-x-1">
            <BanIcon className="h-3 w-3" />
            <span>Banned</span>
          </Badge>
        );
      
      case 'active':
        return (
          <Badge variant="success" className="flex items-center space-x-1">
            <CheckCircle className="h-3 w-3" />
            <span>Active</span>
          </Badge>
        );
      
      case 'pending':
        return (
          <Badge variant="warning" className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>Pending</span>
          </Badge>
        );
      
      case 'dormant':
        return (
          <Badge variant="secondary" className="flex items-center space-x-1">
            <AlertTriangle className="h-3 w-3" />
            <span>Dormant</span>
          </Badge>
        );
      
      case 'trial':
        return (
          <Badge variant="info" className="flex items-center space-x-1">
            <Star className="h-3 w-3" />
            <span>Trial</span>
          </Badge>
        );
      
      case 'inactive':
      default:
        return (
          <Badge variant="secondary" className="flex items-center space-x-1">
            <UserXIcon className="h-3 w-3" />
            <span>Inactive</span>
          </Badge>
        );
    }
  };

  const getSubscriptionBadge = (plan: string) => {
    const planConfig = {
      free: { variant: 'secondary' as const, icon: Users, color: 'gray' },
      starter: { variant: 'info' as const, icon: Star, color: 'blue' },
      pro: { variant: 'warning' as const, icon: Crown, color: 'yellow' },
      enterprise: { variant: 'danger' as const, icon: Zap, color: 'red' }
    };
    
    const config = planConfig[plan as keyof typeof planConfig] || planConfig.free;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center space-x-1">
        <Icon className="h-3 w-3" />
        <span className="capitalize">{plan}</span>
      </Badge>
    );
  };

  const getPerformanceColor = (performance: number) => {
    if (performance >= 90) return 'text-green-600';
    if (performance >= 70) return 'text-yellow-600';
    if (performance >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getRiskColor = (riskScore: number) => {
    if (riskScore <= 30) return 'text-green-600 bg-green-100';
    if (riskScore <= 60) return 'text-yellow-600 bg-yellow-100';
    if (riskScore <= 80) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const columns = [
    {
      key: 'user',
      title: 'User',
      dataIndex: 'name',
      width: 300,
      render: (value: string, record: User) => (
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
              {record.avatar && record.avatar.startsWith('http') ? (
                <img 
                  src={record.avatar} 
                  alt={`${record.firstName} ${record.lastName}`}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                `${record.firstName?.charAt(0) || 'U'}${record.lastName?.charAt(0) || ''}`
              )}
            </div>
            {record.isEmailVerified && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                <CheckCircle className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="font-semibold text-gray-900 truncate">{record.name}</p>
            <p className="text-sm text-gray-500 truncate">{record.email}</p>
            <div className="flex items-center space-x-2 mt-1">
              {record.phone && (
                <div className="flex items-center text-xs text-gray-400">
                  <Phone className="h-3 w-3 mr-1" />
                  {record.phone}
                </div>
              )}
              {record.location && (
                <div className="flex items-center text-xs text-gray-400">
                  <MapPin className="h-3 w-3 mr-1" />
                  {record.location}
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      sorter: true
    },
    {
      key: 'subscription',
      title: 'Subscription',
      dataIndex: 'subscriptionPlan',
      width: 120,
      render: (value: string) => getSubscriptionBadge(value || 'free'),
      sorter: true
    },
    {
      key: 'status',
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (value: string, record: User) => getStatusBadge(record),
      sorter: true
    },
    {
      key: 'engagement',
      title: 'Engagement',
      dataIndex: 'engagementScore',
      width: 150,
      render: (value: number) => (
        <div className="flex items-center space-x-2">
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full ${
                value >= 80 ? 'bg-green-500' :
                value >= 60 ? 'bg-yellow-500' :
                value >= 40 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${value || 0}%` }}
            />
          </div>
          <span className={`text-sm font-medium ${getPerformanceColor(value || 0)}`}>
            {value || 0}%
          </span>
        </div>
      ),
      sorter: true
    },
    {
      key: 'credits',
      title: 'Credits',
      dataIndex: 'creditsRemaining',
      width: 120,
      render: (value: number, record: User) => (
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-900">{value || 0}</div>
          <div className="text-xs text-gray-500">of {record.credits?.total || 0}</div>
        </div>
      ),
      sorter: true
    },
    {
      key: 'lastActivity',
      title: 'Last Activity',
      dataIndex: 'lastActivityAt',
      width: 150,
      render: (value: string, record: User) => (
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-900">
            {record.daysSinceLastActivity !== undefined ? record.daysSinceLastActivity : 'N/A'}
          </div>
          <div className="text-xs text-gray-500">days ago</div>
          {record.lastActivityAt && (
            <div className="text-xs text-gray-400 mt-1">
              {new Date(record.lastActivityAt).toLocaleDateString()}
            </div>
          )}
        </div>
      ),
      sorter: true
    },
    {
      key: 'social',
      title: 'Social',
      dataIndex: 'socialConnections',
      width: 100,
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <GlobeIcon className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium">{value || 0}</span>
        </div>
      ),
      sorter: true
    },
    {
      key: 'lastLogin',
      title: 'Last Login',
      dataIndex: 'lastLoginFormatted',
      width: 120,
      render: (value: string) => (
        <div className="text-sm text-gray-600">
          {value || 'Never'}
        </div>
      ),
      sorter: true
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (value: any, record: User) => (
        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedUser(record);
              setShowEditModal(true);
            }}
            className="h-8 w-8 p-0"
          >
            <Edit3Icon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedUser(record);
              setShowDeleteModal(true);
            }}
            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ];

  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-2">
              Manage and monitor all user accounts, subscriptions, and activities
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" onClick={handleExport} className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              <span>Export</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Import</span>
            </Button>
            <Button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Plus className="h-4 w-4" />
              <span>Add User</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        {userStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6">
            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-600 mb-1">Total Users</p>
                  <p className="text-2xl font-bold text-blue-900 mb-2">{userStats.totalUsers?.toLocaleString() || '0'}</p>
                  <div className="flex items-center">
                    <TrendingUpIcon className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600 ml-1">
                      +{userStats.growthRate || 0}% growth
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-200">
                  <Users className="h-6 w-6 text-blue-700" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-600 mb-1">Active Users</p>
                  <p className="text-2xl font-bold text-green-900 mb-2">{userStats.activeUsers?.toLocaleString() || '0'}</p>
                  <div className="flex items-center">
                    <ActivityIcon className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600 ml-1">
                      {userStats.totalUsers ? Math.round((userStats.activeUsers / userStats.totalUsers) * 100) : 0}% of total
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-green-200">
                  <UserCheckIcon className="h-6 w-6 text-green-700" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-600 mb-1">New Users</p>
                  <p className="text-2xl font-bold text-yellow-900 mb-2">{userStats.newUsers?.toLocaleString() || '0'}</p>
                  <div className="flex items-center">
                    <UserPlusIcon className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-600 ml-1">
                      This month
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-yellow-200">
                  <UserPlusIcon className="h-6 w-6 text-yellow-700" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-purple-900 mb-2">${userStats.totalRevenue?.toLocaleString() || '0'}</p>
                  <div className="flex items-center">
                    <DollarSignIcon className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-purple-600 ml-1">
                      ${userStats.avgOrderValue || 0} avg order
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-purple-200">
                  <DollarSignIcon className="h-6 w-6 text-purple-700" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-600 mb-1">Conversion Rate</p>
                  <p className="text-2xl font-bold text-indigo-900 mb-2">{userStats.conversionRate || 0}%</p>
                  <div className="flex items-center">
                    <TargetIcon className="h-4 w-4 text-indigo-500" />
                    <span className="text-sm font-medium text-indigo-600 ml-1">
                      {userStats.churnRate || 0}% churn rate
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-200">
                  <TargetIcon className="h-6 w-6 text-indigo-700" />
                </div>
              </div>
            </Card>

            <Card className="p-6 hover:shadow-lg transition-all duration-200 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-600 mb-1">Banned Users</p>
                  <p className="text-2xl font-bold text-red-900 mb-2">{userStats.bannedUsers?.toLocaleString() || '0'}</p>
                  <div className="flex items-center">
                    <BanIcon className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-600 ml-1">
                      {userStats.totalUsers ? Math.round((userStats.bannedUsers / userStats.totalUsers) * 100) : 0}% of total
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-red-200">
                  <BanIcon className="h-6 w-6 text-red-700" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Filters and Search */}
        <Card className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 h-11"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="banned">Banned</option>
              </select>
              <select
                value={filterSubscription}
                onChange={(e) => setFilterSubscription(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 h-11"
              >
                <option value="all">All Plans</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 h-11"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={200}>200 per page</option>
              </select>
              <Button variant="outline" onClick={fetchUsers} className="flex items-center space-x-2 h-11">
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Users Table */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Showing {users.length} of {pagination.total} users
                {pagination.pages > 1 && ` (Page ${pagination.page} of ${pagination.pages})`}
              </div>
              <div className="text-sm text-gray-500">
                Total: {pagination.total} users
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <DataTable
            data={users}
            columns={columns}
            loading={isLoading}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: pagination.total,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }
            }}
            selection={{
              selectedRowKeys: selectedUsers,
              onChange: (keys, rows) => setSelectedUsers(keys)
            }}
            onRow={(record) => ({
              onClick: () => navigate(`/users/${record._id}`)
            })}
            rowKey="_id"
            size="middle"
            bordered={false}
            striped={true}
            hoverable={true}
          />
          </div>
        </Card>

        {/* Bulk Actions */}
        {selectedUsers.length > 0 && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">
                {selectedUsers.length} user(s) selected
              </span>
              <div className="flex items-center space-x-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('activate')}>
                  Activate
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('suspend')}>
                  Suspend
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('delete')}>
                  Delete
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedUsers([])}>
                  Clear
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New User"
        size="lg"
      >
        <UserForm
          onSubmit={handleCreateUser}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit User"
        size="lg"
      >
        {selectedUser && (
          <UserForm
            user={selectedUser}
            onSubmit={(data) => handleUpdateUser(selectedUser._id, data)}
            onCancel={() => setShowEditModal(false)}
          />
        )}
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete User"
        size="md"
      >
        {selectedUser && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{selectedUser.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => handleDeleteUser(selectedUser._id)}>
                Delete User
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// User Form Component
const UserForm: React.FC<{
  user?: User;
  onSubmit: (data: Partial<User>) => void;
  onCancel: () => void;
}> = ({ user, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<Partial<User>>({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    isActive: user?.isActive ?? true,
    isEmailVerified: user?.isEmailVerified ?? false,
    isBanned: user?.isBanned ?? false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            First Name
          </label>
          <Input
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Last Name
          </label>
          <Input
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Active</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isEmailVerified}
              onChange={(e) => setFormData({ ...formData, isEmailVerified: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Email Verified</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isBanned}
              onChange={(e) => setFormData({ ...formData, isBanned: e.target.checked })}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="ml-2 text-sm text-gray-700">Banned</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          {user ? 'Update User' : 'Create User'}
        </Button>
      </div>
    </form>
  );
};

export default UsersPage;