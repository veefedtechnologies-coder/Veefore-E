import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}

interface ToastState {
  toasts: Toast[]
}

let toastCount = 0
let toastState: ToastState = { toasts: [] }
let listeners: Array<(state: ToastState) => void> = []

function dispatch(action: { type: string; payload?: any }) {
  switch (action.type) {
    case 'ADD_TOAST':
      toastState = {
        toasts: [...toastState.toasts, action.payload]
      }
      break
    case 'REMOVE_TOAST':
      toastState = {
        toasts: toastState.toasts.filter(t => t.id !== action.payload)
      }
      break
    case 'DISMISS_TOAST':
      toastState = {
        toasts: toastState.toasts.filter(t => t.id !== action.payload)
      }
      break
  }
  
  listeners.forEach(listener => listener(toastState))
}

export function useToast() {
  const [, forceUpdate] = useState(0)
  
  const subscribe = useCallback((listener: (state: ToastState) => void) => {
    listeners.push(listener)
    return () => {
      listeners = listeners.filter(l => l !== listener)
    }
  }, [])
  
  const toast = useCallback(({ title, description, variant = 'default', duration = 5000 }: Omit<Toast, 'id'>) => {
    const id = (++toastCount).toString()
    const toastItem: Toast = {
      id,
      title,
      description,
      variant,
      duration
    }
    
    dispatch({ type: 'ADD_TOAST', payload: toastItem })
    
    if (duration > 0) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE_TOAST', payload: id })
      }, duration)
    }
    
    return {
      id,
      dismiss: () => dispatch({ type: 'DISMISS_TOAST', payload: id })
    }
  }, [])
  
  const dismiss = useCallback((toastId: string) => {
    dispatch({ type: 'DISMISS_TOAST', payload: toastId })
  }, [])
  
  return {
    toast,
    dismiss,
    toasts: toastState.toasts,
    subscribe
  }
}