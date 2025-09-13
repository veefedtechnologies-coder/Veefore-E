import React from 'react'

interface ReactWrapperProps {
  children: React.ReactNode
}

export const ReactWrapper: React.FC<ReactWrapperProps> = ({ children }) => {
  // Check if React is properly loaded
  if (typeof React === 'undefined' || !React.useState) {
    console.error('React is not available in ReactWrapper')
    return <div>Error: React not available</div>
  }

  return <>{children}</>
}
