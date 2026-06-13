import { aiServiceManager } from './services/AIServiceManager';

async function testPromptGeneration() {
  const preferences = {
    aiModel: "openai-gpt4o",
    openAiKey: "sk-fake-key-for-testing",
    aiPersona: "Pirate Captain",
    captionStyle: "Aggressive and loud",
    responseLength: "very short",
    creativityLevel: 0.85,
    contentSafety: "strict",
    multilingual: "Spanish",
    aiMemory: "long-term",
    optimizationGoals: "Maximize Engagement & Comments"
  };

  // We are monkey-patching console.log to see the prompt in AIServiceManager
  console.log("=== Testing Final Prompt Construction ===");
  try {
    await aiServiceManager.generateText("Write a test message.", preferences);
  } catch (error) {
    console.log("Caught expected error due to fake key. The prompt was already constructed.");
  }
}

testPromptGeneration();
