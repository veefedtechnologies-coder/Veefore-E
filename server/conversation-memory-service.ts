import { MongoStorage } from './mongodb-storage';
import { getOpenAIClient, isOpenAIAvailable } from './openai-client';
import { DmConversation, DmMessage, ConversationContext, InsertDmConversation, InsertDmMessage, InsertConversationContext } from '@shared/schema';

export class ConversationMemoryService {
  private storage: MongoStorage;
  private readonly MEMORY_DURATION_DAYS = 3;

  constructor(storage: MongoStorage) {
    this.storage = storage;
  }

  // Get or create conversation for a participant
  async getOrCreateConversation(
    workspaceId: string,
    platform: string,
    participantId: string,
    participantUsername?: string
  ): Promise<DmConversation> {
    console.log(`[MEMORY] Getting conversation for ${participantId} on ${platform}`);
    
    try {
      // Check if conversation exists
      const existing = await this.storage.getDmConversation(workspaceId, platform, participantId);
      if (existing) {
        console.log(`[MEMORY] Found existing conversation ID: ${existing.id}`);
        return existing;
      }

      // Create new conversation
      const conversationData: InsertDmConversation = {
        workspaceId: typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId,
        platform,
        participantId,
        participantUsername: participantUsername || participantId
      };

      const newConversation = await this.storage.createDmConversation(conversationData);
      console.log(`[MEMORY] Created new conversation ID: ${newConversation.id}`);
      return newConversation;
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to get/create conversation:`, error);
      throw error;
    }
  }

  // Store incoming message and extract context
  async storeMessage(
    conversationId: string | number,
    messageId: string | null,
    sender: 'user' | 'ai',
    content: string,
    automationRuleId?: string | number
  ): Promise<DmMessage> {
    console.log(`[MEMORY] Storing ${sender} message for conversation ${conversationId}`);

    try {
      // Analyze message for sentiment and topics using AI
      const analysis = await this.analyzeMessage(content);
      
      const messageData: InsertDmMessage = {
        conversationId: typeof conversationId === 'string' ? parseInt(conversationId, 10) || 0 : conversationId,
        messageId,
        sender,
        content,
        messageType: 'text',
        sentiment: analysis.sentiment,
        topics: analysis.topics,
        aiResponse: sender === 'ai',
        automationRuleId: typeof automationRuleId === 'string' ? parseInt(automationRuleId, 10) || undefined : automationRuleId
      };

      const message = await this.storage.createDmMessage(messageData);
      
      // Extract and store conversation context if this is a user message
      if (sender === 'user') {
        await this.extractAndStoreContext(conversationId, content, analysis);
      }

      // Update conversation's last message time
      await this.storage.updateConversationLastMessage(conversationId);
      
      console.log(`[MEMORY] Stored message ID: ${message.id} with sentiment: ${analysis.sentiment}`);
      return message;
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to store message:`, error);
      throw error;
    }
  }

  // Get conversation history for context
  async getConversationHistory(
    conversationId: number,
    limit: number = 10
  ): Promise<DmMessage[]> {
    console.log(`[MEMORY] Getting history for conversation ${conversationId}, limit: ${limit}`);
    
    try {
      const messages = await this.storage.getDmMessages(conversationId, limit);
      console.log(`[MEMORY] Retrieved ${messages.length} messages from history`);
      return messages;
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to get conversation history:`, error);
      return [];
    }
  }

  // Get conversation context for enhanced AI responses
  async getConversationContext(conversationId: number): Promise<ConversationContext[]> {
    console.log(`[MEMORY] Getting context for conversation ${conversationId}`);
    
    try {
      const context = await this.storage.getConversationContext(conversationId);
      console.log(`[MEMORY] Retrieved ${context.length} context items`);
      return context;
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to get conversation context:`, error);
      return [];
    }
  }

  // Generate contextual AI response using conversation memory
  async generateContextualResponse(
    conversationId: number,
    userMessage: string,
    workspacePersonality?: string
  ): Promise<string> {
    console.log(`[MEMORY] Generating contextual response for conversation ${conversationId}`);

    try {
      // Get conversation history - expand to get more context
      const history = await this.getConversationHistory(conversationId, 15);
      const context = await this.getConversationContext(conversationId);
      
      console.log(`[MEMORY] Retrieved ${history.length} messages from history`);
      console.log(`[MEMORY] Retrieved ${context.length} context items`);

      // Analyze conversation patterns and user behavior
      const conversationAnalysis = this.analyzeConversationPatterns(history);
      
      // Build comprehensive conversation summary
      const recentMessages = history.slice(-8).map(msg => 
        `${msg.sender === 'user' ? 'Customer' : 'Assistant'}: ${msg.content} (${msg.sentiment || 'neutral'})`
      ).join('\n');

      const contextSummary = context
        .filter(ctx => new Date(ctx.expiresAt!) > new Date()) // Only non-expired context
        .map(ctx => `${ctx.contextType}: ${ctx.contextValue}`)
        .join(', ');

      // Extract user intent and topics from current message
      const messageAnalysis = await this.analyzeUserIntent(userMessage);
      
      // Build conversation state analysis
      const conversationState = {
        totalMessages: history.length,
        userMessages: history.filter(m => m.sender === 'user').length,
        aiMessages: history.filter(m => m.sender === 'ai').length,
        lastUserSentiment: history.filter(m => m.sender === 'user')[0]?.sentiment || 'neutral',
        recentTopics: history.slice(-5).flatMap(m => m.topics || []),
        isReturningCustomer: history.length > 3
      };
      
      const systemPrompt = `You are an intelligent social media assistant with perfect conversation memory. Respond naturally and contextually.

CONVERSATION ANALYSIS:
- Total messages exchanged: ${conversationState.totalMessages}
- Customer is ${conversationState.isReturningCustomer ? 'returning' : 'new'}
- Last sentiment: ${conversationState.lastUserSentiment}
- Current intent: ${messageAnalysis.intent}
- Key topics: ${messageAnalysis.topics.join(', ')}
- Previous topics discussed: ${conversationState.recentTopics.join(', ')}

RECENT CONVERSATION:
${recentMessages}

CUSTOMER CONTEXT: ${contextSummary}

CONVERSATION PATTERNS:
${conversationAnalysis.summary}

CRITICAL RULES:
- NEVER use generic phrases like "aap phir se khe rahe hai", "aap se baat karke acha laga"
- NEVER repeat similar greeting patterns
- Always respond specifically to what the user actually said
- Be direct and helpful, not overly polite
- Match the user's language and tone
- Give specific, relevant responses based on the actual message content

Customer Context: ${contextSummary}

Current Message Analysis:
- User said: "${userMessage}"
- Topics detected: ${messageAnalysis.topics.join(', ')}
- Urgency level: ${messageAnalysis.urgency}

Response Strategy:
${conversationState.totalMessages <= 1 ? 
  '- This is a new conversation, respond naturally to their specific message' : 
  '- Continue the ongoing conversation, reference previous context appropriately'
}
${conversationAnalysis.patterns.some(p => p.includes('generic')) ? 
  '- AVOID any greeting-related phrases, focus on content' : 
  '- Respond naturally without forced politeness'
}

Generate a relevant, specific response that directly addresses what they said based on the conversation history and analysis above.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      const aiResponse = response.choices[0].message.content || "I understand, thank you for your message!";
      console.log(`[MEMORY] Generated contextual response: ${aiResponse.substring(0, 50)}...`);
      
      return aiResponse;
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to generate contextual response:`, error);
      // Fallback response
      return "Thank you for your message! How can I help you today?";
    }
  }

  // Analyze conversation patterns and user behavior
  private analyzeConversationPatterns(history: DmMessage[]): { summary: string; patterns: string[] } {
    if (history.length === 0) {
      return { summary: "New conversation", patterns: [] };
    }

    const userMessages = history.filter(m => m.sender === 'user');
    const aiMessages = history.filter(m => m.sender === 'ai');
    
    const patterns = [];
    
    // Check for repeated topics
    const allTopics = history.flatMap(m => m.topics || []);
    const topicCounts = allTopics.reduce((acc, topic) => {
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const repeatedTopics = Object.entries(topicCounts)
      .filter(([_, count]) => count > 1)
      .map(([topic, _]) => topic);
      
    if (repeatedTopics.length > 0) {
      patterns.push(`Customer repeatedly asks about: ${repeatedTopics.join(', ')}`);
    }
    
    // Check sentiment progression
    const recentSentiments = userMessages.slice(-3).map(m => m.sentiment).filter(Boolean);
    if (recentSentiments.length >= 2) {
      const improving = recentSentiments.every((s, i) => i === 0 || s === 'positive' || recentSentiments[i-1] === 'negative');
      const declining = recentSentiments.every((s, i) => i === 0 || s === 'negative' || recentSentiments[i-1] === 'positive');
      
      if (improving) patterns.push("Customer sentiment is improving");
      if (declining) patterns.push("Customer sentiment is declining - needs attention");
    }
    
    // Check response patterns
    if (aiMessages.length > 1) {
      const genericResponses = aiMessages.filter(m => 
        m.content.includes('Thank you') || 
        m.content.includes('How can I help') ||
        m.content.includes('aap se baat karke')
      ).length;
      
      if (genericResponses > 1) {
        patterns.push("Too many generic responses - need more specific replies");
      }
    }

    const summary = patterns.length > 0 
      ? patterns.join('. ') 
      : `${userMessages.length} customer messages, ${aiMessages.length} responses. Ongoing conversation.`;
      
    return { summary, patterns };
  }

  // Analyze user intent from message
  private async analyzeUserIntent(message: string): Promise<{ intent: string; topics: string[]; urgency: string }> {
    try {
      const analysisPrompt = `Analyze this customer message for intent and key topics:

Message: "${message}"

Return JSON with:
{
  "intent": "question|complaint|request|information|greeting|other",
  "topics": ["topic1", "topic2"],
  "urgency": "low|medium|high"
}

Examples:
- "I need help with my order" → {"intent": "request", "topics": ["order", "help"], "urgency": "medium"}
- "When will this be delivered?" → {"intent": "question", "topics": ["delivery", "timing"], "urgency": "medium"}
- "This is not working at all!" → {"intent": "complaint", "topics": ["problem", "functionality"], "urgency": "high"}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        intent: result.intent || 'other',
        topics: Array.isArray(result.topics) ? result.topics.slice(0, 3) : [],
        urgency: result.urgency || 'low'
      };
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to analyze user intent:`, error);
      return { intent: 'other', topics: [], urgency: 'low' };
    }
  }

  // Extract key topics from user message for better context understanding
  private async extractMessageTopics(message: string): Promise<string[]> {
    try {
      const topicPrompt = `Extract 2-3 key topics from this message. Focus on specific subjects, not generic words.

Message: "${message}"

Return only a JSON array: ["topic1", "topic2", "topic3"]

Examples:
- "I need help with my order" → ["order", "help"]
- "When will my delivery arrive?" → ["delivery", "timing"]
- "Can you tell me about your services?" → ["services", "information"]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: topicPrompt }],
        max_tokens: 50,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '[]');
      return Array.isArray(result) ? result.slice(0, 3) : [];
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to extract topics:`, error);
      return [];
    }
  }

  // Analyze message using AI for sentiment and topic extraction
  private async analyzeMessage(content: string): Promise<{
    sentiment: string;
    topics: string[];
  }> {
    try {
      const analysisPrompt = `Analyze this customer message for sentiment and key topics.

Message: "${content}"

Respond in JSON format:
{
  "sentiment": "positive|negative|neutral",
  "topics": ["topic1", "topic2"]
}

Keep topics short (1-2 words) and relevant to customer service context.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: analysisPrompt }],
        max_tokens: 100,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      return {
        sentiment: analysis.sentiment || 'neutral',
        topics: Array.isArray(analysis.topics) ? analysis.topics.slice(0, 3) : []
      };
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to analyze message:`, error);
      return {
        sentiment: 'neutral',
        topics: []
      };
    }
  }

  // Extract and store conversation context
  private async extractAndStoreContext(
    conversationId: string | number,
    content: string,
    analysis: { sentiment: string; topics: string[] }
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.MEMORY_DURATION_DAYS);

      // Store sentiment as context
      if (analysis.sentiment !== 'neutral') {
        const sentimentContext = {
          conversationId: conversationId, // Let MongoDB storage handle the type conversion
          contextType: 'sentiment',
          contextValue: analysis.sentiment,
          confidence: 85,
          expiresAt
        };
        await this.storage.createConversationContext(sentimentContext);
      }

      // Store topics as context
      for (const topic of analysis.topics) {
        const topicContext = {
          conversationId: conversationId, // Let MongoDB storage handle the type conversion
          contextType: 'topic',
          contextValue: topic,
          confidence: 80,
          expiresAt
        };
        await this.storage.createConversationContext(topicContext);
      }

      // Extract intent/questions for better context
      if (content.includes('?') || content.toLowerCase().includes('help')) {
        const intentContext = {
          conversationId: conversationId, // Let MongoDB storage handle the type conversion
          contextType: 'intent',
          contextValue: content.includes('?') ? 'question' : 'help_request',
          confidence: 90,
          expiresAt
        };
        await this.storage.createConversationContext(intentContext);
      }

      console.log(`[MEMORY] Stored context for conversation ${conversationId}`);
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to store context:`, error);
    }
  }

  // Clean up expired conversation memory (3+ days old)
  async cleanupExpiredMemory(): Promise<void> {
    console.log(`[MEMORY CLEANUP] Starting cleanup of expired memory`);
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.MEMORY_DURATION_DAYS);
      
      await this.storage.cleanupExpiredContext(cutoffDate);
      await this.storage.cleanupOldMessages(cutoffDate);
      
      console.log(`[MEMORY CLEANUP] Cleaned up memory older than ${cutoffDate.toISOString()}`);
    } catch (error) {
      console.error(`[MEMORY CLEANUP ERROR] Failed to cleanup expired memory:`, error);
    }
  }

  // Get conversation statistics
  async getConversationStats(workspaceId: string): Promise<{
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    averageResponseTime: number;
  }> {
    try {
      return await this.storage.getConversationStats(workspaceId);
    } catch (error) {
      console.error(`[MEMORY ERROR] Failed to get conversation stats:`, error);
      return {
        totalConversations: 0,
        activeConversations: 0,
        totalMessages: 0,
        averageResponseTime: 0
      };
    }
  }
}