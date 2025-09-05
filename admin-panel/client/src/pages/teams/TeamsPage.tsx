import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { apiClient as api } from '../../services/api';

interface Team {
  _id: string;
  name: string;
  description: string;
  teamCode: string;
  parentTeam?: string;
  level: number;
  path: string;
  teamLead: {
    adminId: string;
    name: string;
    email: string;
    assignedAt: string;
  };
  deputyLeads: Array<{
    adminId: string;
    name: string;
    email: string;
    assignedAt: string;
    permissions: string[];
  }>;
  members: Array<{
    adminId: string;
    name: string;
    email: string;
    role: string;
    level: number;
    joinedAt: string;
    status: 'active' | 'inactive' | 'suspended';
    permissions: string[];
    lastActiveAt: string;
  }>;
  settings: {
    maxMembers: number;
    allowSelfJoin: boolean;
    requireApproval: boolean;
    defaultRole: string;
    workingHours: {
      timezone: string;
      startTime: string;
      endTime: string;
      workingDays: number[];
    };
    notifications: {
      email: boolean;
      inApp: boolean;
      slack: boolean;
      webhook: string;
    };
  };
  permissions: {
    canCreateSubTeams: boolean;
    canManageMembers: boolean;
    canAssignRoles: boolean;
    canViewAnalytics: boolean;
    canManageSettings: boolean;
    canAccessReports: boolean;
    moduleAccess: string[];
    customPermissions: { [key: string]: boolean };
  };
  metrics: {
    totalTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    customerSatisfaction: number;
    teamProductivity: number;
    lastActivityAt: string;
    monthlyGoals: {
      tickets: number;
      satisfaction: number;
      responseTime: number;
    };
    achievements: Array<{
      type: string;
      description: string;
      achievedAt: string;
      value: number;
    }>;
  };
  communication: {
    slackChannel?: string;
    discordChannel?: string;
    teamsChannel?: string;
    emailAlias: string;
    meetingSchedule: {
      frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
      day: string;
      time: string;
      duration: number;
    };
  };
  resources: {
    budget: number;
    currency: string;
    tools: Array<{
      name: string;
      type: string;
      cost: number;
      renewalDate: string;
      status: 'active' | 'expired' | 'pending';
    }>;
    training: Array<{
      name: string;
      type: string;
      completedBy: string[];
      required: boolean;
      dueDate?: string;
    }>;
  };
  status: 'active' | 'inactive' | 'archived' | 'suspended';
  isPublic: boolean;
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  memberCount?: number;
  depth?: number;
}

interface TeamStats {
  totalTeams: number;
  activeTeams: number;
  totalMembers: number;
  avgTeamSize: number;
}

const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [parentTeamFilter, setParentTeamFilter] = useState('');
  const [teamLeadFilter, setTeamLeadFilter] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showTreeView, setShowTreeView] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    fetchTeams();
    fetchStats();
  }, [pagination.current, searchTerm, statusFilter, levelFilter, parentTeamFilter, teamLeadFilter]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.current.toString(),
        limit: '10',
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (searchTerm) params.append('q', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      if (levelFilter) params.append('level', levelFilter);
      if (parentTeamFilter) params.append('parentTeam', parentTeamFilter);
      if (teamLeadFilter) params.append('teamLead', teamLeadFilter);

      const response = await api.get(`/teams?${params}`);
      setTeams(response.data.data.teams);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/teams?page=1&limit=1');
      setStats(response.data.data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTeams();
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  const handleTeamClick = (team: Team) => {
    setSelectedTeam(team);
    setShowDetailModal(true);
  };

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeams(prev => 
      prev.includes(teamId) 
        ? prev.filter(id => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleSelectAll = () => {
    if (selectedTeams.length === teams.length) {
      setSelectedTeams([]);
    } else {
      setSelectedTeams(teams.map(team => team._id));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedTeams.length === 0) return;

    try {
      await api.post('/teams/bulk', {
        teamIds: selectedTeams,
        operation: action
      });
      setSelectedTeams([]);
      fetchTeams();
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      archived: 'bg-red-100 text-red-800',
      suspended: 'bg-yellow-100 text-yellow-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-gray-600">Manage teams, members, and organizational structure</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={showTreeView ? 'primary' : 'outline'}
            onClick={() => setShowTreeView(!showTreeView)}
          >
            {showTreeView ? 'List View' : 'Tree View'}
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            Create Team
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Teams</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalTeams}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Teams</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.activeTeams}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Members</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalMembers}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Team Size</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.avgTeamSize.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search teams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Level</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
              >
                <option value="">All Levels</option>
                <option value="1">Level 1</option>
                <option value="2">Level 2</option>
                <option value="3">Level 3</option>
                <option value="4">Level 4</option>
                <option value="5">Level 5</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Parent Team</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={parentTeamFilter}
                onChange={(e) => setParentTeamFilter(e.target.value)}
              >
                <option value="">All Teams</option>
                {teams.map(team => (
                  <option key={team._id} value={team._id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team Lead</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={teamLeadFilter}
                onChange={(e) => setTeamLeadFilter(e.target.value)}
              >
                <option value="">All Leads</option>
                {teams.map(team => (
                  <option key={team.teamLead.adminId} value={team.teamLead.adminId}>
                    {team.teamLead.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} className="w-full">
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedTeams.length > 0 && (
        <Card>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800">
                {selectedTeams.length} team(s) selected
              </span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('activate')}
                >
                  Activate Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('suspend')}
                >
                  Suspend Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('archive')}
                >
                  Archive Selected
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Teams Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedTeams.length === teams.length && teams.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Members
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budget
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teams.map((team) => (
                <tr key={team._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team._id)}
                      onChange={() => handleSelectTeam(team._id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{team.name}</div>
                      <div className="text-xs text-gray-500">{team.teamCode}</div>
                      <div className="text-xs text-gray-400">Level {team.level}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{team.teamLead.name}</div>
                      <div className="text-xs text-gray-500">{team.teamLead.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{team.memberCount || team.members.length} members</div>
                    <div className="text-xs text-gray-400">
                      {team.members.filter(m => m.status === 'active').length} active
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(team.status)}`}>
                      {team.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>Productivity: {team.metrics.teamProductivity}%</div>
                    <div className="text-xs text-gray-400">
                      Satisfaction: {team.metrics.customerSatisfaction.toFixed(1)}/5
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{formatCurrency(team.resources.budget, team.resources.currency)}</div>
                    <div className="text-xs text-gray-400">
                      {team.resources.tools.length} tools
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(team.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTeamClick(team)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {/* Edit team */}}
                      >
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button
                onClick={() => handlePageChange(pagination.current - 1)}
                disabled={pagination.current === 1}
                variant="outline"
              >
                Previous
              </Button>
              <Button
                onClick={() => handlePageChange(pagination.current + 1)}
                disabled={pagination.current === pagination.pages}
                variant="outline"
              >
                Next
              </Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {(pagination.current - 1) * 10 + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min(pagination.current * 10, pagination.total)}
                  </span>{' '}
                  of{' '}
                  <span className="font-medium">{pagination.total}</span>{' '}
                  results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      variant={page === pagination.current ? "primary" : "outline"}
                      size="sm"
                      className="ml-0 rounded-none first:rounded-l-md last:rounded-r-md"
                    >
                      {page}
                    </Button>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Team Detail Modal */}
      {showDetailModal && selectedTeam && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Team Details - {selectedTeam.name}
                </h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Basic Information</h4>
                  <div className="space-y-2">
                    <div><strong>Name:</strong> {selectedTeam.name}</div>
                    <div><strong>Code:</strong> {selectedTeam.teamCode}</div>
                    <div><strong>Description:</strong> {selectedTeam.description}</div>
                    <div><strong>Level:</strong> {selectedTeam.level}</div>
                    <div><strong>Path:</strong> {selectedTeam.path}</div>
                    <div><strong>Status:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedTeam.status)}`}>{selectedTeam.status}</span></div>
                    <div><strong>Created:</strong> {formatDate(selectedTeam.createdAt)}</div>
                  </div>
                </div>

                {/* Team Lead */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Team Leadership</h4>
                  <div className="space-y-2">
                    <div><strong>Team Lead:</strong> {selectedTeam.teamLead.name}</div>
                    <div><strong>Email:</strong> {selectedTeam.teamLead.email}</div>
                    <div><strong>Assigned:</strong> {formatDate(selectedTeam.teamLead.assignedAt)}</div>
                    {selectedTeam.deputyLeads.length > 0 && (
                      <div>
                        <strong>Deputy Leads:</strong>
                        <ul className="ml-4 mt-1">
                          {selectedTeam.deputyLeads.map((deputy, index) => (
                            <li key={index} className="text-sm text-gray-600">
                              {deputy.name} ({deputy.email})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Members */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Team Members ({selectedTeam.members.length})</h4>
                  <div className="max-h-40 overflow-y-auto">
                    {selectedTeam.members.map((member, index) => (
                      <div key={index} className="flex justify-between items-center py-1 border-b border-gray-100">
                        <div>
                          <div className="text-sm font-medium">{member.name}</div>
                          <div className="text-xs text-gray-500">{member.role} • Level {member.level}</div>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(member.status)}`}>
                          {member.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Performance Metrics</h4>
                  <div className="space-y-2">
                    <div><strong>Total Tickets:</strong> {selectedTeam.metrics.totalTickets}</div>
                    <div><strong>Resolved:</strong> {selectedTeam.metrics.resolvedTickets}</div>
                    <div><strong>Avg Resolution Time:</strong> {Math.round(selectedTeam.metrics.avgResolutionTime)} minutes</div>
                    <div><strong>Customer Satisfaction:</strong> {selectedTeam.metrics.customerSatisfaction.toFixed(1)}/5</div>
                    <div><strong>Team Productivity:</strong> {selectedTeam.metrics.teamProductivity}%</div>
                    <div><strong>Last Activity:</strong> {formatDate(selectedTeam.metrics.lastActivityAt)}</div>
                  </div>
                </div>

                {/* Resources */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Resources</h4>
                  <div className="space-y-2">
                    <div><strong>Budget:</strong> {formatCurrency(selectedTeam.resources.budget, selectedTeam.resources.currency)}</div>
                    <div><strong>Tools:</strong> {selectedTeam.resources.tools.length}</div>
                    <div><strong>Training Programs:</strong> {selectedTeam.resources.training.length}</div>
                    <div><strong>Email Alias:</strong> {selectedTeam.communication.emailAlias}</div>
                  </div>
                </div>

                {/* Settings */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Settings</h4>
                  <div className="space-y-2">
                    <div><strong>Max Members:</strong> {selectedTeam.settings.maxMembers}</div>
                    <div><strong>Self Join:</strong> {selectedTeam.settings.allowSelfJoin ? 'Yes' : 'No'}</div>
                    <div><strong>Require Approval:</strong> {selectedTeam.settings.requireApproval ? 'Yes' : 'No'}</div>
                    <div><strong>Working Hours:</strong> {selectedTeam.settings.workingHours.startTime} - {selectedTeam.settings.workingHours.endTime}</div>
                    <div><strong>Timezone:</strong> {selectedTeam.settings.workingHours.timezone}</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 mt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailModal(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    // Edit team functionality
                    setShowDetailModal(false);
                  }}
                >
                  Edit Team
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;