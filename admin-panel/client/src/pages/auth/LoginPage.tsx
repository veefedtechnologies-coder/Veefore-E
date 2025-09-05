import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    twoFactorCode: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrors({})

    try {
      await login(formData.email, formData.password, formData.twoFactorCode || undefined)
    } catch (error: any) {
      if (error.response?.data?.requires2FA) {
        setRequires2FA(true)
      } else {
        setErrors({ general: error.response?.data?.message || 'Login failed' })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-gray-900 p-3 rounded-lg">
            <Shield className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          VeeFore Admin Panel
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to your admin account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access the admin panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {errors.general && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {errors.general}
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="admin@veefore.com"
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email}
                required
                disabled={isLoading}
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter your password"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.password}
                required
                disabled={isLoading}
              />

              {requires2FA && (
                <Input
                  label="Two-Factor Authentication Code"
                  type="text"
                  name="twoFactorCode"
                  value={formData.twoFactorCode}
                  onChange={handleInputChange}
                  placeholder="Enter 6-digit code"
                  leftIcon={<Shield className="h-4 w-4" />}
                  error={errors.twoFactorCode}
                  required
                  disabled={isLoading}
                />
              )}

              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
                disabled={isLoading}
              >
                {requires2FA ? 'Verify & Sign In' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Having trouble signing in?{' '}
                <a href="mailto:support@veefore.com" className="text-gray-900 hover:text-gray-700 font-medium">
                  Contact Support
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          © 2024 VeeFore. All rights reserved.
        </p>
      </div>
    </div>
  )
}
