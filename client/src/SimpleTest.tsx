import React from 'react';

const SimpleTest: React.FC = () => {
  const [count, setCount] = React.useState(0);

  return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'white', backgroundColor: '#1a1a1a' }}>
      <h1>Simple React Test</h1>
      <p>Count: {count}</p>
      <button 
        onClick={() => setCount(count + 1)}
        style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        Increment
      </button>
      <p>If you see this and can click the button, React is working!</p>
    </div>
  );
};

export default SimpleTest;
