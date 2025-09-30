import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8001/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token')
        console.log('🔍 API Request Debug:');
        console.log('  - Token from localStorage:', token);
        console.log('  - Token length:', token?.length);
        console.log('  - Token preview:', token?.substring(0, 50) + '...');
        console.log('  - Request URL:', config.url);
        console.log('  - Full config:', config);
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
          console.log('  - Authorization header set:', config.headers.Authorization?.substring(0, 50) + '...');
        } else {
          console.log('  - No token found in localStorage');
        }
        return config
      },
      (error) => {
        console.error('  - Request interceptor error:', error);
        return Promise.reject(error)
      }
    )

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        console.log('🔍 API Response Debug:');
        console.log('  - Response status:', response.status);
        console.log('  - Response URL:', response.config.url);
        console.log('  - Response data keys:', Object.keys(response.data || {}));
        console.log('  - Users count:', response.data?.users?.length);
        console.log('  - Pagination total:', response.data?.pagination?.total);
        return response
      },
      (error) => {
        console.error('🔍 API Error Debug:');
        console.error('  - Error status:', error.response?.status);
        console.error('  - Error URL:', error.config?.url);
        console.error('  - Error message:', error.message);
        console.error('  - Error response data:', error.response?.data);
        
        if (error.response?.status === 401) {
          console.log('  - 401 Unauthorized - removing token');
          localStorage.removeItem('token')
          // Don't redirect, let the AuthContext handle it
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config)
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config)
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config)
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config)
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config)
  }

  // File upload method
  async uploadFile<T = any>(url: string, file: File, onProgress?: (progress: number) => void): Promise<AxiosResponse<T>> {
    const formData = new FormData()
    formData.append('file', file)

    return this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(progress)
        }
      },
    })
  }

  // Download file method
  async downloadFile(url: string, filename?: string): Promise<void> {
    const response = await this.client.get(url, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data])
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  }
}

export const apiClient = new ApiClient()
