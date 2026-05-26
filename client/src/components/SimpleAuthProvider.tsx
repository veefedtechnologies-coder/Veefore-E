import React, { createContext, useContext, ReactNode } from 'react'

// Simple test context with default value
const TestContext = createContext<string>("DEFAULT_VALUE")

// Export the context itself for debugging
export { TestContext }

export const useTestAuth = () => {
  console.log('useTestAuth: Using TestContext:', TestContext)
  const context = useContext(TestContext)
  console.log('useTestAuth called, context:', context)
  console.log('useTestAuth: Context === DEFAULT_VALUE?', context === "DEFAULT_VALUE")
  if (context === "DEFAULT_VALUE") {
    console.error('useTestAuth: Context is default value - Provider not working')
    throw new Error('useTestAuth must be used within a TestProvider')
  }
  return context
}

interface TestProviderProps {
  children: ReactNode
}

export const TestProvider: React.FC<TestProviderProps> = ({ children }) => {
  const value = "Test Context Working!"
  
  console.log('TestProvider: Using TestContext:', TestContext)
  console.log('TestProvider: Rendering with value:', value)
  console.log('TestProvider: TestContext.Provider about to render')
  
  return (
    <TestContext.Provider value={value}>
      {children}
    </TestContext.Provider>
  )
}