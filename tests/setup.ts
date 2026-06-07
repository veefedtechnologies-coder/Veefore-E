import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config();

// Ensure required environment variables are set for tests
if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set in environment');
}
