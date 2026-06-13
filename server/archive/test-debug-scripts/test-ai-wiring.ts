import { aiServiceManager } from './services/AIServiceManager';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock console to see final prompts
const originalConsoleLog = console.log;
console.log = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('[SYSTEM CONFIGURATION OVERRIDE]')) {
    originalConsoleLog("FINAL PROMPT INTERCEPTED:");
    originalConsoleLog(args[0]);
  } else {
    originalConsoleLog(...args);
  }
};

async function testWiring() {
  console.log("=== Testing AI Service Manager Wiring ===");
  
  const preferences = {
    aiModel: "google-ai-studio",
    googleAiStudioKey: "MOCK_GOOGLE_KEY",
    openAiKey: "MOCK_OPENAI_KEY",
    aiPersona: "Pirate Captain",
    captionStyle: "Aggressive and loud",
    responseLength: "very short",
    creativityLevel: 0.85,
    contentSafety: "strict",
    multilingual: "Spanish",
    aiMemory: "long-term",
    optimizationGoals: "Maximize Engagement & Comments"
  };

  try {
    // We intentionally expect it to throw an auth error, but before it does, 
    // let's look at the generated prompt by modifying AIServiceManager temporarily or just looking at the source code, 
    // actually let's just log the context inside AIServiceManager by hacking the file temporarily for the test.
  } catch (error) {
    // Ignore error
  }
}

testWiring();
