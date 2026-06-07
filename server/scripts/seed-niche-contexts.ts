/**
 * Seed script for niche context database
 * Task 4.3: Seed initial niche context database
 * 
 * This script populates the niche contexts collection with comprehensive data for major Instagram niches:
 * - Fashion, Fitness, Food, Travel, Beauty, Business, Lifestyle
 * 
 * Each niche includes:
 * - Trending topics and hashtag strategies
 * - Language patterns and slang terms
 * - Audience preferences and engagement triggers
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { NicheContextModel } from '../models/NicheContext/NicheContext';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface NicheContextData {
  niche: string;
  vocabulary: string[];
  slangTerms: Map<string, string>;
  culturalReferences: string[];
  trendingTopics: string[];
  trendingHashtags: string[];
  trendingPhrases: string[];
  typicalEmojis: string[];
  toneGuidelines: string;
  lastUpdated: Date;
}

/**
 * Major Instagram niche contexts with comprehensive data
 */
const nicheContexts: NicheContextData[] = [
  // FASHION NICHE
  {
    niche: 'fashion',
    vocabulary: [
      'outfit', 'ootd', 'style', 'look', 'fashion', 'trend', 'vintage', 'aesthetic',
      'vibe', 'lewk', 'fit', 'drip', 'slay', 'serve', 'streetwear', 'haute', 'couture',
      'capsule', 'wardrobe', 'layering', 'thrifted', 'sustainable', 'slow fashion',
      'designer', 'runway', 'collection', 'pieces', 'staple', 'investment', 'timeless'
    ],
    slangTerms: new Map([
      ['ootd', 'outfit of the day'],
      ['lewk', 'a particularly stylish look'],
      ['slay', 'to look exceptionally good'],
      ['serve', 'to deliver an exceptional look'],
      ['drip', 'stylish outfit or accessories'],
      ['fit', 'outfit'],
      ['no cap', 'no lie, seriously'],
      ['bussin', 'really good'],
      ['ate', 'did exceptionally well'],
      ['giving', 'projecting a certain vibe or aesthetic']
    ]),
    culturalReferences: [
      'old money aesthetic', 'quiet luxury', 'coastal grandmother', 'mob wife aesthetic',
      'clean girl aesthetic', 'dark academia', 'cottagecore', 'Y2K fashion',
      'Barbiecore', 'Balletcore', 'Tomato girl summer', 'Copenhagen fashion week',
      'Paris Fashion Week', 'Met Gala', 'street style', 'thrift flips'
    ],
    trendingTopics: [
      'sustainable fashion', 'capsule wardrobe', 'quiet luxury', 'old money style',
      'dopamine dressing', 'winter layering', 'thrift hauls', 'outfit inspo',
      'styling tips', 'color theory', 'body positivity', 'size inclusivity',
      'vintage finds', 'designer dupes', 'outfit formulas', 'wardrobe essentials'
    ],
    trendingHashtags: [
      '#OOTD', '#FashionInspo', '#StyleBlogger', '#FashionDiary', '#StreetStyle',
      '#ThriftFlip', '#VintageFashion', '#SustainableStyle', '#OutfitIdeas',
      '#FashionTrends', '#QuietLuxury', '#OldMoneyAesthetic', '#CapsuleWardrobe',
      '#SlowFashion', '#FashionTok', '#StyleTips', '#WardrobeEssentials',
      '#OutfitFormula', '#FashionHaul', '#LookBook'
    ],
    trendingPhrases: [
      'outfit of the day', 'this look is giving', 'obsessed with this fit',
      'found this while thrifting', 'timeless piece', 'styling hack',
      'transition piece', 'investment buy', 'wore this to', 'get ready with me',
      'outfit formula', 'on repeat', 'living for this', 'serving looks'
    ],
    typicalEmojis: ['👗', '👠', '👜', '✨', '💫', '🤍', '🖤', '💅', '💃', '🔥', '😍', '🛍️'],
    toneGuidelines: 'Confident, style-focused, aspirational yet relatable. Use fashion terminology naturally but explain styling concepts. Mix high-fashion references with accessible advice. Celebrate individual style and body positivity.',
    lastUpdated: new Date()
  },

  // FITNESS NICHE
  {
    niche: 'fitness',
    vocabulary: [
      'gains', 'pump', 'shredded', 'lean', 'bulk', 'cut', 'macros', 'protein',
      'workout', 'training', 'reps', 'sets', 'PR', 'personal record', 'beast mode',
      'grind', 'hustle', 'discipline', 'consistency', 'transformation', 'progress',
      'mindset', 'wellness', 'mobility', 'recovery', 'rest day', 'active recovery'
    ],
    slangTerms: new Map([
      ['gains', 'muscle growth and progress'],
      ['shredded', 'extremely lean and muscular'],
      ['pump', 'temporary muscle swelling during workout'],
      ['PR', 'personal record - best performance'],
      ['beast mode', 'intense workout mentality'],
      ['no days off', 'commitment to consistent training'],
      ['crushing it', 'performing exceptionally well'],
      ['locked in', 'fully focused and committed'],
      ['legit', 'genuinely effective'],
      ['hit different', 'uniquely effective or impactful']
    ]),
    culturalReferences: [
      'hot girl walk', '75 hard challenge', 'gym tok', 'gym rat',
      'pre-workout jitters', 'leg day struggles', 'gym crush', 'New Year resolutions',
      'summer body prep', 'bulk season', 'bodybuilding lifestyle', 'CrossFit community',
      'peloton squad', 'marathon training', 'yoga journey'
    ],
    trendingTopics: [
      'home workouts', 'gym motivation', 'fitness transformation', 'weight loss journey',
      'muscle building', 'strength training', 'HIIT workouts', 'morning routines',
      'meal prep', 'protein recipes', 'workout splits', 'gym tips',
      'mental health fitness', 'sustainable fitness', 'body recomposition',
      'functional training', 'mobility work', 'recovery tips'
    ],
    trendingHashtags: [
      '#FitnessMotivation', '#GymLife', '#FitnessJourney', '#WorkoutRoutine',
      '#FitFam', '#GymTok', '#TransformationTuesday', '#ProgressNotPerfection',
      '#FitnessGoals', '#HealthyLifestyle', '#MealPrep', '#ProteinRecipes',
      '#StrengthTraining', '#HIIT', '#GymMotivation', '#FitnessTips',
      '#WorkoutVideo', '#ExerciseRoutine', '#FitnessAddict', '#TrainHard'
    ],
    trendingPhrases: [
      'no days off', 'trust the process', 'earned not given', 'mind over matter',
      'strong is the new sexy', 'progress not perfection', 'consistency is key',
      'beast mode activated', 'crushing my goals', 'train like a beast',
      'no excuses', 'sweat is fat crying', 'make it burn', 'pain is weakness leaving'
    ],
    typicalEmojis: ['💪', '🔥', '🏋️', '🥇', '⚡', '💯', '🎯', '👊', '🦾', '💥', '🏆', '🙌'],
    toneGuidelines: 'Motivating, energetic, authentic. Balance intensity with relatability. Show vulnerability alongside strength. Use fitness terminology but stay accessible to beginners. Focus on sustainable habits over quick fixes.',
    lastUpdated: new Date()
  },

  // FOOD NICHE
  {
    niche: 'food',
    vocabulary: [
      'recipe', 'delicious', 'yummy', 'foodie', 'homemade', 'comfort food', 'cravings',
      'indulgent', 'decadent', 'savory', 'sweet', 'spicy', 'flavor', 'texture',
      'crispy', 'juicy', 'tender', 'flaky', 'creamy', 'rich', 'fresh', 'seasonal',
      'farm to table', 'organic', 'artisan', 'gourmet', 'authentic', 'traditional'
    ],
    slangTerms: new Map([
      ['bussin', 'extremely delicious'],
      ['slaps', 'tastes amazing'],
      ['hits different', 'uniquely satisfying'],
      ['no crumbs', 'absolutely perfect'],
      ['chef kiss', 'perfection'],
      ['food coma', 'sleepiness after big meal'],
      ['hangry', 'angry because hungry'],
      ['nom nom', 'eating sounds, delicious'],
      ['drool worthy', 'looks incredibly appetizing'],
      ['fire', 'excellent, amazing']
    ]),
    culturalReferences: [
      'TikTok recipes', 'viral food trends', 'butter board', 'smash burger',
      'baked feta pasta', 'cloud bread', 'dalgona coffee', 'charcuterie board',
      'sourdough starter', 'air fryer everything', 'meal prep Sunday',
      'restaurant dupe', 'comfort food classics', 'grandmas recipes'
    ],
    trendingTopics: [
      'easy recipes', 'quick meals', '30 minute dinners', 'meal prep ideas',
      'healthy eating', 'comfort food', 'viral recipes', 'cooking hacks',
      'kitchen tips', 'budget meals', 'leftovers transformation', 'one pot meals',
      'sheet pan dinners', 'air fryer recipes', 'instant pot meals',
      'vegan options', 'gluten free', 'food photography'
    ],
    trendingHashtags: [
      '#FoodPorn', '#FoodieLife', '#HomeCooked', '#RecipeOfTheDay', '#Foodstagram',
      '#Yummy', '#InstaFood', '#EasyRecipes', '#MealPrep', '#ComfortFood',
      '#HealthyEating', '#FoodPhotography', '#CookingAtHome', '#FoodBlogger',
      '#QuickMeals', '#ViralRecipe', '#FoodTok', '#RecipeShare', '#Delicious',
      '#HomemadeCooking'
    ],
    trendingPhrases: [
      'recipe coming soon', 'this is bussin', 'tastes like heaven', 'so good',
      'hits different', 'cannot stop eating this', 'game changer',
      'weeknight dinner', 'comfort in a bowl', 'better than takeout',
      'restaurant quality', 'made with love', 'family favorite', 'no leftovers'
    ],
    typicalEmojis: ['🍕', '🍔', '🍰', '🔥', '😋', '🤤', '👌', '✨', '🍳', '🥘', '🍜', '❤️'],
    toneGuidelines: 'Enthusiastic, sensory-rich, inviting. Use descriptive language that makes food come alive. Balance indulgence with practical cooking tips. Create a welcoming atmosphere that celebrates home cooking.',
    lastUpdated: new Date()
  },

  // TRAVEL NICHE
  {
    niche: 'travel',
    vocabulary: [
      'adventure', 'wanderlust', 'explore', 'journey', 'destination', 'paradise',
      'bucket list', 'nomad', 'backpacking', 'roadtrip', 'getaway', 'escape',
      'hidden gem', 'off the beaten path', 'local', 'authentic', 'culture',
      'landscape', 'scenic', 'breathtaking', 'stunning', 'views', 'vibes'
    ],
    slangTerms: new Map([
      ['wanderlust', 'strong desire to travel'],
      ['bucket list', 'list of destinations to visit before death'],
      ['hidden gem', 'underrated or lesser-known location'],
      ['off the beaten path', 'non-touristy location'],
      ['living my best life', 'enjoying life to the fullest'],
      ['main character energy', 'feeling like the protagonist of your own story'],
      ['giving paradise', 'looks like paradise'],
      ['no thoughts head empty', 'completely relaxed mindset'],
      ['unbothered', 'completely relaxed and carefree']
    ]),
    culturalReferences: [
      'digital nomad life', 'van life', 'Eat Pray Love', 'travel influencer',
      'Instagram spots', 'golden hour', 'sunrise chaser', 'sunset vibes',
      'solo travel', 'girls trip', 'baecation', 'workcation',
      'slow travel', 'sustainable tourism', 'passport stamps'
    ],
    trendingTopics: [
      'travel tips', 'budget travel', 'solo travel', 'digital nomad',
      'hidden destinations', 'travel hacks', 'packing tips', 'travel photography',
      'cultural experiences', 'local food', 'adventure travel', 'luxury travel',
      'sustainable travel', 'road trip', 'city guides', 'travel itinerary',
      'weekend getaway', 'bucket list destinations'
    ],
    trendingHashtags: [
      '#TravelGram', '#Wanderlust', '#TravelPhotography', '#InstaTravel',
      '#TravelBlogger', '#ExploreMore', '#AdventureAwaits', '#TravelDiaries',
      '#BeautifulDestinations', '#TravelTheWorld', '#BucketList', '#SoloTravel',
      '#TravelTips', '#DigitalNomad', '#TravelLife', '#PassportReady',
      '#TravelAddict', '#WorldTraveler', '#TravelInspiration', '#HiddenGems'
    ],
    trendingPhrases: [
      'take me back', 'living my best life', 'paradise found', 'views for days',
      'wanderlust calling', 'adventure awaits', 'making memories', 'golden hour',
      'off the beaten path', 'local vibes', 'culture shock', 'travel goals',
      'bucket list destination', 'need a vacation', 'permanent vacation mode'
    ],
    typicalEmojis: ['✈️', '🌍', '🗺️', '📸', '🌴', '🏖️', '⛰️', '🌅', '🌊', '🎒', '✨', '💫'],
    toneGuidelines: 'Inspiring, adventurous, experiential. Paint vivid pictures of destinations. Balance aspiration with practical travel advice. Celebrate cultural experiences and authentic moments over perfect Instagram shots.',
    lastUpdated: new Date()
  },

  // BEAUTY NICHE
  {
    niche: 'beauty',
    vocabulary: [
      'glow', 'radiant', 'flawless', 'skincare', 'routine', 'holy grail', 'game changer',
      'must have', 'obsessed', 'drugstore', 'luxury', 'dupe', 'texture', 'coverage',
      'pigmented', 'blendable', 'long lasting', 'waterproof', 'transfer proof',
      'hydrating', 'moisturizing', 'nourishing', 'glowy', 'dewy', 'matte'
    ],
    slangTerms: new Map([
      ['holy grail', 'favorite must-have product'],
      ['dupe', 'affordable alternative to expensive product'],
      ['skip', 'not worth buying'],
      ['ride or die', 'absolute favorite product'],
      ['pan', 'use up all of a product'],
      ['empty', 'finished product'],
      ['snatched', 'perfectly applied or looking sharp'],
      ['beat', 'fully applied makeup'],
      ['bake', 'setting makeup with powder technique'],
      ['no makeup makeup', 'natural-looking makeup']
    ]),
    culturalReferences: [
      'clean girl aesthetic', 'dewy skin', 'glass skin', 'slugging', 'skinimalism',
      'dopamine makeup', 'Euphoria makeup', 'latte makeup', 'strawberry girl',
      'supermodel skin', 'no makeup makeup', 'Sephora haul', 'PR unboxing',
      'get ready with me', 'makeup transformation', 'drugstore vs luxury'
    ],
    trendingTopics: [
      'skincare routine', 'morning routine', 'night routine', 'product reviews',
      'makeup tutorial', 'grwm', 'holy grails', 'drugstore finds', 'luxury beauty',
      'clean beauty', 'k-beauty', 'skincare tips', 'anti-aging', 'acne solutions',
      'glowing skin', 'makeup hacks', 'beauty dupes', 'empties', 'haul video'
    ],
    trendingHashtags: [
      '#Skincare', '#BeautyTips', '#MakeupTutorial', '#GRWM', '#SkincareRoutine',
      '#CleanBeauty', '#BeautyProducts', '#MakeupLover', '#SkincareAddict',
      '#BeautyBlogger', '#HolyGrail', '#BeautyHaul', '#GlowingSkin', '#MakeupLooks',
      '#SkincareJunkie', '#BeautyObsessed', '#InstaBeauty', '#BeautyTok',
      '#SkincareReview', '#MakeupOfTheDay'
    ],
    trendingPhrases: [
      'obsessed with this', 'holy grail product', 'game changer', 'worth the hype',
      'drugstore gem', 'my skin has never looked better', 'glass skin effect',
      'glow from within', 'cant live without', 'empty in a month',
      'better than luxury', 'saved my skin', 'makeup has not moved', 'all day wear'
    ],
    typicalEmojis: ['💄', '✨', '💅', '🌟', '💖', '🌸', '💗', '🦋', '🪞', '🧴', '💆', '😍'],
    toneGuidelines: 'Enthusiastic, honest, beauty-obsessed. Share genuine reviews and experiences. Balance aspiration with realistic expectations. Celebrate self-care and confidence. Use beauty terminology but explain techniques clearly.',
    lastUpdated: new Date()
  },

  // BUSINESS NICHE
  {
    niche: 'business',
    vocabulary: [
      'entrepreneur', 'founder', 'CEO', 'startup', 'hustle', 'grind', 'growth',
      'mindset', 'strategy', 'leadership', 'productivity', 'success', 'goals',
      'business tips', 'scaling', 'revenue', 'profit', 'investment', 'mentor',
      'network', 'brand', 'marketing', 'sales', 'client', 'value', 'impact'
    ],
    slangTerms: new Map([
      ['side hustle', 'secondary business or income source'],
      ['solopreneur', 'solo entrepreneur running business alone'],
      ['pivot', 'change business direction or strategy'],
      ['MVP', 'minimum viable product'],
      ['bootstrapped', 'self-funded business without investors'],
      ['unicorn', 'startup valued over $1 billion'],
      ['disrupt', 'innovate and change an industry'],
      ['scale', 'grow business substantially'],
      ['10x', 'multiply by ten, exponential growth'],
      ['level up', 'improve or advance']
    ]),
    culturalReferences: [
      'Shark Tank', 'hustle culture', 'Gary Vee', 'rise and grind', '5am club',
      'laptop lifestyle', 'passive income', 'digital products', 'online course creator',
      'thought leader', 'personal brand', 'LinkedIn creator', 'business influencer',
      'entrepreneurship journey', 'startup life', 'founder mode'
    ],
    trendingTopics: [
      'business tips', 'entrepreneur advice', 'productivity hacks', 'time management',
      'passive income', 'side hustles', 'online business', 'digital marketing',
      'personal branding', 'leadership skills', 'business growth', 'mindset',
      'success habits', 'morning routines', 'work life balance', 'business strategy',
      'scaling tips', 'marketing strategy', 'sales techniques', 'networking'
    ],
    trendingHashtags: [
      '#Entrepreneur', '#BusinessTips', '#Hustle', '#StartupLife', '#EntrepreneurLife',
      '#BusinessGrowth', '#SuccessMindset', '#Productivity', '#Leadership',
      '#SmallBusiness', '#OnlineBusiness', '#SideHustle', '#PassiveIncome',
      '#BusinessOwner', '#DigitalMarketing', '#PersonalBrand', '#BossBabe',
      '#EntrepreneurshipJourney', '#BusinessStrategy', '#SuccessTips'
    ],
    trendingPhrases: [
      'entrepreneur life', 'hustle and grind', 'build your empire', 'trust the process',
      'done is better than perfect', 'take massive action', 'consistency is key',
      'invest in yourself', 'mindset is everything', 'level up', 'work smarter not harder',
      'your network is your net worth', 'execution over everything', 'stay focused'
    ],
    typicalEmojis: ['💼', '📈', '💰', '🎯', '🚀', '💡', '🔥', '💪', '⚡', '✨', '🏆', '👔'],
    toneGuidelines: 'Professional yet approachable, motivational without being preachy. Share actionable advice and real experiences. Balance ambition with authenticity. Avoid corporate jargon in favor of relatable language.',
    lastUpdated: new Date()
  },

  // LIFESTYLE NICHE
  {
    niche: 'lifestyle',
    vocabulary: [
      'vibe', 'aesthetic', 'mood', 'energy', 'routine', 'habits', 'self-care',
      'wellness', 'mindful', 'intentional', 'cozy', 'hygge', 'slow living',
      'minimalist', 'organized', 'productive', 'balanced', 'healthy', 'positive',
      'gratitude', 'journal', 'manifest', 'growth', 'journey', 'authentic'
    ],
    slangTerms: new Map([
      ['vibe check', 'assess the mood or energy'],
      ['main character', 'living like the protagonist of your life'],
      ['romanticize your life', 'find beauty in everyday moments'],
      ['that girl', 'aspirational productive lifestyle'],
      ['soft life', 'prioritizing ease and comfort'],
      ['living my best life', 'enjoying life fully'],
      ['unbothered', 'relaxed and carefree'],
      ['self care Sunday', 'dedicated time for wellness'],
      ['glow up', 'transformation or improvement'],
      ['level up', 'improve yourself or life']
    ]),
    culturalReferences: [
      'that girl morning routine', 'hot girl walk', 'self-care Sunday', 'Sunday reset',
      'clean girl aesthetic', 'soft life', 'romanticize your life', 'main character energy',
      'wellness journey', 'mindful living', 'slow morning', 'cozy vibes',
      'hygge lifestyle', 'minimalism', 'capsule wardrobe', 'digital detox'
    ],
    trendingTopics: [
      'morning routine', 'night routine', 'self-care tips', 'wellness habits',
      'productivity', 'organization', 'home decor', 'cozy vibes', 'seasonal living',
      'mindfulness', 'journaling', 'gratitude practice', 'healthy habits',
      'work life balance', 'mental health', 'personal growth', 'lifestyle vlog',
      'day in the life', 'reset routine', 'glow up', 'life updates'
    ],
    trendingHashtags: [
      '#LifestyleBlogger', '#DailyLife', '#LifestyleInspo', '#MorningRoutine',
      '#SelfCare', '#Wellness', '#HealthyLiving', '#Mindfulness', '#CozyVibes',
      '#ThatGirl', '#MainCharacter', '#LifestyleContent', '#LifestyleVlog',
      '#SelfLove', '#PersonalGrowth', '#PositiveVibes', '#DayInTheLife',
      '#LifestyleTips', '#IntentionalLiving', '#LifestyleGoals'
    ],
    trendingPhrases: [
      'romanticize your life', 'living my best life', 'soft life era', 'that girl energy',
      'main character moment', 'slow living', 'cozy season', 'reset with me',
      'self-care isnt selfish', 'prioritizing myself', 'in my wellness era',
      'glow up season', 'becoming that girl', 'Sunday reset', 'intentional living'
    ],
    typicalEmojis: ['✨', '🌿', '☕', '🕯️', '🌸', '💫', '🤍', '🧘', '📖', '🌙', '☁️', '🦋'],
    toneGuidelines: 'Warm, authentic, aspirational yet relatable. Share personal experiences and vulnerability. Celebrate small moments and everyday beauty. Balance productivity with rest. Focus on sustainable habits over perfection.',
    lastUpdated: new Date()
  },

  // GAMING NICHE
  {
    niche: 'gaming',
    vocabulary: [
      'gameplay', 'stream', 'gamer', 'console', 'PC', 'mobile gaming', 'esports',
      'tournament', 'squad', 'team', 'clutch', 'epic', 'legendary', 'noob', 'pro',
      'speedrun', 'walkthrough', 'tips', 'tricks', 'strategy', 'build', 'loadout',
      'meta', 'patch', 'update', 'battle pass', 'season', 'rank', 'competitive'
    ],
    slangTerms: new Map([
      ['GG', 'good game'],
      ['clutch', 'winning in a difficult situation'],
      ['noob', 'beginner or inexperienced player'],
      ['OP', 'overpowered, too strong'],
      ['nerf', 'to weaken a game element'],
      ['buff', 'to strengthen a game element'],
      ['rage quit', 'quitting game in frustration'],
      ['carry', 'to lead team to victory'],
      ['tilted', 'frustrated or angry'],
      ['sweaty', 'try-hard competitive player']
    ]),
    culturalReferences: [
      'Twitch streamer', 'YouTube gaming', 'Discord server', 'gaming setup',
      'RGB lighting', 'battle royale', 'Fortnite dances', 'Among Us memes',
      'Elden Ring difficulty', 'Minecraft builds', 'Pokemon nostalgia',
      'retro gaming', 'gaming chair', 'headset life', 'controller vs keyboard'
    ],
    trendingTopics: [
      'game reviews', 'gameplay tips', 'gaming setup', 'streaming setup',
      'game recommendations', 'new releases', 'game updates', 'patch notes',
      'esports highlights', 'tournament results', 'speedrun records', 'gaming news',
      'game strategies', 'character builds', 'best loadouts', 'gaming challenges',
      'multiplayer games', 'co-op games', 'indie games', 'AAA releases'
    ],
    trendingHashtags: [
      '#Gaming', '#Gamer', '#GamePlay', '#TwitchStreamer', '#GamingLife',
      '#GamingCommunity', '#VideoGames', '#GamingSetup', '#Esports', '#GamersUnite',
      '#GamingClips', '#ProGamer', '#StreamerLife', '#GamingNews', '#GameReview',
      '#PCGaming', '#ConsoleGaming', '#MobileGaming', '#IndieGames', '#GamerLife'
    ],
    trendingPhrases: [
      'gg wp', 'clutch or kick', 'lets gooo', 'absolute banger', 'insane gameplay',
      'that was epic', 'cant stop playing', 'addicted to this game', 'pure skill',
      'no skill just luck', 'carried the team', 'got destroyed', 'rage quit incoming',
      'best game ever', 'game of the year'
    ],
    typicalEmojis: ['🎮', '🕹️', '👾', '🎯', '🔥', '⚡', '💯', '🏆', '👑', '💪', '🎮', '🖥️'],
    toneGuidelines: 'Enthusiastic, competitive yet fun. Use gaming terminology naturally but explain complex terms. Celebrate achievements and funny moments. Balance competitiveness with humor and community spirit.',
    lastUpdated: new Date()
  },

  // PETS NICHE
  {
    niche: 'pets',
    vocabulary: [
      'puppy', 'doggo', 'pupper', 'kitten', 'cat', 'pet parent', 'fur baby',
      'adoption', 'rescue', 'breed', 'training', 'tricks', 'vet', 'grooming',
      'treats', 'toys', 'playtime', 'cuddles', 'zoomies', 'boops', 'snoot',
      'blep', 'mlem', 'derp', 'floof', 'chonk', 'smol', 'good boy', 'good girl'
    ],
    slangTerms: new Map([
      ['doggo', 'dog'],
      ['pupper', 'puppy'],
      ['zoomies', 'sudden burst of energy running around'],
      ['boop', 'gentle tap on nose'],
      ['blep', 'tongue sticking out'],
      ['mlem', 'licking motion'],
      ['derp', 'silly or goofy expression'],
      ['floof', 'fluffy animal'],
      ['chonk', 'chubby animal'],
      ['smol', 'small or tiny']
    ]),
    culturalReferences: [
      'adopt dont shop', 'who rescued who', 'dog mom life', 'cat dad',
      'pet Instagram', 'dog park adventures', 'vet visits', 'pet birthday parties',
      'matching outfits', 'pet Halloween costumes', 'Christmas card with pets',
      'dogs of Instagram', 'cats of Instagram', 'pet influencer', 'viral pet videos'
    ],
    trendingTopics: [
      'pet adoption', 'rescue stories', 'pet training tips', 'funny pet videos',
      'pet care advice', 'grooming tips', 'pet health', 'pet nutrition',
      'pet toys', 'pet products', 'pet fashion', 'pet adventures', 'travel with pets',
      'pet photography', 'puppy training', 'cat behavior', 'pet milestones',
      'pet birthdays', 'gotcha day', 'rainbow bridge'
    ],
    trendingHashtags: [
      '#DogsOfInstagram', '#CatsOfInstagram', '#PuppyLove', '#KittenLife', '#PetLife',
      '#DogMom', '#CatDad', '#RescueDog', '#AdoptDontShop', '#PetLover',
      '#FurBaby', '#PetParent', '#DoggoLove', '#CatLoversClub', '#PuppyGram',
      '#InstaP et', '#PetPhotography', '#DogLife', '#CatLife', '#PetFamily'
    ],
    trendingPhrases: [
      'look at this angel', 'best boy ever', 'im obsessed', 'my whole heart',
      'adopt dont shop', 'who rescued who', 'puppy eyes work every time',
      'cat distribution system', 'orange cat behavior', 'void cat', 'tippy taps',
      'land seal', 'house hippo', 'not a single thought behind those eyes'
    ],
    typicalEmojis: ['🐶', '🐱', '🐾', '❤️', '😍', '🥰', '💕', '🦴', '🐕', '🐈', '🎾', '✨'],
    toneGuidelines: 'Warm, affectionate, playful. Use cute pet terminology naturally. Share both funny and heartwarming moments. Balance humor with genuine pet care advice. Celebrate the human-animal bond.',
    lastUpdated: new Date()
  },

  // ART NICHE
  {
    niche: 'art',
    vocabulary: [
      'artwork', 'illustration', 'painting', 'drawing', 'sketch', 'digital art',
      'traditional art', 'watercolor', 'acrylic', 'oil painting', 'mixed media',
      'abstract', 'realism', 'portrait', 'landscape', 'still life', 'commission',
      'art process', 'art supplies', 'canvas', 'palette', 'brushes', 'creative',
      'inspiration', 'artist life', 'studio', 'gallery', 'exhibition', 'art collector'
    ],
    slangTerms: new Map([
      ['WIP', 'work in progress'],
      ['OC', 'original character'],
      ['fanart', 'art of existing characters/franchises'],
      ['art block', 'creative struggle, unable to create'],
      ['speedpaint', 'time-lapse of art creation'],
      ['art dump', 'posting multiple artworks at once'],
      ['study', 'practice piece for learning'],
      ['rendering', 'adding detail and finishing touches'],
      ['lineart', 'outline drawing before coloring'],
      ['color palette', 'selected colors for artwork']
    ]),
    culturalReferences: [
      'Inktober', 'Drawtober', 'art challenge', 'portfolio building',
      'art school', 'self-taught artist', 'Procreate', 'Photoshop', 'Clip Studio Paint',
      'Wacom tablet', 'iPad art', 'sketchbook tour', 'studio vlog',
      'art market', 'art prints', 'Redbubble', 'Etsy shop', 'art commissions'
    ],
    trendingTopics: [
      'art process', 'time lapse', 'art tutorial', 'drawing tips', 'painting techniques',
      'art supplies', 'digital art tips', 'traditional art', 'art challenges',
      'character design', 'concept art', 'fanart', 'original characters',
      'art commissions', 'portfolio tips', 'art business', 'selling art',
      'art inspiration', 'overcoming art block', 'improvement journey', 'art studies'
    ],
    trendingHashtags: [
      '#Art', '#Artist', '#Illustration', '#Drawing', '#Painting', '#DigitalArt',
      '#ArtistOnInstagram', '#ArtWork', '#Sketch', '#ArtProcess', '#WIP',
      '#ArtCommunity', '#ContemporaryArt', '#ArtLovers', '#InstaArt',
      '#CreativeProcess', '#ArtDaily', '#ArtOfTheDay', '#FanArt', '#OriginalArt'
    ],
    trendingPhrases: [
      'work in progress', 'finally finished', 'took forever but worth it',
      'first time trying', 'still learning', 'art journey', 'creative process',
      'inspired by', 'commission work', 'available for commissions',
      'prints available', 'sold out', 'limited edition', 'art block is real'
    ],
    typicalEmojis: ['🎨', '🖌️', '✏️', '🖍️', '✨', '💫', '🌈', '🎭', '🖼️', '👨‍🎨', '💜', '🔥'],
    toneGuidelines: 'Creative, expressive, vulnerable. Share both finished work and process. Balance confidence with humility about learning. Celebrate creativity in all forms. Use art terminology but stay accessible to non-artists.',
    lastUpdated: new Date()
  },

  // MUSIC NICHE
  {
    niche: 'music',
    vocabulary: [
      'song', 'track', 'album', 'EP', 'single', 'release', 'drop', 'banger',
      'vibe', 'mood', 'playlist', 'genre', 'artist', 'musician', 'producer',
      'beats', 'lyrics', 'melody', 'harmony', 'vocals', 'instrumental', 'remix',
      'cover', 'acoustic', 'live', 'performance', 'studio', 'recording', 'concert'
    ],
    slangTerms: new Map([
      ['banger', 'excellent song'],
      ['slaps', 'really good music'],
      ['fire', 'amazing, excellent'],
      ['on repeat', 'playing repeatedly'],
      ['no skip album', 'every song is good'],
      ['goes hard', 'intense and energetic'],
      ['caught in 4k', 'your music taste exposed'],
      ['music taste check', 'judging someones music preferences'],
      ['aux cord', 'control of music playing'],
      ['beat drop', 'impactful moment in song']
    ]),
    culturalReferences: [
      'Spotify Wrapped', 'Apple Music Replay', 'music festival season', 'Coachella',
      'concert tickets', 'vinyl collection', 'record player aesthetic', 'cassette tapes',
      'band merch', 'tour dates', 'music video', 'behind the scenes', 'studio sessions',
      'SoundCloud rapper', 'bedroom pop', 'indie music', 'underground artists'
    ],
    trendingTopics: [
      'new music Friday', 'album release', 'music video', 'behind the scenes',
      'songwriting process', 'music production', 'studio sessions', 'live performance',
      'concert footage', 'tour announcement', 'music recommendations', 'playlist curation',
      'music reviews', 'album analysis', 'favorite artists', 'hidden gems',
      'throwback songs', 'nostalgic music', 'guilty pleasures', 'music evolution'
    ],
    trendingHashtags: [
      '#Music', '#NewMusic', '#MusicLover', '#MusicIsLife', '#Musician', '#Singer',
      '#MusicProducer', '#InstaMusic', '#MusicVideo', '#LiveMusic', '#Concert',
      '#NowPlaying', '#MusicRecommendations', '#Playlist', '#AlbumRelease',
      '#MusicIndustry', '#IndieMusic', '#MusicCommunity', '#SongOfTheDay', '#MusicVibes'
    ],
    trendingPhrases: [
      'this song hits different', 'on repeat', 'cant stop listening', 'absolute banger',
      'song of the summer', 'stuck in my head', 'new favorite', 'no skip album',
      'this is my song', 'that part hits', 'the vocals', 'the production',
      'take my money', 'dropping soon', 'out now everywhere', 'stream link in bio'
    ],
    typicalEmojis: ['🎵', '🎶', '🎤', '🎧', '🎸', '🎹', '🥁', '🔥', '✨', '💫', '🎼', '🎺'],
    toneGuidelines: 'Passionate, expressive, enthusiastic. Share genuine emotional connections to music. Use music terminology naturally. Balance artist appreciation with personal experience. Celebrate diverse music tastes.',
    lastUpdated: new Date()
  },

  // PHOTOGRAPHY NICHE
  {
    niche: 'photography',
    vocabulary: [
      'photo', 'shot', 'capture', 'frame', 'composition', 'lighting', 'exposure',
      'aperture', 'shutter speed', 'ISO', 'lens', 'camera', 'DSLR', 'mirrorless',
      'portrait', 'landscape', 'street photography', 'wildlife', 'macro', 'long exposure',
      'golden hour', 'blue hour', 'bokeh', 'depth of field', 'editing', 'post-processing',
      'raw', 'lightroom', 'photoshop', 'filter', 'preset', 'photographer'
    ],
    slangTerms: new Map([
      ['golden hour', 'hour after sunrise or before sunset, best lighting'],
      ['bokeh', 'aesthetic blur in out-of-focus areas'],
      ['pixel peeping', 'examining photos at 100% zoom'],
      ['spray and pray', 'taking many photos hoping one is good'],
      ['chimping', 'constantly checking LCD screen after shots'],
      ['gear acquisition syndrome', 'constantly buying new camera equipment'],
      ['tack sharp', 'extremely sharp and in focus'],
      ['blown out', 'overexposed highlights'],
      ['crushed blacks', 'underexposed shadows'],
      ['SOOC', 'straight out of camera, no editing']
    ]),
    culturalReferences: [
      'Lightroom presets', 'VSCO filters', 'Instagram aesthetic', 'photography gear',
      'camera bag essentials', 'prime vs zoom debate', 'Canon vs Nikon', 'Sony mirrorless',
      'film photography revival', '35mm film', 'instant camera', 'Polaroid aesthetic',
      'photography challenge', 'photo walk', 'photography workshop', 'portfolio building'
    ],
    trendingTopics: [
      'photography tips', 'camera settings', 'composition techniques', 'lighting tips',
      'editing tutorial', 'preset packs', 'gear reviews', 'camera recommendations',
      'behind the scenes', 'photo shoot', 'location scouting', 'golden hour shots',
      'street photography', 'portrait photography', 'landscape photography', 'wedding photography',
      'photo editing', 'Lightroom tips', 'photography business', 'client work'
    ],
    trendingHashtags: [
      '#Photography', '#PhotoOfTheDay', '#Photographer', '#PhotoShoot', '#InstaPhoto',
      '#PicOfTheDay', '#CameraLife', '#PhotographyLovers', '#PhotographyLife',
      '#PortraitPhotography', '#LandscapePhotography', '#StreetPhotography',
      '#NaturePhotography', '#PhotoGraphy', '#PhotographyCommunity', '#PhotoArt',
      '#PhotographyDaily', '#PhotographySkills', '#PhotographyIsLife', '#IGPhotography'
    ],
    trendingPhrases: [
      'caught the perfect moment', 'golden hour magic', 'natural lighting', 'no filter needed',
      'straight out of camera', 'minimal editing', 'playing with light', 'composition is key',
      'caught this beauty', 'perfect conditions', 'worth waking up early', 'captured this moment',
      'right place right time', 'camera settings in caption', 'shot on', 'gear list in bio'
    ],
    typicalEmojis: ['📷', '📸', '🎞️', '🌅', '🌄', '✨', '💫', '🔥', '👁️', '🎨', '🖼️', '🌟'],
    toneGuidelines: 'Artistic, technical yet accessible. Share both final images and behind-the-scenes process. Balance gear talk with creative vision. Celebrate moments captured. Use photography terminology but explain technical concepts simply.',
    lastUpdated: new Date()
  },

  // DIY NICHE
  {
    niche: 'diy',
    vocabulary: [
      'DIY', 'handmade', 'homemade', 'crafts', 'project', 'tutorial', 'step by step',
      'materials', 'supplies', 'tools', 'woodworking', 'upcycle', 'repurpose',
      'budget friendly', 'easy', 'beginner friendly', 'advanced', 'creative',
      'makeover', 'transformation', 'before and after', 'renovation', 'restoration',
      'paint', 'build', 'create', 'craft', 'design', 'custom', 'personalized'
    ],
    slangTerms: new Map([
      ['DIY', 'do it yourself'],
      ['upcycle', 'transform waste into something useful'],
      ['hack', 'clever solution or shortcut'],
      ['budget friendly', 'inexpensive, affordable'],
      ['thrift flip', 'transforming thrifted items'],
      ['glow up', 'transformation or improvement'],
      ['game changer', 'significantly helpful technique'],
      ['life hack', 'useful tip or trick'],
      ['Pinterest worthy', 'aesthetically pleasing like Pinterest'],
      ['nailed it', 'successfully completed project']
    ]),
    culturalReferences: [
      'Pinterest projects', 'IKEA hacks', 'thrift flip', 'Dollar Tree DIY',
      'home renovation', 'craft room organization', 'DIY home decor', 'farmhouse style',
      'boho aesthetic', 'coastal vibes', 'seasonal decor', 'holiday crafts',
      'wedding DIY', 'party decorations', 'handmade gifts', 'Etsy shop'
    ],
    trendingTopics: [
      'DIY projects', 'home decor', 'furniture makeover', 'room transformation',
      'organization hacks', 'storage solutions', 'budget decorating', 'thrift flips',
      'upcycling ideas', 'craft tutorials', 'seasonal crafts', 'holiday decorations',
      'handmade gifts', 'wedding DIY', 'party decor', 'woodworking projects',
      'painting furniture', 'wall art', 'plant crafts', 'jewelry making'
    ],
    trendingHashtags: [
      '#DIY', '#DIYProjects', '#DIYHomeDecor', '#Handmade', '#Crafts', '#DIYCrafts',
      '#HomeMade', '#DIYTutorial', '#DIYIdeas', '#CraftProject', '#Upcycling',
      '#ThriftFlip', '#FurnitureMakeover', '#BeforeAndAfter', '#DIYHome',
      '#Crafting', '#DIYInspiration', '#MakerMovement', '#DIYDecor', '#CreateDaily'
    ],
    trendingPhrases: [
      'so easy to make', 'budget friendly', 'under $20', 'using things I already had',
      'thrift flip transformation', 'before and after', 'cant believe the difference',
      'Pinterest inspired', 'better than store bought', 'custom made', 'one of a kind',
      'perfect for gifts', 'holiday craft', 'weekend project', 'step by step tutorial'
    ],
    typicalEmojis: ['🔨', '🎨', '✂️', '🪚', '🖌️', '✨', '💡', '🛠️', '🔧', '📐', '🪡', '💚'],
    toneGuidelines: 'Encouraging, instructive, creative. Make projects feel achievable. Break down complex steps simply. Celebrate both successes and happy accidents. Balance aspiration with realistic expectations. Emphasize the joy of creating.',
    lastUpdated: new Date()
  },

  // PARENTING NICHE
  {
    niche: 'parenting',
    vocabulary: [
      'mom life', 'dad life', 'parenting', 'kids', 'children', 'baby', 'toddler',
      'preschool', 'school age', 'teenager', 'motherhood', 'fatherhood', 'family',
      'raising kids', 'parenting tips', 'activities', 'play', 'learning', 'development',
      'milestones', 'bedtime', 'mealtime', 'routine', 'chaos', 'love', 'patience',
      'exhausted', 'blessed', 'grateful', 'memories', 'childhood', 'growing up'
    ],
    slangTerms: new Map([
      ['mom brain', 'forgetfulness due to parenting exhaustion'],
      ['threenager', 'difficult three-year-old acting like teenager'],
      ['touched out', 'overstimulated from physical contact'],
      ['wine o clock', 'time to relax after kids are in bed'],
      ['sleep regression', 'period when child stops sleeping well'],
      ['witching hour', 'difficult evening time with kids'],
      ['mom guilt', 'feeling guilty about parenting choices'],
      ['sahm', 'stay-at-home mom'],
      ['working mom', 'mother with outside employment'],
      ['gentle parenting', 'respectful parenting approach']
    ]),
    culturalReferences: [
      'mom groups', 'PTA meetings', 'soccer mom', 'school drop-off', 'bedtime battles',
      'picky eaters', 'terrible twos', 'threenager phase', 'tween years',
      'screen time debates', 'mom guilt', 'wine moms', 'coffee is life',
      'target runs', 'minivan life', 'Disney trips', 'family traditions'
    ],
    trendingTopics: [
      'parenting tips', 'mom hacks', 'toddler activities', 'kid crafts',
      'family routines', 'bedtime routine', 'meal ideas', 'picky eater solutions',
      'positive parenting', 'discipline strategies', 'developmental milestones',
      'school prep', 'homework help', 'family fun', 'vacation ideas',
      'self-care for parents', 'mental health', 'work life balance', 'real parenting'
    ],
    trendingHashtags: [
      '#MomLife', '#DadLife', '#Parenting', '#ParentingLife', '#MomOf', '#DadOf',
      '#ParentingTips', '#ToddlerLife', '#Motherhood', '#Fatherhood', '#FamilyLife',
      '#ParentingHacks', '#RealMom', '#HonestMotherhood', '#ParentingWin',
      '#KidsActivities', '#FamilyFirst', '#RaisingKids', '#ParentingJourney', '#BoyMom'
    ],
    trendingPhrases: [
      'the days are long but the years are short', 'choose your battles', 'its just a phase',
      'this too shall pass', 'raising tiny humans', 'keep them alive', 'survival mode',
      'coffee is my love language', 'hot mess mom', 'real not perfect', 'showing up',
      'good enough parent', 'theyre only little once', 'making memories', 'cherish every moment'
    ],
    typicalEmojis: ['👶', '👧', '👦', '❤️', '😅', '😴', '☕', '🍷', '🎉', '📚', '🏡', '💕'],
    toneGuidelines: 'Honest, relatable, supportive. Balance humor with heart. Share both struggles and joys. Avoid perfection, embrace reality. Use parenting terminology naturally. Celebrate all parenting styles. Create community, not competition.',
    lastUpdated: new Date()
  },

  // TECH NICHE
  {
    niche: 'tech',
    vocabulary: [
      'tech', 'technology', 'gadget', 'device', 'smartphone', 'laptop', 'computer',
      'software', 'hardware', 'app', 'application', 'program', 'code', 'developer',
      'engineer', 'innovation', 'AI', 'machine learning', 'crypto', 'blockchain',
      'startup', 'silicon valley', 'product launch', 'review', 'specs', 'features',
      'performance', 'benchmark', 'upgrade', 'latest', 'cutting edge', 'next gen'
    ],
    slangTerms: new Map([
      ['specs', 'specifications, technical details'],
      ['benchmarks', 'performance tests'],
      ['bleeding edge', 'newest, most advanced technology'],
      ['vaporware', 'product announced but never released'],
      ['killer app', 'extremely useful application'],
      ['alpha', 'early testing version'],
      ['beta', 'testing version before release'],
      ['bug', 'software error or glitch'],
      ['patch', 'software update to fix issues'],
      ['legacy', 'outdated technology still in use']
    ]),
    culturalReferences: [
      'Apple keynote', 'WWDC', 'CES', 'tech conferences', 'product launches',
      'unboxing videos', 'tech reviews', 'gadget hauls', 'setup tours',
      'iPhone vs Android', 'Mac vs PC', 'gaming PC builds', 'smart home',
      'tech YouTubers', 'Silicon Valley culture', 'startup culture', 'hackathons'
    ],
    trendingTopics: [
      'tech news', 'product reviews', 'unboxing', 'first impressions', 'tech tips',
      'how to guides', 'troubleshooting', 'app recommendations', 'productivity apps',
      'gadget recommendations', 'best tech', 'tech comparisons', 'buying guide',
      'tech predictions', 'future tech', 'AI developments', 'software updates',
      'tech setup', 'workspace tour', 'coding tips', 'programming tutorials'
    ],
    trendingHashtags: [
      '#Tech', '#Technology', '#TechNews', '#Gadgets', '#Innovation', '#TechReview',
      '#TechLover', '#TechLife', '#TechCommunity', '#InstaTech', '#TechnologyNews',
      '#TechBlogger', '#SmartPhone', '#TechGadgets', '#TechWorld', '#FutureTech',
      '#TechTips', '#TechGeek', '#TechDaily', '#TechInnovation'
    ],
    trendingPhrases: [
      'game changer', 'worth the upgrade', 'best in class', 'flagship killer',
      'bang for your buck', 'innovative design', 'cutting edge', 'next generation',
      'revolutionary', 'mind blowing', 'seamless experience', 'future is here',
      'tech specs in comments', 'full review on', 'link in bio', 'thoughts on this'
    ],
    typicalEmojis: ['💻', '📱', '⌨️', '🖥️', '🖱️', '⚡', '🔥', '🚀', '💡', '🤖', '📡', '🔌'],
    toneGuidelines: 'Informed, enthusiastic, analytical. Balance technical details with accessibility. Share genuine opinions and experiences. Explain complex concepts simply. Celebrate innovation while being critical. Foster discussion and community.',
    lastUpdated: new Date()
  }
];

/**
 * Seed the niche contexts collection
 */
async function seedNicheContexts() {
  try {
    console.log('🌱 Starting niche context database seeding...\n');

    // Connect to MongoDB Atlas
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('📡 Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
    console.log('✅ Connected to MongoDB Atlas\n');

    // Clear existing niche contexts (optional - comment out to preserve existing data)
    console.log('🧹 Clearing existing niche contexts...');
    const deleteResult = await NicheContextModel.deleteMany({});
    console.log(`   Deleted ${deleteResult.deletedCount} existing documents\n`);

    // Insert niche contexts
    console.log('📝 Inserting niche context data...\n');
    
    for (const nicheData of nicheContexts) {
      console.log(`   Seeding: ${nicheData.niche.toUpperCase()}`);
      
      // Convert Map to object for MongoDB
      const dataToInsert = {
        ...nicheData,
        slangTerms: Object.fromEntries(nicheData.slangTerms)
      };
      
      await NicheContextModel.create(dataToInsert);
      
      console.log(`      ✓ Vocabulary: ${nicheData.vocabulary.length} terms`);
      console.log(`      ✓ Slang: ${nicheData.slangTerms.size} terms`);
      console.log(`      ✓ Cultural references: ${nicheData.culturalReferences.length} items`);
      console.log(`      ✓ Trending topics: ${nicheData.trendingTopics.length} topics`);
      console.log(`      ✓ Trending hashtags: ${nicheData.trendingHashtags.length} hashtags`);
      console.log(`      ✓ Trending phrases: ${nicheData.trendingPhrases.length} phrases`);
      console.log(`      ✓ Typical emojis: ${nicheData.typicalEmojis.length} emojis\n`);
    }

    console.log('✅ Successfully seeded all niche contexts!\n');
    console.log('📊 Summary:');
    console.log(`   Total niches: ${nicheContexts.length}`);
    console.log(`   Niches: ${nicheContexts.map(n => n.niche).join(', ')}\n`);

    // Verify data
    const count = await NicheContextModel.countDocuments();
    console.log(`📈 Verification: ${count} niche contexts in database\n`);

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB Atlas');
    console.log('🎉 Seeding complete!');

  } catch (error) {
    console.error('❌ Error seeding niche contexts:', error);
    process.exit(1);
  }
}

// Run the seed function
seedNicheContexts();
