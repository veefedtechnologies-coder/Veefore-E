import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = 'AQ.Ab8RN6I8YasF3JCQ53S5_BtK8Wz1Y1SC7xboYNHLS5JsljTQgw';

async function testGeminiScriptGeneration() {
  try {
    console.log('🧪 Testing Gemini Script Generation...');
    console.log('API Key:', API_KEY.substring(0, 10) + '...');
    
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Create a comprehensive video script for a 30-second video about artificial intelligence.

Requirements:
- Visual Style: cinematic
- Tone: professional
- Duration: 30 seconds

Please provide a detailed script with:
1. A compelling title
2. Scene-by-scene breakdown with:
   - Scene description
   - Visual elements
   - Narration text
   - Duration for each scene
3. Visual style guidelines
4. Recommended camera angles
5. Music and sound effects suggestions

Format the response as a structured JSON object with the following structure:
{
  "title": "Video Title",
  "totalDuration": 30,
  "scenes": [
    {
      "id": "scene_1",
      "description": "Scene description",
      "visualElements": "Visual elements",
      "narration": "Narration text",
      "duration": 5,
      "visualStyle": "cinematic",
      "cameraAngle": "Wide shot",
      "musicSuggestion": "Upbeat background music"
    }
  ],
  "visualGuidelines": "Overall visual style guidelines",
  "recommendedMusic": "Music and sound effects suggestions"
}`;

    console.log('📝 Sending request to Gemini...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Gemini Response received!');
    console.log('📄 Raw response length:', text.length);
    console.log('📄 First 200 characters:', text.substring(0, 200));
    
    // Try to parse JSON
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const scriptData = JSON.parse(jsonMatch[0]);
        console.log('✅ JSON parsed successfully!');
        console.log('📊 Script data:', {
          title: scriptData.title,
          totalDuration: scriptData.totalDuration,
          sceneCount: scriptData.scenes?.length || 0
        });
        return scriptData;
      } else {
        console.log('⚠️ No JSON found in response');
        return null;
      }
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError.message);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Gemini API test failed:', error.message);
    return null;
  }
}

testGeminiScriptGeneration().then(result => {
  if (result) {
    console.log('🎉 Test completed successfully!');
  } else {
    console.log('❌ Test failed');
  }
  process.exit(0);
});
