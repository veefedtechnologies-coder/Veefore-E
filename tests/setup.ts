import dotenv from 'dotenv';
import '@testing-library/jest-dom';

// Load environment variables for testing
dotenv.config();

// Ensure required environment variables are set for tests
if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set in environment');
}

// Setup global test environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
