/**
 * Seed script for NicheContext database
 * Populates initial niche-specific language patterns, terminology, and trends
 * for various Instagram niches
 * 
 * Requirements addressed:
 * - 3.1: Maintain language databases for at least 15 content niches
 * - 3.2: Provide niche-specific vocabulary, slang, cultural references, and emojis
 * 
 * Usage: tsx server/scripts/seedNicheContexts.ts
 */

import mongoose from 'mongoose';
import { NicheContextModel } from '../models/NicheContext/NicheContext';

// MongoDB connection string from environment or default to Atlas
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
}

// Comprehensive niche context data
const nicheContextsData: NicheContextData[] = [
  // 1. FITNESS
  {
    niche: 'fitness',
    vocabulary: [
      'gains', 'reps', 'sets', 'workout', 'training', 'shredded', 'bulk', 'cut',
      'macros', 'protein', 'cardio', 'lifting', 'bodyweight', 'strength', 'endurance',
      'recovery', 'mobility', 'flexibility', 'mindset', 'discipline', 'consistency',
      'grind', 'hustle', 'push', 'pump', 'burn', 'sweat', 'transform', 'progress'
    ],
    slangTerms: {
      'gains': 'muscle growth or progress',
      'swole': 'muscular and fit',
      'beast mode': 'intense workout state',
      'leg day': 'lower body workout day',
      'no pain no gain': 'effort leads to results',
      'PR': 'personal record',
      'DOMS': 'delayed onset muscle soreness',
      'bulking': 'eating surplus to gain muscle',
      'cutting': 'eating deficit to lose fat',
      'shredded': 'very low body fat percentage',
      'natty': 'natural (no steroids)',
      'on the grind': 'working hard consistently'
    },
    culturalReferences: [
      'Arnold Schwarzenegger', 'Rich Piana', 'Jeff Nippard', 'Greg Doucette',
      'David Goggins', 'Gym Shark', 'CrossFit', 'Peloton', 'F45', 'Orange Theory',
      'MyFitnessPal', 'Strava', 'Nike Training Club', 'Beachbody'
    ],
    trendingTopics: [
      '75 hard challenge', 'home workouts', 'calisthenics', 'progressive overload',
      'mind-muscle connection', 'mobility work', 'recovery protocols', 'sleep optimization',
      'zone 2 cardio', 'metabolic conditioning', 'functional fitness', 'hybrid training'
    ],
    trendingHashtags: [
      '#FitnessMotivation', '#GymLife', '#FitFam', '#Gains', '#WorkoutRoutine',
      '#FitnessJourney', '#GymMotivation', '#FitnessGoals', '#TrainHard', '#FitLife',
      '#BodyTransformation', '#MuscleBuilding', '#HealthyLifestyle', '#FitnessAddict',
      '#GymTime', '#StrengthTraining', '#CardioWorkout', '#LegDay', '#ChestDay'
    ],
    trendingPhrases: [
      'no excuses', 'earn your body', 'train insane or remain the same',
      'your only limit is you', 'stronger than yesterday', 'results happen over time',
      'consistency is key', 'embrace the process', 'mind over matter',
      'pain is temporary', 'prove them wrong', 'trust the process'
    ],
    typicalEmojis: ['💪', '🔥', '💯', '⚡', '🏋️', '🎯', '🦾', '💥', '🚀', '👊'],
    toneGuidelines: 'Motivational, disciplined, and authentic. Use direct language that shows commitment without being preachy. Balance inspirational content with real struggle and progress.'
  },

  // 2. FOOD
  {
    niche: 'food',
    vocabulary: [
      'delicious', 'yummy', 'tasty', 'flavorful', 'savory', 'sweet', 'spicy', 'tangy',
      'recipe', 'homemade', 'fresh', 'organic', 'seasonal', 'comfort food', 'indulgent',
      'healthy', 'nutritious', 'wholesome', 'craving', 'foodie', 'culinary', 'gourmet',
      'plating', 'presentation', 'texture', 'aroma', 'mouthwatering', 'drool-worthy'
    ],
    slangTerms: {
      'nom nom': 'eating delicious food',
      'food porn': 'visually appealing food photos',
      'drool-worthy': 'extremely appetizing',
      'foodie': 'person passionate about food',
      'hangry': 'angry due to hunger',
      'nom': 'sound of eating',
      'yum': 'expression of deliciousness',
      'comfort food': 'nostalgic satisfying food',
      'guilty pleasure': 'indulgent food you love',
      'on point': 'perfectly executed'
    },
    culturalReferences: [
      'Gordon Ramsay', 'Jamie Oliver', 'Ina Garten', 'Bon Appetit', 'Tasty',
      'Food Network', 'Serious Eats', 'Salt Fat Acid Heat', 'Chef\'s Table',
      'MasterChef', 'Great British Bake Off', 'Anthony Bourdain'
    ],
    trendingTopics: [
      'air fryer recipes', 'meal prep', 'sourdough baking', 'plant-based meals',
      'cottage cheese recipes', 'protein bowls', 'viral pasta', 'butter boards',
      'charcuterie boards', 'tinned fish trend', 'high protein snacks', 'pasta chips'
    ],
    trendingHashtags: [
      '#FoodPorn', '#Foodie', '#InstaFood', '#FoodPhotography', '#Yummy', '#Delicious',
      '#FoodBlogger', '#FoodLover', '#HomeCooking', '#FoodStagram', '#EatLocal',
      '#FoodGasm', '#FoodPics', '#CookingAtHome', '#RecipeOfTheDay', '#FoodiesOfInstagram',
      '#HealthyEating', '#ComfortFood', '#FoodArt', '#ChefLife'
    ],
    trendingPhrases: [
      'made with love', 'good food good mood', 'life is short eat dessert first',
      'food is my love language', 'eat well live well', 'homemade happiness',
      'cooking is love made visible', 'food brings people together', 'simple ingredients',
      'easy weeknight dinner', 'crowd pleaser', 'family favorite'
    ],
    typicalEmojis: ['🍕', '🍔', '🍰', '🍜', '🥗', '🍳', '🌮', '🍣', '🍝', '☕', '🔪', '🍴', '😋', '🤤'],
    toneGuidelines: 'Enthusiastic, warm, and inviting. Use sensory language that helps readers taste and smell through the screen. Balance aspiration with accessibility.'
  },

  // 3. TRAVEL
  {
    niche: 'travel',
    vocabulary: [
      'wanderlust', 'adventure', 'explore', 'discover', 'journey', 'voyage', 'destination',
      'bucket list', 'backpacking', 'roadtrip', 'getaway', 'escape', 'paradise', 'breathtaking',
      'stunning', 'picturesque', 'scenic', 'culture', 'local', 'authentic', 'hidden gem',
      'off the beaten path', 'memorable', 'unforgettable', 'epic', 'views', 'sunset', 'sunrise'
    ],
    slangTerms: {
      'wanderlust': 'strong desire to travel',
      'jet lag': 'tiredness from time zone changes',
      'bucket list': 'list of things to do before you die',
      'off the beaten path': 'not touristy, undiscovered',
      'hidden gem': 'undiscovered amazing place',
      'digital nomad': 'remote worker who travels',
      'road tripping': 'traveling by car',
      'backpacking': 'budget travel with backpack',
      'bleisure': 'business + leisure travel',
      'staycation': 'vacation at home'
    },
    culturalReferences: [
      'Lonely Planet', 'Rick Steves', 'Anthony Bourdain', 'National Geographic',
      'Travel + Leisure', 'Airbnb', 'Booking.com', 'TripAdvisor', 'Nomadic Matt',
      'The Bucket List Family', 'Lost LeBlanc', 'Hey Nadine', 'Sailing La Vagabonde'
    ],
    trendingTopics: [
      'sustainable travel', 'slow travel', 'digital nomad lifestyle', 'work from anywhere',
      'van life', 'overlanding', 'solo female travel', 'luxury budget travel',
      'second cities', 'shoulder season', 'revenge travel', 'domestic travel'
    ],
    trendingHashtags: [
      '#TravelGram', '#Wanderlust', '#InstaTravel', '#TravelPhotography', '#Explore',
      '#Adventure', '#TravelBlogger', '#TravelTheWorld', '#BucketList', '#PassportReady',
      '#TravelAddict', '#TravelDiaries', '#BeautifulDestinations', '#TravelGoals',
      '#ExploreMore', '#RoamThePlanet', '#TravelLife', '#VacationMode', '#TravelInspiration'
    ],
    trendingPhrases: [
      'not all who wander are lost', 'collect moments not things', 'adventure awaits',
      'life is short make it sweet', 'take only memories leave only footprints',
      'the world is a book', 'go where you feel most alive', 'travel far travel often',
      'find me where the wifi is weak', 'passport full heart fuller'
    ],
    typicalEmojis: ['✈️', '🌍', '🗺️', '🏝️', '🏖️', '🌅', '🌄', '🚢', '🎒', '📸', '🧳', '⛰️', '🏔️', '🌊'],
    toneGuidelines: 'Aspirational yet accessible. Share the wonder and excitement of exploration while being authentic about challenges. Balance breathtaking moments with practical insights.'
  },

  // 4. FASHION
  {
    niche: 'fashion',
    vocabulary: [
      'style', 'outfit', 'look', 'aesthetic', 'vibe', 'trendy', 'chic', 'elegant',
      'edgy', 'casual', 'formal', 'streetwear', 'vintage', 'minimalist', 'maximalist',
      'layering', 'accessorize', 'statement piece', 'wardrobe staple', 'capsule wardrobe',
      'sustainable fashion', 'thrifted', 'designer', 'haute couture', 'ready-to-wear'
    ],
    slangTerms: {
      'lewk': 'fashionable look',
      'drip': 'stylish outfit or accessories',
      'slay': 'look amazing',
      'fit check': 'showing off outfit',
      'ootd': 'outfit of the day',
      'grwm': 'get ready with me',
      'haul': 'showing purchased items',
      'dupe': 'affordable alternative',
      'thrifted': 'bought secondhand',
      'serving looks': 'looking fashionable',
      'on trend': 'fashionable right now',
      'investment piece': 'expensive quality item'
    },
    culturalReferences: [
      'Vogue', 'Elle', 'Harper\'s Bazaar', 'Fashion Week', 'Met Gala',
      'Anna Wintour', 'Coco Chanel', 'Zara', 'H&M', 'Shein', 'Reformation',
      'Depop', 'Poshmark', 'The RealReal', 'Rent the Runway'
    ],
    trendingTopics: [
      'quiet luxury', 'dopamine dressing', 'coastal grandmother', 'mob wife aesthetic',
      'old money aesthetic', 'dark academia', 'cottagecore fashion', 'Y2K revival',
      'sustainable fashion', 'capsule wardrobe', 'thrift flips', 'styling hacks'
    ],
    trendingHashtags: [
      '#OOTD', '#FashionBlogger', '#StyleInspo', '#FashionGram', '#Fashionista',
      '#StreetStyle', '#FashionDaily', '#OutfitInspiration', '#FashionWeek', '#Styleoftheday',
      '#FashionLover', '#InstaFashion', '#Trendy', '#FashionAddict', '#LookOfTheDay'
    ],
    trendingPhrases: [
      'outfit repeater', 'wear what makes you happy', 'personal style evolution',
      'confidence is the best outfit', 'less is more', 'timeless pieces',
      'dress for yourself', 'fashion fades style is eternal'
    ],
    typicalEmojis: ['👗', '👠', '👜', '💄', '👔', '🕶️', '💅', '✨', '🛍️', '🎀', '👑'],
    toneGuidelines: 'Confident, stylish, and personal. Celebrate individual expression while sharing trends. Balance aspiration with relatability and inclusivity.'
  },

  // 5. TECH
  {
    niche: 'tech',
    vocabulary: [
      'innovation', 'cutting-edge', 'breakthrough', 'disruptive', 'AI', 'machine learning',
      'automation', 'cloud', 'cybersecurity', 'blockchain', 'crypto', 'NFT', 'metaverse',
      'API', 'developer', 'coding', 'programming', 'software', 'hardware', 'gadget',
      'device', 'smartphone', 'laptop', 'tablet', 'wearable', 'IoT', '5G', 'VR', 'AR'
    ],
    slangTerms: {
      'bleeding edge': 'latest technology',
      'vaporware': 'announced but never released',
      'killer app': 'must-have application',
      'unicorn': 'startup worth over $1 billion',
      'pivot': 'change business direction',
      'MVP': 'minimum viable product',
      'ship it': 'release the product',
      'bug': 'software error',
      'feature creep': 'too many features added',
      'scalable': 'can handle growth'
    },
    culturalReferences: [
      'Steve Jobs', 'Elon Musk', 'Bill Gates', 'Apple', 'Google', 'Microsoft',
      'Tesla', 'SpaceX', 'OpenAI', 'TechCrunch', 'Wired', 'The Verge', 'MKBHD'
    ],
    trendingTopics: [
      'ChatGPT', 'generative AI', 'Apple Vision Pro', 'foldable phones',
      'quantum computing', 'Web3', 'decentralized apps', 'edge computing',
      'green tech', 'AI ethics', 'privacy concerns', 'digital wellness'
    ],
    trendingHashtags: [
      '#Tech', '#Technology', '#Innovation', '#AI', '#MachineLearning', '#Coding',
      '#Programming', '#Developer', '#TechNews', '#Gadgets', '#TechLife', '#FutureTech'
    ],
    trendingPhrases: [
      'the future is now', 'technology changes everything', 'innovation at scale',
      'powered by AI', 'seamless integration', 'user-centric design',
      'disrupting the industry', 'next generation technology'
    ],
    typicalEmojis: ['💻', '📱', '🤖', '🚀', '⚡', '🔬', '🎮', '🖥️', '📡', '🛠️'],
    toneGuidelines: 'Informative, forward-thinking, and accessible. Break down complex topics without dumbing down. Balance excitement about innovation with practical applications.'
  },

  // 6. BUSINESS
  {
    niche: 'business',
    vocabulary: [
      'entrepreneur', 'startup', 'growth', 'revenue', 'profit', 'ROI', 'KPI', 'metrics',
      'strategy', 'execution', 'leadership', 'team', 'culture', 'productivity', 'efficiency',
      'networking', 'partnership', 'investment', 'funding', 'valuation', 'market', 'competition'
    ],
    slangTerms: {
      'bootstrapped': 'self-funded business',
      'burn rate': 'rate of spending money',
      'runway': 'time before money runs out',
      'pivot': 'change business model',
      'hustle': 'work hard',
      'side hustle': 'secondary income source',
      'solopreneur': 'solo entrepreneur',
      'passive income': 'income without active work'
    },
    culturalReferences: [
      'Gary Vee', 'Simon Sinek', 'Tim Ferriss', 'Shark Tank', 'Forbes',
      'Entrepreneur Magazine', 'Inc.', 'Fast Company', 'Y Combinator', 'TechCrunch'
    ],
    trendingTopics: [
      'remote work', 'hybrid teams', 'AI in business', 'creator economy',
      'personal branding', 'newsletter businesses', 'community-led growth',
      'sustainable business', 'employee wellbeing', 'async work'
    ],
    trendingHashtags: [
      '#Entrepreneur', '#Business', '#Startup', '#SmallBusiness', '#Leadership',
      '#Success', '#Hustle', '#BusinessOwner', '#Entrepreneurship', '#Mindset'
    ],
    trendingPhrases: [
      'build in public', 'move fast break things', 'fail fast learn faster',
      'people over profit', 'consistency beats intensity', 'execute or die'
    ],
    typicalEmojis: ['💼', '📈', '💰', '🎯', '🚀', '💡', '🏆', '⚡', '🔥'],
    toneGuidelines: 'Professional yet approachable. Share wins and losses authentically. Balance motivation with practical business insights and real experiences.'
  },

  // 7. BEAUTY
  {
    niche: 'beauty',
    vocabulary: [
      'skincare', 'makeup', 'routine', 'glow', 'radiant', 'flawless', 'dewy', 'matte',
      'serum', 'moisturizer', 'cleanser', 'toner', 'exfoliate', 'SPF', 'hydration',
      'anti-aging', 'natural', 'clean beauty', 'cruelty-free', 'vegan', 'ingredients'
    ],
    slangTerms: {
      'glow up': 'transformation to looking better',
      'beat face': 'full makeup application',
      'snatched': 'looking amazing',
      'no makeup makeup': 'natural looking makeup',
      'glass skin': 'smooth glowing skin',
      'slugging': 'petroleum jelly skincare method',
      'double cleanse': 'two-step face washing',
      'Holy Grail': 'favorite must-have product',
      'dupe': 'affordable alternative product',
      'empties': 'finished products'
    },
    culturalReferences: [
      'Sephora', 'Ulta', 'Charlotte Tilbury', 'Fenty Beauty', 'Glossier',
      'The Ordinary', 'Drunk Elephant', 'Hyram', 'James Charles', 'NikkieTutorials'
    ],
    trendingTopics: [
      'skin cycling', 'retinol alternatives', 'clean beauty', 'K-beauty',
      'grwm makeup', 'skin prep', 'cream blush', 'latte makeup', 'fox eye lift',
      'underpainting technique', 'skin minimalism', 'dermaplaning'
    ],
    trendingHashtags: [
      '#Beauty', '#Skincare', '#Makeup', '#BeautyBlogger', '#MakeupLover',
      '#SkincareRoutine', '#BeautyTips', '#MakeupTutorial', '#GlowingSkin', '#CleanBeauty'
    ],
    trendingPhrases: [
      'skincare is self-care', 'invest in your skin', 'less is more',
      'skin first makeup second', 'beauty from within', 'embrace your natural beauty'
    ],
    typicalEmojis: ['💄', '💅', '✨', '🌟', '💗', '🌸', '🎀', '👑', '💖'],
    toneGuidelines: 'Empowering and inclusive. Share honest reviews and realistic expectations. Balance product recommendations with skin health education.'
  },

  // 8. PARENTING
  {
    niche: 'parenting',
    vocabulary: [
      'motherhood', 'fatherhood', 'toddler', 'baby', 'newborn', 'milestone', 'development',
      'parenting', 'family', 'kids', 'children', 'discipline', 'gentle parenting',
      'attachment', 'tantrum', 'bedtime', 'routine', 'schedule', 'playdate', 'daycare'
    ],
    slangTerms: {
      'mom life': 'daily life as a mother',
      'mom guilt': 'feeling guilty as a parent',
      'terrible twos': 'challenging toddler phase',
      'threenager': 'difficult three-year-old',
      'wine o\'clock': 'time to relax after kids sleep',
      'mom brain': 'forgetfulness from parenting',
      'velcro baby': 'clingy baby',
      'SAHM': 'stay-at-home mom',
      'WAHM': 'work-at-home mom'
    },
    culturalReferences: [
      'What to Expect When You\'re Expecting', 'The Wonder Weeks', 'BabyCenter',
      'Motherly', 'Scary Mommy', 'Janet Lansbury', 'Dr. Becky', 'Big Little Feelings'
    ],
    trendingTopics: [
      'gentle parenting', 'respectful parenting', 'screen time limits',
      'Montessori at home', 'sleep training', 'baby-led weaning',
      'conscious parenting', 'mental load', 'parental burnout', 'co-parenting'
    ],
    trendingHashtags: [
      '#MomLife', '#Parenting', '#Motherhood', '#FamilyFirst', '#ParentingTips',
      '#ToddlerLife', '#BabyLove', '#ParentingJourney', '#MomCommunity', '#DadLife'
    ],
    trendingPhrases: [
      'it takes a village', 'the days are long but the years are short',
      'they\'re only little once', 'raising humans is hard', 'grace over guilt',
      'you\'re doing better than you think', 'comparison is the thief of joy'
    ],
    typicalEmojis: ['👶', '👪', '💕', '🍼', '👶', '💙', '💗', '🤱', '🧸', '❤️'],
    toneGuidelines: 'Supportive, honest, and judgment-free. Share both joys and struggles authentically. Balance advice with empathy, acknowledging that every family is different.'
  },

  // 9. GAMING
  {
    niche: 'gaming',
    vocabulary: [
      'gameplay', 'stream', 'speedrun', 'boss fight', 'quest', 'level up', 'achievement',
      'multiplayer', 'co-op', 'PvP', 'PvE', 'loot', 'grind', 'meta', 'nerf', 'buff',
      'DLC', 'mod', 'patch', 'update', 'esports', 'tournament', 'squad', 'clan'
    ],
    slangTerms: {
      'GG': 'good game',
      'noob': 'beginner player',
      'pwned': 'dominated',
      'clutch': 'come-from-behind win',
      'tilted': 'frustrated and playing poorly',
      'camping': 'staying in one spot',
      'sweaty': 'trying very hard',
      'cracked': 'extremely skilled',
      'OP': 'overpowered',
      'RNG': 'random number generator/luck'
    },
    culturalReferences: [
      'Twitch', 'Discord', 'Steam', 'PlayStation', 'Xbox', 'Nintendo', 'Epic Games',
      'PewDiePie', 'Ninja', 'Pokimane', 'Shroud', 'The Game Awards', 'E3'
    ],
    trendingTopics: [
      'Baldur\'s Gate 3', 'Elden Ring', 'Zelda TOTK', 'Starfield',
      'cloud gaming', 'VR gaming', 'indie games', 'roguelike', 'souls-like',
      'battle royale', 'Game Pass', 'crossplay', 'retro gaming'
    ],
    trendingHashtags: [
      '#Gaming', '#Gamer', '#Twitch', '#PCGaming', '#GamingCommunity', '#Esports',
      '#GamingSetup', '#VideoGames', '#StreamerLife', '#GamingLife', '#GamersUnite'
    ],
    trendingPhrases: [
      'one more game', 'just vibing', 'let\'s run it back', 'absolute cinema',
      'skill issue', 'diff', 'ez clap', 'too good', 'built different'
    ],
    typicalEmojis: ['🎮', '🕹️', '👾', '🎯', '🏆', '⚔️', '🔥', '💯', '👑', '⚡'],
    toneGuidelines: 'Energetic, competitive, and community-focused. Balance skill showcase with humor and relatability. Celebrate wins without excessive bragging.'
  },

  // 10. PETS
  {
    niche: 'pets',
    vocabulary: [
      'adopt', 'rescue', 'furry friend', 'pupper', 'doggo', 'kitty', 'furbaby',
      'pet parent', 'fur mama', 'training', 'tricks', 'treats', 'playtime', 'cuddles',
      'zoomies', 'boop', 'snoot', 'toe beans', 'paws', 'tail wags', 'purr', 'meow'
    ],
    slangTerms: {
      'doggo': 'dog',
      'pupper': 'puppy',
      'smol': 'small',
      'chonk': 'chubby pet',
      'zoomies': 'sudden energy bursts',
      'boop': 'gentle nose touch',
      'toe beans': 'pet's paw pads',
      'blep': 'tongue sticking out',
      'sploot': 'lying flat on belly',
      'mlem': 'licking sound'
    },
    culturalReferences: [
      'Westminster Dog Show', 'Grumpy Cat', 'Boo the Pomeranian',
      'Chewy', 'Petco', 'PetSmart', 'Rover', 'The Dodo', 'It\'s Me or the Dog'
    ],
    trendingTopics: [
      'positive reinforcement training', 'raw feeding', 'pet insurance',
      'enrichment activities', 'fear-free vet visits', 'foster to adopt',
      'senior pet care', 'separation anxiety', 'pet DNA tests', 'smart pet tech'
    ],
    trendingHashtags: [
      '#DogsOfInstagram', '#CatsOfInstagram', '#PuppyLove', '#PetLove', '#DogLife',
      '#CatLife', '#PetsOfInstagram', '#AdoptDontShop', '#DogLovers', '#CatLovers'
    ],
    trendingPhrases: [
      'who rescued who', 'love at first woof', 'my therapist has fur',
      'home is where my pet is', 'all you need is love and a dog',
      'cats rule dogs drool', 'unconditional love'
    ],
    typicalEmojis: ['🐶', '🐱', '🐾', '❤️', '🦴', '🐕', '🐈', '💕', '😍', '🥰'],
    toneGuidelines: 'Warm, playful, and heartfelt. Celebrate the joy pets bring while sharing helpful tips. Balance cute moments with responsible pet ownership advice.'
  },

  // 11-15: Condensed additional niches
  {
    niche: 'art',
    vocabulary: ['creative', 'artwork', 'painting', 'drawing', 'sketch', 'illustration', 'design', 'canvas', 'palette', 'inspiration', 'artistic', 'expression', 'medium', 'technique', 'masterpiece'],
    slangTerms: { 'art block': 'creative block', 'WIP': 'work in progress', 'OC': 'original character', 'fanart': 'art of existing characters', 'study': 'practice piece' },
    culturalReferences: ['DeviantArt', 'ArtStation', 'Procreate', 'Adobe', 'Wacom', 'Bob Ross', 'Van Gogh', 'Picasso', 'MoMA', 'The Met'],
    trendingTopics: ['digital art', 'NFT art', 'AI art debate', 'mixed media', 'art therapy', 'urban sketching', 'plein air', 'art challenges', 'sketchbook tours', 'art supplies haul'],
    trendingHashtags: ['#Art', '#Artist', '#Artwork', '#Drawing', '#Painting', '#Illustration', '#ArtistsOnInstagram', '#DigitalArt', '#CreativeProcess', '#ArtCommunity'],
    trendingPhrases: ['art is therapy', 'create every day', 'embrace imperfection', 'process over perfection', 'art has no rules', 'find your style'],
    typicalEmojis: ['🎨', '🖼️', '✏️', '🖌️', '🎭', '✨', '💫', '🌈', '🖍️'],
    toneGuidelines: 'Inspiring and inclusive. Share creative process authentically, including struggles. Encourage experimentation and individual artistic voice.'
  },
  {
    niche: 'music',
    vocabulary: ['song', 'album', 'track', 'melody', 'rhythm', 'lyrics', 'beat', 'producer', 'musician', 'artist', 'concert', 'performance', 'live', 'studio', 'recording', 'mixing', 'mastering'],
    slangTerms: { 'banger': 'great song', 'slaps': 'sounds great', 'vibes': 'mood/feeling', 'EP': 'extended play', 'LP': 'long play album', 'collab': 'collaboration', 'feature': 'guest artist', 'drop': 'release' },
    culturalReferences: ['Spotify', 'Apple Music', 'SoundCloud', 'Billboard', 'Grammy Awards', 'Coachella', 'Rolling Stone', 'Pitchfork', 'NPR Tiny Desk'],
    trendingTopics: ['Spotify Wrapped', 'vinyl revival', 'bedroom pop', 'lo-fi beats', 'AI music generation', 'live looping', 'music therapy', 'concert experience', 'song covers', 'music production tips'],
    trendingHashtags: ['#Music', '#Musician', '#NewMusic', '#MusicProducer', '#MusicLover', '#LiveMusic', '#MusicLife', '#Song', '#IndieMusic', '#MusicIsLife'],
    trendingPhrases: ['music is life', 'turn it up', 'on repeat', 'playlist vibes', 'music heals', 'lost in the music', 'when words fail music speaks'],
    typicalEmojis: ['🎵', '🎶', '🎤', '🎧', '🎸', '🎹', '🥁', '🎺', '🎼', '🔊', '🎙️'],
    toneGuidelines: 'Passionate and expressive. Share music discovery and emotional connections. Balance technical music knowledge with universal appreciation.'
  },
  {
    niche: 'photography',
    vocabulary: ['photo', 'shot', 'capture', 'lens', 'camera', 'exposure', 'aperture', 'ISO', 'shutter speed', 'composition', 'lighting', 'golden hour', 'bokeh', 'portrait', 'landscape', 'street photography'],
    slangTerms: { 'gear acquisition syndrome': 'always buying equipment', 'spray and pray': 'taking many photos hoping one is good', 'chimping': 'checking photos immediately after taking', 'bokeh': 'background blur', 'fast glass': 'wide aperture lens' },
    culturalReferences: ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Lightroom', 'Photoshop', 'VSCO', 'Annie Leibovitz', 'Ansel Adams', 'National Geographic', '500px', 'Unsplash'],
    trendingTopics: ['smartphone photography', 'film photography revival', 'drone photography', 'astrophotography', 'minimalist photography', 'street photography ethics', 'AI photo editing', 'computational photography'],
    trendingHashtags: ['#Photography', '#PhotoOfTheDay', '#Photographer', '#InstaPhoto', '#PhotoLovers', '#PhotographyLovers', '#NaturePhotography', '#PortraitPhotography', '#LandscapePhotography', '#StreetPhotography'],
    trendingPhrases: ['light is everything', 'the best camera is the one you have', 'shoot more worry less', 'capture the moment', 'see the world differently', 'photography is art'],
    typicalEmojis: ['📷', '📸', '🌅', '🌄', '✨', '🎨', '🖼️', '🔭', '🌟'],
    toneGuidelines: 'Technical yet accessible. Share both artistic vision and practical tips. Balance gear talk with creativity and storytelling through images.'
  },
  {
    niche: 'diy',
    vocabulary: ['handmade', 'crafts', 'project', 'tutorial', 'step-by-step', 'materials', 'tools', 'creative', 'upcycle', 'repurpose', 'makeover', 'budget-friendly', 'easy', 'beginner', 'woodworking', 'sewing'],
    slangTerms: { 'hack': 'clever shortcut', 'upcycle': 'transform old items', 'thrift flip': 'makeover thrifted item', 'five-minute craft': 'quick project', 'Pinterest fail': 'DIY that didn\'t work', 'measure twice cut once': 'be careful and precise' },
    culturalReferences: ['Pinterest', 'HGTV', 'Home Depot', 'Lowes', 'Etsy', 'Joanna Gaines', 'Bob Vila', 'This Old House', 'Instructables', 'Maker Faire'],
    trendingTopics: ['furniture flips', 'thrift store makeovers', 'room transformations', 'budget renovations', 'sustainable DIY', 'power tool tutorials', 'craft room organization', 'resin art', 'macrame', 'epoxy tables'],
    trendingHashtags: ['#DIY', '#Handmade', '#DIYProjects', '#Crafts', '#DIYHome', '#HomeImprovement', '#Upcycle', '#DIYDecor', '#MakerMovement', '#DIYTutorial'],
    trendingPhrases: ['measure twice cut once', 'if I can do it you can too', 'budget-friendly makeover', 'satisfying transformation', 'before and after', 'total cost', 'supplies you need'],
    typicalEmojis: ['🔨', '🛠️', '🪛', '✂️', '🎨', '🖌️', '✨', '🏠', '💡', '👷'],
    toneGuidelines: 'Encouraging and practical. Make projects feel achievable while being honest about skill level. Share mistakes and learning moments alongside successes.'
  },
  {
    niche: 'lifestyle',
    vocabulary: ['wellness', 'self-care', 'mindfulness', 'balance', 'routine', 'habits', 'goals', 'productivity', 'organization', 'minimalism', 'intentional', 'gratitude', 'morning routine', 'evening routine', 'journaling'],
    slangTerms: { 'self-care Sunday': 'day for self-care', 'that girl': 'aspirational lifestyle aesthetic', 'romanticize your life': 'find joy in everyday', 'hot girl walk': 'mindful walking', 'morning pages': 'journaling practice', 'Sunday reset': 'weekly planning' },
    culturalReferences: ['Marie Kondo', 'Gretchen Rubin', 'Bullet Journal', 'The Happiness Project', 'Atomic Habits', 'Headspace', 'Calm', 'The Home Edit'],
    trendingTopics: ['morning routines', 'productive habits', 'mindful living', 'digital detox', 'slow living', 'intentional living', 'capsule wardrobe', 'minimalist lifestyle', 'habit stacking', 'goal setting'],
    trendingHashtags: ['#Lifestyle', '#SelfCare', '#Wellness', '#Mindfulness', '#ProductivityTips', '#LifestyleBlogger', '#HealthyHabits', '#BalancedLife', '#LifestyleGoals', '#IntentionalLiving'],
    trendingPhrases: ['romanticize your life', 'live intentionally', 'progress not perfection', 'small steps big changes', 'find your balance', 'create a life you love', 'be present'],
    typicalEmojis: ['✨', '🌿', '☕', '📖', '🕯️', '🧘', '💫', '🌸', '🌙', '☁️'],
    toneGuidelines: 'Aspirational yet grounded. Share authentic lifestyle moments without toxic positivity. Balance aesthetic content with real, relatable experiences and practical advice.'
  }
];

/**
 * Seed the database with niche context data
 */
async function seedNicheContexts() {
  console.log('🌱 Starting niche context seeding...\n');

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, {
      dbName: 'Veefore'
    });
    console.log('✅ Connected to MongoDB\n');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const nicheData of nicheContextsData) {
      try {
        // Check if niche already exists
        const existing = await NicheContextModel.findOne({ niche: nicheData.niche });

        if (existing) {
          console.log(`⏭️  Niche "${nicheData.niche}" already exists, skipping...`);
          skipped++;
        } else {
          // Convert slangTerms object to Map for MongoDB
          const slangTermsMap = new Map(Object.entries(nicheData.slangTerms));

          await NicheContextModel.create({
            ...nicheData,
            slangTerms: slangTermsMap,
            lastUpdated: new Date()
          });

          console.log(`✅ Created niche context: ${nicheData.niche}`);
          created++;
        }
      } catch (error) {
        console.error(`❌ Error processing niche "${nicheData.niche}":`, error);
      }
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${nicheContextsData.length}\n`);

    console.log('🎉 Niche context seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('👋 MongoDB connection closed');
  }
}

// Run the seed function
if (require.main === module) {
  seedNicheContexts()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { seedNicheContexts, nicheContextsData };
