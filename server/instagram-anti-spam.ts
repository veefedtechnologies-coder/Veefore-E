import { AIResponseGenerator } from './ai-response-generator.js';

interface DelayConfig {
  min: number;
  max: number;
}

interface ResponsePattern {
  emoji: boolean;
  punctuation: boolean;
  capitalization: 'normal' | 'lower' | 'mixed';
  abbreviations: boolean;
}

/**
 * Advanced anti-spam system for Instagram automation
 * Implements human-like timing, response patterns, and behavior simulation
 */
export class InstagramAntiSpam {
  private aiGenerator: AIResponseGenerator;
  private responseHistory: Map<string, number> = new Map();
  private lastResponseTime: number = 0;
  private dailyResponseCount: number = 0;
  private lastResetDate: string = '';

  // Human-like timing patterns (in milliseconds)
  private timingPatterns = {
    shortComment: { min: 15000, max: 45000 }, // 15-45 seconds for short comments
    longComment: { min: 30000, max: 90000 },  // 30-90 seconds for longer comments
    busyPeriod: { min: 60000, max: 180000 },  // 1-3 minutes during busy periods
    naturalBreak: { min: 300000, max: 900000 } // 5-15 minute breaks occasionally
  };

  // Ultra-natural response templates that bypass spam detection
  private humanResponses = {
    price: ['DM', 'Inbox', 'Message me', 'Text'],
    greeting: ['Hey', 'Hi', 'Hello', 'Sup'],
    thanks: ['Thanks', 'Ty', '❤️', '🙏'],
    question: ['What', 'How', 'When', 'Details'],
    positive: ['Nice', 'Cool', 'Great', 'Love it'],
    simple: ['Yes', 'Ok', 'Sure', 'Right']
  };

  constructor() {
    this.aiGenerator = new AIResponseGenerator();
    this.resetDailyCountIfNeeded();
  }

  /**
   * Generate anti-spam response with human-like patterns
   */
  async generateAntiSpamResponse(
    comment: string, 
    username: string, 
    aiMode: string = 'contextual',
    personality: string = 'friendly',
    responseLength: string = 'medium'
  ): Promise<{ response: string; delay: number; shouldRespond: boolean }> {
    
    // Check daily limits (humans don't respond to everything)
    if (this.dailyResponseCount > 50) {
      return { response: '', delay: 0, shouldRespond: false };
    }

    // Sometimes skip responses to appear more human
    if (Math.random() < 0.3) { // 30% chance to not respond
      return { response: '', delay: 0, shouldRespond: false };
    }

    // Calculate human-like delay
    const delay = this.calculateHumanDelay(comment);

    // Generate ultra-short, natural response
    const response = await this.generateUltraNaturalResponse(comment, username);

    // Apply human-like text patterns
    const humanizedResponse = this.applyHumanPatterns(response);

    this.dailyResponseCount++;
    this.lastResponseTime = Date.now();

    return {
      response: humanizedResponse,
      delay,
      shouldRespond: true
    };
  }

  /**
   * Calculate human-like response delay based on comment complexity
   */
  private calculateHumanDelay(comment: string): number {
    const words = comment.split(' ').length;
    const timeSinceLastResponse = Date.now() - this.lastResponseTime;

    let delayRange: DelayConfig;

    // Choose delay based on comment length and timing
    if (words <= 3) {
      delayRange = this.timingPatterns.shortComment;
    } else if (words <= 10) {
      delayRange = this.timingPatterns.longComment;
    } else {
      delayRange = this.timingPatterns.busyPeriod;
    }

    // Add extra delay if responding too quickly
    if (timeSinceLastResponse < 30000) { // Less than 30 seconds
      delayRange = this.timingPatterns.busyPeriod;
    }

    // Occasionally take longer breaks to appear human
    if (Math.random() < 0.1) { // 10% chance for longer break
      delayRange = this.timingPatterns.naturalBreak;
    }

    // Generate random delay within range
    return Math.floor(Math.random() * (delayRange.max - delayRange.min) + delayRange.min);
  }

  /**
   * Generate ultra-natural, short responses that bypass spam detection
   */
  private async generateUltraNaturalResponse(comment: string, username: string): Promise<string> {
    const commentLower = comment.toLowerCase();

    // Use extremely short, natural responses
    if (commentLower.includes('price') || commentLower.includes('cost') || commentLower.includes('kitna')) {
      return this.getRandomResponse(this.humanResponses.price);
    }

    if (commentLower.includes('nice') || commentLower.includes('good') || commentLower.includes('great')) {
      return this.getRandomResponse(this.humanResponses.thanks);
    }

    if (commentLower.includes('where') || commentLower.includes('how') || commentLower.includes('when')) {
      return this.getRandomResponse(this.humanResponses.question);
    }

    if (commentLower.includes('hello') || commentLower.includes('hi') || commentLower.includes('hey')) {
      return this.getRandomResponse(this.humanResponses.greeting);
    }

    // Default to simple acknowledgment
    return this.getRandomResponse(this.humanResponses.simple);
  }

  /**
   * Apply human-like text patterns to make responses more natural
   */
  private applyHumanPatterns(response: string): string {
    let humanized = response;

    // Randomly apply human patterns
    const patterns = {
      lowerCase: Math.random() < 0.3, // 30% chance for lowercase
      removeEmoji: Math.random() < 0.5, // 50% chance to remove emojis
      addTypo: Math.random() < 0.1, // 10% chance for minor typo
      shortForm: Math.random() < 0.4 // 40% chance for abbreviations
    };

    // Apply lowercase sometimes
    if (patterns.lowerCase) {
      humanized = humanized.toLowerCase();
    }

    // Remove emojis sometimes to be more natural
    if (patterns.removeEmoji) {
      humanized = humanized.replace(/😀|😁|😂|😃|😄|😅|😆|😇|😈|😉|😊|😋|😌|😍|😎|😏/g, '');
    }

    // Use short forms
    if (patterns.shortForm) {
      humanized = humanized
        .replace('thanks', 'ty')
        .replace('okay', 'ok')
        .replace('you', 'u')
        .replace('your', 'ur');
    }

    // Add subtle typos occasionally (very sparingly)
    if (patterns.addTypo && humanized.length > 3) {
      const typos = {
        'the': 'teh',
        'you': 'u',
        'and': 'nd'
      };
      
      for (const [correct, typo] of Object.entries(typos)) {
        if (humanized.includes(correct) && Math.random() < 0.5) {
          humanized = humanized.replace(correct, typo);
          break; // Only one typo
        }
      }
    }

    return humanized.trim();
  }

  /**
   * Get random response from array
   */
  private getRandomResponse(responses: string[]): string {
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Reset daily response count if it's a new day
   */
  private resetDailyCountIfNeeded(): void {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyResponseCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Check if we should respond based on anti-spam rules
   */
  shouldRespond(comment: string, username: string): boolean {
    this.resetDailyCountIfNeeded();

    // Don't respond if we've hit daily limits
    if (this.dailyResponseCount >= 50) {
      return false;
    }

    // Don't respond too quickly after last response
    const timeSinceLastResponse = Date.now() - this.lastResponseTime;
    if (timeSinceLastResponse < 10000) { // Less than 10 seconds
      return false;
    }

    // Don't respond to very short comments sometimes
    if (comment.length < 5 && Math.random() < 0.5) {
      return false;
    }

    return true;
  }

  /**
   * Get current response statistics
   */
  getStats(): { dailyResponses: number; lastResponseTime: number } {
    return {
      dailyResponses: this.dailyResponseCount,
      lastResponseTime: this.lastResponseTime
    };
  }
}

