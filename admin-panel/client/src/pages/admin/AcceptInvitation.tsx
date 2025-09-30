import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Shield, 
  Users, 
  Crown, 
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  BookOpen,
  Lock,
  UserCheck,
  Settings,
  BarChart3,
  MessageSquare,
  CreditCard,
  FileText,
  Zap
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { apiClient } from '../../services/api';

interface InvitationDetails {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  level: number;
  team: string;
  permissions: string[];
  status: string;
  invitedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  invitedAt: string;
  expiresAt: string;
  customMessage?: string;
}

interface PermissionCategory {
  name: string;
  permissions: string[];
  icon: React.ReactNode;
  description: string;
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    name: 'Authentication & Security',
    permissions: ['auth.login', 'auth.logout', 'auth.2fa.enable', 'auth.password.change'],
    icon: <Lock className="h-5 w-5" />,
    description: 'Login access and security controls'
  },
  {
    name: 'User Management',
    permissions: ['users.read', 'users.edit', 'users.ban', 'users.analytics.view'],
    icon: <Users className="h-5 w-5" />,
    description: 'Manage user accounts and data'
  },
  {
    name: 'Admin Management',
    permissions: ['admins.read', 'admins.invite', 'admins.roles.assign'],
    icon: <Crown className="h-5 w-5" />,
    description: 'Manage admin accounts and roles'
  },
  {
    name: 'Support & Communication',
    permissions: ['tickets.read', 'tickets.respond', 'notifications.send'],
    icon: <MessageSquare className="h-5 w-5" />,
    description: 'Handle support tickets and communications'
  },
  {
    name: 'Analytics & Reporting',
    permissions: ['analytics.dashboard.view', 'reports.generate', 'analytics.export'],
    icon: <BarChart3 className="h-5 w-5" />,
    description: 'View analytics and generate reports'
  },
  {
    name: 'System Administration',
    permissions: ['system.settings.view', 'security.audit.view'],
    icon: <Settings className="h-5 w-5" />,
    description: 'System configuration and monitoring'
  }
];

export const AcceptInvitation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showCredentials, setShowCredentials] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);

  const token = searchParams.get('token');

  // Fetch invitation details
  const { data: invitationData, isLoading, error } = useQuery({
    queryKey: ['admin-invitation', token],
    queryFn: async () => {
      if (!token) throw new Error('No invitation token provided');
      const response = await apiClient.get(`/onboarding/invitation/${token}`);
      return response.data.data as InvitationDetails;
    },
    enabled: !!token
  });

  // Accept invitation mutation
  const acceptInvitationMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('No invitation token provided');
      const response = await apiClient.post(`/onboarding/invitation/${token}/accept`, {
        twoFactorEnabled: false
      });
      return response.data;
    },
    onSuccess: (data) => {
      setIsAccepting(false);
      setShowCredentials(true);
    },
    onError: (error: any) => {
      setIsAccepting(false);
      setAcceptanceError(error.response?.data?.message || 'Failed to accept invitation');
    }
  });

  const handleAcceptInvitation = async () => {
    setIsAccepting(true);
    setAcceptanceError(null);
    acceptInvitationMutation.mutate();
  };

  const handleRejectInvitation = () => {
    // Navigate back or show rejection message
    navigate('/');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getPermissionCategory = (permission: string) => {
    return PERMISSION_CATEGORIES.find(category => 
      category.permissions.some(p => permission.startsWith(p.split('.')[0] + '.'))
    ) || {
      name: 'Other',
      permissions: [],
      icon: <FileText className="h-5 w-5" />,
      description: 'Additional permissions'
    };
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' },
      approved: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle, text: 'Approved' },
      accepted: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Accepted' },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Rejected' },
      expired: { color: 'bg-gray-100 text-gray-800', icon: AlertTriangle, text: 'Expired' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.text}
      </span>
    );
  };

  const getRoleIcon = (role: string) => {
    const roleIcons: { [key: string]: React.ReactNode } = {
      superadmin: <Crown className="h-5 w-5 text-purple-600" />,
      admin: <Shield className="h-5 w-5 text-blue-600" />,
      support: <MessageSquare className="h-5 w-5 text-green-600" />,
      billing: <CreditCard className="h-5 w-5 text-orange-600" />,
      moderator: <UserCheck className="h-5 w-5 text-yellow-600" />,
      analytics: <BarChart3 className="h-5 w-5 text-indigo-600" />
    };
    return roleIcons[role] || <Shield className="h-5 w-5 text-gray-600" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  if (error || !invitationData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">
            This invitation link is invalid or has expired. Please contact your administrator for a new invitation.
          </p>
          <Button onClick={() => navigate('/')} className="w-full">
            Go to Home
          </Button>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(invitationData.expiresAt) < new Date();
  const canAccept = invitationData.status === 'pending' || invitationData.status === 'approved';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            VeeFore Admin Panel Invitation
          </h1>
          <p className="text-xl text-gray-600">
            You've been invited to join our admin team
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invitation Status */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Invitation Status</h2>
                {getStatusBadge(invitationData.status)}
              </div>
              
              {isExpired && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                    <p className="text-red-800 font-medium">This invitation has expired</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invited By</label>
                  <p className="text-gray-900">
                    {invitationData.invitedBy.firstName} {invitationData.invitedBy.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{invitationData.invitedBy.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invited On</label>
                  <p className="text-gray-900">
                    {new Date(invitationData.invitedAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(invitationData.invitedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires On</label>
                  <p className={`${isExpired ? 'text-red-600' : 'text-gray-900'}`}>
                    {new Date(invitationData.expiresAt).toLocaleDateString()}
                  </p>
                  <p className={`text-sm ${isExpired ? 'text-red-500' : 'text-gray-500'}`}>
                    {new Date(invitationData.expiresAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <p className="text-gray-900">{invitationData.email}</p>
                </div>
              </div>
            </Card>

            {/* Role & Team Information */}
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Role & Team</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    {getRoleIcon(invitationData.role)}
                  </div>
                  <h3 className="font-semibold text-gray-900">Role</h3>
                  <p className="text-gray-600 capitalize">{invitationData.role}</p>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Team</h3>
                  <p className="text-gray-600 capitalize">{invitationData.team}</p>
                </div>
                <div className="text-center">
                  <div className="flex justify-center mb-2">
                    <Zap className="h-5 w-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Level</h3>
                  <p className="text-gray-600">Level {invitationData.level}</p>
                </div>
              </div>
            </Card>

            {/* Permissions Overview */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Your Permissions</h2>
                <Button
                  variant="outline"
                  onClick={() => setShowPermissionGuide(true)}
                  className="flex items-center"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  View Guide
                </Button>
              </div>
              
              <p className="text-gray-600 mb-4">
                You have been granted <strong>{invitationData.permissions.length}</strong> permissions across different categories.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PERMISSION_CATEGORIES.map((category) => {
                  const categoryPermissions = invitationData.permissions.filter(permission =>
                    category.permissions.some(catPerm => permission.startsWith(catPerm.split('.')[0] + '.'))
                  );

                  if (categoryPermissions.length === 0) return null;

                  return (
                    <div key={category.name} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        {category.icon}
                        <h3 className="font-semibold text-gray-900 ml-2">{category.name}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                      <p className="text-sm font-medium text-blue-600">
                        {categoryPermissions.length} permission{categoryPermissions.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Custom Message */}
            {invitationData.customMessage && (
              <Card className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Personal Message</h2>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-gray-800 italic">"{invitationData.customMessage}"</p>
                </div>
              </Card>
            )}

            {/* Action Buttons */}
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">What's Next?</h2>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">1</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Accept the Invitation</h3>
                    <p className="text-gray-600">Click the accept button to create your admin account</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">2</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Receive Your Credentials</h3>
                    <p className="text-gray-600">You'll get secure login credentials via email</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-sm">3</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Start Using the Admin Panel</h3>
                    <p className="text-gray-600">Access all your assigned features and permissions</p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-4 mt-6">
                <Button
                  onClick={handleAcceptInvitation}
                  disabled={!canAccept || isExpired || isAccepting}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  {isAccepting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Accepting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Accept Invitation
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRejectInvitation}
                  disabled={isAccepting}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Decline
                </Button>
              </div>

              {acceptanceError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                    <p className="text-red-800">{acceptanceError}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Info */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Quick Info</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{invitationData.firstName} {invitationData.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-sm">{invitationData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Role:</span>
                  <span className="font-medium capitalize">{invitationData.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Team:</span>
                  <span className="font-medium capitalize">{invitationData.team}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Level:</span>
                  <span className="font-medium">Level {invitationData.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Permissions:</span>
                  <span className="font-medium">{invitationData.permissions.length}</span>
                </div>
              </div>
            </Card>

            {/* Security Notice */}
            <Card className="p-6 bg-yellow-50 border-yellow-200">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-800 mb-2">Security Notice</h3>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Change your password on first login</li>
                    <li>• Enable two-factor authentication</li>
                    <li>• Keep your credentials secure</li>
                    <li>• Contact admin if you have issues</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Credentials Modal */}
        <Modal
          isOpen={showCredentials}
          onClose={() => setShowCredentials(false)}
          title="Account Created Successfully!"
          size="lg"
        >
          <div className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to VeeFore!</h2>
            <p className="text-gray-600 mb-6">
              Your admin account has been created successfully. Check your email for login credentials.
            </p>
            <Button
              onClick={() => navigate('/admin/login')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Login
            </Button>
          </div>
        </Modal>

        {/* Permission Guide Modal */}
        <Modal
          isOpen={showPermissionGuide}
          onClose={() => setShowPermissionGuide(false)}
          title="Permission Guide"
          size="xl"
        >
          <div className="space-y-6">
            <p className="text-gray-600">
              This guide explains what each permission allows you to do in the VeeFore Admin Panel.
            </p>
            
            {PERMISSION_CATEGORIES.map((category) => {
              const categoryPermissions = invitationData.permissions.filter(permission =>
                category.permissions.some(catPerm => permission.startsWith(catPerm.split('.')[0] + '.'))
              );

              if (categoryPermissions.length === 0) return null;

              return (
                <div key={category.name} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    {category.icon}
                    <h3 className="font-semibold text-gray-900 ml-2">{category.name}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{category.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {categoryPermissions.map((permission) => (
                      <div key={permission} className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded">
                        {permission}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      </div>
    </div>
  );
};
