import React, { useState } from 'react'

function TestApp() {
  console.log('TestApp rendering, React:', typeof React, 'useState:', typeof React?.useState)
  
  if (!React || !React.useState) {
    console.error('React not available in TestApp')
    return <div>React not available</div>
  }

  const [count, setCount] = useState(0)

  return (
    <div>
      <h1>Test App</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}

export default TestApp
