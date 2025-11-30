import React, { useState, useEffect } from 'react'
import { useCacheInvalidation } from '@/hooks/useCacheInvalidation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Debug component for WebSocket connection issues
 * Can be temporarily added to dashboard for troubleshooting
 */
export function WebSocketDebugger() {
  const {
    isConnected,
    workspaceId,
    connectionAttempts,
    disableWebSocket,
    enableWebSocket
  } = useCacheInvalidation()
  
  const [isVisible, setIsVisible] = useState(false)
  
  // Auto-hide in production
  useEffect(() => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('localhost')
    const isDebugMode = localStorage.getItem('show-websocket-debug') === 'true'
    setIsVisible(isDev || isDebugMode)
  }, [])
  
  if (!isVisible) {
    // Only show toggle button in development
    return window.location.hostname === 'localhost' ? (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-gray-800 text-white px-3 py-2 rounded-lg text-xs opacity-50 hover:opacity-100"
        >
          WS Debug
        </button>
      </div>
    ) : null
  }
  
  const getStatusColor = () => {
    return isConnected ? 'text-green-600' : 'text-red-600'
  }
  
  const getStatusIcon = () => {
    return isConnected ? '🟢' : '🔴'
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="w-80 bg-white dark:bg-gray-800 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>WebSocket Debug</span>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span>{getStatusIcon()}</span>
              <span className={`font-medium ${getStatusColor()}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            <div className="text-gray-600 dark:text-gray-400">
              <div>Workspace: {workspaceId || 'None'}</div>
              <div>Attempts: {connectionAttempts}</div>
              <div className="text-xs">
                URL: {window.location.protocol}//{window.location.host}/ws/metrics
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={isConnected ? disableWebSocket : enableWebSocket}
              className="text-xs"
            >
              {isConnected ? 'Disable' : 'Enable'} WebSocket
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              Reload Page
            </Button>
          </div>
          
          <div className="text-xs text-gray-500">
            {localStorage.getItem('disable-websocket') === 'true' 
              ? '⚠️ WebSocket connections are disabled' 
              : 'WebSocket connections are enabled'
            }
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



