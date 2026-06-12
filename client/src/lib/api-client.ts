/**
 * Authenticated API Client
 * 
 * Provides utility functions for making authenticated API requests
 * Automatically includes Firebase ID token in Authorization header
 */

import { auth } from './firebase'

/**
 * Make an authenticated API request
 * Automatically adds Authorization header with Firebase ID token
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Get current user
  const user = auth.currentUser
  
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  // Get fresh ID token
  const idToken = await user.getIdToken()
  
  // Add Authorization header
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  }
  
  // Make request
  return fetch(url, {
    ...options,
    headers,
  })
}

/**
 * Make an authenticated GET request
 */
export async function apiGet(url: string): Promise<any> {
  const response = await authenticatedFetch(url, {
    method: 'GET',
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  
  return response.json()
}

/**
 * Make an authenticated POST request
 */
export async function apiPost(url: string, data?: any): Promise<any> {
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  
  return response.json()
}

/**
 * Make an authenticated PUT request
 */
export async function apiPut(url: string, data?: any): Promise<any> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  
  return response.json()
}

/**
 * Make an authenticated DELETE request
 */
export async function apiDelete(url: string): Promise<any> {
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  
  return response.json()
}

/**
 * Make an authenticated PATCH request
 */
export async function apiPatch(url: string, data?: any): Promise<any> {
  const response = await authenticatedFetch(url, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  
  return response.json()
}
