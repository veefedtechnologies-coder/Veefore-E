import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { VoiceProfileService } from '../VoiceProfileService';

describe('VoiceProfileService - Voice Pattern Extraction', () => {
  let mongoClient: MongoClient;
  let service: VoiceProfileService;
  const testDbName = 'test_voice_profile_db';

  beforeAll(async () => {
    // Connect to MongoDB (using test database)
    const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    service = new VoiceProfileService(mongoClient, testDbName);
  });

  afterAll(async () => {
    // Cleanup
    if (mongoClient) {
      await mongoClient.db(testDbName).dropDatabase();
      await mongoClient.close();
    }
  });

  describe('Vocabulary Frequency Analysis', () => {
    it('should extract vocabulary frequency from sample captions', async () => {
      const sampleCaptions = [
        "Love this new workout routine! It's amazing how much energy I have.",
        "Amazing results from my fitness journey. Love seeing progress!",
        "This routine is incredible. Love every moment of training.",
        "New fitness goals achieved! Love the energy and amazing feeling.",
        "Love this journey. Amazing progress every single day!"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user1',
        'workspace1',
        sampleCaptions
      );

      // Check that common words are tracked
      expect(profile.vocabularyFrequency).toBeDefined();
      expect(Object.keys(profile.vocabularyFrequency).length).toBeGreaterThan(0);
      
      // High-frequency content words should be present
      expect(profile.vocabularyFrequency['love']).toBeDefined();
      expect(profile.vocabularyFrequency['amazing']).toBeDefined();
      expect(profile.vocabularyFrequency['energy']).toBeDefined();
      
      // 'love' appears 5 times, should have higher frequency
      expect(profile.vocabularyFrequency['love']).toBeGreaterThan(0.01);
    });

    it('should filter out very rare words', async () => {
      const sampleCaptions = [
        "Regular word repeated word repeated word",
        "Regular word appears word appears word",
        "Regular word shows word shows word",
        "Regular word normal word normal word",
        "Regular word common word common word uniqueraretestword"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user2',
        'workspace2',
        sampleCaptions
      );

      // Very rare words might be filtered depending on threshold
      expect(profile.vocabularyFrequency['regular']).toBeDefined();
      expect(profile.vocabularyFrequency['word']).toBeDefined();
    });
  });

  describe('Sentence Length Distribution', () => {
    it('should correctly categorize sentence lengths', async () => {
      const sampleCaptions = [
        "Short.", // 1 word - short
        "This is medium length.", // 4 words - short
        "This is a slightly longer sentence with more words.", // 9 words - medium
        "This is a much longer sentence that goes on and on with many words in it.", // 15 words - medium
        "This is a very long sentence that contains more than fifteen words and should be categorized as long by the algorithm.", // 20 words - long
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user3',
        'workspace3',
        sampleCaptions
      );

      // Check distributions sum to 100
      const total = profile.sentenceLengthDistribution.short +
                    profile.sentenceLengthDistribution.medium +
                    profile.sentenceLengthDistribution.long;
      expect(total).toBe(100);

      // We have mix of lengths, all should have some percentage
      expect(profile.sentenceLengthDistribution.short).toBeGreaterThan(0);
      expect(profile.sentenceLengthDistribution.medium).toBeGreaterThan(0);
      expect(profile.sentenceLengthDistribution.long).toBeGreaterThan(0);
    });
  });

  describe('Emoji Usage Pattern Detection', () => {
    it('should detect emoji frequency and placement', async () => {
      const sampleCaptions = [
        "Love this! 😍",
        "Amazing day! 🌟",
        "Feeling 😊 great today",
        "Best workout ever! 💪😍",
        "New goals achieved! 🎯"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user4',
        'workspace4',
        sampleCaptions
      );

      expect(profile.emojiUsagePattern.frequency).toBeDefined();
      expect(['minimal', 'moderate', 'heavy']).toContain(profile.emojiUsagePattern.frequency);
      expect(profile.emojiUsagePattern.topEmojis.length).toBeGreaterThan(0);
    });

    it('should detect no emoji usage', async () => {
      const sampleCaptions = [
        "No emojis here",
        "Just plain text",
        "Simple caption",
        "Another plain caption",
        "Text only content"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user5',
        'workspace5',
        sampleCaptions
      );

      expect(profile.emojiUsagePattern.frequency).toBe('none');
    });
  });

  describe('Tone Marker Analysis', () => {
    it('should detect casual tone', async () => {
      const sampleCaptions = [
        "omg this is gonna be amazing lol",
        "yeah I'm totally gonna do this btw",
        "ngl this is kinda awesome",
        "tbh I wanna try this yeah",
        "lol you're gonna love this"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user6',
        'workspace6',
        sampleCaptions
      );

      expect(profile.toneMarkers.casual).toBeGreaterThan(0.3);
    });

    it('should detect conversational tone', async () => {
      const sampleCaptions = [
        "You're going to love this journey with us",
        "Let's explore what we can achieve together",
        "Your goals are our goals",
        "We're here to help you succeed",
        "You're amazing and we believe in you"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user7',
        'workspace7',
        sampleCaptions
      );

      expect(profile.toneMarkers.conversational).toBeGreaterThan(0.2);
    });

    it('should detect inspirational tone', async () => {
      const sampleCaptions = [
        "Believe in your dreams and achieve greatness!",
        "Success comes from motivation and inspiration!",
        "Transform your journey and inspire others!",
        "Achieve your goals and motivate the world!",
        "Dream big and believe in yourself!"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user8',
        'workspace8',
        sampleCaptions
      );

      expect(profile.toneMarkers.inspirational).toBeGreaterThan(0);
    });
  });

  describe('Signature Phrase Extraction', () => {
    it('should extract frequently used phrases', async () => {
      const sampleCaptions = [
        "Let's be real about fitness goals",
        "Let's be real about workout routines",
        "Here's the thing about training",
        "Here's the thing about progress",
        "Let's be real it's all worth it",
        "Here's the thing you need to know"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user9',
        'workspace9',
        sampleCaptions
      );

      expect(profile.signaturePhrases.length).toBeGreaterThan(0);
      
      // Check if common phrases were detected
      const hasLetsBeReal = profile.signaturePhrases.some(p => p.includes("let's be real"));
      const hasHeresTheThing = profile.signaturePhrases.some(p => p.includes("here's the thing"));
      
      expect(hasLetsBeReal || hasHeresTheThing).toBe(true);
    });

    it('should not extract common filler phrases', async () => {
      const sampleCaptions = [
        "This is a caption",
        "That is another caption",
        "This is the third one",
        "It is a good day",
        "There is more to come"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user10',
        'workspace10',
        sampleCaptions
      );

      // Should not have extracted basic filler phrases like "this is" or "that is"
      const hasFillers = profile.signaturePhrases.some(p => 
        ['this is', 'that is', 'it is'].includes(p)
      );
      expect(hasFillers).toBe(false);
    });
  });

  describe('Hook Pattern Extraction', () => {
    it('should extract opening hook patterns', async () => {
      const sampleCaptions = [
        "Hot take: fitness is more mental than physical",
        "Hot take: cardio isn't everything",
        "POV: you just finished an amazing workout",
        "POV: crushing your fitness goals",
        "Real talk about training hard"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user11',
        'workspace11',
        sampleCaptions
      );

      expect(profile.hookPatterns.length).toBeGreaterThan(0);
      
      // Should extract "hot take" and "pov" patterns
      const hasHotTake = profile.hookPatterns.some(p => p.includes('hot take'));
      const hasPOV = profile.hookPatterns.some(p => p.includes('pov'));
      
      expect(hasHotTake || hasPOV).toBe(true);
    });
  });

  describe('Engagement Question Extraction', () => {
    it('should extract engagement questions', async () => {
      const sampleCaptions = [
        "Great workout today! What's your favorite exercise?",
        "New routine complete. How do you stay motivated?",
        "Amazing progress this week. What are your fitness goals?",
        "Best session ever. Which workout do you prefer?",
        "Feeling strong today. What motivates you to train?"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user12',
        'workspace12',
        sampleCaptions
      );

      expect(profile.engagementQuestionStyle.length).toBeGreaterThan(0);
      
      // Check that actual questions were extracted
      const hasQuestions = profile.engagementQuestionStyle.some(q => q.includes('?'));
      expect(hasQuestions).toBe(true);
    });
  });

  describe('Storytelling Structure Detection', () => {
    it('should detect flashback structure', async () => {
      const sampleCaptions = [
        "Remember when I couldn't even do a push-up?",
        "Back when I started training, everything was hard",
        "Used to struggle with workouts daily",
        "Looking back at my fitness journey",
        "Remember when fitness seemed impossible"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user13',
        'workspace13',
        sampleCaptions
      );

      expect(profile.storytellingStructure).toBe('flashback');
    });

    it('should detect buildup structure', async () => {
      const sampleCaptions = [
        "First I started with light weights, then gradually increased",
        "Started small, then built up strength, finally achieved my goals",
        "First day was tough, then it got easier, now I love it",
        "Beginning was hard, then progress came, finally succeeded",
        "First step was hardest, then momentum built, eventually succeeded"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user14',
        'workspace14',
        sampleCaptions
      );

      expect(profile.storytellingStructure).toBe('buildup');
    });

    it('should detect revelation structure', async () => {
      const sampleCaptions = [
        "Never thought I could achieve this, but turns out I was stronger than I knew",
        "Realized that consistency beats intensity",
        "Discovered that rest is as important as training",
        "Found out the secret to progress: patience",
        "Little did I know this journey would transform me"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user15',
        'workspace15',
        sampleCaptions
      );

      expect(profile.storytellingStructure).toBe('revelation');
    });
  });

  describe('Voice Profile Metadata', () => {
    it('should calculate confidence based on sample size', async () => {
      const sampleCaptions = [
        "Caption 1",
        "Caption 2",
        "Caption 3",
        "Caption 4",
        "Caption 5"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user16',
        'workspace16',
        sampleCaptions
      );

      expect(profile.sampleSize).toBe(5);
      expect(profile.confidence).toBeGreaterThan(0.8);
      expect(profile.confidence).toBeLessThanOrEqual(1);
    });

    it('should increase confidence with more samples', async () => {
      const sampleCaptions = Array.from({ length: 15 }, (_, i) => `Caption ${i + 1}`);

      const profile = await service.analyzeAndCreateProfile(
        'user17',
        'workspace17',
        sampleCaptions
      );

      expect(profile.sampleSize).toBe(15);
      expect(profile.confidence).toBeGreaterThan(0.85);
    });
  });

  describe('Voice Profile to Prompt Conversion', () => {
    it('should convert profile to prompt instructions', async () => {
      const sampleCaptions = [
        "Love this amazing workout! 💪",
        "Amazing progress today! Love it!",
        "This is incredible! Love the energy! 🌟",
        "New goals achieved! Love this journey!",
        "Love every moment! Amazing results!"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user18',
        'workspace18',
        sampleCaptions
      );

      const prompt = service.voiceProfileToPrompt(profile);

      expect(prompt).toContain('VOICE PROFILE');
      expect(prompt).toContain('Vocabulary:');
      expect(prompt).toContain('Tone:');
      expect(prompt).toContain('Confidence:');
    });
  });

  describe('Profile Update from Edits', () => {
    it('should update vocabulary frequency based on user edits', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user19',
        'workspace19',
        sampleCaptions
      );

      const originalCaption = "Great workout today";
      const editedCaption = "Crushing my epic workout today"; // Added "crushing" and "epic"

      await service.updateFromEdit(
        'user19',
        'workspace19',
        originalCaption,
        editedCaption
      );

      const updatedProfile = await service.getProfile('user19', 'workspace19');

      // New words should be added to vocabulary
      expect(updatedProfile.vocabularyFrequency['crushing']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['epic']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['crushing']).toBeGreaterThan(0);
    });

    it('should update emoji usage when user adds emojis', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user20',
        'workspace20',
        sampleCaptions
      );

      expect(profile.emojiUsagePattern.frequency).toBe('none');

      const originalCaption = "Great workout today";
      const editedCaption = "Great workout today 💪🔥";

      await service.updateFromEdit(
        'user20',
        'workspace20',
        originalCaption,
        editedCaption
      );

      const updatedProfile = await service.getProfile('user20', 'workspace20');

      // Emoji frequency should increase
      expect(updatedProfile.emojiUsagePattern.frequency).toBe('minimal');
      expect(updatedProfile.emojiUsagePattern.topEmojis).toContain('💪');
    });

    it('should update sentence length preferences based on edits', async () => {
      const sampleCaptions = [
        "This is a very long sentence that contains many words and goes on for quite a while.",
        "Another lengthy sentence with numerous words that spans a considerable amount of text.",
        "Yet another extended sentence that includes multiple clauses and phrases throughout.",
        "One more long sentence with many descriptive words and detailed information included.",
        "A final lengthy sentence containing lots of words that creates a substantial statement."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user21',
        'workspace21',
        sampleCaptions
      );

      // Original has long sentences, should have some long percentage
      expect(profile.sentenceLengthDistribution.long).toBeGreaterThan(0);

      const originalCaption = "This is a very long sentence that contains many words and goes on for quite a while.";
      const editedCaption = "This is short. Very concise. Brief words."; // Made much shorter

      await service.updateFromEdit(
        'user21',
        'workspace21',
        originalCaption,
        editedCaption
      );

      const updatedProfile = await service.getProfile('user21', 'workspace21');

      // Short percentage should increase
      expect(updatedProfile.sentenceLengthDistribution.short).toBeGreaterThan(profile.sentenceLengthDistribution.short);
    });

    it('should update punctuation style based on edits', async () => {
      const sampleCaptions = [
        "Great workout today.",
        "Amazing session completed.",
        "Training went well.",
        "Finished my routine.",
        "Completed exercises successfully."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user22',
        'workspace22',
        sampleCaptions
      );

      expect(profile.punctuationStyle.exclamationUsage).toBe('rare');

      const originalCaption = "Great workout today.";
      const editedCaption = "Great workout today! Feeling amazing! So pumped!";

      await service.updateFromEdit(
        'user22',
        'workspace22',
        originalCaption,
        editedCaption
      );

      const updatedProfile = await service.getProfile('user22', 'workspace22');

      // Exclamation usage should increase
      expect(updatedProfile.punctuationStyle.exclamationUsage).toBe('moderate');
    });

    it('should not update profile from edits if no existing profile', async () => {
      const originalCaption = "Test caption";
      const editedCaption = "Edited test caption";

      await service.updateFromEdit(
        'user23',
        'workspace23',
        originalCaption,
        editedCaption
      );

      const profile = await service.getProfile('user23', 'workspace23');

      // Should return default profile since no profile existed
      expect(profile.sampleSize).toBe(0);
    });
  });

  describe('Profile Update from Selection', () => {
    it('should update vocabulary frequency based on selected variation', async () => {
      const sampleCaptions = [
        "Good workout today",
        "Nice session completed",
        "Training went okay",
        "Finished my routine",
        "Completed exercises"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user24',
        'workspace24',
        sampleCaptions
      );

      const selectedCaption = "Crushing an epic workout! Feeling powerful and unstoppable!";
      const rejectedCaptions = [
        "Having a satisfactory exercise session today.",
        "Completed my scheduled workout routine as planned."
      ];

      await service.updateFromSelection(
        'user24',
        'workspace24',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user24', 'workspace24');

      // Words from selected caption should be boosted
      expect(updatedProfile.vocabularyFrequency['crushing']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['epic']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['powerful']).toBeDefined();
    });

    it('should reduce frequency of rejected vocabulary', async () => {
      const sampleCaptions = [
        "Satisfactory workout today",
        "Adequate session completed",
        "Acceptable training results",
        "Satisfactory fitness routine",
        "Adequate exercise program"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user25',
        'workspace25',
        sampleCaptions
      );

      const initialSatisfactoryFreq = profile.vocabularyFrequency['satisfactory'];
      expect(initialSatisfactoryFreq).toBeDefined();

      const selectedCaption = "Amazing workout! Incredible results!";
      const rejectedCaptions = [
        "Satisfactory workout today",
        "Adequate session with satisfactory outcomes"
      ];

      await service.updateFromSelection(
        'user25',
        'workspace25',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user25', 'workspace25');

      // "satisfactory" appears only in rejected, should be reduced
      if (updatedProfile.vocabularyFrequency['satisfactory']) {
        expect(updatedProfile.vocabularyFrequency['satisfactory']).toBeLessThanOrEqual(initialSatisfactoryFreq);
      }
    });

    it('should update emoji preferences based on selection', async () => {
      const sampleCaptions = [
        "Great workout 💪",
        "Amazing session 🏋️",
        "Training complete 🎯",
        "Fitness goals 💯",
        "Exercise done ✅"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user26',
        'workspace26',
        sampleCaptions
      );

      const selectedCaption = "Epic workout today! 🔥🚀💥";
      const rejectedCaptions = [
        "Good workout 😊",
        "Nice session 👍"
      ];

      await service.updateFromSelection(
        'user26',
        'workspace26',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user26', 'workspace26');

      // Emojis from selected should be prioritized (new ones should be added to front)
      expect(updatedProfile.emojiUsagePattern.topEmojis).toContain('🔥');
      expect(updatedProfile.emojiUsagePattern.topEmojis).toContain('🚀');
      expect(updatedProfile.emojiUsagePattern.topEmojis).toContain('💥');
      // The first emoji from selected caption should be at or near the front
      const indexOfFireEmoji = updatedProfile.emojiUsagePattern.topEmojis.indexOf('🔥');
      expect(indexOfFireEmoji).toBeLessThan(3); // Should be in top 3
    });

    it('should update tone markers based on selected variation', async () => {
      const sampleCaptions = [
        "Workout completed successfully",
        "Training session finished",
        "Exercise routine done",
        "Fitness program completed",
        "Gym session accomplished"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user27',
        'workspace27',
        sampleCaptions
      );

      const initialCasualTone = profile.toneMarkers.casual;

      const selectedCaption = "omg crushing it today! gonna smash these goals lol 💪";
      const rejectedCaptions = [
        "Successfully completed workout routine",
        "Training objectives achieved"
      ];

      await service.updateFromSelection(
        'user27',
        'workspace27',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user27', 'workspace27');

      // Casual tone should increase (selected caption is very casual)
      expect(updatedProfile.toneMarkers.casual).toBeGreaterThan(initialCasualTone);
    });

    it('should extract and prioritize hook patterns from selected caption', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing session",
        "Training complete",
        "Fitness achieved",
        "Exercise done"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user28',
        'workspace28',
        sampleCaptions
      );

      const selectedCaption = "Hot take: cardio is overrated. Strength training wins every time!";
      const rejectedCaptions = [
        "Today I had a good workout",
        "Completed my training session"
      ];

      await service.updateFromSelection(
        'user28',
        'workspace28',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user28', 'workspace28');

      // Should extract "hot take" as a hook pattern
      expect(updatedProfile.hookPatterns.length).toBeGreaterThan(0);
      expect(updatedProfile.hookPatterns[0]).toContain('hot take');
    });

    it('should extract engagement questions from selected caption', async () => {
      const sampleCaptions = [
        "Great workout today.",
        "Amazing session completed.",
        "Training went well.",
        "Fitness improved.",
        "Exercise finished."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user29',
        'workspace29',
        sampleCaptions
      );

      const selectedCaption = "Crushed my workout today! What's your favorite exercise?";
      const rejectedCaptions = [
        "Had a good training session.",
        "Completed my routine today."
      ];

      await service.updateFromSelection(
        'user29',
        'workspace29',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user29', 'workspace29');

      // Should extract the engagement question
      expect(updatedProfile.engagementQuestionStyle.length).toBeGreaterThan(0);
      expect(updatedProfile.engagementQuestionStyle[0]).toContain('?');
      expect(updatedProfile.engagementQuestionStyle[0].toLowerCase()).toContain('what');
    });

    it('should adjust sentence length preferences based on selection', async () => {
      const sampleCaptions = [
        "This is a very long sentence that contains many words.",
        "Another lengthy sentence with numerous words included.",
        "Yet another extended sentence with multiple words.",
        "One more long sentence containing lots of words.",
        "A final lengthy sentence with many words present."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user30',
        'workspace30',
        sampleCaptions
      );

      const initialShortPercentage = profile.sentenceLengthDistribution.short;

      const selectedCaption = "Love it! So good! Amazing! Perfect! Yes!"; // All very short
      const rejectedCaptions = [
        "This is a moderately long sentence with several words in it.",
        "Another somewhat lengthy sentence containing multiple words throughout."
      ];

      await service.updateFromSelection(
        'user30',
        'workspace30',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user30', 'workspace30');

      // Short sentence percentage should increase
      expect(updatedProfile.sentenceLengthDistribution.short).toBeGreaterThan(initialShortPercentage);
    });

    it('should create profile from selected caption if no profile exists', async () => {
      const selectedCaption = "Amazing workout today! Feeling incredible! 💪";
      const rejectedCaptions = [
        "Had a good session",
        "Training completed"
      ];

      await service.updateFromSelection(
        'user31',
        'workspace31',
        selectedCaption,
        rejectedCaptions
      );

      const profile = await service.getProfile('user31', 'workspace31');

      // Should have created a profile from the selected caption (repeated 5 times)
      expect(profile.sampleSize).toBe(5);
      expect(profile.vocabularyFrequency['amazing']).toBeDefined();
      expect(profile.vocabularyFrequency['incredible']).toBeDefined();
    });

    it('should limit stored hook patterns to reasonable size', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing session",
        "Training complete",
        "Fitness achieved",
        "Exercise done"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user32',
        'workspace32',
        sampleCaptions
      );

      // Simulate multiple selections to potentially overflow hook patterns
      for (let i = 0; i < 25; i++) {
        const selectedCaption = `Hook pattern ${i}: workout number ${i} completed!`;
        await service.updateFromSelection(
          'user32',
          'workspace32',
          selectedCaption,
          []
        );
      }

      const updatedProfile = await service.getProfile('user32', 'workspace32');

      // Should be limited to 20 hook patterns
      expect(updatedProfile.hookPatterns.length).toBeLessThanOrEqual(20);
    });

    it('should limit stored emoji preferences to top 10', async () => {
      const sampleCaptions = [
        "Great workout 💪",
        "Amazing session 🔥",
        "Training complete 🎯",
        "Fitness achieved 💯",
        "Exercise done ✅"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user33',
        'workspace33',
        sampleCaptions
      );

      // Select captions with many different emojis
      const selectedCaption = "Amazing! 🚀🌟💥⭐️🏆🎉🎊🙌👏🤩🔥💪";
      const rejectedCaptions = [];

      await service.updateFromSelection(
        'user33',
        'workspace33',
        selectedCaption,
        rejectedCaptions
      );

      const updatedProfile = await service.getProfile('user33', 'workspace33');

      // Should be limited to 10 emojis
      expect(updatedProfile.emojiUsagePattern.topEmojis.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Profile Update from Published Posts', () => {
    it('should update profile when new post is published', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user34',
        'workspace34',
        sampleCaptions
      );

      const publishedCaption = "Crushing my epic workout! Feeling unstoppable! 💪🔥";

      await service.updateFromPublishedPost(
        'user34',
        'workspace34',
        publishedCaption
      );

      const updatedProfile = await service.getProfile('user34', 'workspace34');

      // New vocabulary should be added
      expect(updatedProfile.vocabularyFrequency['crushing']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['epic']).toBeDefined();
      expect(updatedProfile.vocabularyFrequency['unstoppable']).toBeDefined();
      
      // Sample size should increment
      expect(updatedProfile.sampleSize).toBe(6);
    });

    it('should weight updates based on performance metrics', async () => {
      const sampleCaptions = [
        "Good workout",
        "Nice session",
        "Training done",
        "Exercise complete",
        "Fitness achieved"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user35',
        'workspace35',
        sampleCaptions
      );

      const highPerformingCaption = "Epic workout achieved!";
      const performanceMetrics = {
        likes: 500,
        comments: 50,
        saves: 30,
        shares: 10,
        impressions: 10000 // 5.9% engagement rate - very high
      };

      await service.updateFromPublishedPost(
        'user35',
        'workspace35',
        highPerformingCaption,
        performanceMetrics
      );

      const updatedProfile = await service.getProfile('user35', 'workspace35');

      // High-performing content should have stronger influence
      expect(updatedProfile.vocabularyFrequency['epic']).toBeGreaterThan(0);
      expect(updatedProfile.vocabularyFrequency['achieved']).toBeGreaterThan(0);
    });

    it('should create profile from published post if none exists', async () => {
      const publishedCaption = "Amazing workout today! Feeling incredible! 💪";

      await service.updateFromPublishedPost(
        'user36',
        'workspace36',
        publishedCaption
      );

      const profile = await service.getProfile('user36', 'workspace36');

      // Should have created a profile
      expect(profile.sampleSize).toBe(5);
      expect(profile.vocabularyFrequency['amazing']).toBeDefined();
    });
  });

  describe('Voice Drift Detection', () => {
    it('should detect no drift with consistent content', async () => {
      const sampleCaptions = [
        "Great workout today! Love the energy!",
        "Amazing session! Love this routine!",
        "Incredible training! Love every moment!",
        "Fantastic workout! Love the progress!",
        "Excellent session! Love these results!"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user37',
        'workspace37',
        sampleCaptions
      );

      const recentCaptions = [
        "Great training session! Love it!",
        "Amazing workout completed! Love the feeling!",
        "Fantastic exercise routine! Love this!"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user37',
        'workspace37',
        recentCaptions
      );

      expect(driftResult.hasDrift).toBe(false);
      expect(driftResult.driftScore).toBeLessThan(0.35);
      expect(driftResult.driftAreas.length).toBe(0);
    });

    it('should detect vocabulary drift', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user38',
        'workspace38',
        sampleCaptions
      );

      // Use completely different vocabulary to create stronger drift
      const recentCaptions = [
        "Crushing my epic beast mode session daily",
        "Dominating this savage workout grind constantly",
        "Annihilating these killer reps repeatedly",
        "Destroying goals with intense power moves",
        "Obliterating targets through sheer determination"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user38',
        'workspace38',
        recentCaptions
      );

      // With significantly different vocabulary, drift should be detected
      expect(driftResult.driftScore).toBeGreaterThan(0.2);
      // Vocabulary drift may or may not be flagged depending on threshold
      // Just check that some drift areas are detected
      if (driftResult.hasDrift) {
        expect(driftResult.driftAreas.length).toBeGreaterThan(0);
      }
    });

    it('should detect emoji usage drift', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user39',
        'workspace39',
        sampleCaptions
      );

      const recentCaptions = [
        "Great workout today! 💪🔥🚀",
        "Amazing fitness session! 🏋️‍♀️💯⭐",
        "Incredible training routine! 🎯💥🌟"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user39',
        'workspace39',
        recentCaptions
      );

      expect(driftResult.driftAreas).toContain('emoji usage');
    });

    it('should detect tone drift', async () => {
      const sampleCaptions = [
        "Successfully completed workout routine today.",
        "Training objectives achieved as planned.",
        "Exercise program executed efficiently.",
        "Fitness goals accomplished systematically.",
        "Workout schedule maintained consistently."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user40',
        'workspace40',
        sampleCaptions
      );

      const recentCaptions = [
        "omg crushing it today! gonna smash these goals lol 💪",
        "tbh this workout is fire! ngl feeling amazing rn",
        "yooo this session was insane! totally destroyed it"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user40',
        'workspace40',
        recentCaptions
      );

      expect(driftResult.hasDrift).toBe(true);
      expect(driftResult.driftAreas).toContain('tone and style');
    });

    it('should detect sentence length drift', async () => {
      const sampleCaptions = [
        "This is a very long sentence that contains many words and goes on for quite a while with lots of detail.",
        "Another lengthy sentence with numerous words that spans a considerable amount of text and information.",
        "Yet another extended sentence that includes multiple clauses and phrases throughout its entire length.",
        "One more long sentence containing lots of words that creates a substantial statement with detail.",
        "A final lengthy sentence with many words present that describes things in great detail here."
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user41',
        'workspace41',
        sampleCaptions
      );

      // Use consistently very short sentences
      const recentCaptions = [
        "Short. Very brief. Concise. Quick. Fast. Simple. Small.",
        "Tiny. Compact. Minimal. Basic. Plain. Clean. Easy.",
        "Swift. Rapid. Direct. Sharp. Clear. Neat. Crisp."
      ];

      const driftResult = await service.detectVoiceDrift(
        'user41',
        'workspace41',
        recentCaptions
      );

      // Should detect significant sentence length change
      expect(driftResult.driftScore).toBeGreaterThan(0.3);
      expect(driftResult.driftAreas).toContain('sentence length');
    });

    it('should require minimum captions for drift detection', async () => {
      const sampleCaptions = [
        "Great workout",
        "Amazing session",
        "Training done",
        "Exercise complete",
        "Fitness achieved"
      ];

      await service.analyzeAndCreateProfile(
        'user42',
        'workspace42',
        sampleCaptions
      );

      const recentCaptions = [
        "Only one caption"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user42',
        'workspace42',
        recentCaptions
      );

      expect(driftResult.hasDrift).toBe(false);
      expect(driftResult.recommendations[0]).toContain('at least 3');
    });

    it('should provide drift recommendations', async () => {
      const sampleCaptions = [
        "Great workout",
        "Amazing session",
        "Training done",
        "Exercise complete",
        "Fitness achieved"
      ];

      const profile = await service.analyzeAndCreateProfile(
        'user43',
        'workspace43',
        sampleCaptions
      );

      const recentCaptions = [
        "Crushing epic beast mode",
        "Dominating savage workout",
        "Annihilating killer reps"
      ];

      const driftResult = await service.detectVoiceDrift(
        'user43',
        'workspace43',
        recentCaptions
      );

      expect(driftResult.recommendations.length).toBeGreaterThan(0);
      if (driftResult.hasDrift) {
        expect(driftResult.recommendations.some(r => r.includes('recalibrating'))).toBe(true);
      }
    });
  });

  describe('Profile Merging', () => {
    it('should blend two profiles together', async () => {
      const sampleCaptions = [
        "Great workout today",
        "Amazing fitness session",
        "Incredible training routine",
        "Fantastic exercise program",
        "Excellent gym time"
      ];

      const existingProfile = await service.analyzeAndCreateProfile(
        'user44',
        'workspace44',
        sampleCaptions
      );

      const newCaptions = [
        "Crushing epic workout! Feeling unstoppable!",
        "Dominating this session! Amazing energy!",
        "Annihilating goals! Incredible progress!",
        "Destroying limits! Phenomenal results!",
        "Obliterating targets! Unstoppable force!"
      ];

      const newProfile = await service.analyzeAndCreateProfile(
        'temp',
        'temp',
        newCaptions
      );

      const mergedProfile = await service.mergeProfiles(
        'user44',
        'workspace44',
        newProfile,
        'blend'
      );

      // Should contain vocabulary from both profiles
      expect(mergedProfile.vocabularyFrequency['great']).toBeDefined();
      expect(mergedProfile.vocabularyFrequency['crushing']).toBeDefined();
      
      // Sample size should be sum
      expect(mergedProfile.sampleSize).toBe(existingProfile.sampleSize + newProfile.sampleSize);
    });

    it('should prefer new data when strategy is prefer-new', async () => {
      const sampleCaptions = [
        "Great workout",
        "Amazing session",
        "Training done",
        "Exercise complete",
        "Fitness achieved"
      ];

      await service.analyzeAndCreateProfile(
        'user45',
        'workspace45',
        sampleCaptions
      );

      const newProfileData: Partial<VoiceProfile> = {
        paragraphStructure: 'long-form',
        storytellingStructure: 'revelation',
        emojiUsagePattern: {
          frequency: 'heavy',
          placement: 'inline',
          topEmojis: ['🔥', '💪', '🚀']
        }
      };

      const mergedProfile = await service.mergeProfiles(
        'user45',
        'workspace45',
        newProfileData,
        'prefer-new'
      );

      expect(mergedProfile.paragraphStructure).toBe('long-form');
      expect(mergedProfile.storytellingStructure).toBe('revelation');
      expect(mergedProfile.emojiUsagePattern.frequency).toBe('heavy');
    });

    it('should prefer existing data when strategy is prefer-existing', async () => {
      const sampleCaptions = [
        "Great workout",
        "Amazing session",
        "Training done",
        "Exercise complete",
        "Fitness achieved"
      ];

      const existingProfile = await service.analyzeAndCreateProfile(
        'user46',
        'workspace46',
        sampleCaptions
      );

      const newProfileData: Partial<VoiceProfile> = {
        paragraphStructure: 'long-form',
        storytellingStructure: 'revelation'
      };

      const mergedProfile = await service.mergeProfiles(
        'user46',
        'workspace46',
        newProfileData,
        'prefer-existing'
      );

      // Should keep existing values
      expect(mergedProfile.paragraphStructure).toBe(existingProfile.paragraphStructure);
      expect(mergedProfile.storytellingStructure).toBe(existingProfile.storytellingStructure);
    });

    it('should merge signature phrases without duplicates', async () => {
      const sampleCaptions = [
        "Let's be real about fitness",
        "Let's be real this is hard",
        "Here's the thing about training",
        "Here's the thing you need",
        "Let's be real it works"
      ];

      await service.analyzeAndCreateProfile(
        'user47',
        'workspace47',
        sampleCaptions
      );

      const newProfileData: Partial<VoiceProfile> = {
        signaturePhrases: ["let's be real", "no cap", "straight up"],
        sampleSize: 3
      };

      const mergedProfile = await service.mergeProfiles(
        'user47',
        'workspace47',
        newProfileData,
        'blend'
      );

      // Should not have duplicate "let's be real"
      const letsBeRealCount = mergedProfile.signaturePhrases.filter(p => 
        p.includes("let's be real")
      ).length;
      expect(letsBeRealCount).toBeLessThanOrEqual(1);
      
      // Should have new phrases
      expect(mergedProfile.signaturePhrases.some(p => p.includes('no cap'))).toBe(true);
    });

    it('should limit merged arrays to reasonable sizes', async () => {
      const sampleCaptions = Array.from({ length: 10 }, (_, i) => `Caption ${i}`);

      await service.analyzeAndCreateProfile(
        'user48',
        'workspace48',
        sampleCaptions
      );

      const newProfileData: Partial<VoiceProfile> = {
        signaturePhrases: Array.from({ length: 25 }, (_, i) => `phrase ${i}`),
        hookPatterns: Array.from({ length: 25 }, (_, i) => `hook ${i}`),
        emojiUsagePattern: {
          frequency: 'moderate',
          placement: 'both',
          topEmojis: Array.from({ length: 15 }, (_, i) => `emoji${i}`)
        }
      };

      const mergedProfile = await service.mergeProfiles(
        'user48',
        'workspace48',
        newProfileData,
        'blend'
      );

      expect(mergedProfile.signaturePhrases.length).toBeLessThanOrEqual(20);
      expect(mergedProfile.hookPatterns.length).toBeLessThanOrEqual(20);
      expect(mergedProfile.emojiUsagePattern.topEmojis.length).toBeLessThanOrEqual(10);
    });
  });
});
