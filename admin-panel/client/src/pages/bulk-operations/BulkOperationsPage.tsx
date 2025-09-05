import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Users, 
  Shield, 
  CreditCard, 
  Ticket, 
  Webhook, 
  Megaphone,
  Play,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle,
  Settings,
  Filter,
  Search
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface BulkOperationTemplate {
  name: string;
  operation: string;
  description: string;
  data?: any;
}

interface BulkOperationTemplates {
  [key: string]: BulkOperationTemplate[];
}

interface BulkOperationResult {
  processedCount: number;
  errorCount: number;
  errors: any[];
  operation: string;
  entityType: string;
}

const BulkOperationsPage: React.FC = () => {
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [criteria, setCriteria] = useState('');
  const [operationData, setOperationData] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);

  const queryClient = useQueryClient();

  // Fetch operation templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['bulk-operation-templates'],
    queryFn: () => api.get('/bulk-operations/templates').then(res => res.data)
  });

  const templates: BulkOperationTemplates = templatesData?.data || {};

  // Preview operation mutation
  const previewMutation = useMutation({
    mutationFn: ({ entityType, criteria }: { entityType: string; criteria: string }) =>
      api.get('/bulk-operations/preview', {
        params: { entityType, criteria }
      }).then(res => res.data),
    onSuccess: (data) => {
      setPreviewCount(data.data.affectedCount);
      setShowPreview(true);
    }
  });

  // Execute operation mutation
  const executeMutation = useMutation({
    mutationFn: (operationData: any) =>
      api.post('/bulk-operations/execute', operationData).then(res => res.data),
    onSuccess: (data) => {
      setIsExecuting(false);
      // Show success message
      alert(`Operation completed successfully! ${data.data.processedCount} records processed.`);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [selectedEntityType] });
    },
    onError: (error) => {
      setIsExecuting(false);
      alert('Operation failed. Please try again.');
    }
  });

  // Export data mutation
  const exportMutation = useMutation({
    mutationFn: (exportData: any) =>
      api.post('/bulk-operations/export', exportData, {
        responseType: 'blob'
      }),
    onSuccess: (response) => {
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedEntityType}_export_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  });

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'users': return <Users className="h-5 w-5" />;
      case 'admins': return <Shield className="h-5 w-5" />;
      case 'subscriptions': return <CreditCard className="h-5 w-5" />;
      case 'tickets': return <Ticket className="h-5 w-5" />;
      case 'webhooks': return <Webhook className="h-5 w-5" />;
      case 'banners': return <Megaphone className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  const getEntityColor = (entityType: string) => {
    switch (entityType) {
      case 'users': return 'text-blue-600 bg-blue-100';
      case 'admins': return 'text-purple-600 bg-purple-100';
      case 'subscriptions': return 'text-green-600 bg-green-100';
      case 'tickets': return 'text-orange-600 bg-orange-100';
      case 'webhooks': return 'text-indigo-600 bg-indigo-100';
      case 'banners': return 'text-pink-600 bg-pink-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const handleTemplateSelect = (template: BulkOperationTemplate) => {
    setSelectedOperation(template.operation);
    if (template.data) {
      setOperationData(JSON.stringify(template.data, null, 2));
    }
  };

  const handlePreview = () => {
    if (!selectedEntityType || !criteria) {
      alert('Please select entity type and enter criteria');
      return;
    }

    previewMutation.mutate({
      entityType: selectedEntityType,
      criteria
    });
  };

  const handleExecute = () => {
    if (!selectedEntityType || !selectedOperation || !criteria) {
      alert('Please fill in all required fields');
      return;
    }

    if (!confirm(`Are you sure you want to execute this operation on ${previewCount} records?`)) {
      return;
    }

    setIsExecuting(true);
    executeMutation.mutate({
      entityType: selectedEntityType,
      operation: selectedOperation,
      criteria: JSON.parse(criteria),
      data: operationData ? JSON.parse(operationData) : undefined
    });
  };

  const handleExport = () => {
    if (!selectedEntityType || !criteria) {
      alert('Please select entity type and enter criteria');
      return;
    }

    exportMutation.mutate({
      entityType: selectedEntityType,
      criteria: JSON.parse(criteria),
      format: 'json'
    });
  };

  if (templatesLoading) {
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
          <h1 className="text-2xl font-bold text-gray-900">Bulk Operations</h1>
          <p className="text-gray-600">Perform bulk operations on multiple records</p>
        </div>
      </div>

      {/* Operation Form */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Bulk Operation</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Entity Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Entity Type
            </label>
            <select
              value={selectedEntityType}
              onChange={(e) => setSelectedEntityType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select entity type</option>
              {Object.keys(templates).map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType.charAt(0).toUpperCase() + entityType.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Operation Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Operation
            </label>
            <select
              value={selectedOperation}
              onChange={(e) => setSelectedOperation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select operation</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="activate">Activate</option>
              <option value="deactivate">Deactivate</option>
              <option value="export">Export</option>
            </select>
          </div>
        </div>

        {/* Criteria */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Criteria (JSON)
          </label>
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder='{"status": "active"}'
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>

        {/* Operation Data */}
        {selectedOperation === 'update' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Update Data (JSON)
            </label>
            <textarea
              value={operationData}
              onChange={(e) => setOperationData(e.target.value)}
              placeholder='{"status": "inactive", "updatedBy": "admin123"}'
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3 mt-6">
          <Button
            onClick={handlePreview}
            disabled={!selectedEntityType || !criteria || previewMutation.isPending}
            className="flex items-center space-x-2"
          >
            <Search className="h-4 w-4" />
            <span>Preview</span>
          </Button>
          
          <Button
            onClick={handleExecute}
            disabled={!selectedEntityType || !selectedOperation || !criteria || isExecuting}
            className="flex items-center space-x-2"
          >
            {isExecuting ? (
              <LoadingSpinner size="sm" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>Execute</span>
          </Button>
          
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!selectedEntityType || !criteria || exportMutation.isPending}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </div>
      </Card>

      {/* Operation Templates */}
      {selectedEntityType && templates[selectedEntityType] && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Quick Templates for {selectedEntityType.charAt(0).toUpperCase() + selectedEntityType.slice(1)}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates[selectedEntityType].map((template, index) => (
              <div
                key={index}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className={`p-2 rounded-lg ${getEntityColor(selectedEntityType)}`}>
                    {getEntityIcon(selectedEntityType)}
                  </div>
                  <h4 className="font-medium text-gray-900">{template.name}</h4>
                </div>
                <p className="text-sm text-gray-600">{template.description}</p>
                <Badge variant="info" size="sm" className="mt-2">
                  {template.operation}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Operation Preview"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <span className="text-sm font-medium text-gray-900">
              This operation will affect {previewCount} records
            </span>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Entity Type:</strong> {selectedEntityType}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Operation:</strong> {selectedOperation}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Criteria:</strong> {criteria}
            </p>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecute} disabled={isExecuting}>
              {isExecuting ? 'Executing...' : 'Confirm & Execute'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BulkOperationsPage;
