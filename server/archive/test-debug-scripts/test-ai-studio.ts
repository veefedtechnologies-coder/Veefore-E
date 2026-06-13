import { config } from 'dotenv';
config();
import { aiServiceManager } from './services/AIServiceManager';

async function test() {
  console.log("Starting AI Service Manager Test...");
  
  const preferences = {
    aiModel: "google-ai-studio",
    googleAiStudioKey: process.env.GOOGLE_API_KEY, // Use the system one for testing or any valid key
    aiPersona: "Pirate Captain",
    captionStyle: "Aggressive and loud",
    responseLength: "very short (max 2 sentences)",
    creativityLevel: 0.9,
    contentSafety: "standard",
    multilingual: "auto",
    aiMemory: "long-term"
  };

  try {
    const prompt = "Explain what a CRM is to a 10 year old.";
    console.log("\\nTesting text generation with Google AI Studio (Gemini 2.0 Flash) and Pirate Persona...");
    const result = await aiServiceManager.generateText(prompt, preferences);
    console.log("Result:");
    console.log("-------------------");
    console.log(result);
    console.log("-------------------");
    console.log("Test passed!");
  } catch (error) {
    console.error("Test failed!", error);
  }
}

test();
