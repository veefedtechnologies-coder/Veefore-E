import { config } from 'dotenv';
config({ path: '/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/.env' });

async function testNetworkAPI() {
  const { aiServiceManager } = await import('./services/AIServiceManager');
  
  console.log("=== Testing Real Network AI API (Google AI Studio Default Key) ===");
  
  const preferences = {
    aiModel: "google-ai-studio", // Should route to gemini-2.5-pro
    aiPersona: "Pirate Captain",
    captionStyle: "Aggressive and loud",
    responseLength: "very short",
    creativityLevel: 0.85,
    contentSafety: "strict",
    multilingual: "Spanish",
    aiMemory: "short-term",
    optimizationGoals: "Maximize Engagement & Comments"
  };

  try {
    const prompt = "Explain what a CRM is to a 10 year old.";
    console.log("Input Prompt: " + prompt);
    console.log("Expected Output: Spanish, Pirate persona, very short.");
    
    const result = await aiServiceManager.generateText(prompt, preferences);
    
    console.log("\n====== NETWORK API RESULT ======");
    console.log(result);
    console.log("================================");
    
    console.log("\n✅ Test Passed! The API network call succeeded natively with your new key!");
  } catch (error: any) {
    console.error("\n❌ API Test Failed:");
    console.error(error.message || error);
  }
}

testNetworkAPI();
