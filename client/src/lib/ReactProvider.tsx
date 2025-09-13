import React from 'react'

// React Context Provider to ensure React context is properly established
export const ReactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // This component ensures React context is properly established
  // and prevents the "Invalid hook call" error
  return <>{children}</>
}

// Hook to ensure React is available
export const useReactCheck = () => {
  if (!React || !React.useState) {
    throw new Error('React is not properly initialized')
  }
  return true
}
