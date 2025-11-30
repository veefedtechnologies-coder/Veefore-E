import { auth } from './firebase'

// Get the correct API base URL based on current environment
function getApiBaseUrl(): string {
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol;
  
  // If we're on localhost, use HTTP
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // If we're on the Cloudflare tunnel, use HTTPS
  if (currentHost === 'veefore-webhook.veefore.com') {
    return 'https://veefore-webhook.veefore.com';
  }
  
  // Default to current protocol and host
  return `${currentProtocol}//${currentHost}`;
}

export class ApiClient {
  private static async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser
    if (!user) return null
    
    try {
      return await user.getIdToken()
    } catch (error) {
      console.error('Failed to get auth token:', error)
      return null
    }
  }

  static async request(url: string, options: RequestInit = {}) {
    const token = await this.getAuthToken()
    
    // Ensure URL is absolute
    if (!url.startsWith('http')) {
      const baseUrl = getApiBaseUrl();
      url = `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
    }
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (response.status === 401) {
      // Avoid hard reloads on tunnel domains; surface error to UI instead
      throw new Error('Authentication required')
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  static async get(url: string) {
    return this.request(url, { method: 'GET' })
  }

  static async post(url: string, data?: any) {
    return this.request(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  static async put(url: string, data?: any) {
    return this.request(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  static async delete(url: string) {
    return this.request(url, { method: 'DELETE' })
  }
}

// Security helper functions
export const requireAuth = () => {
  if (!auth.currentUser) {
    window.location.href = '/'
    return false
  }
  return true
}

export const checkAuthStatus = () => {
  return !!auth.currentUser
}
