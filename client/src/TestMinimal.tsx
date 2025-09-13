import React from 'react';

const TestMinimal = () => {
  console.log('TestMinimal - React:', typeof React);
  console.log('TestMinimal - useState:', typeof React.useState);
  
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <h1>Minimal Test: {count}</h1>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};

export default TestMinimal;
