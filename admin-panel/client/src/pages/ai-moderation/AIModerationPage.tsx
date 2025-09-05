import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Filter,
  Download,
  RefreshCw,
  Search,
  Calendar,
  BarChart3,
  Users,
  FileText,
  Image,
  Video,
  Music,
  File
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface ComplianceRecord {
  _id: string;
  userId: string;
  contentId: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'document';
  content: string;
  aiModel: string;
  prompt: string;
  response: string;
  moderationResults: {
    toxicity: { score: number; level: string; categories: string[] };
    bias: { score: number; level: string; categories: string[] };
    safety: { score: number; level: string; categories: string[] };
    quality: { score: number; level: string; categories: string[] };
    compliance: { score: number; level: string; categories: string[] };
  };
  action: 'approved' | 'flagged' | 'blocked' | 'quarantined' | 'escalated';
  actionReason: string;
  reviewStatus: 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  actionTakenBy?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  reviewedBy?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface ComplianceStats {
  totalRecords: number;
  actionStats: Record<string, number>;
  reviewStats: Record<string, number>;
  riskStats: Record<string, number>;
  contentTypeStats: Record<string, number>;
  moderationStats: {
    toxicityHigh?: number;
    toxicityCritical?: number;
    biasHigh?: number;
    biasCritical?: number;
    safetyHigh?: number;
    safetyCritical?: number;
  };
}

const AIModerationPage: React.FC = () => {
  const [filters, setFilters] = useState({
    search: '',
    contentType: '',
    action: '',
    reviewStatus: '',
    riskLevel: '',
    startDate: '',
    endDate: ''
  });
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const queryClient = useQueryClient();

  // Fetch compliance records
  const { data: recordsData, isLoading: recordsLoading, refetch: refetchRecords } = useQuery({
    queryKey: ['ai-compliance-records', currentPage, pageSize, filters],
    queryFn: () => api.get('/ai-moderation', {
      params: {
        page: currentPage,
        limit: pageSize,
        ...filters
      }
    }).then(res => res.data)
  });

  // Fetch compliance statistics
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['ai-compliance-stats', filters.startDate, filters.endDate],
    queryFn: () => api.get('/ai-moderation/stats', {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate
      }
    }).then(res => res.data)
  });

  // Update action mutation
  const updateActionMutation = useMutation({
    mutationFn: ({ id, action, actionReason, reviewNotes }: any) =>
      api.put(`/ai-moderation/${id}/action`, { action, actionReason, reviewNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-records'] });
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-stats'] });
    }
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, reviewStatus, reviewNotes, riskLevel, mitigationActions }: any) =>
      api.put(`/ai-moderation/${id}/review`, { reviewStatus, reviewNotes, riskLevel, mitigationActions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-records'] });
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-stats'] });
    }
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: (data: any) => api.post('/ai-moderation/bulk', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-records'] });
      queryClient.invalidateQueries({ queryKey: ['ai-compliance-stats'] });
      setSelectedRecords([]);
    }
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecords(prev => 
      prev.includes(id) 
        ? prev.filter(recordId => recordId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRecords.length === recordsData?.data.records.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(recordsData?.data.records.map((record: ComplianceRecord) => record._id) || []);
    }
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return <FileText className="h-4 w-4" />;
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'audio': return <Music className="h-4 w-4" />;
      case 'document': return <File className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'approved': return 'text-green-600 bg-green-100';
      case 'flagged': return 'text-yellow-600 bg-yellow-100';
      case 'blocked': return 'text-red-600 bg-red-100';
      case 'quarantined': return 'text-purple-600 bg-purple-100';
      case 'escalated': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getModerationLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (recordsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const records: ComplianceRecord[] = recordsData?.data.records || [];
  const stats: ComplianceStats = statsData?.data || {};
  const pagination = recordsData?.data.pagination || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Moderation & Compliance</h1>
          <p className="text-gray-600">Monitor and manage AI-generated content compliance</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => refetchRecords()}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRecords || 0}</p>
            </div>
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">High Risk</p>
              <p className="text-2xl font-bold text-red-600">
                {(stats.riskStats?.high || 0) + (stats.riskStats?.critical || 0)}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Review</p>
              <p className="text-2xl font-bold text-yellow-600">
                {stats.reviewStats?.pending || 0}
              </p>
            </div>
            <Eye className="h-8 w-8 text-yellow-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-green-600">
                {stats.actionStats?.approved || 0}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Search content..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
            
            <select
              value={filters.contentType}
              onChange={(e) => handleFilterChange('contentType', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Content Types</option>
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="document">Document</option>
            </select>

            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="approved">Approved</option>
              <option value="flagged">Flagged</option>
              <option value="blocked">Blocked</option>
              <option value="quarantined">Quarantined</option>
              <option value="escalated">Escalated</option>
            </select>

            <select
              value={filters.riskLevel}
              onChange={(e) => handleFilterChange('riskLevel', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Risk Levels</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </Card>
      )}

      {/* Records Table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Compliance Records</h3>
            {selectedRecords.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedRecords.length} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkUpdateMutation.mutate({
                    recordIds: selectedRecords,
                    action: 'approved',
                    actionReason: 'Bulk approved by admin'
                  })}
                >
                  Bulk Approve
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRecords.length === records.length && records.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Moderation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedRecords.includes(record._id)}
                      onChange={() => handleSelectRecord(record._id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      {getContentTypeIcon(record.contentType)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {record.content.substring(0, 50)}...
                        </p>
                        <p className="text-xs text-gray-500">
                          {record.aiModel} • {new Date(record.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Toxicity:</span>
                        <span className={`text-xs font-medium ${getModerationLevelColor(record.moderationResults.toxicity.level)}`}>
                          {record.moderationResults.toxicity.level}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Bias:</span>
                        <span className={`text-xs font-medium ${getModerationLevelColor(record.moderationResults.bias.level)}`}>
                          {record.moderationResults.bias.level}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">Safety:</span>
                        <span className={`text-xs font-medium ${getModerationLevelColor(record.moderationResults.safety.level)}`}>
                          {record.moderationResults.safety.level}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActionColor(record.action)}`}>
                      {record.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRiskLevelColor(record.riskLevel)}`}>
                      {record.riskLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      record.reviewStatus === 'approved' ? 'text-green-600 bg-green-100' :
                      record.reviewStatus === 'rejected' ? 'text-red-600 bg-red-100' :
                      record.reviewStatus === 'in_review' ? 'text-yellow-600 bg-yellow-100' :
                      'text-gray-600 bg-gray-100'
                    }`}>
                      {record.reviewStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Handle view details
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateActionMutation.mutate({
                            id: record._id,
                            action: 'approved',
                            actionReason: 'Approved by admin'
                          });
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
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
          <div className="px-6 py-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
              </div>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page === 1}
                  onClick={() => setCurrentPage(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page === pagination.pages}
                  onClick={() => setCurrentPage(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AIModerationPage;
