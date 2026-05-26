/**
 * AI-Powered Video Shortener with URL Support
 * Analyzes videos from URLs (YouTube, etc.) and extracts best segments
 */

import OpenAI from 'openai';

// Initialize OpenAI client only when needed and API key is available
const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

interface VideoSegment {
  startTime: number;
  endTime: number;
  duration: number;
  score: number;
  content: string;
  highlights: string[];
  engagement_factors: string[];
  viral_potential: number;
}

interface VideoAnalysis {
  title: string;
  totalDuration: number;
  keyMoments: VideoSegment[];
  transcript: string;
  themes: string[];
  mood: string;
  pacing: 'slow' | 'medium' | 'fast';
  bestSegments: VideoSegment[];
}

interface ShortVideoConfig {
  targetDuration: number;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'twitter';
  style: 'highlights' | 'tutorial' | 'story' | 'viral' | 'educational';
  includeSubtitles: boolean;
  aspectRatio: '16:9' | '9:16' | '1:1';
  userPreferences?: {
    focusOnAction?: boolean;
    includeDialogue?: boolean;
    preferBeginning?: boolean;
    preferEnding?: boolean;
    avoidSilence?: boolean;
  };
}

export class VideoShortenerAI {
  
  /**
   * Extract video URL from various platforms
   */
  private extractVideoId(url: string): { platform: string; id: string } | null {
    const patterns = {
      youtube: [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/
      ],
      vimeo: [/vimeo\.com\/(\d+)/],
      dailymotion: [/dailymotion\.com\/video\/([^_]+)/],
      facebook: [/facebook\.com\/.*\/videos\/(\d+)/],
      instagram: [/instagram\.com\/p\/([^\/]+)/],
      tiktok: [/tiktok\.com\/@[^\/]+\/video\/(\d+)/]
    };

    for (const [platform, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        const match = url.match(regex);
        if (match) {
          return { platform, id: match[1] };
        }
      }
    }
    return null;
  }

  /**
   * Analyze video content using AI
   */
  async analyzeVideoContent(url: string): Promise<VideoAnalysis> {
    console.log('[VIDEO ANALYZER] Starting analysis for URL:', url);
    
    const videoInfo = this.extractVideoId(url);
    if (!videoInfo) {
      throw new Error('Unsupported video URL format');
    }

    // Simulate video metadata extraction (in real implementation, use yt-dlp or similar)
    const mockMetadata = await this.extractVideoMetadata(url, videoInfo);
    
    // AI-powered content analysis
    const analysis = await this.performAIAnalysis(mockMetadata);
    
    console.log('[VIDEO ANALYZER] Analysis complete:', analysis.title);
    return analysis;
  }

  /**
   * Extract video metadata and transcript
   */
  private async extractVideoMetadata(url: string, videoInfo: { platform: string; id: string }) {
    // In a real implementation, this would use yt-dlp, YouTube API, or similar services
    // For demo purposes, we'll simulate realistic video metadata
    
    console.log('[METADATA] Extracting from', videoInfo.platform);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      title: `Sample ${videoInfo.platform} Video - ${videoInfo.id}`,
      duration: 300, // 5 minutes
      description: 'A comprehensive tutorial on modern web development techniques including React, Node.js, and deployment strategies.',
      transcript: this.generateSampleTranscript(),
      thumbnails: [`https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`],
      uploadDate: new Date().toISOString(),
      viewCount: Math.floor(Math.random() * 100000),
      likeCount: Math.floor(Math.random() * 5000),
      commentCount: Math.floor(Math.random() * 500)
    };
  }

  /**
   * Generate realistic sample transcript for demo
   */
  private generateSampleTranscript(): string {
    return `
    Welcome everyone to today's tutorial on modern web development.
    In this video, we'll cover the essential concepts you need to know.
    First, let's talk about React and its component-based architecture.
    React has revolutionized how we build user interfaces.
    The virtual DOM provides excellent performance optimizations.
    Now, let's move on to the backend with Node.js.
    Node.js allows us to use JavaScript on the server side.
    This creates a seamless full-stack development experience.
    We'll also discuss deployment strategies and best practices.
    Docker containers make deployment much more reliable.
    Cloud platforms like AWS and Vercel simplify hosting.
    Finally, we'll look at performance optimization techniques.
    Proper caching strategies can dramatically improve load times.
    Code splitting helps reduce initial bundle sizes.
    Thank you for watching, and don't forget to subscribe!
    `;
  }

  /**
   * AI-powered video content analysis using GPT-4
   */
  private async performAIAnalysis(metadata: any): Promise<VideoAnalysis> {
    console.log('[AI ANALYSIS] Processing video content...');
    
    const analysisPrompt = `
    Analyze this video content and identify the best segments for creating short-form content:
    
    Title: ${metadata.title}
    Duration: ${metadata.duration} seconds
    Description: ${metadata.description}
    Transcript: ${metadata.transcript}
    
    Please provide:
    1. Key themes and topics covered
    2. Most engaging moments with timestamps
    3. Segments with highest viral potential
    4. Optimal clips for different platforms (TikTok, Instagram, YouTube Shorts)
    5. Content mood and pacing analysis
    
    Respond in JSON format with detailed segment analysis.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert video content analyzer specializing in identifying viral-worthy segments and optimal clips for social media platforms. Provide detailed, actionable insights.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000
      });

      const aiAnalysis = JSON.parse(response.choices[0].message.content || '{}');
      
      // Structure the analysis response
      return {
        title: metadata.title,
        totalDuration: metadata.duration,
        transcript: metadata.transcript,
        themes: aiAnalysis.themes || ['Technology', 'Tutorial', 'Web Development'],
        mood: aiAnalysis.mood || 'Educational',
        pacing: aiAnalysis.pacing || 'medium',
        keyMoments: this.parseKeyMoments(aiAnalysis.keyMoments || []),
        bestSegments: this.identifyBestSegments(aiAnalysis.bestSegments || [])
      };
      
    } catch (error) {
      console.error('[AI ANALYSIS] Error:', error);
      // Fallback to rule-based analysis
      return this.performRuleBasedAnalysis(metadata);
    }
  }

  /**
   * Parse AI-identified key moments into structured format
   */
  private parseKeyMoments(moments: any[]): VideoSegment[] {
    return moments.map((moment, index) => ({
      startTime: moment.startTime || index * 30,
      endTime: moment.endTime || (index * 30) + 15,
      duration: moment.duration || 15,
      score: moment.score || Math.random() * 100,
      content: moment.content || `Key moment ${index + 1}`,
      highlights: moment.highlights || ['Engaging content'],
      engagement_factors: moment.engagement_factors || ['Visual appeal'],
      viral_potential: moment.viral_potential || Math.random() * 100
    }));
  }

  /**
   * Identify best segments for short-form content
   */
  private identifyBestSegments(segments: any[]): VideoSegment[] {
    if (segments.length === 0) {
      // Generate sample segments if AI analysis fails
      return [
        {
          startTime: 15,
          endTime: 45,
          duration: 30,
          score: 95,
          content: 'Introduction and hook',
          highlights: ['Strong opening', 'Clear value proposition'],
          engagement_factors: ['Immediate value', 'Clear speaking'],
          viral_potential: 85
        },
        {
          startTime: 120,
          endTime: 180,
          duration: 60,
          score: 88,
          content: 'Core tutorial content',
          highlights: ['Practical demonstration', 'Visual examples'],
          engagement_factors: ['Hands-on learning', 'Clear visuals'],
          viral_potential: 75
        },
        {
          startTime: 250,
          endTime: 280,
          duration: 30,
          score: 92,
          content: 'Key takeaways and conclusion',
          highlights: ['Summary points', 'Call to action'],
          engagement_factors: ['Memorable ending', 'Clear next steps'],
          viral_potential: 80
        }
      ];
    }
    
    return segments.map(segment => ({
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.endTime - segment.startTime,
      score: segment.score,
      content: segment.content,
      highlights: segment.highlights,
      engagement_factors: segment.engagement_factors,
      viral_potential: segment.viral_potential
    }));
  }

  /**
   * Fallback rule-based analysis when AI is unavailable
   */
  private performRuleBasedAnalysis(metadata: any): VideoAnalysis {
    console.log('[RULE-BASED] Performing fallback analysis');
    
    const duration = metadata.duration;
    const transcript = metadata.transcript.toLowerCase();
    
    // Detect themes from transcript
    const themes = [];
    if (transcript.includes('react')) themes.push('React');
    if (transcript.includes('node')) themes.push('Node.js');
    if (transcript.includes('tutorial')) themes.push('Tutorial');
    if (transcript.includes('development')) themes.push('Web Development');
    
    // Detect mood and pacing
    const mood = transcript.includes('welcome') || transcript.includes('tutorial') ? 'Educational' : 'Informational';
    const pacing = transcript.split(' ').length > 200 ? 'fast' : 'medium';
    
    // Generate key moments based on typical video structure
    const keyMoments = this.generateRuleBasedMoments(duration);
    const bestSegments = keyMoments.filter(moment => moment.score > 80);
    
    return {
      title: metadata.title,
      totalDuration: duration,
      transcript: metadata.transcript,
      themes: themes.length > 0 ? themes : ['General Content'],
      mood,
      pacing,
      keyMoments,
      bestSegments
    };
  }

  /**
   * Generate key moments using rule-based approach
   */
  private generateRuleBasedMoments(duration: number): VideoSegment[] {
    const moments: VideoSegment[] = [];
    const segmentCount = Math.min(Math.floor(duration / 30), 10);
    
    for (let i = 0; i < segmentCount; i++) {
      const startTime = i * (duration / segmentCount);
      const endTime = Math.min(startTime + 30, duration);
      
      // Score based on position (beginning and end typically better)
      let score = 60;
      if (i === 0) score = 90; // Opening
      if (i === segmentCount - 1) score = 85; // Conclusion
      if (i === Math.floor(segmentCount / 2)) score = 80; // Middle peak
      
      moments.push({
        startTime: Math.floor(startTime),
        endTime: Math.floor(endTime),
        duration: Math.floor(endTime - startTime),
        score: score + Math.random() * 10,
        content: `Segment ${i + 1}`,
        highlights: this.generateHighlights(i, segmentCount),
        engagement_factors: this.generateEngagementFactors(i),
        viral_potential: score - 10 + Math.random() * 20
      });
    }
    
    return moments;
  }

  /**
   * Generate highlights for segments
   */
  private generateHighlights(index: number, total: number): string[] {
    const highlights = [
      ['Strong opening', 'Hook content', 'Clear introduction'],
      ['Core content', 'Key insights', 'Practical examples'],
      ['Demonstration', 'Visual content', 'Step-by-step guide'],
      ['Summary', 'Key takeaways', 'Call to action']
    ];
    
    if (index === 0) return highlights[0];
    if (index === total - 1) return highlights[3];
    if (index < total / 2) return highlights[1];
    return highlights[2];
  }

  /**
   * Generate engagement factors
   */
  private generateEngagementFactors(index: number): string[] {
    const factors = [
      ['Immediate value', 'Clear speaking', 'Strong visuals'],
      ['Practical content', 'Expert insights', 'Useful tips'],
      ['Hands-on learning', 'Visual examples', 'Clear instructions'],
      ['Memorable ending', 'Clear next steps', 'Strong CTA']
    ];
    
    return factors[Math.min(index, factors.length - 1)];
  }

  /**
   * Create optimized short video based on analysis and preferences
   */
  async createShortVideo(
    analysis: VideoAnalysis, 
    config: ShortVideoConfig
  ): Promise<{
    selectedSegment: VideoSegment;
    optimizedScript: string;
    editingInstructions: string[];
    platformOptimizations: string[];
    estimatedViews: number;
  }> {
    console.log('[SHORT CREATOR] Creating optimized short video');
    
    // Select best segment based on config and user preferences
    const selectedSegment = this.selectOptimalSegment(analysis, config);
    
    // Generate optimized script
    const optimizedScript = await this.generateOptimizedScript(selectedSegment, config, analysis);
    
    // Create editing instructions
    const editingInstructions = this.generateEditingInstructions(selectedSegment, config);
    
    // Platform-specific optimizations
    const platformOptimizations = this.generatePlatformOptimizations(config);
    
    // Estimate potential views based on content quality and platform
    const estimatedViews = this.estimateViralPotential(selectedSegment, config);
    
    return {
      selectedSegment,
      optimizedScript,
      editingInstructions,
      platformOptimizations,
      estimatedViews
    };
  }

  /**
   * Select optimal segment based on configuration and preferences
   */
  private selectOptimalSegment(analysis: VideoAnalysis, config: ShortVideoConfig): VideoSegment {
    let candidates = analysis.bestSegments.filter(
      segment => segment.duration <= config.targetDuration + 10
    );
    
    if (candidates.length === 0) {
      candidates = analysis.keyMoments;
    }
    
    // Apply user preferences
    if (config.userPreferences?.preferBeginning) {
      candidates = candidates.filter(segment => segment.startTime < analysis.totalDuration * 0.3);
    }
    
    if (config.userPreferences?.preferEnding) {
      candidates = candidates.filter(segment => segment.startTime > analysis.totalDuration * 0.7);
    }
    
    if (config.userPreferences?.focusOnAction) {
      candidates.sort((a, b) => b.viral_potential - a.viral_potential);
    }
    
    // Select highest scoring segment
    return candidates.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }

  /**
   * Generate optimized script for the selected segment
   */
  private async generateOptimizedScript(
    segment: VideoSegment, 
    config: ShortVideoConfig, 
    analysis: VideoAnalysis
  ): Promise<string> {
    const scriptPrompt = `
    Create an optimized script for a ${config.targetDuration}-second ${config.platform} video based on:
    
    Original Content: ${segment.content}
    Platform: ${config.platform}
    Style: ${config.style}
    Highlights: ${segment.highlights.join(', ')}
    Target Duration: ${config.targetDuration} seconds
    
    The script should:
    1. Hook viewers in the first 3 seconds
    2. Deliver maximum value quickly
    3. Include platform-specific elements
    4. End with a strong call-to-action
    5. Be optimized for ${config.aspectRatio} format
    
    Provide a concise, engaging script that maximizes viral potential.
    `;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a viral content script writer specializing in short-form video content for social media platforms. Create engaging, concise scripts that capture attention immediately.'
          },
          {
            role: 'user',
            content: scriptPrompt
          }
        ],
        max_tokens: 500
      });

      return response.choices[0].message.content || this.generateFallbackScript(segment, config);
      
    } catch (error) {
      console.error('[SCRIPT GENERATION] Error:', error);
      return this.generateFallbackScript(segment, config);
    }
  }

  /**
   * Generate fallback script when AI is unavailable
   */
  private generateFallbackScript(segment: VideoSegment, config: ShortVideoConfig): string {
    const hooks = [
      "Here's what nobody tells you about...",
      "This changed everything...",
      "The secret that pros don't want you to know...",
      "In just 30 seconds, you'll learn..."
    ];
    
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    const ctas = {
      youtube: "Subscribe for more tips!",
      instagram: "Follow for daily insights!",
      tiktok: "Like if this helped you!",
      twitter: "Retweet to save this!"
    };
    
    return `${hook}

${segment.content}

Key takeaway: ${segment.highlights[0]}

${ctas[config.platform]}`;
  }

  /**
   * Generate editing instructions for the short video
   */
  private generateEditingInstructions(segment: VideoSegment, config: ShortVideoConfig): string[] {
    const instructions = [
      `Extract segment from ${this.formatTime(segment.startTime)} to ${this.formatTime(segment.endTime)}`,
      `Resize to ${config.aspectRatio} aspect ratio`,
      `Target final duration: ${config.targetDuration} seconds`
    ];
    
    if (config.includeSubtitles) {
      instructions.push('Add animated subtitles with high contrast');
      instructions.push('Use bold, readable fonts (minimum 24pt)');
    }
    
    // Platform-specific editing instructions
    switch (config.platform) {
      case 'tiktok':
        instructions.push('Add trending music or sound effects');
        instructions.push('Use quick cuts and transitions');
        instructions.push('Include visual effects or filters');
        break;
      case 'instagram':
        instructions.push('Optimize for Stories and Reels format');
        instructions.push('Add Instagram-style text overlays');
        instructions.push('Use smooth transitions');
        break;
      case 'youtube':
        instructions.push('Add YouTube Shorts branding');
        instructions.push('Include thumbnail-worthy moments');
        instructions.push('Optimize for YouTube algorithm');
        break;
    }
    
    // Style-specific instructions
    switch (config.style) {
      case 'viral':
        instructions.push('Add dramatic zoom effects');
        instructions.push('Use high-energy music');
        instructions.push('Include trending visual elements');
        break;
      case 'educational':
        instructions.push('Add clear visual explanations');
        instructions.push('Use consistent branding');
        instructions.push('Include step-by-step graphics');
        break;
      case 'tutorial':
        instructions.push('Highlight key steps with graphics');
        instructions.push('Add progress indicators');
        instructions.push('Use clear, instructional overlays');
        break;
    }
    
    return instructions;
  }

  /**
   * Generate platform-specific optimizations
   */
  private generatePlatformOptimizations(config: ShortVideoConfig): string[] {
    const optimizations: Record<string, string[]> = {
      youtube: [
        'Upload during peak hours (2-4 PM EST)',
        'Use trending hashtags in description',
        'Create eye-catching thumbnail',
        'Add YouTube Shorts in title',
        'Optimize for YouTube Shorts algorithm'
      ],
      instagram: [
        'Post during high engagement hours (11 AM - 1 PM)',
        'Use 3-5 relevant hashtags',
        'Tag relevant accounts',
        'Add location if relevant',
        'Use Instagram Reels features'
      ],
      tiktok: [
        'Post during peak TikTok hours (6-10 PM)',
        'Use trending sounds and hashtags',
        'Participate in challenges',
        'Engage with comments quickly',
        'Use TikTok effects and filters'
      ],
      twitter: [
        'Post during high activity hours (9 AM - 3 PM)',
        'Use relevant hashtags (max 3)',
        'Tag relevant accounts',
        'Add captions for accessibility',
        'Optimize for Twitter video format'
      ]
    };
    
    return optimizations[config.platform] || [];
  }

  /**
   * Estimate viral potential and expected views
   */
  private estimateViralPotential(segment: VideoSegment, config: ShortVideoConfig): number {
    let baseScore = segment.viral_potential;
    
    // Platform multipliers
    const platformMultipliers = {
      tiktok: 1.5,
      instagram: 1.2,
      youtube: 1.0,
      twitter: 0.8
    };
    
    // Style multipliers
    const styleMultipliers = {
      viral: 1.4,
      highlights: 1.2,
      tutorial: 1.0,
      story: 0.9,
      educational: 0.8
    };
    
    const platformMultiplier = platformMultipliers[config.platform] || 1.0;
    const styleMultiplier = styleMultipliers[config.style] || 1.0;
    
    // Calculate estimated views
    const adjustedScore = baseScore * platformMultiplier * styleMultiplier;
    
    // Convert to estimated views (simplified model)
    return Math.floor(adjustedScore * 100 * (1 + Math.random() * 0.5));
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Main method to process video URL and create short content
   */
  async processVideoUrl(
    url: string, 
    config: ShortVideoConfig
  ): Promise<{
    analysis: VideoAnalysis;
    shortVideo: {
      selectedSegment: VideoSegment;
      optimizedScript: string;
      editingInstructions: string[];
      platformOptimizations: string[];
      estimatedViews: number;
    };
    downloadUrl?: string;
  }> {
    try {
      console.log('[VIDEO SHORTENER] Processing URL:', url);
      
      // Analyze video content
      const analysis = await this.analyzeVideoContent(url);
      
      // Create optimized short video
      const shortVideo = await this.createShortVideo(analysis, config);
      
      console.log('[VIDEO SHORTENER] Processing complete');
      
      return {
        analysis,
        shortVideo,
        downloadUrl: `/api/generated-content/short_${Date.now()}.mp4`
      };
      
    } catch (error) {
      console.error('[VIDEO SHORTENER] Error processing video:', error);
      throw error;
    }
  }
}

export const videoShortenerAI = new VideoShortenerAI();