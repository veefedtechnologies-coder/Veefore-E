import { AIExtractionService } from './server/services/social-listening/ai-extraction.service.ts';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const text = "WATCH PART 2 HERE: https://www.youtube.com/watch?v=f-FyMY1LMwI&t=133s In this video, we reveal the top 17 breakthrough technology trends...";
  const res = await AIExtractionService.analyzeContent(text, 'youtube');
  console.log("AI RESULT:", res);
}
check().catch(console.error);
