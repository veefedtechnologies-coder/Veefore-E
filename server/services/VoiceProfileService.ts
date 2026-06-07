import { Collection, Db, MongoClient } from 'mongodb';

export interface VoiceProfile {
  userId: string;
  workspaceId: string;
  
  // Voice Characteristics
  vocabularyFrequency: Record<string, number>;  // Word → frequency
  signaturePhrases: string[];                   // e.g., ["let's be real", "here's the thing"]
  sentenceLengthDistribution: {
    short: number;   // 1-5 words (percentage)
    medium: number;  // 6-15 words (percentage)
    long: number;    // 16+ words (percentage)
  };
  paragraphStructure: 'single' | 'short-breaks' | 'long-form';
  
  // Emoji & Punctuation
  emojiUsagePattern: {
    frequency: 'none' | 'minimal' | 'moderate' | 'heavy';
    placement: 'inline' | 'end' | 'both';
    topEmojis: string[];  // Most used emojis
  };
  punctuationStyle: {
    exclamationUsage: 'rare' | 'moderate' | 'frequent';
    questionUsage: 'rare' | 'moderate' | 'frequent';
    ellipsisUsage: boolean;
  };
  
  // Tone & Style
  toneMarkers: {
    casual: number;      // 0-1 score
    professional: number;
    humorous: number;
    inspirational: number;
    educational: number;
    conversational: number;
  };
  
  // Pattern Recognition
  hookPatterns: string[];              // Opening sentence structures
  engagementQuestionStyle: string[];   // How they ask questions
  storytellingStructure: 'linear' | 'flashback' | 'buildup' | 'revelation';
  
  // Metadata
  sampleSize: number;          // Number of captions analyzed
  confidence: number;          // 0-1 accuracy score
  lastUpdated: Date;
  createdAt: Date;
}

export class VoiceProfileService {
  private db: Db;
  private collection: Collection<VoiceProfile>;

  constructor(mongoClient: MongoClient, dbName: string) {
    this.db = mongoClient.db(dbName);
    this.collection = this.db.collection<VoiceProfile>('voiceprofiles');
  }

  /**
   * Analyze user's sample captions to create voice profile
   */
  async analyzeAndCreateProfile(
    userId: string,
    workspaceId: string,
    sampleCaptions: string[]
  ): Promise<VoiceProfile> {
    // Validate input
    if (!sampleCaptions || sampleCaptions.length < 5) {
      throw new Error('At least 5 sample captions are required for voice profile analysis');
    }

    // Extract voice characteristics from captions
    const vocabularyFrequency = this.extractVocabularyFrequency(sampleCaptions);
    const signaturePhrases = this.extractSignaturePhrases(sampleCaptions);
    const sentenceLengthDistribution = this.analyzeSentenceLengthDistribution(sampleCaptions);
    const paragraphStructure = this.detectParagraphStructure(sampleCaptions);
    const emojiUsagePattern = this.analyzeEmojiUsage(sampleCaptions);
    const punctuationStyle = this.analyzePunctuationStyle(sampleCaptions);
    const toneMarkers = this.analyzeToneMarkers(sampleCaptions);
    const hookPatterns = this.extractHookPatterns(sampleCaptions);
    const engagementQuestionStyle = this.extractEngagementQuestions(sampleCaptions);
    const storytellingStructure = this.detectStorytellingStructure(sampleCaptions);

    // Calculate confidence based on sample size and pattern consistency
    const confidence = Math.min(0.85 + (sampleCaptions.length - 5) * 0.02, 0.98);

    const voiceProfile: VoiceProfile = {
      userId,
      workspaceId,
      vocabularyFrequency,
      signaturePhrases,
      sentenceLengthDistribution,
      paragraphStructure,
      emojiUsagePattern,
      punctuationStyle,
      toneMarkers,
      hookPatterns,
      engagementQuestionStyle,
      storytellingStructure,
      sampleSize: sampleCaptions.length,
      confidence,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };

    // Store in database (upsert)
    await this.collection.updateOne(
      { userId, workspaceId },
      { $set: voiceProfile },
      { upsert: true }
    );

    return voiceProfile;
  }

  /**
   * Get existing voice profile or return default
   */
  async getProfile(userId: string, workspaceId: string): Promise<VoiceProfile> {
    const profile = await this.collection.findOne({ userId, workspaceId });

    if (profile) {
      return profile;
    }

    // Return default profile
    return this.getDefaultProfile(userId, workspaceId);
  }

  /**
   * Update profile based on user edits
   * Analyzes the differences between original and edited captions to learn preferences
   */
  async updateFromEdit(
    userId: string,
    workspaceId: string,
    originalCaption: string,
    editedCaption: string
  ): Promise<void> {
    const profile = await this.getProfile(userId, workspaceId);
    
    // If no existing profile (default profile), don't update from single edit
    if (profile.sampleSize === 0) {
      return;
    }

    // Analyze what changed between original and edited
    const originalWords = this.tokenize(originalCaption.toLowerCase());
    const editedWords = this.tokenize(editedCaption.toLowerCase());
    
    // Track vocabulary changes (words added in edited version)
    const addedWords = editedWords.filter(word => !originalWords.includes(word));
    const removedWords = originalWords.filter(word => !editedWords.includes(word));
    
    // Update vocabulary frequency with weighted adjustments
    const vocabularyUpdates: Record<string, number> = { ...profile.vocabularyFrequency };
    
    // Boost frequency for added words (user prefers these)
    addedWords.forEach(word => {
      if (word.length > 2) {
        const currentFreq = vocabularyUpdates[word] || 0;
        // Increase by 0.005 (weighted adjustment)
        vocabularyUpdates[word] = currentFreq + 0.005;
      }
    });
    
    // Slightly reduce frequency for removed words (user dislikes these)
    removedWords.forEach(word => {
      if (word.length > 2 && vocabularyUpdates[word]) {
        vocabularyUpdates[word] = Math.max(0, vocabularyUpdates[word] - 0.003);
      }
    });

    // Analyze emoji changes
    const originalEmojis = this.extractEmojis(originalCaption);
    const editedEmojis = this.extractEmojis(editedCaption);
    
    let emojiUpdates = { ...profile.emojiUsagePattern };
    
    if (editedEmojis.length > originalEmojis.length) {
      // User added emojis - shift frequency higher
      if (emojiUpdates.frequency === 'none') emojiUpdates.frequency = 'minimal';
      else if (emojiUpdates.frequency === 'minimal') emojiUpdates.frequency = 'moderate';
    } else if (editedEmojis.length < originalEmojis.length) {
      // User removed emojis - shift frequency lower
      if (emojiUpdates.frequency === 'heavy') emojiUpdates.frequency = 'moderate';
      else if (emojiUpdates.frequency === 'moderate') emojiUpdates.frequency = 'minimal';
    }
    
    // Update top emojis with newly added ones
    editedEmojis.forEach(emoji => {
      if (!emojiUpdates.topEmojis.includes(emoji)) {
        emojiUpdates.topEmojis.push(emoji);
        // Keep only top 10
        if (emojiUpdates.topEmojis.length > 10) {
          emojiUpdates.topEmojis = emojiUpdates.topEmojis.slice(0, 10);
        }
      }
    });

    // Analyze sentence length changes
    const originalSentences = this.splitSentences(originalCaption);
    const editedSentences = this.splitSentences(editedCaption);
    
    let sentenceLengthUpdates = { ...profile.sentenceLengthDistribution };
    
    if (editedSentences.length > 0) {
      const avgOriginalLength = originalSentences.reduce((sum, s) => 
        sum + this.tokenize(s).length, 0) / originalSentences.length;
      const avgEditedLength = editedSentences.reduce((sum, s) => 
        sum + this.tokenize(s).length, 0) / editedSentences.length;
      
      // If user made sentences shorter, adjust distribution
      if (avgEditedLength < avgOriginalLength - 2) {
        sentenceLengthUpdates.short = Math.min(100, sentenceLengthUpdates.short + 3);
        sentenceLengthUpdates.long = Math.max(0, sentenceLengthUpdates.long - 3);
        sentenceLengthUpdates.medium = 100 - sentenceLengthUpdates.short - sentenceLengthUpdates.long;
      } else if (avgEditedLength > avgOriginalLength + 2) {
        // User made sentences longer
        sentenceLengthUpdates.long = Math.min(100, sentenceLengthUpdates.long + 3);
        sentenceLengthUpdates.short = Math.max(0, sentenceLengthUpdates.short - 3);
        sentenceLengthUpdates.medium = 100 - sentenceLengthUpdates.short - sentenceLengthUpdates.long;
      }
    }

    // Analyze punctuation changes
    const punctuationUpdates = { ...profile.punctuationStyle };
    
    const originalExclamations = (originalCaption.match(/!/g) || []).length;
    const editedExclamations = (editedCaption.match(/!/g) || []).length;
    
    if (editedExclamations > originalExclamations && punctuationUpdates.exclamationUsage === 'rare') {
      punctuationUpdates.exclamationUsage = 'moderate';
    } else if (editedExclamations < originalExclamations && punctuationUpdates.exclamationUsage === 'frequent') {
      punctuationUpdates.exclamationUsage = 'moderate';
    }
    
    const originalQuestions = (originalCaption.match(/\?/g) || []).length;
    const editedQuestions = (editedCaption.match(/\?/g) || []).length;
    
    if (editedQuestions > originalQuestions && punctuationUpdates.questionUsage === 'rare') {
      punctuationUpdates.questionUsage = 'moderate';
    } else if (editedQuestions < originalQuestions && punctuationUpdates.questionUsage === 'frequent') {
      punctuationUpdates.questionUsage = 'moderate';
    }
    
    if (!profile.punctuationStyle.ellipsisUsage && editedCaption.includes('...')) {
      punctuationUpdates.ellipsisUsage = true;
    }

    // Extract new signature phrases from edited caption
    const editedPhrases = this.extractPhrasesFromSingleCaption(editedCaption);
    const updatedSignaturePhrases = [...profile.signaturePhrases];
    
    editedPhrases.forEach(phrase => {
      if (!updatedSignaturePhrases.includes(phrase) && updatedSignaturePhrases.length < 20) {
        updatedSignaturePhrases.push(phrase);
      }
    });

    // Apply incremental updates to profile
    await this.collection.updateOne(
      { userId, workspaceId },
      {
        $set: {
          vocabularyFrequency: vocabularyUpdates,
          signaturePhrases: updatedSignaturePhrases,
          sentenceLengthDistribution: sentenceLengthUpdates,
          emojiUsagePattern: emojiUpdates,
          punctuationStyle: punctuationUpdates,
          lastUpdated: new Date(),
        }
      }
    );
  }

  /**
   * Update profile based on caption selection
   * Learns from which variations user chooses and which they reject
   */
  async updateFromSelection(
    userId: string,
    workspaceId: string,
    selectedCaption: string,
    rejectedCaptions: string[]
  ): Promise<void> {
    const profile = await this.getProfile(userId, workspaceId);
    
    // If no existing profile (default profile), create one from selected caption
    // Allow single caption for initial profile creation from selection
    if (profile.sampleSize === 0) {
      // Create a minimal profile by repeating the caption to meet the 5 caption requirement
      const repeatedCaptions = Array(5).fill(selectedCaption);
      await this.analyzeAndCreateProfile(userId, workspaceId, repeatedCaptions);
      return;
    }

    // Analyze selected caption to identify preferred patterns
    const selectedWords = this.tokenize(selectedCaption.toLowerCase());
    const selectedEmojis = this.extractEmojis(selectedCaption);
    const selectedSentences = this.splitSentences(selectedCaption);
    
    // Boost vocabulary from selected caption
    const vocabularyUpdates: Record<string, number> = { ...profile.vocabularyFrequency };
    
    selectedWords.forEach(word => {
      if (word.length > 2) {
        const currentFreq = vocabularyUpdates[word] || 0;
        vocabularyUpdates[word] = currentFreq + 0.003; // Boost selected words
      }
    });

    // Analyze rejected captions to identify disliked patterns
    rejectedCaptions.forEach(rejectedCaption => {
      const rejectedWords = this.tokenize(rejectedCaption.toLowerCase());
      
      // Identify words unique to rejected captions (not in selected)
      const uniqueRejectedWords = rejectedWords.filter(word => 
        !selectedWords.includes(word) && word.length > 2
      );
      
      // Slightly reduce frequency for rejected unique words
      uniqueRejectedWords.forEach(word => {
        if (vocabularyUpdates[word]) {
          vocabularyUpdates[word] = Math.max(0, vocabularyUpdates[word] - 0.002);
        }
      });
    });

    // Update emoji preferences based on selection
    let emojiUpdates = { ...profile.emojiUsagePattern };
    
    selectedEmojis.forEach(emoji => {
      if (!emojiUpdates.topEmojis.includes(emoji)) {
        // Add to front (most preferred)
        emojiUpdates.topEmojis.unshift(emoji);
        if (emojiUpdates.topEmojis.length > 10) {
          emojiUpdates.topEmojis.pop(); // Remove least preferred
        }
      } else {
        // Move to front if already present
        const index = emojiUpdates.topEmojis.indexOf(emoji);
        emojiUpdates.topEmojis.splice(index, 1);
        emojiUpdates.topEmojis.unshift(emoji);
      }
    });

    // Analyze tone of selected vs rejected
    const selectedTone = this.analyzeToneMarkers([selectedCaption]);
    const toneUpdates = { ...profile.toneMarkers };
    
    // Blend selected tone into profile (weighted 20% toward selected)
    Object.keys(toneUpdates).forEach(key => {
      const toneKey = key as keyof typeof toneUpdates;
      toneUpdates[toneKey] = (
        toneUpdates[toneKey] * 0.8 + 
        selectedTone[toneKey] * 0.2
      );
    });

    // Extract hook pattern from selected caption
    const selectedHook = this.extractHookFromCaption(selectedCaption);
    const updatedHookPatterns = [...profile.hookPatterns];
    
    if (selectedHook && !updatedHookPatterns.includes(selectedHook)) {
      // Add to front (most preferred)
      updatedHookPatterns.unshift(selectedHook);
      if (updatedHookPatterns.length > 20) {
        updatedHookPatterns.pop();
      }
    }

    // Extract engagement question from selected caption
    const selectedQuestion = this.extractQuestionFromCaption(selectedCaption);
    const updatedQuestionStyles = [...profile.engagementQuestionStyle];
    
    if (selectedQuestion && !updatedQuestionStyles.includes(selectedQuestion)) {
      updatedQuestionStyles.unshift(selectedQuestion);
      if (updatedQuestionStyles.length > 15) {
        updatedQuestionStyles.pop();
      }
    }

    // Analyze sentence length preference from selection
    let sentenceLengthUpdates = { ...profile.sentenceLengthDistribution };
    
    if (selectedSentences.length > 0) {
      const avgSelectedLength = selectedSentences.reduce((sum, s) => 
        sum + this.tokenize(s).length, 0) / selectedSentences.length;
      
      // Calculate average rejected sentence length
      let totalRejectedLength = 0;
      let rejectedSentenceCount = 0;
      
      rejectedCaptions.forEach(rejected => {
        const sentences = this.splitSentences(rejected);
        sentences.forEach(s => {
          totalRejectedLength += this.tokenize(s).length;
          rejectedSentenceCount++;
        });
      });
      
      if (rejectedSentenceCount > 0) {
        const avgRejectedLength = totalRejectedLength / rejectedSentenceCount;
        
        // If selected has shorter sentences than rejected, boost short
        if (avgSelectedLength < avgRejectedLength - 2) {
          sentenceLengthUpdates.short = Math.min(100, sentenceLengthUpdates.short + 2);
          sentenceLengthUpdates.long = Math.max(0, sentenceLengthUpdates.long - 2);
          sentenceLengthUpdates.medium = 100 - sentenceLengthUpdates.short - sentenceLengthUpdates.long;
        } else if (avgSelectedLength > avgRejectedLength + 2) {
          sentenceLengthUpdates.long = Math.min(100, sentenceLengthUpdates.long + 2);
          sentenceLengthUpdates.short = Math.max(0, sentenceLengthUpdates.short - 2);
          sentenceLengthUpdates.medium = 100 - sentenceLengthUpdates.short - sentenceLengthUpdates.long;
        }
      }
    }

    // Apply incremental updates
    await this.collection.updateOne(
      { userId, workspaceId },
      {
        $set: {
          vocabularyFrequency: vocabularyUpdates,
          emojiUsagePattern: emojiUpdates,
          toneMarkers: toneUpdates,
          hookPatterns: updatedHookPatterns,
          engagementQuestionStyle: updatedQuestionStyles,
          sentenceLengthDistribution: sentenceLengthUpdates,
          lastUpdated: new Date(),
        }
      }
    );
  }

  /**
   * Update profile when new posts are published
   * Incrementally learns from newly published content
   */
  async updateFromPublishedPost(
    userId: string,
    workspaceId: string,
    caption: string,
    performanceMetrics?: {
      likes: number;
      comments: number;
      saves: number;
      shares: number;
      impressions: number;
    }
  ): Promise<void> {
    const profile = await this.getProfile(userId, workspaceId);
    
    // If no existing profile, create one
    if (profile.sampleSize === 0) {
      // Create initial profile from this published post
      const repeatedCaptions = Array(5).fill(caption);
      await this.analyzeAndCreateProfile(userId, workspaceId, repeatedCaptions);
      return;
    }

    // Extract patterns from the published caption
    const words = this.tokenize(caption.toLowerCase());
    const emojis = this.extractEmojis(caption);
    const sentences = this.splitSentences(caption);
    
    // Weight adjustments based on performance (if metrics provided)
    let performanceWeight = 0.003; // Base weight
    if (performanceMetrics) {
      const engagementRate = performanceMetrics.impressions > 0
        ? ((performanceMetrics.likes + performanceMetrics.comments + performanceMetrics.saves) / 
           performanceMetrics.impressions) * 100
        : 0;
      
      // Boost learning weight if content performed well (>3% engagement is good)
      if (engagementRate > 3) {
        performanceWeight = 0.005; // Higher weight for successful content
      } else if (engagementRate > 5) {
        performanceWeight = 0.007; // Even higher for exceptional content
      }
    }

    // Update vocabulary frequency
    const vocabularyUpdates: Record<string, number> = { ...profile.vocabularyFrequency };
    words.forEach(word => {
      if (word.length > 2) {
        const currentFreq = vocabularyUpdates[word] || 0;
        vocabularyUpdates[word] = currentFreq + performanceWeight;
      }
    });

    // Update emoji preferences
    let emojiUpdates = { ...profile.emojiUsagePattern };
    emojis.forEach(emoji => {
      if (!emojiUpdates.topEmojis.includes(emoji)) {
        emojiUpdates.topEmojis.unshift(emoji);
        if (emojiUpdates.topEmojis.length > 10) {
          emojiUpdates.topEmojis.pop();
        }
      } else {
        // Move to front if already present
        const index = emojiUpdates.topEmojis.indexOf(emoji);
        emojiUpdates.topEmojis.splice(index, 1);
        emojiUpdates.topEmojis.unshift(emoji);
      }
    });

    // Update tone markers
    const captionTone = this.analyzeToneMarkers([caption]);
    const toneUpdates = { ...profile.toneMarkers };
    Object.keys(toneUpdates).forEach(key => {
      const toneKey = key as keyof typeof toneUpdates;
      // Blend published caption tone into profile (weighted 15% toward published)
      toneUpdates[toneKey] = (
        toneUpdates[toneKey] * 0.85 + 
        captionTone[toneKey] * 0.15
      );
    });

    // Extract and add new patterns
    const hook = this.extractHookFromCaption(caption);
    const updatedHookPatterns = [...profile.hookPatterns];
    if (hook && !updatedHookPatterns.includes(hook)) {
      updatedHookPatterns.unshift(hook);
      if (updatedHookPatterns.length > 20) {
        updatedHookPatterns.pop();
      }
    }

    const question = this.extractQuestionFromCaption(caption);
    const updatedQuestionStyles = [...profile.engagementQuestionStyle];
    if (question && !updatedQuestionStyles.includes(question)) {
      updatedQuestionStyles.unshift(question);
      if (updatedQuestionStyles.length > 15) {
        updatedQuestionStyles.pop();
      }
    }

    // Extract new signature phrases
    const phrases = this.extractPhrasesFromSingleCaption(caption);
    const updatedSignaturePhrases = [...profile.signaturePhrases];
    phrases.forEach(phrase => {
      if (!updatedSignaturePhrases.includes(phrase) && updatedSignaturePhrases.length < 20) {
        updatedSignaturePhrases.push(phrase);
      }
    });

    // Update sample size
    const updatedSampleSize = profile.sampleSize + 1;

    // Apply incremental updates
    await this.collection.updateOne(
      { userId, workspaceId },
      {
        $set: {
          vocabularyFrequency: vocabularyUpdates,
          emojiUsagePattern: emojiUpdates,
          toneMarkers: toneUpdates,
          hookPatterns: updatedHookPatterns,
          engagementQuestionStyle: updatedQuestionStyles,
          signaturePhrases: updatedSignaturePhrases,
          sampleSize: updatedSampleSize,
          lastUpdated: new Date(),
        }
      }
    );
  }

  /**
   * Detect voice drift by comparing current profile with recent content
   * Returns drift metrics indicating significant changes in user's style
   */
  async detectVoiceDrift(
    userId: string,
    workspaceId: string,
    recentCaptions: string[]
  ): Promise<{
    hasDrift: boolean;
    driftScore: number; // 0-1, higher means more drift
    driftAreas: string[]; // Areas where drift was detected
    recommendations: string[];
  }> {
    if (recentCaptions.length < 3) {
      return {
        hasDrift: false,
        driftScore: 0,
        driftAreas: [],
        recommendations: ['Need at least 3 recent captions to detect drift']
      };
    }

    const currentProfile = await this.getProfile(userId, workspaceId);
    
    // If no established profile, no drift possible
    if (currentProfile.sampleSize === 0) {
      return {
        hasDrift: false,
        driftScore: 0,
        driftAreas: [],
        recommendations: ['No established voice profile to compare against']
      };
    }

    // Analyze recent captions to create a temporary profile
    const recentVocabulary = this.extractVocabularyFrequency(recentCaptions);
    const recentEmojis = this.analyzeEmojiUsage(recentCaptions);
    const recentTone = this.analyzeToneMarkers(recentCaptions);
    const recentSentenceLength = this.analyzeSentenceLengthDistribution(recentCaptions);
    const recentPunctuation = this.analyzePunctuationStyle(recentCaptions);

    const driftAreas: string[] = [];
    let totalDrift = 0;
    let driftFactors = 0;

    // 1. Check vocabulary drift (top 20 words overlap)
    const currentTopWords = Object.keys(currentProfile.vocabularyFrequency)
      .sort((a, b) => currentProfile.vocabularyFrequency[b] - currentProfile.vocabularyFrequency[a])
      .slice(0, 20);
    const recentTopWords = Object.keys(recentVocabulary)
      .sort((a, b) => recentVocabulary[b] - recentVocabulary[a])
      .slice(0, 20);
    
    const vocabularyOverlap = currentTopWords.filter(word => recentTopWords.includes(word)).length;
    const vocabularyDrift = 1 - (vocabularyOverlap / 20);
    
    if (vocabularyDrift > 0.5) {
      driftAreas.push('vocabulary');
      totalDrift += vocabularyDrift;
    }
    driftFactors++;

    // 2. Check emoji usage drift
    const emojiFrequencyDrift = Math.abs(
      this.emojiFrequencyToNumber(currentProfile.emojiUsagePattern.frequency) -
      this.emojiFrequencyToNumber(recentEmojis.frequency)
    ) / 3; // Normalize (0-3 levels difference)
    
    if (emojiFrequencyDrift > 0.33) {
      driftAreas.push('emoji usage');
      totalDrift += emojiFrequencyDrift;
    }
    driftFactors++;

    // 3. Check tone drift (compare all tone markers)
    let toneDrift = 0;
    Object.keys(currentProfile.toneMarkers).forEach(key => {
      const toneKey = key as keyof typeof currentProfile.toneMarkers;
      toneDrift += Math.abs(currentProfile.toneMarkers[toneKey] - recentTone[toneKey]);
    });
    toneDrift = toneDrift / Object.keys(currentProfile.toneMarkers).length;
    
    if (toneDrift > 0.3) {
      driftAreas.push('tone and style');
      totalDrift += toneDrift;
    }
    driftFactors++;

    // 4. Check sentence length drift
    const sentenceLengthDrift = (
      Math.abs(currentProfile.sentenceLengthDistribution.short - recentSentenceLength.short) +
      Math.abs(currentProfile.sentenceLengthDistribution.medium - recentSentenceLength.medium) +
      Math.abs(currentProfile.sentenceLengthDistribution.long - recentSentenceLength.long)
    ) / 300; // Normalize (max change is 300 if all shifts completely)
    
    if (sentenceLengthDrift > 0.3) {
      driftAreas.push('sentence length');
      totalDrift += sentenceLengthDrift;
    }
    driftFactors++;

    // 5. Check punctuation drift
    let punctuationDrift = 0;
    punctuationDrift += Math.abs(
      this.punctuationLevelToNumber(currentProfile.punctuationStyle.exclamationUsage) -
      this.punctuationLevelToNumber(recentPunctuation.exclamationUsage)
    ) / 2; // Normalize (0-2 levels difference)
    punctuationDrift += Math.abs(
      this.punctuationLevelToNumber(currentProfile.punctuationStyle.questionUsage) -
      this.punctuationLevelToNumber(recentPunctuation.questionUsage)
    ) / 2;
    punctuationDrift = punctuationDrift / 2;
    
    if (punctuationDrift > 0.33) {
      driftAreas.push('punctuation style');
      totalDrift += punctuationDrift;
    }
    driftFactors++;

    // Calculate overall drift score (0-1)
    const driftScore = totalDrift / driftFactors;
    const hasDrift = driftScore > 0.35; // Threshold for significant drift

    // Generate recommendations
    const recommendations: string[] = [];
    if (hasDrift) {
      recommendations.push(`Detected ${Math.round(driftScore * 100)}% change in writing style`);
      recommendations.push(`Changes observed in: ${driftAreas.join(', ')}`);
      recommendations.push('Consider recalibrating voice profile to match recent writing style');
      
      if (driftAreas.includes('vocabulary')) {
        recommendations.push('Vocabulary has shifted significantly - new words and phrases detected');
      }
      if (driftAreas.includes('tone and style')) {
        recommendations.push('Overall tone has evolved - profile may need adjustment');
      }
      if (driftAreas.includes('emoji usage')) {
        recommendations.push('Emoji usage pattern has changed');
      }
    } else {
      recommendations.push('Writing style remains consistent with voice profile');
      recommendations.push(`Current drift score: ${Math.round(driftScore * 100)}%`);
    }

    return {
      hasDrift,
      driftScore,
      driftAreas,
      recommendations
    };
  }

  /**
   * Merge new profile data with existing profile
   * Used for bulk recalibration or importing profiles
   */
  async mergeProfiles(
    userId: string,
    workspaceId: string,
    newProfileData: Partial<VoiceProfile>,
    mergeStrategy: 'blend' | 'prefer-new' | 'prefer-existing' = 'blend'
  ): Promise<VoiceProfile> {
    const existingProfile = await this.getProfile(userId, workspaceId);
    
    let mergedProfile: VoiceProfile;

    if (mergeStrategy === 'blend') {
      // Blend vocabularies (average frequencies)
      const mergedVocabulary: Record<string, number> = { ...existingProfile.vocabularyFrequency };
      if (newProfileData.vocabularyFrequency) {
        Object.entries(newProfileData.vocabularyFrequency).forEach(([word, freq]) => {
          const existingFreq = mergedVocabulary[word] || 0;
          mergedVocabulary[word] = (existingFreq + freq) / 2;
        });
      }

      // Blend tone markers (weighted average)
      const mergedTone = { ...existingProfile.toneMarkers };
      if (newProfileData.toneMarkers) {
        Object.keys(mergedTone).forEach(key => {
          const toneKey = key as keyof typeof mergedTone;
          const existingTone = mergedTone[toneKey];
          const newTone = newProfileData.toneMarkers![toneKey];
          mergedTone[toneKey] = (existingTone + newTone) / 2;
        });
      }

      // Merge arrays (combine and deduplicate, prioritize new)
      const mergedSignaturePhrases = [
        ...(newProfileData.signaturePhrases || []),
        ...existingProfile.signaturePhrases
      ].filter((phrase, index, self) => self.indexOf(phrase) === index).slice(0, 20);

      const mergedHookPatterns = [
        ...(newProfileData.hookPatterns || []),
        ...existingProfile.hookPatterns
      ].filter((hook, index, self) => self.indexOf(hook) === index).slice(0, 20);

      const mergedQuestionStyles = [
        ...(newProfileData.engagementQuestionStyle || []),
        ...existingProfile.engagementQuestionStyle
      ].filter((q, index, self) => self.indexOf(q) === index).slice(0, 15);

      // Blend sentence length (weighted average)
      const mergedSentenceLength = newProfileData.sentenceLengthDistribution
        ? {
            short: Math.round((existingProfile.sentenceLengthDistribution.short + newProfileData.sentenceLengthDistribution.short) / 2),
            medium: Math.round((existingProfile.sentenceLengthDistribution.medium + newProfileData.sentenceLengthDistribution.medium) / 2),
            long: Math.round((existingProfile.sentenceLengthDistribution.long + newProfileData.sentenceLengthDistribution.long) / 2),
          }
        : existingProfile.sentenceLengthDistribution;

      // Merge emojis (combine top emojis)
      const mergedTopEmojis = [
        ...(newProfileData.emojiUsagePattern?.topEmojis || []),
        ...existingProfile.emojiUsagePattern.topEmojis
      ].filter((emoji, index, self) => self.indexOf(emoji) === index).slice(0, 10);

      mergedProfile = {
        userId,
        workspaceId,
        vocabularyFrequency: mergedVocabulary,
        signaturePhrases: mergedSignaturePhrases,
        sentenceLengthDistribution: mergedSentenceLength,
        paragraphStructure: newProfileData.paragraphStructure || existingProfile.paragraphStructure,
        emojiUsagePattern: {
          frequency: newProfileData.emojiUsagePattern?.frequency || existingProfile.emojiUsagePattern.frequency,
          placement: newProfileData.emojiUsagePattern?.placement || existingProfile.emojiUsagePattern.placement,
          topEmojis: mergedTopEmojis,
        },
        punctuationStyle: newProfileData.punctuationStyle || existingProfile.punctuationStyle,
        toneMarkers: mergedTone,
        hookPatterns: mergedHookPatterns,
        engagementQuestionStyle: mergedQuestionStyles,
        storytellingStructure: newProfileData.storytellingStructure || existingProfile.storytellingStructure,
        sampleSize: existingProfile.sampleSize + (newProfileData.sampleSize || 0),
        confidence: Math.min(0.98, (existingProfile.confidence + (newProfileData.confidence || 0.5)) / 2),
        lastUpdated: new Date(),
        createdAt: existingProfile.createdAt,
      };
    } else if (mergeStrategy === 'prefer-new') {
      // Prefer new data when available, fallback to existing
      mergedProfile = {
        ...existingProfile,
        ...newProfileData,
        userId,
        workspaceId,
        lastUpdated: new Date(),
      } as VoiceProfile;
    } else {
      // prefer-existing: Only fill in missing fields from new data
      mergedProfile = {
        ...newProfileData,
        ...existingProfile,
        userId,
        workspaceId,
        lastUpdated: new Date(),
      } as VoiceProfile;
    }

    // Save merged profile
    await this.collection.updateOne(
      { userId, workspaceId },
      { $set: mergedProfile },
      { upsert: true }
    );

    return mergedProfile;
  }

  /**
   * Helper: Convert emoji frequency string to number for drift calculation
   */
  private emojiFrequencyToNumber(freq: 'none' | 'minimal' | 'moderate' | 'heavy'): number {
    const map = { 'none': 0, 'minimal': 1, 'moderate': 2, 'heavy': 3 };
    return map[freq];
  }

  /**
   * Helper: Convert punctuation level string to number for drift calculation
   */
  private punctuationLevelToNumber(level: 'rare' | 'moderate' | 'frequent'): number {
    const map = { 'rare': 0, 'moderate': 1, 'frequent': 2 };
    return map[level];
  }

  /**
   * Convert voice profile to prompt instructions
   */
  voiceProfileToPrompt(profile: VoiceProfile): string {
    const topVocabulary = Object.entries(profile.vocabularyFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);

    const toneDescription = this.getToneDescription(profile.toneMarkers);

    return `
VOICE PROFILE - Match this exact writing style:
- Vocabulary: Uses "${topVocabulary.join('", "')}" frequently
- Signature phrases: "${profile.signaturePhrases.join('", "')}"
- Sentence length: ${profile.sentenceLengthDistribution.short}% short (1-5 words), 
  ${profile.sentenceLengthDistribution.medium}% medium (6-15 words), 
  ${profile.sentenceLengthDistribution.long}% long (16+ words)
- Paragraph style: ${profile.paragraphStructure}
- Emoji usage: ${profile.emojiUsagePattern.frequency} (${profile.emojiUsagePattern.placement})
- Top emojis: ${profile.emojiUsagePattern.topEmojis.join(' ')}
- Exclamation marks: ${profile.punctuationStyle.exclamationUsage}
- Questions: ${profile.punctuationStyle.questionUsage}
- Uses ellipsis: ${profile.punctuationStyle.ellipsisUsage ? 'yes' : 'no'}
- Tone: ${toneDescription}
- Hook patterns: "${profile.hookPatterns.slice(0, 3).join('", "')}"
- Engagement question style: "${profile.engagementQuestionStyle.slice(0, 3).join('", "')}"
- Storytelling: ${profile.storytellingStructure}

Confidence: ${(profile.confidence * 100).toFixed(0)}% (based on ${profile.sampleSize} samples)
`.trim();
  }

  // Private helper methods for analysis

  private extractVocabularyFrequency(captions: string[]): Record<string, number> {
    const wordCounts: Record<string, number> = {};
    
    // Common stop words to filter out (less frequent tracking for common words)
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
    ]);

    let totalWords = 0;
    let contentWords = 0;

    captions.forEach(caption => {
      const words = this.tokenize(caption);
      words.forEach(word => {
        const normalized = word.toLowerCase();
        
        // Track all words but weight content words more heavily
        if (!stopWords.has(normalized) && normalized.length > 2) {
          wordCounts[normalized] = (wordCounts[normalized] || 0) + 2; // Weight content words
          contentWords += 2;
        } else if (normalized.length > 0) {
          wordCounts[normalized] = (wordCounts[normalized] || 0) + 1;
          totalWords++;
        }
      });
    });

    const total = totalWords + contentWords || 1;

    // Convert to frequency (0-1) and filter out very rare words
    const frequency: Record<string, number> = {};
    Object.entries(wordCounts).forEach(([word, count]) => {
      const freq = count / total;
      // Only include words that appear with reasonable frequency
      if (count >= 2 || freq >= 0.001) {
        frequency[word] = freq;
      }
    });

    return frequency;
  }

  private extractSignaturePhrases(captions: string[]): string[] {
    const phrases: Record<string, number> = {};
    const phrasePositions: Record<string, number[]> = {};
    
    // Common filler phrases to ignore
    const fillerPhrases = new Set([
      'this is', 'that is', 'it is', 'there is', 'there are',
      'i am', 'you are', 'we are', 'they are', 'i was', 'you were',
      'in the', 'on the', 'at the', 'to the', 'for the', 'of the'
    ]);
    
    captions.forEach((caption, captionIdx) => {
      // Extract 2-5 word phrases (extended to capture longer signature phrases)
      const words = this.tokenize(caption);
      for (let len = 2; len <= 5; len++) {
        for (let i = 0; i <= words.length - len; i++) {
          const phrase = words.slice(i, i + len).join(' ').toLowerCase();
          
          // Skip filler phrases and very short phrases
          if (fillerPhrases.has(phrase) || phrase.length < 5) continue;
          
          phrases[phrase] = (phrases[phrase] || 0) + 1;
          
          // Track which captions contain this phrase
          if (!phrasePositions[phrase]) {
            phrasePositions[phrase] = [];
          }
          if (!phrasePositions[phrase].includes(captionIdx)) {
            phrasePositions[phrase].push(captionIdx);
          }
        }
      }
    });

    // Return phrases that appear in at least 20% of captions OR appear 3+ times
    const threshold = Math.max(2, Math.floor(captions.length * 0.2));
    
    return Object.entries(phrases)
      .filter(([phrase, count]) => {
        const uniqueCaptions = phrasePositions[phrase]?.length || 0;
        return count >= 3 || uniqueCaptions >= threshold;
      })
      .sort(([phraseA, countA], [phraseB, countB]) => {
        // Prioritize phrases that appear in multiple captions
        const captionsA = phrasePositions[phraseA]?.length || 0;
        const captionsB = phrasePositions[phraseB]?.length || 0;
        if (captionsA !== captionsB) return captionsB - captionsA;
        return countB - countA;
      })
      .slice(0, 15)
      .map(([phrase]) => phrase);
  }

  private analyzeSentenceLengthDistribution(captions: string[]): {
    short: number;
    medium: number;
    long: number;
  } {
    const sentences: string[] = [];
    captions.forEach(caption => {
      sentences.push(...this.splitSentences(caption));
    });

    let short = 0;
    let medium = 0;
    let long = 0;

    sentences.forEach(sentence => {
      const wordCount = this.tokenize(sentence).length;
      if (wordCount <= 5) short++;
      else if (wordCount <= 15) medium++;
      else long++;
    });

    const total = sentences.length || 1;
    return {
      short: Math.round((short / total) * 100),
      medium: Math.round((medium / total) * 100),
      long: Math.round((long / total) * 100),
    };
  }

  private detectParagraphStructure(captions: string[]): 'single' | 'short-breaks' | 'long-form' {
    const avgLineBreaks = captions.reduce((sum, caption) => {
      return sum + (caption.match(/\n/g) || []).length;
    }, 0) / captions.length;

    if (avgLineBreaks === 0) return 'single';
    if (avgLineBreaks <= 3) return 'short-breaks';
    return 'long-form';
  }

  private analyzeEmojiUsage(captions: string[]): {
    frequency: 'none' | 'minimal' | 'moderate' | 'heavy';
    placement: 'inline' | 'end' | 'both';
    topEmojis: string[];
  } {
    // Comprehensive emoji regex without unicode flag
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\u2700-\u27BF]|[\uD83C][\uDC00-\uDFFF]|[\uD83D][\uDC00-\uDFFF]|[\uD83E][\uDD00-\uDDFF]/g;
    const emojiCounts: Record<string, number> = {};
    let totalEmojis = 0;
    let inlineCount = 0;
    let endCount = 0;

    captions.forEach(caption => {
      const emojis = caption.match(emojiRegex) || [];
      totalEmojis += emojis.length;

      emojis.forEach(emoji => {
        emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
      });

      // Check placement
      const lines = caption.split('\n');
      lines.forEach((line, idx) => {
        const lineEmojis = line.match(emojiRegex) || [];
        if (lineEmojis.length > 0) {
          const isEnd = line.trim().endsWith(lineEmojis[lineEmojis.length - 1]);
          if (isEnd) endCount++;
          else inlineCount++;
        }
      });
    });

    const avgEmojisPerCaption = totalEmojis / captions.length;
    let frequency: 'none' | 'minimal' | 'moderate' | 'heavy';
    if (avgEmojisPerCaption === 0) frequency = 'none';
    else if (avgEmojisPerCaption <= 2) frequency = 'minimal';
    else if (avgEmojisPerCaption <= 5) frequency = 'moderate';
    else frequency = 'heavy';

    let placement: 'inline' | 'end' | 'both';
    if (inlineCount === 0 && endCount === 0) placement = 'end';
    else if (inlineCount > endCount * 2) placement = 'inline';
    else if (endCount > inlineCount * 2) placement = 'end';
    else placement = 'both';

    const topEmojis = Object.entries(emojiCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([emoji]) => emoji);

    return { frequency, placement, topEmojis };
  }

  private analyzePunctuationStyle(captions: string[]): {
    exclamationUsage: 'rare' | 'moderate' | 'frequent';
    questionUsage: 'rare' | 'moderate' | 'frequent';
    ellipsisUsage: boolean;
  } {
    const totalSentences = captions.reduce((sum, caption) => {
      return sum + this.splitSentences(caption).length;
    }, 0);

    const exclamationCount = captions.reduce((sum, caption) => {
      return sum + (caption.match(/!/g) || []).length;
    }, 0);

    const questionCount = captions.reduce((sum, caption) => {
      return sum + (caption.match(/\?/g) || []).length;
    }, 0);

    const ellipsisUsage = captions.some(caption => caption.includes('...'));

    const exclamationRate = exclamationCount / totalSentences;
    const questionRate = questionCount / totalSentences;

    const getUsageLevel = (rate: number): 'rare' | 'moderate' | 'frequent' => {
      if (rate < 0.1) return 'rare';
      if (rate < 0.3) return 'moderate';
      return 'frequent';
    };

    return {
      exclamationUsage: getUsageLevel(exclamationRate),
      questionUsage: getUsageLevel(questionRate),
      ellipsisUsage,
    };
  }

  private analyzeToneMarkers(captions: string[]): {
    casual: number;
    professional: number;
    humorous: number;
    inspirational: number;
    educational: number;
    conversational: number;
  } {
    const text = captions.join(' ').toLowerCase();
    const wordCount = this.tokenize(text).length;

    // Enhanced keyword-based tone analysis with weighted scoring
    const casualKeywords = ['lol', 'omg', 'tbh', 'ngl', 'btw', 'gonna', 'wanna', 'yeah', 'yep', 'nope', 'gotta', 'kinda', 'sorta'];
    const professionalKeywords = ['therefore', 'however', 'moreover', 'furthermore', 'consequently', 'additionally', 'specifically', 'accordingly'];
    const humorousKeywords = ['haha', 'funny', 'joke', 'laugh', '😂', '😄', 'lmao', 'rofl', 'hilarious', 'comedy'];
    const inspirationalKeywords = ['inspire', 'motivate', 'dream', 'believe', 'achieve', 'success', 'goals', 'journey', 'growth', 'transform'];
    const educationalKeywords = ['learn', 'understand', 'explain', 'teach', 'know', 'discover', 'tips', 'guide', 'how', 'why', 'what'];
    const conversationalKeywords = ['you', 'your', 'we', 'us', 'our', "let's", "you're", "i'm", 'hey', 'so'];

    const countKeywords = (keywords: string[]) => {
      return keywords.reduce((sum, keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        return sum + (text.match(regex) || []).length;
      }, 0);
    };

    // Check for contractions (strong casual indicator)
    const contractionCount = (text.match(/\b\w+'(s|re|ve|ll|d|t|m)\b/g) || []).length;
    
    // Check for exclamations (energy level)
    const exclamationCount = (text.match(/!/g) || []).length;
    
    // Check for questions (engagement/educational)
    const questionCount = (text.match(/\?/g) || []).length;

    // Calculate raw scores
    let casual = (countKeywords(casualKeywords) * 2 + contractionCount) / wordCount * 100;
    let professional = countKeywords(professionalKeywords) / wordCount * 100;
    let humorous = (countKeywords(humorousKeywords) + exclamationCount * 0.5) / wordCount * 50;
    let inspirational = (countKeywords(inspirationalKeywords) + exclamationCount * 0.3) / wordCount * 80;
    let educational = (countKeywords(educationalKeywords) + questionCount) / wordCount * 80;
    let conversational = countKeywords(conversationalKeywords) / wordCount * 50;

    // Normalize to 0-1 range with realistic caps
    return {
      casual: Math.min(Math.max(casual, 0), 1),
      professional: Math.min(Math.max(professional, 0), 1),
      humorous: Math.min(Math.max(humorous, 0), 1),
      inspirational: Math.min(Math.max(inspirational, 0), 1),
      educational: Math.min(Math.max(educational, 0), 1),
      conversational: Math.min(Math.max(conversational, 0), 1),
    };
  }

  private extractHookPatterns(captions: string[]): string[] {
    const hookStructures: Map<string, { examples: string[], count: number }> = new Map();
    
    captions.forEach(caption => {
      const sentences = this.splitSentences(caption);
      if (sentences.length > 0) {
        const firstSentence = sentences[0].trim();
        const words = this.tokenize(firstSentence);
        
        if (words.length < 2) return;
        
        // Create a structural pattern by identifying the hook type
        let hookPattern = '';
        
        // Check for common hook patterns
        if (firstSentence.match(/^(hot take|unpopular opinion|confession|real talk|let's be real|here's the thing)/i)) {
          hookPattern = firstSentence.split(/[:.!?]/)[0].toLowerCase().trim();
        } else if (firstSentence.includes('?')) {
          // Question hook - preserve the question structure
          hookPattern = words.slice(0, Math.min(7, words.length)).join(' ');
        } else if (firstSentence.match(/^(pov|when|imagine|remember|nobody|everyone)/i)) {
          // Scenario/POV hook
          hookPattern = words.slice(0, 3).join(' ').toLowerCase();
        } else if (words.length <= 5) {
          // Short, punchy opening
          hookPattern = firstSentence.toLowerCase();
        } else {
          // General pattern - first 5 words
          hookPattern = words.slice(0, 5).join(' ').toLowerCase();
        }
        
        if (hookPattern.length >= 5) {
          const existing = hookStructures.get(hookPattern) || { examples: [], count: 0 };
          existing.count++;
          if (existing.examples.length < 3 && !existing.examples.includes(firstSentence)) {
            existing.examples.push(firstSentence);
          }
          hookStructures.set(hookPattern, existing);
        }
      }
    });

    // Return hooks sorted by frequency, keeping diverse examples
    return Array.from(hookStructures.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15)
      .map(([pattern]) => pattern);
  }

  private extractEngagementQuestions(captions: string[]): string[] {
    const questionPatterns: Map<string, { full: string, count: number }> = new Map();

    captions.forEach(caption => {
      const sentences = this.splitSentences(caption);
      sentences.forEach(sentence => {
        if (sentence.includes('?')) {
          const words = this.tokenize(sentence);
          
          // Filter for genuine engagement questions (3-20 words)
          if (words.length >= 3 && words.length <= 20) {
            const questionTrimmed = sentence.trim();
            
            // Create a pattern key based on question structure
            const firstThreeWords = words.slice(0, 3).join(' ').toLowerCase();
            
            // Check if it's an engagement question (not rhetorical)
            const engagementIndicators = ['what', 'which', 'how', 'why', 'who', 'where', 'when', 'do you', 'have you', 'are you', 'would you', 'can you', 'did you'];
            const isEngagementQuestion = engagementIndicators.some(indicator => 
              firstThreeWords.includes(indicator)
            );
            
            if (isEngagementQuestion) {
              const existing = questionPatterns.get(firstThreeWords) || { full: questionTrimmed, count: 0 };
              existing.count++;
              // Keep the shortest version as the representative example
              if (questionTrimmed.length < existing.full.length) {
                existing.full = questionTrimmed;
              }
              questionPatterns.set(firstThreeWords, existing);
            }
          }
        }
      });
    });

    // Return unique question patterns, prioritizing frequently used structures
    return Array.from(questionPatterns.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 12)
      .map(([, data]) => data.full);
  }

  private detectStorytellingStructure(captions: string[]): 'linear' | 'flashback' | 'buildup' | 'revelation' {
    // Analyze patterns across all captions to determine dominant storytelling structure
    const text = captions.join(' ').toLowerCase();
    let scores = {
      flashback: 0,
      buildup: 0,
      revelation: 0,
      linear: 0
    };

    captions.forEach(caption => {
      const lower = caption.toLowerCase();
      
      // Flashback indicators - past references
      if (lower.match(/\b(remember when|back when|used to|years ago|once upon|the other day|last time|back in)\b/)) {
        scores.flashback += 2;
      }
      if (lower.match(/\b(thinking back|looking back|reminds me|takes me back)\b/)) {
        scores.flashback += 1;
      }
      
      // Buildup indicators - progression and steps
      if (lower.match(/\b(first|then|next|after that|finally|eventually|now)\b/)) {
        const matches = lower.match(/\b(first|then|next|finally)\b/g);
        if (matches && matches.length >= 2) {
          scores.buildup += 3;
        } else {
          scores.buildup += 1;
        }
      }
      if (lower.match(/\b(step by step|one by one|gradually|slowly|leading to)\b/)) {
        scores.buildup += 2;
      }
      
      // Revelation indicators - surprise or realization
      if (lower.match(/\b(never thought|turns out|realized|found out|discovered|plot twist|little did i know)\b/)) {
        scores.revelation += 2;
      }
      if (lower.match(/\b(surprise|shocked|unexpected|mind blown|who knew|guess what)\b/)) {
        scores.revelation += 1;
      }
      
      // Linear indicators - straightforward narrative
      if (lower.match(/\b(today|right now|currently|at the moment|these days|lately)\b/)) {
        scores.linear += 1;
      }
      if (lower.match(/\b(here's|this is|check out|showing you|sharing)\b/)) {
        scores.linear += 1;
      }
    });

    // Return the dominant structure
    const maxScore = Math.max(scores.flashback, scores.buildup, scores.revelation, scores.linear);
    
    // If scores are very low, default to linear
    if (maxScore < 2) return 'linear';
    
    if (scores.flashback === maxScore) return 'flashback';
    if (scores.buildup === maxScore) return 'buildup';
    if (scores.revelation === maxScore) return 'revelation';
    return 'linear';
  }

  private getDefaultProfile(userId: string, workspaceId: string): VoiceProfile {
    return {
      userId,
      workspaceId,
      vocabularyFrequency: {},
      signaturePhrases: [],
      sentenceLengthDistribution: {
        short: 33,
        medium: 50,
        long: 17,
      },
      paragraphStructure: 'short-breaks',
      emojiUsagePattern: {
        frequency: 'moderate',
        placement: 'both',
        topEmojis: [],
      },
      punctuationStyle: {
        exclamationUsage: 'moderate',
        questionUsage: 'moderate',
        ellipsisUsage: false,
      },
      toneMarkers: {
        casual: 0.5,
        professional: 0.3,
        humorous: 0.4,
        inspirational: 0.3,
        educational: 0.3,
        conversational: 0.7,
      },
      hookPatterns: [],
      engagementQuestionStyle: [],
      storytellingStructure: 'linear',
      sampleSize: 0,
      confidence: 0.5,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
  }

  private getToneDescription(toneMarkers: VoiceProfile['toneMarkers']): string {
    const tones = Object.entries(toneMarkers)
      .filter(([, score]) => score > 0.3)
      .sort(([, a], [, b]) => b - a)
      .map(([tone]) => tone);

    if (tones.length === 0) return 'neutral';
    return tones.slice(0, 3).join(', ');
  }

  /**
   * Extract emojis from text
   */
  private extractEmojis(text: string): string[] {
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\u2700-\u27BF]|[\uD83C][\uDC00-\uDFFF]|[\uD83D][\uDC00-\uDFFF]|[\uD83E][\uDD00-\uDDFF]/g;
    return text.match(emojiRegex) || [];
  }

  /**
   * Extract phrases from a single caption for learning
   */
  private extractPhrasesFromSingleCaption(caption: string): string[] {
    const phrases: string[] = [];
    const words = this.tokenize(caption);
    
    // Extract 2-4 word phrases
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        const phrase = words.slice(i, i + len).join(' ').toLowerCase();
        if (phrase.length >= 5) {
          phrases.push(phrase);
        }
      }
    }
    
    return phrases.slice(0, 5); // Return top 5 phrases
  }

  /**
   * Extract hook pattern from a single caption
   */
  private extractHookFromCaption(caption: string): string | null {
    const sentences = this.splitSentences(caption);
    if (sentences.length === 0) return null;
    
    const firstSentence = sentences[0].trim();
    const words = this.tokenize(firstSentence);
    
    if (words.length < 2) return null;
    
    // Check for common hook patterns
    if (firstSentence.match(/^(hot take|unpopular opinion|confession|real talk|let's be real|here's the thing)/i)) {
      return firstSentence.split(/[:.!?]/)[0].toLowerCase().trim();
    } else if (firstSentence.includes('?')) {
      return words.slice(0, Math.min(7, words.length)).join(' ');
    } else if (firstSentence.match(/^(pov|when|imagine|remember|nobody|everyone)/i)) {
      return words.slice(0, 3).join(' ').toLowerCase();
    } else if (words.length <= 5) {
      return firstSentence.toLowerCase();
    } else {
      return words.slice(0, 5).join(' ').toLowerCase();
    }
  }

  /**
   * Extract engagement question from a single caption
   */
  private extractQuestionFromCaption(caption: string): string | null {
    const sentences = this.splitSentences(caption);
    
    for (const sentence of sentences) {
      if (sentence.includes('?')) {
        const words = this.tokenize(sentence);
        
        if (words.length >= 3 && words.length <= 20) {
          const questionTrimmed = sentence.trim();
          const firstThreeWords = words.slice(0, 3).join(' ').toLowerCase();
          
          const engagementIndicators = ['what', 'which', 'how', 'why', 'who', 'where', 'when', 'do you', 'have you', 'are you', 'would you', 'can you', 'did you'];
          const isEngagementQuestion = engagementIndicators.some(indicator => 
            firstThreeWords.includes(indicator)
          );
          
          if (isEngagementQuestion) {
            return questionTrimmed;
          }
        }
      }
    }
    
    return null;
  }

  private tokenize(text: string): string[] {
    // Enhanced word tokenization that preserves contractions and handles emojis
    // Comprehensive emoji regex without unicode flag
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u26FF]|[\u2700-\u27BF]|[\uD83C][\uDC00-\uDFFF]|[\uD83D][\uDC00-\uDFFF]|[\uD83E][\uDD00-\uDDFF]/g;
    
    return text
      // Remove emojis (they're tracked separately)
      .replace(emojiRegex, ' ')
      // Preserve contractions (don't -> don't, not don and t)
      .replace(/([a-z])'([a-z])/gi, '$1_APOSTROPHE_$2')
      // Remove other punctuation
      .replace(/[^\w\s'-]/g, ' ')
      // Restore contractions
      .replace(/_APOSTROPHE_/g, "'")
      // Split and filter
      .split(/\s+/)
      .filter(word => word.length > 0 && !word.match(/^['-]+$/));
  }

  private splitSentences(text: string): string[] {
    // Enhanced sentence splitting that handles abbreviations and preserves terminators
    return text
      // Protect common abbreviations
      .replace(/\bMr\./g, 'Mr_DOT_')
      .replace(/\bMrs\./g, 'Mrs_DOT_')
      .replace(/\bDr\./g, 'Dr_DOT_')
      .replace(/\bvs\./g, 'vs_DOT_')
      .replace(/\be\.g\./g, 'e_DOT_g_DOT_')
      .replace(/\bi\.e\./g, 'i_DOT_e_DOT_')
      // Split on sentence terminators while preserving them
      .split(/(?<=[.!?])\s+/)
      // Restore abbreviations
      .map(s => s.replace(/_DOT_/g, '.').trim())
      .filter(s => s.length > 0);
  }

  /**
   * Get voice profile snapshots (evolution history)
   * Requirements: 10.4, 10.5
   */
  async getProfileSnapshots(userId: string, workspaceId: string): Promise<any[]> {
    // For now, we'll create a snapshot from the current profile
    // In a production system, you would store historical snapshots in a separate collection
    const currentProfile = await this.getProfile(userId, workspaceId);
    
    if (currentProfile.sampleSize === 0) {
      return [];
    }

    // Get top vocabulary for snapshot
    const topVocabulary = Object.entries(currentProfile.vocabularyFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);

    // Create a snapshot from current profile
    const snapshot = {
      date: currentProfile.lastUpdated,
      confidence: currentProfile.confidence,
      sampleSize: currentProfile.sampleSize,
      toneMarkers: currentProfile.toneMarkers,
      topVocabulary,
      signaturePhrases: currentProfile.signaturePhrases.slice(0, 3),
      acceptanceRate: undefined // This would come from feedback data
    };

    // Return as array (in production, you'd fetch multiple historical snapshots)
    return [snapshot];
  }

  /**
   * Get learning milestones
   * Requirements: 10.4, 10.5
   */
  async getLearningMilestones(userId: string, workspaceId: string): Promise<any[]> {
    // In a production system, milestones would be tracked in a separate collection
    // For now, we'll generate milestones based on the current profile state
    const currentProfile = await this.getProfile(userId, workspaceId);
    
    if (currentProfile.sampleSize === 0) {
      return [];
    }

    const milestones: any[] = [];

    // Milestone: Profile created
    milestones.push({
      id: `profile-created-${currentProfile.createdAt.getTime()}`,
      date: currentProfile.createdAt,
      type: 'profile_updated',
      title: 'Voice Profile Created',
      description: `Analyzed ${currentProfile.sampleSize} captions to establish your unique writing style with ${Math.round(currentProfile.confidence * 100)}% confidence.`,
      impact: 'high'
    });

    // Milestone: High confidence achieved (if applicable)
    if (currentProfile.confidence >= 0.90) {
      milestones.push({
        id: `high-confidence-${currentProfile.lastUpdated.getTime()}`,
        date: currentProfile.lastUpdated,
        type: 'accuracy_improved',
        title: 'High Confidence Achieved',
        description: `Voice profile confidence reached ${Math.round(currentProfile.confidence * 100)}%, ensuring highly accurate caption generation.`,
        impact: 'high'
      });
    }

    // Milestone: Signature phrases discovered (if applicable)
    if (currentProfile.signaturePhrases.length >= 3) {
      milestones.push({
        id: `phrases-discovered-${currentProfile.lastUpdated.getTime()}`,
        date: currentProfile.lastUpdated,
        type: 'pattern_discovered',
        title: 'Signature Phrases Discovered',
        description: `Identified ${currentProfile.signaturePhrases.length} unique signature phrases that define your writing style.`,
        impact: 'medium'
      });
    }

    return milestones.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get acceptance rate trends
   * Requirements: 10.4, 10.5
   */
  async getAcceptanceRateTrend(userId: string, workspaceId: string): Promise<any[]> {
    // In a production system, acceptance rates would be tracked in the captionfeedback collection
    // For now, we'll return an empty array as this requires integration with caption feedback tracking
    
    // Query the generatedcaptions collection to calculate acceptance rates
    const generatedCaptionsCollection = this.db.collection('generatedcaptions');
    
    try {
      // Aggregate acceptance rates by month
      const trends = await generatedCaptionsCollection.aggregate([
        {
          $match: {
            userId,
            workspaceId,
            publishedAt: { $exists: true }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$generatedAt' },
              month: { $month: '$generatedAt' }
            },
            totalGenerated: { $sum: 1 },
            totalAccepted: {
              $sum: {
                $cond: [
                  { $or: [
                    { $eq: ['$wasEdited', false] },
                    { $lte: ['$editDistance', 20] } // Minor edits count as accepted
                  ]},
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        },
        {
          $project: {
            date: {
              $dateFromParts: {
                year: '$_id.year',
                month: '$_id.month',
                day: 1
              }
            },
            totalGenerated: 1,
            totalAccepted: 1,
            acceptanceRate: {
              $cond: [
                { $gt: ['$totalGenerated', 0] },
                { $divide: ['$totalAccepted', '$totalGenerated'] },
                0
              ]
            }
          }
        }
      ]).toArray();

      return trends.map(trend => ({
        date: trend.date.toISOString(),
        acceptanceRate: trend.acceptanceRate,
        totalGenerated: trend.totalGenerated,
        totalAccepted: trend.totalAccepted
      }));
    } catch (error) {
      console.error('[VOICE PROFILE] Error calculating acceptance trends:', error);
      return [];
    }
  }
}

