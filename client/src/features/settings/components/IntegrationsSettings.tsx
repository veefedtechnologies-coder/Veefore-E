import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react';
import {
  Instagram, Facebook, Twitter, Youtube, Linkedin, Link as LinkIcon,
  AlertCircle, RefreshCw, Plus, Trash2, Activity, Key, Check, AlertTriangle
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { useSocialAccounts } from '@/hooks/useSocialAccounts';

/**
 * IntegrationsSettings Component
 * 
 * Manages OAuth connection management for Instagram, Facebook, Twitter
 * and API key management interface for third-party integrations.
 * Shows integration status and last sync timestamps.
 * 
 * Requirements: 11.2, 11.3, 11.5
 */
export function IntegrationsSettings() {
  const { currentWorkspace } = useCurrentWorkspace();
  const { socialAccounts, isLoading, refetch } = useSocialAccounts(currentWorkspace?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State for API keys
  const [apiKeys, setApiKeys] = useState({
    googleAiStudioKey: '',
    openAiKey: ''
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Handle OAuth redirect success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'instagram') {
      const username = params.get('username');
      setConnectedUsername(username);
      setShowSuccessModal(true);
      
      // Clean up the URL so refreshing doesn't trigger it again
      const newUrl = window.location.pathname + '?tab=integrations';
      window.history.replaceState({}, '', newUrl);

      // Auto-close countdown
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowSuccessModal(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, []);

  // Sync mutation for social accounts
  const syncMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}/metrics`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: "Sync Triggered", description: "Account metrics are syncing in the background." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Sync Failed", description: err.message || "Failed to trigger sync", variant: "destructive" });
    }
  });

  // Delete mutation for social accounts
  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return apiRequest(`/api/social-accounts/${accountId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: "Account Removed", description: "The social account was successfully disconnected." });
      refetch();
    },
    onError: (err: any) => {
      toast({ title: "Disconnection Failed", description: err.message || "Could not disconnect account", variant: "destructive" });
    }
  });

  // API Keys mutation
  const apiKeysMutation = useMutation({
    mutationFn: async (keys: typeof apiKeys) => {
      return apiRequest('/api/user/api-keys', {
        method: 'PATCH',
        body: JSON.stringify(keys)
      });
    },
    onSuccess: () => {
      toast({ title: "API Keys Updated", description: "Your custom API keys have been saved successfully." });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (err: any) => {
      toast({ title: "Error Saving Keys", description: err.message || "Failed to update API keys.", variant: "destructive" });
    }
  });

  const handleReconnect = (platform: string) => {
    if (!currentWorkspace?.id) return;
    window.location.href = `/api/social-auth/${platform}/authorize?workspaceId=${currentWorkspace.id}`;
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'instagram': return <Instagram className="w-6 h-6" />;
      case 'facebook': return <Facebook className="w-6 h-6" />;
      case 'twitter': return <Twitter className="w-6 h-6" />;
      case 'youtube': return <Youtube className="w-6 h-6" />;
      case 'linkedin': return <Linkedin className="w-6 h-6" />;
      default: return <LinkIcon className="w-6 h-6 text-gray-500" />;
    }
  };

  const handleApiKeysSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    apiKeysMutation.mutate(apiKeys);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Integrations</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage OAuth connections, API keys, and third-party integrations
        </p>
      </div>

      {/* Social Accounts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <LinkIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Social Accounts</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Connect and manage OAuth integrations for social platforms
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Plus className="w-4 h-4" /> Add Account
                </Button>
              </DialogTrigger>
              <AddAccountModal currentWorkspace={currentWorkspace} getPlatformIcon={getPlatformIcon} />
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="p-4 flex items-center justify-between animate-pulse rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-48"></div>
                  </div>
                </div>
                <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded-xl w-24"></div>
              </div>
            ))}
          </div>
        ) : !socialAccounts?.length ? (
          <div className="p-8 text-center flex flex-col items-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <LinkIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Social Accounts Connected
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
              Connect your social media profiles to enable cross-platform publishing and automation
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  <Plus className="w-5 h-5" /> Connect First Account
                </Button>
              </DialogTrigger>
              <AddAccountModal currentWorkspace={currentWorkspace} getPlatformIcon={getPlatformIcon} />
            </Dialog>
          </div>
        ) : (
          <div className="space-y-3">
            {socialAccounts.map((account: any) => {
              const isHealthy = account.tokenStatus === 'valid' && account.isActive !== false;
              const hasExpired = account.tokenStatus === 'expired';
              const validId = account._id || account.id;
              
              return (
                <div 
                  key={validId} 
                  className="p-4 flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {account.profilePictureUrl ? (
                        <img 
                          src={account.profilePictureUrl} 
                          alt={account.username} 
                          className="w-12 h-12 rounded-xl object-cover ring-2 ring-gray-100 dark:ring-gray-800" 
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center ring-2 ring-gray-100 dark:ring-gray-800">
                          <div className={`${
                            account.platform.toLowerCase() === 'instagram' ? 'text-pink-500' :
                            account.platform.toLowerCase() === 'facebook' ? 'text-blue-600' :
                            account.platform.toLowerCase() === 'twitter' ? 'text-sky-500' :
                            'text-gray-500'
                          }`}>
                            {getPlatformIcon(account.platform)}
                          </div>
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white dark:bg-gray-900 rounded-lg flex items-center justify-center shadow-sm">
                        <div className={`scale-75 ${
                          account.platform.toLowerCase() === 'instagram' ? 'text-pink-500' :
                          account.platform.toLowerCase() === 'facebook' ? 'text-blue-600' :
                          account.platform.toLowerCase() === 'twitter' ? 'text-sky-500' :
                          'text-gray-500'
                        }`}>
                          {getPlatformIcon(account.platform)}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {account.username}
                        {!isHealthy && <AlertCircle className="w-4 h-4 text-red-500" />}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isHealthy 
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                            : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                        }`}>
                          {isHealthy ? 'Active' : hasExpired ? 'Expired' : 'Action Required'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Synced {account.lastSyncAt ? formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true }) : 'never'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => syncMutation.mutate(validId)}
                      disabled={!isHealthy || syncMutation.isPending}
                      title="Force sync"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                    
                    {!isHealthy ? (
                      <Button 
                        onClick={() => handleReconnect(account.platform)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm h-9"
                      >
                        Reconnect
                      </Button>
                    ) : (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="text-sm h-9">Manage</Button>
                        </DialogTrigger>
                        <ManageAccountModal 
                          account={account} 
                          isHealthy={isHealthy} 
                          syncMutation={syncMutation} 
                          getPlatformIcon={getPlatformIcon} 
                        />
                      </Dialog>
                    )}

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DisconnectAccountModal 
                        account={account} 
                        deleteMutation={deleteMutation}
                        validId={validId}
                      />
                    </Dialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom API Keys Section */}
      <form onSubmit={handleApiKeysSubmit}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/30 rounded-xl">
              <Key className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Custom API Keys</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Bring your own AI API keys to override default system keys
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Google AI Studio Key (Gemini)
              </label>
              <Input 
                type="password" 
                placeholder="AIzaSy..." 
                value={apiKeys.googleAiStudioKey} 
                onChange={(e) => setApiKeys({ ...apiKeys, googleAiStudioKey: e.target.value })}
                className="w-full h-11"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google AI Studio</a>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                OpenAI API Key
              </label>
              <Input 
                type="password" 
                placeholder="sk-..." 
                value={apiKeys.openAiKey} 
                onChange={(e) => setApiKeys({ ...apiKeys, openAiKey: e.target.value })}
                className="w-full h-11"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">OpenAI Platform</a>
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button 
              type="submit" 
              disabled={apiKeysMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {apiKeysMutation.isPending ? 'Saving...' : 'Save API Keys'}
            </Button>
          </div>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <SuccessModal 
          connectedUsername={connectedUsername} 
          countdown={countdown}
          onClose={() => setShowSuccessModal(false)}
        />
      )}
    </div>
  );
}

// Add Account Modal Component
function AddAccountModal({ currentWorkspace, getPlatformIcon }: any) {
  const platforms = [
    { id: 'instagram', name: 'Instagram', description: 'Business & Creator Accounts', color: 'bg-pink-500 hover:bg-pink-600' },
    { id: 'facebook', name: 'Facebook', description: 'Pages & Groups', color: 'bg-blue-600 hover:bg-blue-700' },
    { id: 'twitter', name: 'X (Twitter)', description: 'Professional Accounts', color: 'bg-slate-900 hover:bg-black dark:hover:bg-slate-800' },
    { id: 'youtube', name: 'YouTube', description: 'Channels & Shorts', color: 'bg-red-600 hover:bg-red-700' },
    { id: 'linkedin', name: 'LinkedIn', description: 'Personal & Company Pages', color: 'bg-blue-700 hover:bg-blue-800' }
  ];

  const handleConnect = (platformId: string) => {
    if (!currentWorkspace?.id) return;
    window.location.href = `/api/social-auth/${platformId}/authorize?workspaceId=${currentWorkspace.id}`;
  };

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
          <Plus className="w-6 h-6 text-indigo-600" /> Connect a New Platform
        </DialogTitle>
      </DialogHeader>
      <div className="py-6">
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Select a platform below to authenticate. You will be redirected to securely grant permissions.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {platforms.map(p => (
            <button 
              key={p.id}
              onClick={() => handleConnect(p.id)}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800 transition-all group text-left"
            >
              <div className={`w-12 h-12 flex items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105 ${p.color}`}>
                {getPlatformIcon(p.id)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </DialogContent>
  );
}

// Manage Account Modal Component
function ManageAccountModal({ account, isHealthy, syncMutation, getPlatformIcon }: any) {
  const tokenHealth = isHealthy ? "Active & Healthy" : account.tokenStatus === "expired" ? "Expired" : "Requires Action";
  const webhookHealth = isHealthy && account.lastSyncAt ? "Listening" : "Degraded";
  const connectedDate = account.createdAt 
    ? new Date(account.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) 
    : 'Unknown';
  
  const profilePic = account.profilePictureUrl || account.profilePicture || account.avatar;

  return (
    <DialogContent className="sm:max-w-[750px] p-0 overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-2xl max-h-[95vh]">
      {/* Premium Header with Gradient */}
      <div className="relative h-28 bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-indigo-900 dark:to-purple-900 overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
        <div className="absolute bottom-5 left-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center relative p-0.5">
            {profilePic ? (
              <img src={profilePic} alt={account.username} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-[14px]" />
            ) : (
              <div className="w-full h-full bg-gray-100 rounded-[14px] flex items-center justify-center">
                {getPlatformIcon(account.platform)}
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm">
              <div className="scale-75">{getPlatformIcon(account.platform)}</div>
            </div>
          </div>
          <div>
            <DialogTitle className="text-2xl font-bold text-white drop-shadow-md leading-tight">
              @{account.username}
            </DialogTitle>
            <p className="text-white/80 text-sm flex items-center gap-1.5 mt-0.5">
              <span className="capitalize">{account.platform}</span> Business Account
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {/* Core Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Followers</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">
              {account.followersCount ? (account.followersCount > 10000 ? (account.followersCount / 1000).toFixed(1) + 'k' : account.followersCount.toLocaleString()) : 'N/A'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Media</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">
              {account.mediaCount ? account.mediaCount.toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2.5 h-2.5 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <p className={`text-sm font-bold ${isHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} leading-none`}>
                {isHealthy ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">Connected</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-none mt-1">{connectedDate}</p>
          </div>
        </div>

        {/* Integration Details & Scopes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-500" /> Platform Integration
            </h4>
            <div className="flex-1 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex-1 flex flex-col justify-center border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Access Token</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    isHealthy 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' 
                      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                  }`}>
                    {tokenHealth}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-tight">Authenticates secure API requests.</p>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Data Synchronization</span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    webhookHealth === 'Listening' 
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' 
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                  }`}>
                    {webhookHealth}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-tight">
                  Last synchronized: {account.lastSyncAt ? formatDistanceToNow(new Date(account.lastSyncAt), { addSuffix: true }) : 'Never'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Key className="w-4 h-4 text-emerald-500" /> Authorized Scopes
            </h4>
            <div className="flex-1 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm flex flex-col justify-center">
              {isHealthy ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">
                        Content Management
                      </p>
                      <p className="text-xs text-gray-500 leading-tight">Publish posts, stories, & reels.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">
                        Community Engagement
                      </p>
                      <p className="text-xs text-gray-500 leading-tight">Read and respond to messages.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 bg-emerald-100 dark:bg-emerald-500/20 p-1 rounded-full">
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-tight mb-0.5">
                        Insights & Analytics
                      </p>
                      <p className="text-xs text-gray-500 leading-tight">Access audience demographics.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Permissions Revoked</p>
                  <p className="text-xs text-gray-500 mt-1">Reconnect this account.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer Actions */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20 -mx-6 -mb-6 p-5 rounded-b-xl shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Data Synchronization</p>
            <p className="text-xs text-gray-500 mt-0.5">Force a manual fetch of the latest metrics.</p>
          </div>
          <Button 
            onClick={() => syncMutation.mutate(account._id || account.id)} 
            disabled={!isHealthy || syncMutation.isPending}
            className="h-9 text-sm gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-5"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> 
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

// Disconnect Account Modal Component
function DisconnectAccountModal({ account, deleteMutation, validId }: any) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-red-600 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> Danger Zone: Disconnect Account
        </DialogTitle>
      </DialogHeader>
      <div className="py-4 space-y-4">
        <p className="text-gray-600 dark:text-gray-300">
          You are about to disconnect <strong>{account.username}</strong> from Veefore. This will immediately 
          stop all active automations, automated posting, and analytics syncing for this profile.
        </p>
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/50">
          <ul className="list-disc list-inside text-sm text-red-800 dark:text-red-300 space-y-1">
            <li>Scheduled posts will fail</li>
            <li>AI automations will stop responding</li>
            <li>Historical metrics will be retained but frozen</li>
          </ul>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <DialogTrigger asChild>
          <Button variant="outline">Cancel</Button>
        </DialogTrigger>
        <Button 
          variant="destructive" 
          onClick={() => deleteMutation.mutate(validId)}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? 'Disconnecting...' : 'Yes, disconnect account'}
        </Button>
      </div>
    </DialogContent>
  );
}

// Success Modal Component
function SuccessModal({ connectedUsername, countdown, onClose }: any) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-2xl animate-in zoom-in-95 duration-400">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-500">
              <Check className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-400 rounded-full animate-ping"></div>
          </div>
        </div>
        
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
            Account Connected
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            The account <span className="font-semibold text-gray-900 dark:text-white">@{connectedUsername}</span> 
            {' '}has been successfully authenticated and is now securely connected.
          </p>
          
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg mt-0.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                  What's next?
                </p>
                <ul className="text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                  <li>• Create automations for this account</li>
                  <li>• Schedule posts and stories</li>
                  <li>• View analytics and insights</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Auto-closing in</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{countdown}s</span>
          </div>
          
          <Button 
            onClick={onClose}
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Continue to Integrations
          </Button>
        </div>
      </div>
    </div>
  );
}
