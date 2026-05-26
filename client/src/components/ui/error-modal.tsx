import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Lock } from 'lucide-react'

interface ErrorModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  type?: 'error' | 'warning' | 'constraint'
}

export function ErrorModal({ isOpen, onClose, title, message, type = 'error' }: ErrorModalProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
    } else {
      const timer = setTimeout(() => setIsVisible(false), 150)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const getIcon = () => {
    switch (type) {
      case 'constraint':
        return <Lock className="h-6 w-6 text-amber-500" />
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-amber-500" />
      default:
        return <AlertTriangle className="h-6 w-6 text-red-500" />
    }
  }

  const getBorderColor = () => {
    switch (type) {
      case 'constraint':
        return 'border-amber-200 dark:border-amber-800'
      case 'warning':
        return 'border-amber-200 dark:border-amber-800'
      default:
        return 'border-red-200 dark:border-red-800'
    }
  }

  const getBackgroundColor = () => {
    switch (type) {
      case 'constraint':
        return 'bg-amber-50 dark:bg-amber-950/20'
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-950/20'
      default:
        return 'bg-red-50 dark:bg-red-950/20'
    }
  }

  if (!isVisible) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className={`
          sm:max-w-md mx-auto
          bg-white dark:bg-gray-900 
          border border-gray-200 dark:border-gray-700
          shadow-2xl
          transition-all duration-200 ease-out
          ${isOpen ? 'animate-in fade-in-0 zoom-in-95' : 'animate-out fade-out-0 zoom-out-95'}
        `}
        data-testid="error-modal"
      >
        <div className="relative">
          {/* Header with icon */}
          <DialogHeader className="space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full ${getBackgroundColor()} ${getBorderColor()} border-2 flex items-center justify-center`}>
              {getIcon()}
            </div>
            
            <DialogTitle 
              className="text-center text-lg font-semibold text-gray-900 dark:text-gray-100"
              data-testid="error-modal-title"
            >
              {title}
            </DialogTitle>
          </DialogHeader>

          {/* Message */}
          <DialogDescription 
            className="mt-4 text-center text-sm text-gray-600 dark:text-gray-300 leading-relaxed px-2"
            data-testid="error-modal-message"
          >
            {message}
          </DialogDescription>

          {/* Action buttons */}
          <div className="mt-6 flex justify-center">
            <Button
              onClick={onClose}
              className={`
                px-6 py-2 rounded-lg font-medium transition-all duration-200
                ${type === 'constraint' 
                  ? 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white' 
                  : type === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white'
                  : 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white'
                }
                focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900
                ${type === 'constraint' 
                  ? 'focus:ring-amber-500' 
                  : type === 'warning'
                  ? 'focus:ring-amber-500'
                  : 'focus:ring-red-500'
                }
              `}
              data-testid="error-modal-understand"
            >
              I Understand
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}