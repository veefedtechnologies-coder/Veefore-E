import React, { useState } from 'react';
import { 
  Lock, 
  Shield, 
  Smartphone, 
  Key, 
  Eye, 
  EyeOff, 
  Check, 
  AlertTriangle,
  Loader2,
  LogOut
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { calculatePasswordStrength } from '../utils/passwordStrength';
import type { PasswordFormData, Session, TwoFactorStatus } from '../types';

/**
 * SecuritySettings Component
 * 
 * Manages user security settings including:
 * - Password change with strength indicator
 * - Two-factor authentication setup
 * - Active session management
 * 
 * Requirements: 11.2, 11.3
 */
export const SecuritySettings: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Password change state
  const [passwordForm, setPasswordForm] = useState<PasswordFormData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Fetch 2FA status
  const { data: twoFactorStatus } = useQuery<TwoFactorStatus>({
    queryKey: ['/api/user/2fa/status'],
    queryFn: async () => {
      return apiRequest('/api/user/2fa/status');
    }
  });

  // Fetch active sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ['/api/user/sessions'],
    queryFn: async () => {
      return apiRequest('/api/user/sessions');
    }
  });

  // Password change mutation
  const passwordChangeMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      return apiRequest('/api/user/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error changing password",
        description: error.message || "Failed to update password.",
        variant: "destructive"
      });
    }
  });

  // Enable 2FA mutation
  const enable2FAMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/user/2fa/enable', {
        method: 'POST'
      });
    },
    onSuccess: (data: { qrCode: string }) => {
      setQrCode(data.qrCode);
      setShow2FAModal(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error enabling 2FA",
        description: error.message || "Failed to enable two-factor authentication.",
        variant: "destructive"
      });
    }
  });

  // Verify 2FA mutation
  const verify2FAMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest('/api/user/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/2fa/status'] });
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been enabled successfully.",
      });
      setShow2FAModal(false);
      setTwoFactorCode('');
      setQrCode(null);
    },
    onError: (error: any) => {
      toast({
        title: "Invalid code",
        description: error.message || "The code you entered is invalid.",
        variant: "destructive"
      });
    }
  });

  // Disable 2FA mutation
  const disable2FAMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/user/2fa/disable', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/2fa/status'] });
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error disabling 2FA",
        description: error.message || "Failed to disable two-factor authentication.",
        variant: "destructive"
      });
    }
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      return apiRequest(`/api/user/sessions/${sessionId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/sessions'] });
      toast({
        title: "Session Revoked",
        description: "The session has been terminated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error revoking session",
        description: error.message || "Failed to revoke session.",
        variant: "destructive"
      });
    }
  });

  // Calculate password strength
  const passwordStrength = calculatePasswordStrength(passwordForm.newPassword);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match.",
        variant: "destructive"
      });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive"
      });
      return;
    }

    passwordChangeMutation.mutate(passwordForm);
  };

  const handle2FAEnable = () => {
    if (twoFactorStatus?.enabled) {
      if (confirm("Are you sure you want to disable two-factor authentication? This will make your account less secure.")) {
        disable2FAMutation.mutate();
      }
    } else {
      enable2FAMutation.mutate();
    }
  };

  const handle2FAVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (twoFactorCode.length === 6) {
      verify2FAMutation.mutate(twoFactorCode);
    }
  };

  const handleRevokeSession = (sessionId: string) => {
    if (confirm("Are you sure you want to revoke this session? The device will be logged out.")) {
      revokeSessionMutation.mutate(sessionId);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Security & Privacy
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Protect your account and control your data
        </p>
      </div>

      {/* Password Change Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-start gap-4 pb-6 border-b border-gray-100 dark:border-gray-700/50">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <Key className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Change Password
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Update your password to keep your account secure
            </p>
          </div>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-6">
          {/* Current Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Current Password
            </label>
            <div className="relative">
              <Input
                type={showCurrentPassword ? "text" : "password"}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Enter your current password"
                className="w-full h-11 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              New Password
            </label>
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Enter your new password"
                className="w-full h-11 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {passwordForm.newPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Password strength</span>
                  <span className={`font-medium ${
                    passwordStrength.strength <= 25 ? 'text-red-600' :
                    passwordStrength.strength <= 50 ? 'text-orange-600' :
                    passwordStrength.strength <= 75 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                    style={{ width: `${passwordStrength.strength}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>Password should contain:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li className={passwordForm.newPassword.length >= 8 ? 'text-green-600' : ''}>
                      At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(passwordForm.newPassword) ? 'text-green-600' : ''}>
                      Uppercase letters
                    </li>
                    <li className={/[a-z]/.test(passwordForm.newPassword) ? 'text-green-600' : ''}>
                      Lowercase letters
                    </li>
                    <li className={/[0-9]/.test(passwordForm.newPassword) ? 'text-green-600' : ''}>
                      Numbers
                    </li>
                    <li className={/[^a-zA-Z0-9]/.test(passwordForm.newPassword) ? 'text-green-600' : ''}>
                      Special characters
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm New Password
            </label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Confirm your new password"
                className="w-full h-11 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Passwords do not match
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={passwordChangeMutation.isPending}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700"
          >
            {passwordChangeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating Password...
              </>
            ) : (
              'Update Password'
            )}
          </Button>
        </form>
      </div>

      {/* Two-Factor Authentication Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Two-Factor Authentication
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {twoFactorStatus?.enabled 
                    ? 'Your account is protected with 2FA' 
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {twoFactorStatus?.enabled && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-medium rounded-lg">
                    <Check className="w-4 h-4" />
                    Enabled
                  </span>
                )}
                <Button
                  onClick={handle2FAEnable}
                  disabled={enable2FAMutation.isPending || disable2FAMutation.isPending}
                  variant={twoFactorStatus?.enabled ? "outline" : "default"}
                  className={twoFactorStatus?.enabled ? '' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'}
                >
                  {enable2FAMutation.isPending || disable2FAMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    twoFactorStatus?.enabled ? 'Disable 2FA' : 'Enable 2FA'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Sessions Section */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-start gap-4 pb-6 border-b border-gray-100 dark:border-gray-700/50">
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
            <Lock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Active Sessions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage devices where you're currently logged in
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50"
              >
                <div className="flex items-center gap-4">
                  <Smartphone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {session.os} • {session.browser}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {session.isCurrent ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          Active now
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Last active {formatDistanceToNow(new Date(session.lastActive), { addSuffix: true })}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {session.ip}
                      </span>
                      {session.location && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {session.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revokeSessionMutation.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Revoke
                  </Button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active sessions found</p>
            </div>
          )}
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {show2FAModal && qrCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Setup Two-Factor Authentication
              </h3>
              <button
                onClick={() => {
                  setShow2FAModal(false);
                  setQrCode(null);
                  setTwoFactorCode('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="flex justify-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                </div>
              </div>

              <form onSubmit={handle2FAVerify} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enter the 6-digit code from your app
                  </label>
                  <Input
                    type="text"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full h-11 text-center text-2xl tracking-widest"
                    maxLength={6}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={twoFactorCode.length !== 6 || verify2FAMutation.isPending}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                >
                  {verify2FAMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify and Enable'
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
