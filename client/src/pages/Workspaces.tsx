import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { 
  Building2, 
  Plus, 
  Users, 
  Crown, 
  Trash2, 
  Edit3,
  Palette,
  Bot,
  Copy,
  BarChart3
} from 'lucide-react'
import { SkeletonWorkspaceCard, SkeletonPageLoader } from '@/components/ui/skeleton'

interface Workspace {
  id: string
  name: string
  description?: string
  avatar?: string
  theme: string
  aiPersonality: string
  isDefault: boolean
  maxTeamMembers: number
  inviteCode?: string
  credits: number
  createdAt: string
  updatedAt: string
}

interface WorkspaceFormData {
  name: string
  description: string
  theme: string
  aiPersonality: string
}

export default function Workspaces() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [formData, setFormData] = useState<WorkspaceFormData>({
    name: '',
    description: '',
    theme: 'default',
    aiPersonality: 'professional'
  })

  // Fetch user's workspaces
  const { data: workspacesRaw = [], isLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: async () => {
      const response = await apiRequest('/api/workspaces');
      console.log('[WORKSPACES DEBUG] Raw API response:', response);
      console.log('[WORKSPACES DEBUG] Response type:', typeof response);
      console.log('[WORKSPACES DEBUG] Is array:', Array.isArray(response));
      console.log('[WORKSPACES DEBUG] Has data property:', response?.data);
      console.log('[WORKSPACES DEBUG] data is array:', Array.isArray(response?.data));
      
      // API returns { success: true, data: [...] } - extract the data array
      if (Array.isArray(response)) {
        console.log('[WORKSPACES DEBUG] Returning response directly (is array)');
        return response;
      }
      if (response && Array.isArray(response.data)) {
        console.log('[WORKSPACES DEBUG] Returning response.data array, length:', response.data.length);
        return response.data;
      }
      if (response && Array.isArray(response.workspaces)) {
        console.log('[WORKSPACES DEBUG] Returning response.workspaces array');
        return response.workspaces;
      }
      console.warn('[WORKSPACES DEBUG] Unexpected workspaces response format:', response);
      return [];
    }
  })
  
  // Ensure workspaces is always an array for safety
  // Handle both array format (new) and wrapped format (old cached data from localStorage)
  const workspaces: Workspace[] = Array.isArray(workspacesRaw) 
    ? workspacesRaw 
    : (workspacesRaw && Array.isArray((workspacesRaw as any).data) 
        ? (workspacesRaw as any).data 
        : []);

  // Create workspace mutation with optimistic updates
  const createWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceFormData) => 
      apiRequest('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onMutate: async (newWorkspace) => {
      await queryClient.cancelQueries({ queryKey: ['/api/workspaces'] })
      const previousWorkspaces = queryClient.getQueryData(['/api/workspaces'])
      const optimisticWorkspace = {
        id: `temp-${Date.now()}`,
        ...newWorkspace,
        isDefault: false,
        maxTeamMembers: 5,
        credits: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      queryClient.setQueryData(['/api/workspaces'], (old: any) => [...(old || []), optimisticWorkspace])
      return { previousWorkspaces }
    },
    onError: (error: any, newWorkspace, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(['/api/workspaces'], context.previousWorkspaces)
      }
      toast({
        title: "Error",
        description: error.message || "Failed to create workspace",
        variant: "destructive"
      })
    },
    onSuccess: () => {
      setIsCreateDialogOpen(false)
      setFormData({ name: '', description: '', theme: 'default', aiPersonality: 'professional' })
      toast({
        title: "Workspace created",
        description: "Your new workspace has been created successfully."
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    }
  })

  // Update workspace mutation with optimistic updates
  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<WorkspaceFormData> }) =>
      apiRequest(`/api/workspaces/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['/api/workspaces'] })
      const previousWorkspaces = queryClient.getQueryData(['/api/workspaces'])
      queryClient.setQueryData(['/api/workspaces'], (old: any) => 
        (old || []).map((w: Workspace) => w.id === id ? { ...w, ...data, updatedAt: new Date().toISOString() } : w)
      )
      return { previousWorkspaces }
    },
    onError: (error: any, variables, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(['/api/workspaces'], context.previousWorkspaces)
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update workspace",
        variant: "destructive"
      })
    },
    onSuccess: () => {
      setIsEditDialogOpen(false)
      setSelectedWorkspace(null)
      toast({
        title: "Workspace updated",
        description: "Your workspace has been updated successfully."
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    }
  })

  // Delete workspace mutation with optimistic updates
  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/workspaces/${id}`, {
        method: 'DELETE'
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['/api/workspaces'] })
      const previousWorkspaces = queryClient.getQueryData(['/api/workspaces'])
      queryClient.setQueryData(['/api/workspaces'], (old: any) => 
        (old || []).filter((w: Workspace) => w.id !== id)
      )
      return { previousWorkspaces }
    },
    onError: (error: any, id, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(['/api/workspaces'], context.previousWorkspaces)
      }
      toast({
        title: "Error",
        description: error.message || "Failed to delete workspace",
        variant: "destructive"
      })
    },
    onSuccess: () => {
      toast({
        title: "Workspace deleted",
        description: "The workspace has been deleted successfully."
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
    }
  })

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a workspace name",
        variant: "destructive"
      })
      return
    }
    createWorkspaceMutation.mutate(formData)
  }

  const handleEditWorkspace = (workspace: Workspace) => {
    setSelectedWorkspace(workspace)
    setFormData({
      name: workspace.name,
      description: workspace.description || '',
      theme: workspace.theme,
      aiPersonality: workspace.aiPersonality
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorkspace) return
    
    updateWorkspaceMutation.mutate({
      id: selectedWorkspace.id,
      data: formData
    })
  }

  const handleDeleteWorkspace = (workspace: Workspace) => {
    if (workspace.isDefault) {
      toast({
        title: "Cannot delete",
        description: "You cannot delete your default workspace",
        variant: "destructive"
      })
      return
    }

    if (confirm(`Are you sure you want to delete "${workspace.name}"? This action cannot be undone.`)) {
      deleteWorkspaceMutation.mutate(workspace.id)
    }
  }

  const copyInviteCode = (inviteCode: string) => {
    navigator.clipboard.writeText(inviteCode)
    toast({
      title: "Copied!",
      description: "Invite code copied to clipboard"
    })
  }

  const themes = [
    { value: 'default', label: 'Default', color: 'bg-gray-500' },
    { value: 'space', label: 'Space', color: 'bg-purple-500' },
    { value: 'ocean', label: 'Ocean', color: 'bg-blue-500' },
    { value: 'forest', label: 'Forest', color: 'bg-green-500' },
    { value: 'sunset', label: 'Sunset', color: 'bg-orange-500' }
  ]

  const personalities = [
    { value: 'professional', label: 'Professional', icon: '💼' },
    { value: 'creative', label: 'Creative', icon: '🎨' },
    { value: 'casual', label: 'Casual', icon: '😊' },
    { value: 'technical', label: 'Technical', icon: '⚙️' },
    { value: 'friendly', label: 'Friendly', icon: '🤝' }
  ]

  const getThemeGradient = (theme: string) => {
    switch (theme) {
      case 'space':
        return 'from-purple-500 to-indigo-600'
      case 'ocean':
        return 'from-blue-500 to-cyan-600'
      case 'forest':
        return 'from-green-500 to-emerald-600'
      case 'sunset':
        return 'from-orange-500 to-red-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  const showSkeletons = isLoading && workspaces.length === 0

  // Show full page skeleton loader for initial load
  if (isLoading && workspaces.length === 0) {
    return <SkeletonPageLoader type="workspaces" />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Workspaces</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your team workspaces and collaborate with others</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <Label htmlFor="name">Workspace Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter workspace name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your workspace"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="theme">Theme</Label>
                <Select value={formData.theme} onValueChange={(value) => setFormData(prev => ({ ...prev, theme: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((theme) => (
                      <SelectItem key={theme.value} value={theme.value}>
                        <div className="flex items-center space-x-2">
                          <div className={`w-4 h-4 rounded-full ${theme.color}`}></div>
                          <span>{theme.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="aiPersonality">AI Personality</Label>
                <Select value={formData.aiPersonality} onValueChange={(value) => setFormData(prev => ({ ...prev, aiPersonality: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {personalities.map((personality) => (
                      <SelectItem key={personality.value} value={personality.value}>
                        <div className="flex items-center space-x-2">
                          <span>{personality.icon}</span>
                          <span>{personality.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex space-x-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createWorkspaceMutation.isPending}
                  className="flex-1"
                >
                  {createWorkspaceMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {showSkeletons ? (
          <>
            {[1, 2, 3].map((i) => (
              <SkeletonWorkspaceCard key={i} />
            ))}
          </>
        ) : workspaces.map((workspace: Workspace) => (
          <Card key={workspace.id} className="border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                    getThemeGradient(workspace.theme)
                  } flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                      <span className="truncate">{workspace.name}</span>
                      {workspace.isDefault && (
                        <span title="Default workspace">
                          <Crown className="w-4 h-4 text-yellow-500" />
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {workspace.description || 'No description provided'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditWorkspace(workspace)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  {!workspace.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteWorkspace(workspace)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">Max {workspace.maxTeamMembers} members</span>
                </div>
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">{workspace.credits} credits</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400 capitalize">{workspace.theme}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400 capitalize">{workspace.aiPersonality}</span>
                </div>
              </div>

              {workspace.inviteCode && (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{workspace.inviteCode}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyInviteCode(workspace.inviteCode!)}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}

              <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
                Created {new Date(workspace.createdAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Workspace Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateWorkspace} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Workspace Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter workspace name"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe your workspace"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="edit-theme">Theme</Label>
              <Select value={formData.theme} onValueChange={(value) => setFormData(prev => ({ ...prev, theme: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value}>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full ${theme.color}`}></div>
                        <span>{theme.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-aiPersonality">AI Personality</Label>
              <Select value={formData.aiPersonality} onValueChange={(value) => setFormData(prev => ({ ...prev, aiPersonality: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personalities.map((personality) => (
                    <SelectItem key={personality.value} value={personality.value}>
                      <div className="flex items-center space-x-2">
                        <span>{personality.icon}</span>
                        <span>{personality.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateWorkspaceMutation.isPending}
                className="flex-1"
              >
                {updateWorkspaceMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}