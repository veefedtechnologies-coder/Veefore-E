import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Eye, 
  EyeOff, 
  Edit, 
  Trash2, 
  UserX, 
  UserCheck, 
  Copy, 
  RefreshCw,
  Shield,
  Crown,
  Users,
  MessageSquare,
  CreditCard,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  MoreVertical,
  Lock,
  Unlock
} from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { apiClient } from '../../services/api';

interface Admin {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  level: number;
  team: string;
  permissions: string[];
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminCredentials {
  username: string;
  password: string;
  temporaryPassword: boolean;
}

export const AdminManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState<AdminCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    level: 1,
    team: '',
    permissions: [] as string[],
    isActive: true
  });

  const queryClient = useQueryClient();

  // Fetch admins
  const { data: adminsData, isLoading } = useQuery({
    queryKey: ['admins-management'],
    queryFn: async () => {
      const response = await apiClient.get('/admin');
      return response.data.data as Admin[];
    }
  });

  // Generate new credentials mutation
  const generateCredentialsMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiClient.post(`/admin/${adminId}/generate-credentials`);
      return response.data.data as AdminCredentials;
    },
    onSuccess: (data) => {
      setAdminCredentials(data);
      setShowCredentials(true);
    }
  });

  // Update admin mutation
  const updateAdminMutation = useMutation({
    mutationFn: async ({ adminId, data }: { adminId: string; data: any }) => {
      const response = await apiClient.put(`/admin/${adminId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admins-management']);
      setShowEditModal(false);
    }
  });

  // Delete admin mutation
  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiClient.delete(`/admin/${adminId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admins-management']);
      setShowDeleteModal(false);
    }
  });

  // Suspend/Activate admin mutation
  const suspendAdminMutation = useMutation({
    mutationFn: async ({ adminId, isActive }: { adminId: string; isActive: boolean }) => {
      const response = await apiClient.patch(`/admin/${adminId}/status`, { isActive });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admins-management']);
      setShowSuspendModal(false);
    }
  });

  const handleViewCredentials = (admin: Admin) => {
    setSelectedAdmin(admin);
    generateCredentialsMutation.mutate(admin._id);
  };

  const handleEditAdmin = (admin: Admin) => {
    setSelectedAdmin(admin);
    setEditFormData({
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      level: admin.level,
      team: admin.team,
      permissions: admin.permissions,
      isActive: admin.isActive
    });
    setShowEditModal(true);
  };

  const handleDeleteAdmin = (admin: Admin) => {
    setSelectedAdmin(admin);
    setShowDeleteModal(true);
  };

  const handleSuspendAdmin = (admin: Admin) => {
    setSelectedAdmin(admin);
    setShowSuspendModal(true);
  };

  const handleUpdateAdmin = () => {
    if (selectedAdmin) {
      updateAdminMutation.mutate({
        adminId: selectedAdmin._id,
        data: editFormData
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (selectedAdmin) {
      deleteAdminMutation.mutate(selectedAdmin._id);
    }
  };

  const handleSuspendConfirm = () => {
    if (selectedAdmin) {
      suspendAdminMutation.mutate({
        adminId: selectedAdmin._id,
        isActive: !selectedAdmin.isActive
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRoleIcon = (role: string) => {
    const roleIcons: { [key: string]: React.ReactNode } = {
      superadmin: <Crown className="h-4 w-4 text-purple-600" />,
      admin: <Shield className="h-4 w-4 text-blue-600" />,
      support: <MessageSquare className="h-4 w-4 text-green-600" />,
      billing: <CreditCard className="h-4 w-4 text-orange-600" />,
      moderator: <UserCheck className="h-4 w-4 text-yellow-600" />,
      analytics: <BarChart3 className="h-4 w-4 text-indigo-600" />
    };
    return roleIcons[role] || <Shield className="h-4 w-4 text-gray-600" />;
  };

  const getStatusBadge = (admin: Admin) => {
    if (!admin.isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <UserX className="h-3 w-3 mr-1" />
          Suspended
        </span>
      );
    }

    if (!admin.isEmailVerified) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Unverified
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </span>
    );
  };

  const filteredAdmins = adminsData?.filter(admin =>
    admin.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.role.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Management</h1>
          <p className="text-gray-600">Manage admin accounts, credentials, and permissions</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {filteredAdmins.length} admin{filteredAdmins.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Search */}
      <Card className="p-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Search admins by name, email, username, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Admins List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredAdmins.map((admin) => (
          <Card key={admin._id} className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-lg font-semibold text-gray-600">
                      {admin.firstName.charAt(0)}{admin.lastName.charAt(0)}
                    </span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {admin.firstName} {admin.lastName}
                    </h3>
                    {getRoleIcon(admin.role)}
                    {getStatusBadge(admin)}
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                    <span>@{admin.username}</span>
                    <span>•</span>
                    <span>{admin.email}</span>
                    <span>•</span>
                    <span className="capitalize">{admin.role}</span>
                    <span>•</span>
                    <span>Level {admin.level}</span>
                    <span>•</span>
                    <span className="capitalize">{admin.team}</span>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-gray-400 mt-1">
                    <span>Created: {new Date(admin.createdAt).toLocaleDateString()}</span>
                    {admin.lastLoginAt && (
                      <>
                        <span>•</span>
                        <span>Last login: {new Date(admin.lastLoginAt).toLocaleDateString()}</span>
                      </>
                    )}
                    {admin.twoFactorEnabled && (
                      <>
                        <span>•</span>
                        <span className="text-green-600">2FA Enabled</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewCredentials(admin)}
                  className="flex items-center"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Credentials
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditAdmin(admin)}
                  className="flex items-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuspendAdmin(admin)}
                  className={`flex items-center ${
                    admin.isActive ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'
                  }`}
                >
                  {admin.isActive ? (
                    <>
                      <UserX className="h-4 w-4 mr-1" />
                      Suspend
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 mr-1" />
                      Activate
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteAdmin(admin)}
                  className="flex items-center text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Credentials Modal */}
      <Modal
        isOpen={showCredentials}
        onClose={() => setShowCredentials(false)}
        title="Admin Credentials"
        size="md"
      >
        {adminCredentials && (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                <p className="text-yellow-800 font-medium">Security Notice</p>
              </div>
              <p className="text-yellow-700 text-sm mt-1">
                These credentials are sensitive. Share them securely and ensure the admin changes their password on first login.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <div className="flex items-center space-x-2">
                  <Input
                    value={adminCredentials.username}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(adminCredentials.username)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="flex items-center space-x-2">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={adminCredentials.password}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(adminCredentials.password)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <Input
                  value={selectedAdmin?.email || ''}
                  readOnly
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Next Steps:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Share these credentials securely with the admin</li>
                <li>• Admin should change password on first login</li>
                <li>• Admin should enable two-factor authentication</li>
                <li>• Monitor admin activity and permissions</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Admin Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Admin"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <Input
                value={editFormData.firstName}
                onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <Input
                value={editFormData.lastName}
                onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={editFormData.role}
                onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="superadmin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="support">Support</option>
                <option value="billing">Billing</option>
                <option value="moderator">Moderator</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select
                value={editFormData.level}
                onChange={(e) => setEditFormData({ ...editFormData, level: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5].map(level => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <select
                value={editFormData.team}
                onChange={(e) => setEditFormData({ ...editFormData, team: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="executive">Executive</option>
                <option value="support">Support</option>
                <option value="billing">Billing</option>
                <option value="product">Product</option>
                <option value="marketing">Marketing</option>
                <option value="development">Development</option>
                <option value="sales">Sales</option>
                <option value="legal">Legal</option>
                <option value="aiops">AIOps</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={editFormData.isActive ? 'active' : 'suspended'}
                onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.value === 'active' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateAdmin}
              disabled={updateAdminMutation.isLoading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {updateAdminMutation.isLoading ? 'Updating...' : 'Update Admin'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Admin Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Admin"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <p className="text-red-800 font-medium">Warning</p>
            </div>
            <p className="text-red-700 text-sm mt-1">
              This action cannot be undone. The admin will be permanently removed from the system.
            </p>
          </div>

          <p className="text-gray-700">
            Are you sure you want to delete <strong>{selectedAdmin?.firstName} {selectedAdmin?.lastName}</strong>?
          </p>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleteAdminMutation.isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteAdminMutation.isLoading ? 'Deleting...' : 'Delete Admin'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Suspend Admin Modal */}
      <Modal
        isOpen={showSuspendModal}
        onClose={() => setShowSuspendModal(false)}
        title={selectedAdmin?.isActive ? 'Suspend Admin' : 'Activate Admin'}
        size="md"
      >
        <div className="space-y-4">
          <div className={`border rounded-lg p-4 ${
            selectedAdmin?.isActive 
              ? 'bg-yellow-50 border-yellow-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center">
              {selectedAdmin?.isActive ? (
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              )}
              <p className={`font-medium ${
                selectedAdmin?.isActive ? 'text-yellow-800' : 'text-green-800'
              }`}>
                {selectedAdmin?.isActive ? 'Suspend Admin' : 'Activate Admin'}
              </p>
            </div>
            <p className={`text-sm mt-1 ${
              selectedAdmin?.isActive ? 'text-yellow-700' : 'text-green-700'
            }`}>
              {selectedAdmin?.isActive 
                ? 'The admin will lose access to the system but their account will be preserved.'
                : 'The admin will regain access to the system with their current permissions.'
              }
            </p>
          </div>

          <p className="text-gray-700">
            {selectedAdmin?.isActive 
              ? `Are you sure you want to suspend ${selectedAdmin.firstName} ${selectedAdmin.lastName}?`
              : `Are you sure you want to activate ${selectedAdmin?.firstName} ${selectedAdmin?.lastName}?`
            }
          </p>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowSuspendModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSuspendConfirm}
              disabled={suspendAdminMutation.isLoading}
              className={selectedAdmin?.isActive 
                ? 'bg-yellow-600 hover:bg-yellow-700' 
                : 'bg-green-600 hover:bg-green-700'
              }
            >
              {suspendAdminMutation.isLoading 
                ? (selectedAdmin?.isActive ? 'Suspending...' : 'Activating...') 
                : (selectedAdmin?.isActive ? 'Suspend Admin' : 'Activate Admin')
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
