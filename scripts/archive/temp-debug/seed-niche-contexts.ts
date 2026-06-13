/**
 * Seed Niche Context Database
 * 
 * Populates the niche context database with training data for AI caption generation:
 * - Vocabulary and language patterns the AI learns from
 * - Trending topics, hashtags, and phrases
 * - Audience preferences and engagement triggers
 * - Niche-specific emojis and tone guidelines
 * 
 * Task 4.3: Seed initial niche context database
 * Requirements: 3.1, 3.2
 * 
 * Usage: npx ts-node seed-niche-contexts.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';

interface NicheContextData {
  niche: string;
  vocabulary: string[];
  slangTerms: Record<string, string>;
  culturalReferences: string[];
  trendingTopics: string[];
  trendingHashtags: string[];
  trendingPhrases: string[];
  typicalEmojis: string[];
  toneGuidelines: string;
  audiencePreferences?: string[];
  engagementTriggers?: string[];
}

/**
 * Comprehensive niche context data
 * This is TRAINING DATA - vocabulary and language patterns the AI learns from
 * to understand how real Instagram creators communicate in each niche
 */
const NICHE_CONTEXTS: NicheContextData[] = [
  
  //==================== FITNESS NICHE ====================
  {
    niche: 'fitness',
    vocabulary: [
      'gains', 'reps', 'sets', 'pump', 'shredded', 'bulk', 'cut', 'macros', 'protein',
      'progressive overload', 'compound movements', 'isolation exercises', 'cardio', 'hiit',
      'strength training', 'hypertrophy', 'recovery', 'rest day', 'mobility', 'flexibility',
      'deadlift', 'squat', 'bench press', 'pull-ups', 'burpees', 'lunges', 'plank',
      'core', 'glutes', 'quads', 'hamstrings', 'calves', 'biceps', 'triceps', 'shoulders',
      'chest day', 'leg day', 'back day', 'arm day', 'full body', 'split', 'pr', 'personal record',
      'form check', 'tempo', 'time under tension', 'drop sets', 'supersets', 'amrap',
      'bodyweight', 'resistance bands', 'free weights', 'machines', 'kettlebell', 'dumbbell',
      'barbell', 'gym bro', 'gym anxiety', 'newbie gains', 'plateau', 'muscle soreness',
      'doms', 'pre-workout', 'post-workout', 'whey', 'creatine', 'bcaa', 'supplements',
      'lean', 'toned', 'definition', 'abs', 'six pack', 'transformation', 'progress',
      'consistency', 'discipline', 'mindset', 'motivation', 'accountability', 'fitness journey'
    ],
    slangTerms: {
      'gains': 'muscle growth and progress',
      'shredded': 'very lean with visible muscle definition',
      'swole': 'muscular and built',
      'pump': 'temporary muscle swelling after working out',
      'doms': 'delayed onset muscle soreness',
      'pr': 'personal record - your best lift',
      'amrap': 'as many reps as possible',
      'hiit': 'high intensity interval training',
      'cutting': 'eating in calorie deficit to lose fat',
      'bulking': 'eating in calorie surplus to build muscle',
      'gym bro': 'stereotypical male gym enthusiast',
      'ego lifting': 'lifting too heavy with bad form to impress others',
      'newbie gains': 'rapid progress beginners experience',
      'hitting a plateau': 'when progress stalls',
      'dialed in': 'nutrition and training perfectly aligned'
    },
    culturalReferences: [
      'Greg Doucette cookbook', 'Athlean-X', 'Jeff Nippard science-based training',
      'David Goggins mindset', 'Arnold Schwarzenegger bodybuilding',
      'CrossFit culture', 'Planet Fitness lunk alarm', 'gym parking lot anxiety',
      '5am workout crew', 'weekend warrior', 'gym crush dynamics'
    ],
    trendingTopics: [
      'rest day importance', 'gym anxiety tips', 'home workout effectiveness',
      'protein myths debunked', 'progressive overload explained', 'intuitive eating for athletes',
      'lifting heavy vs high reps', 'muscle building for women', 'fitness over 40',
      'form over weight debate', 'cardio killing gains myth', 'natural vs enhanced',
      'morning vs evening workouts', 'pre-workout necessity', 'creatine benefits',
      'active recovery techniques', 'mobility work importance', 'mind-muscle connection'
    ],
    trendingHashtags: [
      '#FitnessMotivation', '#GymLife', '#GainsOnGains', '#LegDay', '#ProgressNotPerfection',
      '#FitFam', '#GymRat', '#ShredSeason', '#BulkSeason', '#FitnessJourney',
      '#WorkoutMotivation', '#StrengthTraining', '#BuildMuscle', '#TransformationTuesday',
      '#FitnessCommunity', '#GymFlow', '#FitnessGoals', '#LiftHeavy', '#TrainHard',
      '#FitnessAddict', '#GymTime', '#WorkoutRoutine', '#HealthyLifestyle', '#FitLife',
      '#BodyBuilding', '#PersonalTrainer', '#FitInspiration', '#WorkoutOfTheDay', '#GymMotivation'
    ],
    trendingPhrases: [
      'rest days are growth days', 'form over ego', 'progressive overload is key',
      'consistency beats intensity', 'train like an athlete', 'fuel your body right',
      'mind-muscle connection', 'strong not skinny', 'fitness is a journey',
      'trust the process', 'no pain no gain', 'earn your body', 'build don\'t break',
      'lift heavy feel light', 'sweat is fat crying', 'your only limit is you',
      'champions train', 'grind now shine later', 'pain is temporary pride is forever'
    ],
    typicalEmojis: ['💪', '🔥', '💯', '🏋️', '🎯', '⚡', '🦾', '👊', '🏆', '💥', '🚀', '✨', '💪🏻', '🤝', '🫡'],
    toneGuidelines: 'Motivational yet real. Acknowledges struggle while celebrating progress. Uses gym culture slang naturally. Balances inspiration with practical advice. Authentic vulnerability about challenges. Never toxic positivity or bro-science.',
    audiencePreferences: [
      'Real transformation stories', 'Honest gym struggles', 'Science-backed advice',
      'Form check videos', 'No-BS nutrition tips', 'Relatable fitness humor',
      'Progress over perfection mindset', 'Beginner-friendly content', 'Home workout alternatives'
    ],
    engagementTriggers: [
      'Before/after comparisons', 'Gym fail stories', 'Unpopular fitness opinions',
      'Myth-busting posts', 'Exercise form breakdowns', 'Rest day importance',
      'Gym anxiety discussions', 'Plateau breakthrough stories', 'Workout split debates'
    ]
  },

  //==================== FOOD NICHE ====================
  {
    niche: 'food',
    vocabulary: [
      'recipe', 'ingredients', 'cooking', 'baking', 'homemade', 'from scratch', 'easy recipe',
      'quick meal', 'meal prep', 'leftovers', 'batch cooking', 'weeknight dinner',
      'comfort food', 'soul food', 'street food', 'fusion cuisine', 'elevated', 'restaurant quality',
      'mise en place', 'prep work', 'chop', 'dice', 'mince', 'julienne', 'sauté', 'sear',
      'roast', 'grill', 'braise', 'simmer', 'reduce', 'deglaze', 'emulsify', 'fold',
      'season', 'taste as you go', 'adjust seasoning', 'plate', 'garnish', 'presentation',
      'al dente', 'caramelized', 'crispy', 'tender', 'juicy', 'flaky', 'moist', 'fluffy',
      'umami', 'savory', 'sweet', 'salty', 'sour', 'bitter', 'spicy', 'tangy', 'rich',
      'fresh', 'seasonal', 'local', 'organic', 'farm-to-table', 'sustainable',
      'leftovers remix', 'budget meals', 'fancy but easy', 'one pot wonder', 'sheet pan dinner',
      'dump and go', 'set it and forget it', 'meal planning', 'grocery haul', 'pantry staples',
      'kitchen hack', 'food waste', 'use what you have', 'cooking by feel', 'no recipe needed',
      'taste test', 'flavor profile', 'balance', 'layering flavors', 'depth', 'complexity'
    ],
    slangTerms: {
      'mise en place': 'everything in its place - prepping ingredients before cooking',
      'emulsify': 'combining two liquids that don\'t naturally mix (oil and vinegar)',
      'deglaze': 'adding liquid to a hot pan to lift flavorful browned bits',
      'al dente': 'cooked so it\'s still firm when bitten',
      'umami': 'savory fifth taste - depth and richness',
      'meal prep': 'preparing multiple meals in advance',
      'dump and go': 'throw ingredients together without fuss',
      'one pot wonder': 'complete meal made in single pot',
      'restaurant quality': 'homemade food that tastes like dining out',
      'elevated': 'making simple food fancy or gourmet',
      'cooking by feel': 'not following exact measurements, using intuition'
    },
    culturalReferences: [
      'Salt Fat Acid Heat', 'The Bear kitchen chaos', 'Gordon Ramsay standards',
      'Bon Appétit test kitchen', 'TikTok pasta', 'Instagram vs reality',
      'grandma\'s secret recipe', 'food blogger recipe essays', 'recipe card drama',
      'cooking show binge', 'Pinterest fail', 'nailed it attempt'
    ],
    trendingTopics: [
      'air fryer everything', 'budget-friendly meals', 'meal prep hacks',
      'cooking without recipes', 'food waste reduction', 'pantry cooking',
      'restaurant copycat recipes', 'one pot meals', 'sheet pan dinners',
      'instant pot recipes', 'sourdough revival', 'fermentation projects',
      'butter makes it better', 'salt your pasta water', 'mise en place importance',
      'knife skills basics', 'seasoning every layer', 'tasting as you cook'
    ],
    trendingHashtags: [
      '#FoodPorn', '#Foodie', '#InstaFood', '#FoodPhotography', '#Homemade',
      '#RecipeOfTheDay', '#FoodBlogger', '#CookingAtHome', '#EasyRecipes', '#MealPrep',
      '#ComfortFood', '#FoodLover', '#DeliciousFood', '#FoodStagram', '#HomeChef',
      '#QuickMeals', '#HealthyEating', '#FoodInspiration', '#CookingTips', '#Yummy',
      '#FoodGasm', '#EatWellLiveWell', '#RecipeShare', '#CookingFromScratch', '#RealFood',
      '#SimpleCooking', '#FoodCulture', '#KitchenLife', '#FoodAdventures', '#TasteOfHome'
    ],
    trendingPhrases: [
      'made this in 30 minutes', 'easier than ordering takeout',
      'tastes like restaurant quality', 'used what I had in the pantry',
      'forgot to take a photo before eating', 'butter makes everything better',
      'season to taste', 'trust your palate', 'cooking is love made visible',
      'good food good mood', 'food tastes better when shared', 'homemade with love',
      'simple ingredients big flavor', 'cooking therapy', 'kitchen experiments'
    ],
    typicalEmojis: ['🍳', '🔥', '😋', '🤤', '👨‍🍳', '👩‍🍳', '🍽️', '🥘', '🍝', '🥗', '🍲', '✨', '💯', '🙌', '😍'],
    toneGuidelines: 'Warm and inviting like cooking for friends. Practical and accessible - no pretension. Celebrates simple pleasures of good food. Honest about failures and experiments. Emphasizes ease over perfection. Encourages creativity over strict recipes.',
    audiencePreferences: [
      'Quick weeknight recipes', 'Budget-friendly ideas', 'Leftover transformations',
      'Cooking tips and tricks', 'Kitchen hacks', 'Ingredient substitutions',
      'No-fuss meals', 'Family-friendly recipes', 'Meal prep strategies'
    ],
    engagementTriggers: [
      'Recipe reveal videos', 'Cooking fails and successes', 'Unpopular food opinions',
      'Restaurant vs homemade comparisons', 'Kitchen disasters', 'Food cost breakdowns',
      'Controversial ingredients', 'Technique demonstrations', 'Taste test reactions'
    ]
  },

  //==================== TRAVEL NICHE ====================
  {
    niche: 'travel',
    vocabulary: [
      'wanderlust', 'adventure', 'explore', 'journey', 'destination', 'backpacking', 'solo travel',
      'digital nomad', 'travel hack', 'budget travel', 'luxury travel', 'road trip', 'visa',
      'passport', 'hostel', 'airbnb', 'hotel', 'flight deal', 'layover', 'jet lag',
      'culture shock', 'local experience', 'hidden gem', 'tourist trap', 'off the beaten path',
      'bucket list', 'must-see', 'itinerary', 'travel tips', 'packing hack', 'carry-on only',
      'city guide', 'food tour', 'walking tour', 'day trip', 'weekend getaway', 'staycation',
      'travel anxiety', 'culture', 'authentic', 'immersive', 'memorable', 'breathtaking'
    ],
    slangTerms: {
      'wanderlust': 'strong desire to travel and explore the world',
      'digital nomad': 'person who works remotely while traveling',
      'travel hack': 'tip or trick to save money or improve travel',
      'bucket list': 'list of places you want to visit before you die',
      'tourist trap': 'overpriced place that targets tourists',
      'off the beaten path': 'not touristy, more authentic locations',
      'hidden gem': 'undiscovered or lesser-known amazing place',
      'solo travel': 'traveling alone',
      'carry-on only': 'traveling with just cabin luggage, no checked bags'
    },
    culturalReferences: [
      'Rick Steves travel philosophy', 'Anthony Bourdain authenticity', 'Instagram vs reality',
      'airport fashion', 'hostel life', 'Airbnb experiences', 'Google Maps offline saves',
      'travel scam stories', 'language barrier moments', 'currency confusion'
    ],
    trendingTopics: [
      'solo travel safety', 'budget travel hacks', 'digital nomad lifestyle',
      'overtourism problem', 'sustainable travel', 'travel scams to avoid',
      'working remotely abroad', 'travel anxiety tips', 'packing light strategies',
      'off-season travel benefits', 'credit card travel points', 'travel insurance necessity'
    ],
    trendingHashtags: [
      '#Travel', '#Wanderlust', '#TravelGram', '#Explore', '#Adventure', '#SoloTravel',
      '#TravelPhotography', '#BucketList', '#DigitalNomad', '#BackpackerLife', '#TravelTips',
      '#HiddenGems', '#TravelMore', '#PassportReady', '#TravelAddict', '#RoamThePlanet',
      '#TravelCommunity', '#TravelDiaries', '#ExploreMore', '#TravelGoals', '#TravelLife',
      '#TravelTheWorld', '#InstaTravel', '#TravelBlogger', '#Vacation', '#TravelInspiration',
      '#WorldExplorer', '#TravelBug', '#AdventureTime'
    ],
    trendingPhrases: [
      'book the flight', 'travel now plan later', 'collect moments not things',
      'not all who wander are lost', 'adventure awaits', 'take only pictures leave only footprints',
      'live with no excuses travel with no regrets', 'the world is a book'
    ],
    typicalEmojis: ['✈️', '🌍', '🗺️', '🎒', '🏝️', '🌅', '📸', '🧳', '🚗', '⛰️', '🏖️', '🌴', '✨', '💫', '🫶'],
    toneGuidelines: 'Inspiring yet practical. Balances wanderlust with real advice. Honest about challenges and anxiety. Encourages taking the leap while being safety-conscious. Celebrates diverse travel styles from budget to luxury.',
    audiencePreferences: [
      'Destination guides', 'Budget travel tips', 'Packing strategies', 'Travel safety advice',
      'Solo travel encouragement', 'Hidden gems discovery', 'Cultural experiences',
      'Travel fail stories', 'Cost breakdowns'
    ],
    engagementTriggers: [
      'Solo travel stories', 'Travel scam warnings', 'Budget vs luxury comparisons',
      'Unpopular destination opinions', 'Travel anxiety discussions', 'Packing list reveals',
      'Flight deal sharing', 'Cultural misunderstandings', 'Best/worst experiences'
    ]
  },

  //==================== FASHION NICHE ====================
  {
    niche: 'fashion',
    vocabulary: [
      'outfit', 'ootd', 'style', 'trend', 'vintage', 'thrift', 'capsule wardrobe', 'minimalist',
      'wardrobe essentials', 'statement piece', 'layering', 'accessorize', 'sustainable fashion',
      'fast fashion', 'designer', 'dupe', 'investment piece', 'timeless', 'seasonal', 'collection',
      'runway', 'streetwear', 'casual chic', 'business casual', 'athleisure', 'elevated basics',
      'color blocking', 'monochrome', 'neutral palette', 'mix and match', 'personal style',
      'fashion haul', 'try-on', 'styling tips', 'outfit formula', 'fashion hack'
    ],
    slangTerms: {
      'ootd': 'outfit of the day',
      'dupe': 'affordable alternative to expensive item',
      'capsule wardrobe': 'minimal versatile wardrobe with mix-match pieces',
      'investment piece': 'expensive quality item worth the cost',
      'fast fashion': 'cheap trendy clothing quickly produced',
      'athleisure': 'athletic clothing worn as everyday fashion',
      'elevated basics': 'simple high-quality wardrobe staples',
      'statement piece': 'bold item that stands out in outfit'
    },
    culturalReferences: [
      'Anna Wintour standards', 'The Devil Wears Prada', 'vintage thrift finds',
      'capsule wardrobe minimalism', 'fashion week chaos', 'fast fashion controversy',
      'sustainable fashion movement', 'designer dupe culture', 'outfit repeating debate'
    ],
    trendingTopics: [
      'capsule wardrobe building', 'sustainable fashion choices', 'thrift shopping tips',
      'designer dupes', 'styling versatile pieces', 'fashion on a budget',
      'body confidence fashion', 'personal style development', 'outfit formulas',
      'fast fashion impact', 'timeless vs trendy', 'wardrobe decluttering'
    ],
    trendingHashtags: [
      '#OOTD', '#FashionInspo', '#StyleInspiration', '#FashionBlogger', '#StreetStyle',
      '#SustainableFashion', '#ThriftFinds', '#CapsuleWardrobe', '#FashionDaily', '#Fashionista',
      '#StyleGuide', '#FashionTrends', '#OutfitIdeas', '#FashionLover', '#PersonalStyle',
      '#MinimalistFashion', '#FashionGram', '#StyleDiary', '#FashionCommunity', '#Vintage'
    ],
    trendingPhrases: [
      'confidence is the best outfit', 'style over trends', 'wear what makes you happy',
      'dress for yourself', 'fashion fades style is eternal', 'less is more',
      'quality over quantity', 'invest in basics', 'own your style'
    ],
    typicalEmojis: ['👗', '👠', '👜', '💄', '✨', '🖤', '🤍', '💫', '🪞', '🛍️', '👕', '👔', '🧥', '💅', '😍'],
    toneGuidelines: 'Confident yet inclusive. Celebrates individual style over conformity. Accessible fashion advice for all budgets. Honest about fast fashion while promoting sustainability. Empowering without being preachy.',
    audiencePreferences: [
      'Outfit inspiration', 'Styling tips', 'Budget fashion', 'Sustainable choices',
      'Body-positive content', 'Thrift hauls', 'Capsule wardrobe guides',
      'Trend forecasts', 'Wardrobe organization'
    ],
    engagementTriggers: [
      'Outfit transformations', 'Fast fashion debates', 'Designer vs dupe comparisons',
      'Thrift flip reveals', 'Capsule wardrobe tours', 'Style evolution stories',
      'Fashion hot takes', 'Budget outfit challenges', 'Trend predictions'
    ]
  },

  //==================== BEAUTY NICHE ====================
  {
    niche: 'beauty',
    vocabulary: [
      'skincare', 'makeup', 'routine', 'glow', 'radiant', 'dewy', 'matte', 'natural look',
      'full glam', 'no-makeup makeup', 'holy grail', 'dupe', 'drugstore', 'high-end',
      'cleanser', 'toner', 'serum', 'moisturizer', 'spf', 'retinol', 'hyaluronic acid',
      'niacinamide', 'vitamin c', 'exfoliate', 'double cleanse', 'skin barrier', 'purge',
      'foundation', 'concealer', 'contour', 'highlight', 'blush', 'bronzer', 'setting spray',
      'eyeshadow', 'eyeliner', 'mascara', 'brows', 'lips', 'skin type', 'combination skin',
      'acne-prone', 'sensitive skin', 'glass skin', 'skin texture', 'pores', 'fine lines'
    ],
    slangTerms: {
      'holy grail': 'best product you swear by',
      'dupe': 'affordable alternative to expensive product',
      'glass skin': 'ultra-smooth luminous flawless complexion',
      'skin purge': 'breakout when starting active ingredients',
      'skin barrier': 'protective outer layer of skin',
      'no-makeup makeup': 'natural look that enhances features',
      'drugstore': 'affordable products from pharmacy stores',
      'full glam': 'complete dramatic makeup look',
      'double cleanse': 'two-step cleansing method (oil then water-based)'
    },
    culturalReferences: [
      'Korean skincare routine', 'glass skin trend', 'clean beauty movement',
      'Sephora vs Ulta', 'TikTok made me buy it', 'drugstore vs high-end debate',
      'skincare purge phase', 'tretinoin journey', 'Cerave cult following'
    ],
    trendingTopics: [
      'simple skincare routines', 'expensive vs drugstore', 'skin barrier repair',
      'acne journey honesty', 'makeup minimalism', 'clean beauty products',
      'skincare order explained', 'retinol benefits', 'SPF importance',
      'natural makeup looks', 'product dupes', 'skincare myths debunked'
    ],
    trendingHashtags: [
      '#Skincare', '#MakeupLover', '#BeautyTips', '#GlowingSkin', '#SkincareRoutine',
      '#MakeupTutorial', '#BeautyBlogger', '#CleanBeauty', '#DrugstoreBeauty', '#SkincareJunkie',
      '#MakeupAddict', '#BeautyCommunity', '#SkincareTips', '#NaturalBeauty', '#BeautyEssentials',
      '#SkincareObsessed', '#MakeupInspo', '#HealthySkin', '#BeautySecrets', '#GlassSkin'
    ],
    trendingPhrases: [
      'less is more', 'healthy skin is beautiful skin', 'skincare is self-care',
      'wear sunscreen every day', 'simple routine consistent results',
      'expensive doesn\'t always mean better', 'know your skin type', 'patch test everything'
    ],
    typicalEmojis: ['💄', '✨', '🌟', '💅', '🧴', '🪞', '💕', '🤍', '💫', '🌸', '🧖‍♀️', '🎀', '💗', '😍', '🫶'],
    toneGuidelines: 'Informative yet approachable. Emphasizes self-care over perfection. Honest product reviews without excessive hype. Inclusive of all skin types and budgets. Science-informed but not intimidating.',
    audiencePreferences: [
      'Product recommendations', 'Routine breakdowns', 'Budget-friendly options',
      'Ingredient education', 'Problem-solving tips', 'Before/after results',
      'Honest reviews', 'Dupe comparisons', 'Skin concern solutions'
    ],
    engagementTriggers: [
      'Product dupe reveals', 'Skincare routine tours', 'Expensive vs drugstore tests',
      'Acne journey updates', 'Product fails', 'Holy grail reveals',
      'Controversial beauty opinions', 'Ingredient deep dives', 'Transformation stories'
    ]
  },

  //==================== BUSINESS NICHE ====================
  {
    niche: 'business',
    vocabulary: [
      'entrepreneur', 'hustle', 'grind', 'side hustle', 'passive income', 'revenue', 'profit',
      'scale', 'growth', 'startup', 'founder', 'solopreneur', 'freelance', 'consultant',
      'digital product', 'online course', 'coaching', 'mentorship', 'networking', 'personal brand',
      'content creation', 'social media marketing', 'email list', 'funnel', 'conversion',
      'client acquisition', 'value proposition', 'niche down', 'target audience', 'ideal client',
      'business model', 'monetize', 'diversify', 'pivot', 'bootstrap', 'investment',
      'cash flow', 'expenses', 'roi', 'kpi', 'metrics', 'analytics', 'strategy', 'execution',
      'mindset', 'productivity', 'time management', 'work-life balance', 'burnout', 'resilience'
    ],
    slangTerms: {
      'side hustle': 'business or job outside main employment',
      'passive income': 'earnings requiring minimal ongoing effort',
      'solopreneur': 'entrepreneur working alone',
      'scale': 'grow business without proportional resource increase',
      'pivot': 'change business direction or strategy',
      'bootstrap': 'self-fund business without external investment',
      'niche down': 'focus on specific specialized market segment',
      'funnel': 'customer journey from awareness to purchase',
      'roi': 'return on investment - profitability measure',
      'kpi': 'key performance indicator - success metric'
    },
    culturalReferences: [
      'Gary Vee hustle culture', 'Tim Ferriss 4-hour workweek', 'Silicon Valley startup culture',
      'Shark Tank pitch pressure', 'hustle culture burnout', 'work-life balance debate',
      'passive income myth', 'overnight success fallacy', 'LinkedIn thought leaders'
    ],
    trendingTopics: [
      'sustainable business growth', 'anti-hustle culture', 'authentic marketing',
      'building in public', 'niche business ideas', 'solopreneur challenges',
      'passive income reality', 'first client stories', 'pricing strategy',
      'imposter syndrome', 'business mistakes', 'scaling without burnout'
    ],
    trendingHashtags: [
      '#Entrepreneur', '#SmallBusiness', '#BusinessOwner', '#StartupLife', '#Hustle',
      '#BusinessGrowth', '#Solopreneur', '#SideHustle', '#PassiveIncome', '#BusinessTips',
      '#DigitalNomad', '#FreelanceLife', '#OnlineBusiness', '#BusinessMindset', '#ContentCreator',
      '#PersonalBrand', '#Entrepreneurship', '#BuildYourEmpire', '#BusinessSuccess', '#WorkSmart'
    ],
    trendingPhrases: [
      'start before you\'re ready', 'done is better than perfect', 'consistency over perfection',
      'fail fast learn faster', 'overnight success is a myth', 'build in public',
      'serve don\'t sell', 'add value first', 'your network is your net worth'
    ],
    typicalEmojis: ['💼', '📈', '💰', '🚀', '💡', '🎯', '⚡', '🔥', '💪', '🏆', '📊', '✨', '👊', '🫡', '🤝'],
    toneGuidelines: 'Motivational but realistic. Celebrates wins while acknowledging struggles. Action-oriented and practical. Honest about failure and learning. Anti-toxic hustle culture. Emphasizes sustainable growth over burnout.',
    audiencePreferences: [
      'Real business stories', 'Practical strategies', 'Income transparency',
      'Failure lessons', 'No-BS advice', 'Beginner-friendly content',
      'Behind-the-scenes', 'Tool recommendations', 'Growth milestones'
    ],
    engagementTriggers: [
      'Income reports', 'First sale stories', 'Business mistakes', 'Hot takes on hustle culture',
      'Tool stack reveals', 'Pricing debates', 'Client horror stories',
      'Growth milestones', 'Failure analysis', 'Controversial business opinions'
    ]
  },

  //==================== LIFESTYLE NICHE ====================
  {
    niche: 'lifestyle',
    vocabulary: [
      'mindfulness', 'self-care', 'wellness', 'balance', 'routine', 'habits', 'morning ritual',
      'productivity', 'organization', 'declutter', 'minimalism', 'slow living', 'intentional living',
      'romanticize your life', 'small joys', 'gratitude', 'journaling', 'meditation', 'yoga',
      'mental health', 'boundaries', 'rest', 'recharge', 'reset', 'glow up', 'personal growth',
      'self-improvement', 'confidence', 'manifestation', 'affirmations', 'goal setting',
      'sunday reset', 'cozy vibes', 'aesthetic', 'vibe', 'energy', 'aura', 'main character energy',
      'that girl routine', 'soft life', 'home decor', 'interior design', 'plants', 'candles'
    ],
    slangTerms: {
      'romanticize your life': 'find beauty and joy in everyday moments',
      'that girl routine': 'aspirational productive morning routine trend',
      'main character energy': 'living confidently as if you\'re the protagonist',
      'soft life': 'prioritizing ease, joy, and peace over hustle',
      'sunday reset': 'weekly routine to prepare and recharge',
      'glow up': 'personal transformation and improvement',
      'slow living': 'intentional mindful lifestyle rejecting hustle culture',
      'cozy vibes': 'comfortable warm inviting atmosphere'
    },
    culturalReferences: [
      'cottage core aesthetic', 'dark academia', 'clean girl aesthetic',
      'TikTok that girl trend', 'hygge lifestyle', 'Marie Kondo organization',
      'Atomic Habits', 'morning routine culture', 'self-care Sunday'
    ],
    trendingTopics: [
      'romanticizing life', 'slow living movement', 'rest as productive',
      'realistic self-care', 'morning routine reality', 'anti-hustle culture',
      'setting boundaries', 'simple pleasures', 'mindful living',
      'cozy home vibes', 'seasonal living', 'intentional habits'
    ],
    trendingHashtags: [
      '#Lifestyle', '#SelfCare', '#Wellness', '#Mindfulness', '#SlowLiving', '#Cozy',
      '#MorningRoutine', '#ThatGirl', '#MainCharacter', '#SoftLife', '#RomanticizeYourLife',
      '#LifestyleBlogger', '#DailyRoutine', '#Aesthetic', '#PersonalGrowth', '#Minimalism',
      '#HomeVibes', '#Intentional', '#Peaceful', '#LifestyleInspo', '#HealthyHabits',
      '#MentalHealth', '#Balance', '#SelfLove', '#PositiveVibes', '#GoodVibes'
    ],
    trendingPhrases: [
      'romanticize the small things', 'rest is productive', 'your pace is perfect',
      'be the main character', 'protect your peace', 'soft life era', 'slow mornings',
      'find joy in the ordinary', 'create a life you love', 'little things matter most'
    ],
    typicalEmojis: ['✨', '🤍', '🫶', '🌸', '☕', '🕯️', '📖', '🌿', '💫', '🧘‍♀️', '🛁', '🎀', '🪞', '💕', '🌅'],
    toneGuidelines: 'Warm and nurturing. Aspirational yet relatable. Celebrates simplicity and mindfulness. Gentle encouragement without pressure. Emphasizes self-compassion over perfection. Cozy and inviting tone.',
    audiencePreferences: [
      'Morning routine ideas', 'Self-care practices', 'Cozy home inspiration',
      'Mindfulness tips', 'Simple pleasures', 'Realistic routines',
      'Mental health support', 'Aesthetic content', 'Slow living inspiration'
    ],
    engagementTriggers: [
      'Morning routine reveals', 'Sunday reset rituals', 'Cozy space tours',
      'Self-care reality checks', 'Simple joy moments', 'That girl routine debates',
      'Romanticizing life tips', 'Rest advocacy', 'Boundary setting stories'
    ]
  },

  //==================== TECH NICHE ====================
  {
    niche: 'tech',
    vocabulary: [
      'productivity', 'tools', 'apps', 'software', 'hardware', 'gadget', 'device', 'smartphone',
      'laptop', 'tablet', 'workflow', 'automation', 'shortcuts', 'hack', 'tip', 'trick',
      'feature', 'update', 'upgrade', 'review', 'unboxing', 'specs', 'performance', 'battery life',
      'camera quality', 'display', 'processor', 'ram', 'storage', 'cloud', 'backup', 'sync',
      'integration', 'compatibility', 'user interface', 'user experience', 'design', 'aesthetic',
      'minimalist setup', 'desk setup', 'home office', 'work from home', 'remote work',
      'digital nomad', 'tech stack', 'keyboard', 'mouse', 'monitor', 'headphones', 'earbuds',
      'charging', 'wireless', 'bluetooth', 'wifi', 'connectivity', 'speed', 'efficiency',
      'optimization', 'customization', 'personalization', 'settings', 'preferences'
    ],
    slangTerms: {
      'tech stack': 'combination of tools and software you use',
      'workflow': 'sequence of tasks to complete work efficiently',
      'automation': 'setting up tasks to run automatically',
      'productivity hack': 'shortcut or tip to work more efficiently',
      'desk setup': 'arrangement of technology and workspace',
      'unboxing': 'opening and reviewing new product',
      'specs': 'technical specifications of device',
      'battery life': 'how long device runs on single charge',
      'ecosystem': 'interconnected products from same brand',
      'optimization': 'making system run faster or better'
    },
    culturalReferences: [
      'Apple ecosystem', 'Android vs iPhone debates', 'mechanical keyboard obsession',
      'RGB everything trend', 'minimalist desk setups', 'productivity guru culture',
      'Notion templates', 'keyboard shortcuts flex', 'cable management pride',
      'tech YouTuber unboxing aesthetic', 'M1/M2 Mac hype', 'always beta testing'
    ],
    trendingTopics: [
      'AI tools for productivity', 'ChatGPT use cases', 'notion alternatives',
      'best budget tech', 'desk setup essentials', 'keyboard shortcuts',
      'phone vs camera debate', 'right to repair movement', 'digital minimalism',
      'screen time management', 'productivity apps', 'tech for remote work',
      'smart home automation', 'sustainable tech choices', 'app recommendations',
      'workflow optimization', 'tech on a budget', 'gear vs skill debate'
    ],
    trendingHashtags: [
      '#TechTips', '#Productivity', '#WorkflowOptimization', '#DeskSetup', '#TechReview',
      '#Gadgets', '#TechLife', '#AppRecommendation', '#ProductivityHacks', '#TechCommunity',
      '#DigitalNomad', '#RemoteWork', '#TechNews', '#Innovation', '#SmartHome',
      '#TechSetup', '#WorkFromHome', '#TechEnthusiast', '#GadgetLover', '#TechTools',
      '#Automation', '#Efficiency', '#TechAddict', '#ModernWorkspace', '#TechInspo'
    ],
    trendingPhrases: [
      'if you\'re not using this you\'re wasting time', 'game changer app',
      'keyboard shortcuts that literally just saved you hours', 'workflow optimization',
      'you don\'t need the newest phone', 'save your money', 'free alternative',
      'underrated tech tool', 'productivity secret', 'automate everything',
      'work smarter not harder', 'tech that actually improves life'
    ],
    typicalEmojis: ['💻', '📱', '⌨️', '🖱️', '🎧', '⚡', '🚀', '💡', '🔧', '⚙️', '📊', '🎯', '✨', '🔥', '💯'],
    toneGuidelines: 'Informative and helpful without being condescending. Practical advice over hype. Honest reviews that acknowledge budget constraints. Celebrates efficiency gains and clever solutions. Anti-consumerism despite tech focus - encourages smart purchases over constant upgrades.',
    audiencePreferences: [
      'Practical productivity tips', 'Budget-friendly tech recommendations', 'App reviews',
      'Keyboard shortcuts', 'Workflow automation', 'Desk setup inspiration',
      'Honest tech reviews', 'Free tool alternatives', 'Tech problem solutions'
    ],
    engagementTriggers: [
      'Productivity hack reveals', 'iPhone vs Android debates', 'Budget tech finds',
      'Underrated app recommendations', 'Desk setup tours', 'Tech hot takes',
      'Workflow optimization tips', 'Gadget necessity debates', 'Free vs paid tool comparisons'
    ]
  },

  //==================== PARENTING NICHE ====================
  {
    niche: 'parenting',
    vocabulary: [
      'toddler', 'baby', 'kids', 'children', 'newborn', 'infant', 'preschooler', 'teenager',
      'tantrum', 'meltdown', 'bedtime', 'nap time', 'sleep training', 'co-sleeping',
      'breastfeeding', 'bottle feeding', 'formula', 'solid foods', 'picky eater',
      'developmental milestones', 'first words', 'walking', 'crawling', 'potty training',
      'daycare', 'preschool', 'school', 'homework', 'screen time', 'playtime',
      'discipline', 'boundaries', 'gentle parenting', 'positive reinforcement', 'time-out',
      'patience', 'exhaustion', 'mom guilt', 'dad life', 'parenting win', 'parenting fail',
      'survival mode', 'chaos', 'messy house', 'laundry pile', 'snack tax', 'sippy cup',
      'diaper bag', 'stroller', 'car seat', 'baby carrier', 'high chair',
      'bedtime routine', 'morning chaos', 'school run', 'activities', 'sports', 'crafts',
      'quality time', 'family time', 'date night', 'me time', 'self-care', 'village'
    ],
    slangTerms: {
      'mom guilt': 'feeling of inadequacy or worry about parenting choices',
      'snack tax': 'parent eating kids\' snacks',
      'survival mode': 'getting through day with minimal functioning',
      'gentle parenting': 'respectful discipline approach without punishment',
      'village': 'support system helping raise children',
      'touched out': 'overwhelmed by physical contact from children',
      'threenager': 'three-year-old with teenager attitude',
      'witching hour': 'chaotic late afternoon/early evening time',
      'sleep regression': 'temporary period when baby stops sleeping well',
      'parenting win': 'successful moment in parenting',
      'parenting fail': 'humorous mistake or challenging moment'
    },
    culturalReferences: [
      'Bluey parenting goals', 'gentle parenting movement', 'crying in the pantry',
      'wine o\'clock jokes', 'Pinterest perfect fail', 'Instagram vs reality parenting',
      'Cocomelon debate', 'screen time guilt', 'mom groups drama',
      'unsolicited parenting advice', 'mom wars (breast vs bottle, stay home vs work)',
      'toddler negotiation skills', 'losing your mind before 9am'
    ],
    trendingTopics: [
      'gentle parenting techniques', 'screen time guidelines', 'mom burnout reality',
      'working parent balance', 'toddler tantrum management', 'picky eater strategies',
      'sleep training methods', 'parenting without shame', 'mental load discussion',
      'village importance', 'self-care for parents', 'realistic expectations',
      'parenting different ages', 'sibling dynamics', 'quality over quantity time',
      'letting go of perfection', 'honest parenting struggles', 'asking for help'
    ],
    trendingHashtags: [
      '#MomLife', '#DadLife', '#Parenting', '#ToddlerLife', '#ParentingHumor', '#RealMomLife',
      '#MomTruths', '#ParentingWin', '#ParentingFail', '#Motherhood', '#Fatherhood',
      '#ParentingCommunity', '#HonestParenting', '#ParentingIsHard', '#TiredMom', '#BusyDad',
      '#ParentingJourney', '#FamilyLife', '#KidsOfInstagram', '#ParentingTips', '#MomBurnout',
      '#GentleParenting', '#ToddlerMom', '#NewParent', '#ParentingSupport', '#RealParenting'
    ],
    trendingPhrases: [
      'no one tells you that parenting means being touched ALL. THE. TIME.',
      'I just want 5 minutes alone', 'why does nobody talk about this',
      'please tell me I\'m not alone', 'the chaos is real', 'I love them but',
      'survival mode activated', 'coffee and patience', 'they\'re lucky they\'re cute',
      'you\'re doing great mama', 'give yourself grace', 'it takes a village',
      'this too shall pass', 'the days are long but the years are short'
    ],
    typicalEmojis: ['👶', '🍼', '😅', '😴', '☕', '🙈', '💪', '❤️', '🤯', '😭', '🤪', '🫠', '💤', '🎉', '🫶'],
    toneGuidelines: 'Honest and vulnerable about struggles. Humorous while validating hard emotions. Supportive without judgment. Celebrates small wins. Normalizes imperfection and asking for help. Creates sense of community through shared experiences. Never preachy or prescriptive about "right way" to parent.',
    audiencePreferences: [
      'Relatable parenting struggles', 'Honest humor', 'Validation of feelings',
      'Practical survival tips', 'No-judgment zone', 'Realistic expectations',
      'Mental health support', 'Community connection', 'Permission to not be perfect'
    ],
    engagementTriggers: [
      'Relatable parenting moments', 'Toddler logic stories', 'Exhaustion confessions',
      'Mom guilt discussions', 'Parenting fails', 'Unsolicited advice rants',
      'Before/after having kids comparisons', 'Things nobody warned you about',
      'Parenting unpopular opinions', 'Asking "am I the only one" questions'
    ]
  },

  //==================== PETS NICHE ====================
  {
    niche: 'pets',
    vocabulary: [
      'dog', 'cat', 'puppy', 'kitten', 'rescue', 'adopt', 'breed', 'mixed breed', 'purebred',
      'training', 'tricks', 'commands', 'obedience', 'behavior', 'socialization',
      'vet', 'veterinarian', 'checkup', 'vaccines', 'health', 'wellness', 'grooming',
      'walk', 'play', 'fetch', 'toys', 'treats', 'snacks', 'food', 'diet', 'nutrition',
      'zoomies', 'derp', 'blep', 'sploot', 'boop', 'good boy', 'good girl', 'who\'s a good dog',
      'pet parent', 'fur baby', 'pawrent', 'dog mom', 'dog dad', 'cat mom', 'cat dad',
      'cuddles', 'belly rubs', 'scritches', 'head pats', 'ear scratches',
      'separation anxiety', 'reactive', 'recall', 'leash training', 'crate training',
      'adventure', 'hiking', 'beach day', 'road trip', 'pet-friendly'
    ],
    slangTerms: {
      'zoomies': 'sudden burst of hyperactive running',
      'derp': 'silly or goofy expression/behavior',
      'blep': 'tongue sticking out slightly',
      'sploot': 'laying with back legs stretched out',
      'boop': 'gentle nose tap',
      'pawrent': 'pet parent',
      'fur baby': 'beloved pet treated like child',
      'good boy/girl': 'affectionate praise for pet',
      'scritches': 'scratching/petting',
      'tippy taps': 'excited paw movements',
      'floof': 'very fluffy animal',
      'chonk': 'affectionately chubby pet',
      'bork': 'dog bark (humorous)',
      'mlem': 'licking motion',
      'heckin': 'very (as in "heckin cute")'
    },
    culturalReferences: [
      'we don\'t deserve dogs', 'dogs are better than people', 'cat distribution system',
      'adopt don\'t shop', 'who rescued who', 'dog mom lifestyle', 'crazy cat lady',
      'pets are family', 'no pets on furniture rule (broken immediately)',
      'spending more on pet food than own food', 'pets as Instagram models',
      'talking to pets like babies', 'entire camera roll is pet photos'
    ],
    trendingTopics: [
      'rescue stories', 'training tips', 'pet health awareness', 'adoption advocacy',
      'positive reinforcement training', 'pet anxiety solutions', 'enrichment activities',
      'pet nutrition myths', 'bonding with pets', 'funny pet behaviors explained',
      'pet-friendly travel', 'sustainable pet products', 'pet first aid',
      'understanding body language', 'reactive dog support', 'senior pet care'
    ],
    trendingHashtags: [
      '#DogsOfInstagram', '#CatsOfInstagram', '#DogMom', '#DogDad', '#CatMom', '#CatDad',
      '#PuppyLove', '#KittenLove', '#RescueDog', '#RescueCat', '#AdoptDontShop', '#PetLife',
      '#DogLovers', '#CatLovers', '#FurBaby', '#PetsOfInstagram', '#DogLife', '#CatLife',
      '#PuppiesOfInstagram', '#KittensOfInstagram', '#PetParent', '#AnimalLover', '#DogCommunity',
      '#CatCommunity', '#PetPhotography', '#Pawsome', '#DogsAreFamily', '#CatsAreFamily'
    ],
    trendingPhrases: [
      'we don\'t deserve dogs', 'living their best life', 'who rescued who',
      'unconditional love', 'best decision ever', 'worth every penny',
      'my heart is full', 'why are dogs like this', 'cats are weird and I love it',
      'the goodest boy', 'professional napper', 'official taste tester',
      'personal trainer (walks)', 'emotional support animal', 'my whole world'
    ],
    typicalEmojis: ['🐶', '🐕', '🐱', '🐈', '🐾', '❤️', '😍', '🥰', '🦴', '🎾', '🏃', '💤', '😂', '🤣', '✨'],
    toneGuidelines: 'Loving and enthusiastic. Humorous appreciation of pet quirks. Wholesome and heartwarming. Supportive of rescue/adoption. Educational without being preachy. Celebrates unique pet personalities. Uses playful internet pet language naturally.',
    audiencePreferences: [
      'Cute pet content', 'Funny pet behaviors', 'Training tips', 'Rescue stories',
      'Pet care advice', 'Relatable pet parent moments', 'Health and wellness info',
      'Pet-friendly recommendations', 'Heartwarming bonding moments'
    ],
    engagementTriggers: [
      'Cute pet photos/videos', 'Funny pet behavior', 'Rescue transformation stories',
      'Pet fails', 'Training milestones', 'Pet logic humor', 'Asking pet-related questions',
      '"Caption this" pet photos', 'Pet personality descriptions', 'Relatable pet parent struggles'
    ]
  }
];

/**
 * Main seeding function
 */
async function seedNicheContexts() {
  try {
    console.log('🌱 Starting Niche Context Database seeding...\n');
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const dbName = 'veeforedb';
    await mongoose.connect(MONGODB_URI, { 
      dbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Clear existing niche contexts
    console.log('🗑️  Clearing existing niche contexts...');
    try {
      const deleteResult = await db.collection('nichecontexts').deleteMany({});
      console.log(`   Deleted ${deleteResult.deletedCount} existing niche contexts\n`);
    } catch (error) {
      console.log('   No existing niche contexts to delete (collection may not exist yet)\n');
    }

    let totalInserted = 0;
    let totalErrors = 0;

    // Insert each niche context
    for (const nicheData of NICHE_CONTEXTS) {
      console.log(`📝 Processing ${nicheData.niche.toUpperCase()} niche...`);
      
      try {
        const nicheContext = {
          niche: nicheData.niche,
          vocabulary: nicheData.vocabulary,
          slangTerms: new Map(Object.entries(nicheData.slangTerms)),
          culturalReferences: nicheData.culturalReferences,
          trendingTopics: nicheData.trendingTopics,
          trendingHashtags: nicheData.trendingHashtags,
          trendingPhrases: nicheData.trendingPhrases,
          typicalEmojis: nicheData.typicalEmojis,
          toneGuidelines: nicheData.toneGuidelines,
          lastUpdated: new Date()
        };

        await db.collection('nichecontexts').insertOne(nicheContext);
        totalInserted++;
        
        console.log(`   ✅ Inserted ${nicheData.niche} context`);
        console.log(`      - ${nicheData.vocabulary.length} vocabulary terms`);
        console.log(`      - ${Object.keys(nicheData.slangTerms).length} slang terms`);
        console.log(`      - ${nicheData.trendingTopics.length} trending topics`);
        console.log(`      - ${nicheData.trendingHashtags.length} hashtags`);
        console.log(`      - ${nicheData.typicalEmojis.length} emojis\n`);
      } catch (error) {
        totalErrors++;
        console.error(`   ❌ Error inserting ${nicheData.niche}: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Seeding Complete!');
    console.log(`✅ Total niche contexts inserted: ${totalInserted}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Show summary
    console.log('📈 Seeded Niches:');
    for (const nicheData of NICHE_CONTEXTS) {
      const count = await db.collection('nichecontexts').countDocuments({ niche: nicheData.niche });
      console.log(`   ✓ ${nicheData.niche.padEnd(12)} - ${count > 0 ? 'SUCCESS' : 'FAILED'}`);
    }

    console.log('\n💡 This is TRAINING DATA for AI caption generation:');
    console.log('   - Vocabulary the AI learns from to understand each niche');
    console.log('   - Language patterns real Instagram creators use');
    console.log('   - Audience preferences and engagement triggers');
    console.log('   - Trending topics and hashtag strategies');
    console.log('   - Niche-specific tone and communication style\n');

  } catch (error) {
    console.error('💥 Fatal error during seeding:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the seeding script
seedNicheContexts()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    console.log('\n📚 Next Steps:');
    console.log('   1. Run seed-example-captions.ts to populate example caption library');
    console.log('   2. Test NicheContextService.getNicheContext() with various niches');
    console.log('   3. Verify prompt generation includes niche context\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
