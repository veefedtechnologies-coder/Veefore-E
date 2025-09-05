import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { apiClient as api } from '../../services/api';

interface SupportTicket {
  _id: string;
  ticketId: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'on_hold' | 'escalated' | 'resolved' | 'closed';
  category: string;
  subCategory?: string;
  userId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  userEmail: string;
  userName?: string;
  userPhone?: string;
  assignedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedTeam?: string;
  escalatedTo?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  emailThread: {
    originalEmail: {
      messageId: string;
      from: string;
      to: string;
      subject: string;
      body: string;
      attachments: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
      }>;
      receivedAt: string;
    };
    replies: Array<{
      messageId: string;
      from: string;
      to: string;
      subject: string;
      body: string;
      attachments: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
      }>;
      sentAt: string;
      sentBy: string;
      isInternal: boolean;
    }>;
  };
  aiAnalysis: {
    categoryPrediction?: string;
    priorityPrediction?: string;
    sentimentScore?: number;
    language?: string;
    suggestedReplies?: Array<{
      content: string;
      confidence: number;
      type: 'greeting' | 'solution' | 'escalation' | 'follow_up';
    }>;
    autoReplySent?: boolean;
    autoReplyContent?: string;
  };
  sla: {
    responseTime: number;
    resolutionTime: number;
    targetResponseTime: number;
    targetResolutionTime: number;
    breached: boolean;
    breachReason?: string;
    escalationTriggers: Array<{
      type: 'time' | 'priority' | 'manual';
      triggeredAt: string;
      escalatedTo: string;
      reason: string;
    }>;
  };
  tags: string[];
  customFields: { [key: string]: any };
  relatedTickets: string[];
  relatedRefund?: {
    _id: string;
    amount: number;
    status: string;
    reason: string;
  };
  relatedSubscription?: {
    _id: string;
    planName: string;
    status: string;
    pricing: {
      finalPrice: number;
      currency: string;
    };
  };
  internalNotes: Array<{
    content: string;
    author: string;
    createdAt: string;
    isPrivate: boolean;
  }>;
  satisfaction: {
    rating?: number;
    feedback?: string;
    submittedAt?: string;
  };
  analytics: {
    responseCount: number;
    resolutionCount: number;
    reopenCount: number;
    timeToFirstResponse: number;
    timeToResolution: number;
    customerSatisfaction: number;
  };
  statusHistory: Array<{
    status: string;
    changedBy: string;
    changedAt: string;
    reason?: string;
  }>;
  escalation: {
    isEscalated: boolean;
    escalatedAt?: string;
    escalatedBy?: string;
    escalatedTo?: string;
    escalationReason?: string;
    escalationLevel: number;
  };
  routing: {
    autoAssigned: boolean;
    assignmentRule?: string;
    suggestedAssignee?: string;
    suggestedTeam?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface TicketStats {
  overview: {
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    resolvedTickets: number;
    closedTickets: number;
    slaBreachedTickets: number;
    avgResponseTime: number;
    avgResolutionTime: number;
    avgSatisfaction: number;
  };
  categoryBreakdown: Array<{
    _id: string;
    count: number;
    avgResolutionTime: number;
    avgSatisfaction: number;
  }>;
  priorityBreakdown: Array<{
    _id: string;
    count: number;
    avgResolutionTime: number;
    slaBreachRate: number;
  }>;
}

const SupportTicketsPage: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [slaBreachedFilter, setSlaBreachedFilter] = useState('');
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalReply, setIsInternalReply] = useState(false);
  const [replyAs, setReplyAs] = useState('admin');
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    fetchTickets();
    fetchStats();
  }, [pagination.current, searchTerm, statusFilter, priorityFilter, categoryFilter, assignedToFilter, teamFilter, slaBreachedFilter]);

  const fetchTickets = async () => {
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
      if (priorityFilter) params.append('priority', priorityFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (assignedToFilter) params.append('assignedTo', assignedToFilter);
      if (teamFilter) params.append('team', teamFilter);
      if (slaBreachedFilter) params.append('slaBreached', slaBreachedFilter);

      const response = await api.get(`/support-tickets?${params}`);
      setTickets(response.data.data.tickets);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/support-tickets/stats?period=30d');
      setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTickets();
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  const handleTicketClick = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setShowDetailModal(true);
  };

  const handleReply = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setShowReplyModal(true);
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;

    try {
      await api.post(`/support-tickets/${selectedTicket._id}/reply`, {
        message: replyMessage,
        isInternal: isInternalReply,
        sendEmail: true,
        replyAs
      });
      
      setReplyMessage('');
      setIsInternalReply(false);
      setReplyAs('admin');
      setShowReplyModal(false);
      fetchTickets();
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  };

  const handleEscalate = async (ticketId: string) => {
    try {
      await api.post(`/support-tickets/${ticketId}/escalate`, {
        reason: 'Manual escalation by admin',
        escalateTo: 'superadmin',
        escalationLevel: 2
      });
      fetchTickets();
    } catch (error) {
      console.error('Error escalating ticket:', error);
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTickets(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleSelectAll = () => {
    if (selectedTickets.length === tickets.length) {
      setSelectedTickets([]);
    } else {
      setSelectedTickets(tickets.map(ticket => ticket._id));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedTickets.length === 0) return;

    try {
      await api.post('/support-tickets/bulk', {
        ticketIds: selectedTickets,
        operation: action,
        updates: {}
      });
      setSelectedTickets([]);
      fetchTickets();
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      open: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      on_hold: 'bg-orange-100 text-orange-800',
      escalated: 'bg-red-100 text-red-800',
      resolved: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
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
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-600">Manage customer support tickets with AI assistance</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          Create Ticket
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Tickets</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.totalTickets}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Open</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.openTickets}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">SLA Breached</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.slaBreachedTickets}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Satisfaction</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.overview.avgSatisfaction.toFixed(1)}/5
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search tickets..."
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
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="escalated">Escalated</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
                <option value="general">General</option>
                <option value="refund">Refund</option>
                <option value="feature_request">Feature Request</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <option value="">All Teams</option>
                <option value="support">Support</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SLA</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={slaBreachedFilter}
                onChange={(e) => setSlaBreachedFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="true">Breached</option>
                <option value="false">On Track</option>
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
      {selectedTickets.length > 0 && (
        <Card>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800">
                {selectedTickets.length} ticket(s) selected
              </span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('assign')}
                >
                  Assign Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('close')}
                >
                  Close Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('escalate')}
                >
                  Escalate Selected
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tickets Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedTickets.length === tickets.length && tickets.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SLA
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
              {tickets.map((ticket) => (
                <tr key={ticket._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedTickets.includes(ticket._id)}
                      onChange={() => handleSelectTicket(ticket._id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ticket.ticketId}</div>
                    <div className="text-xs text-gray-500">{ticket.category}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {ticket.subject}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">
                      {ticket.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {ticket.userName || ticket.userEmail}
                      </div>
                      <div className="text-sm text-gray-500">{ticket.userEmail}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                    {ticket.escalation.isEscalated && (
                      <div className="text-xs text-red-600 mt-1">Escalated</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {ticket.assignedTo ? (
                        <>
                          <div className="font-medium">
                            {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                          </div>
                          <div className="text-xs">{ticket.assignedTeam}</div>
                        </>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className={ticket.sla.breached ? 'text-red-600' : 'text-green-600'}>
                      {ticket.sla.breached ? 'Breached' : 'On Track'}
                    </div>
                    <div className="text-xs">
                      Response: {formatDuration(ticket.analytics.timeToFirstResponse)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(ticket.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTicketClick(ticket)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReply(ticket)}
                      >
                        Reply
                      </Button>
                      {ticket.status !== 'escalated' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEscalate(ticket._id)}
                        >
                          Escalate
                        </Button>
                      )}
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

      {/* Reply Modal */}
      {showReplyModal && selectedTicket && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Reply to {selectedTicket.ticketId}
                </h3>
                <button
                  onClick={() => setShowReplyModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reply As</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={replyAs}
                    onChange={(e) => setReplyAs(e.target.value)}
                  >
                    <option value="admin">Admin</option>
                    <option value="team">Team</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={6}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="internalReply"
                    checked={isInternalReply}
                    onChange={(e) => setIsInternalReply(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="internalReply" className="ml-2 text-sm text-gray-700">
                    Internal note (not visible to customer)
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 mt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowReplyModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendReply}
                  disabled={!replyMessage.trim()}
                >
                  Send Reply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportTicketsPage;
