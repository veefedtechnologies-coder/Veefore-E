/**
 * Seed script for initial viral pattern database
 * Populates database with 30+ proven viral patterns across different niches
 * 
 * Task: 3.3 Seed initial viral pattern database
 * Requirements: 2.1, 2.2
 */

import mongoose from 'mongoose';
import { ViralPatternModel } from '../models/AI/ViralPattern';
import { ViralHookModel } from '../models/AI/ViralHook';
import { Logger } from '../utils/logger';

// Connect to database
async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
  
  try {
    await mongoose.connect(MONGODB_URI);
    Logger.info('SeedViralPatterns', 'Connected to MongoDB');
  } catch (error) {
    Logger.error('SeedViralPatterns', 'Failed to connect to MongoDB:', error);
    throw error;
  }
}

// Viral Pattern Seed Data
const viralPatterns = [
  // HOOK PATTERNS
  {
    name: 'Hot Take Hook',
    category: 'hook' as const,
    pattern: '{controversial_statement} → {explanation} → {engagement_question}',
    description: 'Opens with controversial or unpopular opinion to grab attention',
    niches: ['fitness', 'food', 'business', 'tech', 'lifestyle'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 9.5,
    usageCount: 0,
    successRate: 85,
    exampleCaptions: [
      'Hot take: meal prep is overrated 🔥 Unless you actually enjoy eating the same lunch for 5 days straight, you\'re just forcing yourself into a routine that kills your relationship with food. What if I told you there\'s a better way?',
      'Unpopular opinion: rest days are more important than gym days 💪 Your muscles don\'t grow in the gym, they grow when you rest. Comment RECOVER if you needed to hear this.'
    ],
    trending: true,
  },
  {
    name: 'POV Hook',
    category: 'hook' as const,
    pattern: 'POV: {relatable_scenario} → {humorous_or_insightful_commentary}',
    description: 'Point of view format that creates immediate relatability',
    niches: ['lifestyle', 'fashion', 'food', 'travel', 'parenting'],
    postTypes: ['post', 'reel', 'story'] as const,
    avgEngagementRate: 8.7,
    usageCount: 0,
    successRate: 82,
    exampleCaptions: [
      'POV: you just discovered that coffee shop that makes you want to move your entire office there ☕️✨ The vibes, the playlist, the perfect lighting... yeah, I\'m not leaving.',
      'POV: your toddler just asked "why" for the 47th time today and you\'re questioning every life choice that led to this moment 😅 Parents, drop a 😭 if you felt that.'
    ],
    trending: true,
  },
  {
    name: 'Question Hook',
    category: 'hook' as const,
    pattern: '{thought_provoking_question} → {answer/insight} → {deeper_engagement}',
    description: 'Opens with question that stops the scroll and demands attention',
    niches: ['business', 'tech', 'fitness', 'beauty', 'photography'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.9,
    usageCount: 0,
    successRate: 78,
    exampleCaptions: [
      'Why do 90% of people quit their fitness journey in the first month? It\'s not lack of motivation. It\'s not even lack of time. It\'s this one thing nobody talks about...',
      'What\'s the one camera setting that completely changed your photography? For me, it wasn\'t shutter speed or ISO. It was understanding THIS. Swipe to see the difference 👉'
    ],
    trending: true,
  },
  {
    name: 'Interrupt Hook',
    category: 'hook' as const,
    pattern: '{stop_command} → {attention_grabbing_statement} → {value_delivery}',
    description: 'Commands immediate attention with interrupt pattern',
    niches: ['business', 'tech', 'fitness', 'beauty', 'lifestyle'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.3,
    usageCount: 0,
    successRate: 80,
    exampleCaptions: [
      'STOP scrolling if you\'re tired of looking tired 😴 This 3-minute morning routine transformed my under-eyes in 2 weeks. No expensive creams, no fancy tools, just science.',
      'Wait. Before you buy another productivity app, read this. I tested 47 tools and only 3 actually moved the needle. Here\'s what actually works 👇'
    ],
    trending: true,
  },
  {
    name: 'Scenario Hook',
    category: 'hook' as const,
    pattern: '{imagine/picture_this} → {vivid_scenario} → {connection_to_value}',
    description: 'Creates mental imagery to draw audience into story',
    niches: ['travel', 'food', 'lifestyle', 'fashion', 'art'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.5,
    usageCount: 0,
    successRate: 75,
    exampleCaptions: [
      'Imagine waking up to the sound of waves, coffee in hand, laptop open, deadline met by 10am. Then spending the rest of the day exploring hidden beaches. That\'s not a dream. That\'s my Tuesday. Here\'s how 👇',
      'Picture this: You walk into a room. Every head turns. Not because of what you\'re wearing, but how you\'re wearing it. That\'s the power of confidence styling. Let me show you...'
    ],
    trending: false,
  },

  // STRUCTURE PATTERNS
  {
    name: 'Hook-Value-Engagement',
    category: 'structure' as const,
    pattern: '{strong_hook} → {valuable_content} → {clear_cta}',
    description: 'Classic three-part structure for maximum engagement',
    niches: ['fitness', 'business', 'tech', 'beauty', 'photography'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.1,
    usageCount: 0,
    successRate: 83,
    exampleCaptions: [
      'You\'re wasting money on supplements you don\'t need 💊\n\nMost people take 10+ supplements and see zero results. Here\'s what actually works: protein, creatine, vitamin D. That\'s it. Everything else is marketing.\n\nDrop a 💯 if this just saved you $200/month.',
      'Your business doesn\'t need more features. It needs more focus 🎯\n\nI learned this the hard way after spending 6 months building features nobody used. Then I cut 80% of them, doubled down on the core problem, and revenue tripled.\n\nWhat would you cut from your product? Comment below 👇'
    ],
    trending: true,
  },
  {
    name: 'Problem-Solution-Benefit',
    category: 'structure' as const,
    pattern: '{relatable_problem} → {solution} → {transformation_benefit}',
    description: 'Addresses pain point, provides solution, shows results',
    niches: ['fitness', 'business', 'tech', 'beauty', 'parenting'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.8,
    usageCount: 0,
    successRate: 81,
    exampleCaptions: [
      'Tired of your photos looking flat and lifeless? 📸\n\nI used to struggle with this too until I learned the golden hour isn\'t actually golden. It\'s the 20 minutes after sunset that creates MAGIC.\n\nNow my photos get 3x more engagement. Try it tomorrow and tag me in your results!',
      'Spending hours on content that gets 10 likes? Same. Until I discovered the 80/20 rule of social media. 80% of your results come from 20% of your content types. Find your 20% and double down. My engagement jumped 400% in 30 days.'
    ],
    trending: true,
  },
  {
    name: 'List-Based Structure',
    category: 'structure' as const,
    pattern: '{hook} → {numbered_list_3-7_items} → {save_this_cta}',
    description: 'Scannable list format perfect for value-packed content',
    niches: ['business', 'tech', 'fitness', 'travel', 'food'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.9,
    usageCount: 0,
    successRate: 87,
    exampleCaptions: [
      '5 productivity hacks that actually changed my life (not the usual BS):\n\n1. No meetings before 2pm\n2. Phone on airplane mode until lunch\n3. One priority task before checking email\n4. 25-min work blocks, 5-min walks\n5. Weekly planning on Sunday night\n\nWhich one are you trying first? 👇',
      '7 travel destinations that are BETTER in off-season:\n\n1. Iceland (winter = northern lights)\n2. Italy (spring = fewer crowds)\n3. Japan (fall = stunning foliage)\n4. Greece (October = perfect weather)\n5. Peru (May-Sept = dry season)\n6. Scotland (autumn = dramatic landscapes)\n7. New Zealand (their winter = our summer)\n\nSave this for your 2025 planning! 📌'
    ],
    trending: true,
  },
  {
    name: 'Before-After Structure',
    category: 'structure' as const,
    pattern: '{before_state} → {what_changed} → {after_state} → {how_you_can_too}',
    description: 'Shows transformation journey with clear before and after',
    niches: ['fitness', 'business', 'beauty', 'DIY', 'photography'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 9.2,
    usageCount: 0,
    successRate: 88,
    exampleCaptions: [
      'Before: Working 80hr weeks, burned out, barely seeing my family 😓\n\nWhat changed: I started saying no. To meetings. To projects. To "opportunities."\n\nAfter: 40hr weeks, 2x revenue, present for dinner every night ✨\n\nThe secret? Focus isn\'t about doing more. It\'s about doing less, better. What are you saying no to this week?',
      'Before this photo: 2 years of shooting on auto mode, wondering why my pics looked meh\n\nThe shift: Learned manual mode in one weekend\n\nAfter: This shot 👆 First place in local photo contest\n\nIf you\'re stuck on auto, comment AUTO and I\'ll send you my free manual mode cheat sheet'
    ],
    trending: true,
  },
  {
    name: 'Myth-Busting Structure',
    category: 'structure' as const,
    pattern: '{common_myth} → {why_its_wrong} → {truth} → {what_to_do_instead}',
    description: 'Challenges conventional wisdom to establish authority',
    niches: ['fitness', 'business', 'tech', 'beauty', 'food'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.6,
    usageCount: 0,
    successRate: 84,
    exampleCaptions: [
      'Myth: You need to post every day to grow on Instagram 📱\n\nWhy it\'s wrong: I posted daily for 6 months. Grew 200 followers. Burned out completely.\n\nThe truth: Quality > quantity. Always. One viral post beats 30 mediocre ones.\n\nWhat worked: 3 posts/week. High value. Strategic timing. Grew 10K in 3 months. Which would you rather have? 👇',
      'Myth: Breakfast is the most important meal of the day 🍳\n\nWhy it\'s BS: This was literally coined by cereal companies in the 1960s as a marketing slogan.\n\nThe truth: Meal timing matters way less than total nutrition and what works for YOUR body.\n\nWhat to do: Eat when you\'re actually hungry. Revolutionary, I know. Do you eat breakfast? Curious! 👇'
    ],
    trending: true,
  },

  // STORYTELLING PATTERNS
  {
    name: 'Story-Insight-Question',
    category: 'storytelling' as const,
    pattern: '{personal_story} → {lesson_learned} → {engagement_question}',
    description: 'Personal narrative that builds connection and drives engagement',
    niches: ['lifestyle', 'business', 'parenting', 'travel', 'fitness'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 9.1,
    usageCount: 0,
    successRate: 89,
    exampleCaptions: [
      'I cried in my car for 20 minutes before walking into that gym 😢\n\n300lbs. 35 years old. Hadn\'t worked out in a decade. Everyone was fit, confident, knew what they were doing. I felt like an imposter.\n\nBut I walked in anyway. And then the next day. And the next.\n\n2 years later? Down 120lbs. But more importantly, I found a version of myself I didn\'t know existed.\n\nIf you\'re scared to start, this is your sign. The gym needs more people like you, not fewer. What\'s holding you back? 💪',
      'My business partner quit. Via text. 2 weeks before our biggest launch. 😳\n\nI had two choices: panic or pivot. I chose pivot.\n\nHired a freelancer. Rebuilt the timeline. Launched on time. Best month we ever had.\n\nThat "disaster" taught me more about resilience than any success ever could. Sometimes the worst moments become your biggest breakthroughs.\n\nWhat\'s your biggest business plot twist? Tell me in the comments 👇'
    ],
    trending: true,
  },
  {
    name: 'Failure-to-Success Arc',
    category: 'storytelling' as const,
    pattern: '{rock_bottom_moment} → {turning_point} → {breakthrough} → {current_state}',
    description: 'Classic hero\'s journey that inspires and motivates',
    niches: ['business', 'fitness', 'lifestyle', 'photography', 'art'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.8,
    usageCount: 0,
    successRate: 86,
    exampleCaptions: [
      '$47 in my bank account. Eviction notice on my door. Business failed. Again. 😔\n\nThat was 3 years ago.\n\nThe turning point? I stopped trying to copy everyone else\'s success formula. Started doing what felt authentic to ME.\n\nBuilt a business around my actual strengths, not what I thought I "should" do.\n\nToday? 6-figure business. Working from anywhere. Most importantly, doing work I actually love.\n\nYour breakthrough isn\'t about working harder. It\'s about working truer. What would you do if you ignored everyone else\'s advice?',
      'First time I shared my art online: 3 likes. Two were my mom. 🎨\n\nI almost quit that day. Thought I wasn\'t good enough. Everyone else seemed so much better.\n\nBut I kept posting. Not for likes. For ME. To document my growth.\n\n500 posts later? Commission waitlist 6 months long. Featured in galleries. Teaching workshops.\n\nThe secret? I didn\'t get better at art. I got better at showing up. Consistency beats perfection every single time.\n\nTag an artist who needs to hear this 👇'
    ],
    trending: true,
  },
  {
    name: 'Behind-the-Scenes Story',
    category: 'storytelling' as const,
    pattern: '{polished_result} → {messy_reality} → {real_process} → {authentic_takeaway}',
    description: 'Pulls back curtain to show authentic process vs perfect image',
    niches: ['photography', 'food', 'art', 'business', 'fashion'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.6,
    usageCount: 0,
    successRate: 79,
    exampleCaptions: [
      'This photo 👆 Looks effortless, right?\n\nThe reality: 2 hours of setup. 87 shots. 4 outfit changes. My dog photobombed 23 times. Knocked over my coffee. Twice.\n\nSocial media shows the highlight reel. But the magic happens in the messy middle.\n\nNext time you see a "perfect" shot, remember: behind every great photo is probably a very patient (or very caffeinated) photographer.\n\nWhat\'s your behind-the-scenes disaster story? Make me feel better about my chaos 😅',
      'That "simple" 30-second reel? Took 4 hours to film and 2 hours to edit 🎬\n\nHere\'s what you didn\'t see: \n- 47 takes (I kept forgetting my lines)\n- Neighbor\'s dog barking through shots 12-23\n- Changed location 3 times\n- Completely reshot because lighting changed\n\nPoint is: nothing is as easy as it looks. Everyone\'s faking the effortless part.\n\nWhat took you WAY longer than expected? Drop it below 👇'
    ],
    trending: false,
  },
  {
    name: 'Moment of Realization',
    category: 'storytelling' as const,
    pattern: '{everything_before} → {aha_moment} → {everything_after} → {share_with_others}',
    description: 'Captures transformative moment of clarity or insight',
    niches: ['business', 'lifestyle', 'fitness', 'parenting', 'tech'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.4,
    usageCount: 0,
    successRate: 83,
    exampleCaptions: [
      'I was explaining my business to someone at a party and I saw their eyes glaze over 😳\n\nThat moment? Changed everything.\n\nRealized: if I can\'t explain what I do in one sentence without using jargon, I don\'t actually understand it myself. Or worse, I\'m overthinking it.\n\nRewrote my entire pitch. Made it simple. Human. Clear.\n\nConversion rate tripled.\n\nIf your mom doesn\'t understand what you do, your customers probably don\'t either. What\'s your one-sentence pitch? Practice in the comments 👇',
      'My kid asked me "Mommy, why are you always on your phone?" 💔\n\nGut punch. But needed.\n\nI thought I was being productive. Building a business. Providing for my family. But I was missing THE moment while documenting the moments.\n\nMade a rule: phone stays in another room during family time. No exceptions.\n\nMy business didn\'t suffer. My relationship with my kids completely transformed.\n\nWhat boundary do you need to set with your phone? Be honest 👇'
    ],
    trending: true,
  },

  // ENGAGEMENT PATTERNS
  {
    name: 'Choose Your Side',
    category: 'engagement' as const,
    pattern: '{present_two_options} → {explain_both} → {ask_audience_to_pick}',
    description: 'Creates engagement through friendly debate or preference',
    niches: ['food', 'travel', 'fashion', 'lifestyle', 'photography'],
    postTypes: ['post', 'story', 'reel'] as const,
    avgEngagementRate: 9.3,
    usageCount: 0,
    successRate: 90,
    exampleCaptions: [
      'Team sunrise or team sunset? 🌅🌇\n\nSunrise crew:\n✓ Empty beaches\n✓ Fresh energy\n✓ Peaceful vibes\n✗ Waking up at 5am\n\nSunset squad:\n✓ Golden hour magic\n✓ Romantic atmosphere\n✓ Reasonable wake time\n✗ Crowds everywhere\n\nI\'m firmly team sunrise (yes, I\'m crazy). Drop a 🌅 for sunrise or 🌇 for sunset and defend your choice 👇',
      'Pineapple on pizza: genius or crime? 🍕🍍\n\nThe case FOR:\n- Sweet + savory = flavor explosion\n- Hawaiian pizza is a classic for a reason\n- Don\'t knock it til you try it\n\nThe case AGAINST:\n- Some lines shouldn\'t be crossed\n- Fruit has no business on pizza\n- Italy is crying\n\nI know this is controversial but I\'m saying YES. Come at me. What\'s your stance?'
    ],
    trending: true,
  },
  {
    name: 'Fill in the Blank',
    category: 'engagement' as const,
    pattern: '{setup_statement} → {fill_in_blank_prompt} → {share_yours}',
    description: 'Low-friction engagement through completion prompt',
    niches: ['lifestyle', 'business', 'fitness', 'travel', 'food'],
    postTypes: ['post', 'story', 'reel'] as const,
    avgEngagementRate: 8.7,
    usageCount: 0,
    successRate: 85,
    exampleCaptions: [
      'Finish this sentence: "I\'m successful when ___________" 💭\n\nNot when you hit a number. Not when you buy a thing. But when you FEEL it.\n\nFor me? "I\'m successful when I can take my kid to school without checking my phone."\n\nYour turn. Define success on YOUR terms. Fill in the blank below 👇',
      'My 2025 goal in 3 words: _____ _____ _____ 🎯\n\nMine: "Less but better"\n\nNo more saying yes to everything. No more hustle culture. Just focused, intentional, quality work.\n\nWhat are your 3 words? Make them count 👇'
    ],
    trending: true,
  },
  {
    name: 'Tag Someone Who',
    category: 'engagement' as const,
    pattern: '{relatable_characteristic} → {why_its_them} → {tag_prompt}',
    description: 'Drives shares by prompting audience to tag friends',
    niches: ['fitness', 'food', 'lifestyle', 'travel', 'business'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 10.2,
    usageCount: 0,
    successRate: 92,
    exampleCaptions: [
      'Tag someone who needs to hear this today 👇\n\nYou don\'t need permission to start. You don\'t need to be perfect. You don\'t need to have it all figured out.\n\nYou just need to START.\n\nThat business idea? Launch it messy. That fitness goal? Start today. That creative project? Share it scared.\n\nDone is better than perfect. Always.\n\nWho needs this reminder? Tag them and spread the energy ⚡️',
      'Tag your workout partner who keeps you accountable 💪\n\nYou know the one. Shows up on days you want to quit. Calls you out when you\'re making excuses. Celebrates your PRs like they\'re their own.\n\nGood training partners are hard to find. If you have one, show them some love below 👇'
    ],
    trending: true,
  },
  {
    name: 'This or That',
    category: 'engagement' as const,
    pattern: '{option_A} vs {option_B} → {explain_context} → {vote_now}',
    description: 'Quick binary choice that drives instant engagement',
    niches: ['food', 'travel', 'lifestyle', 'fashion', 'fitness'],
    postTypes: ['post', 'story', 'reel'] as const,
    avgEngagementRate: 9.0,
    usageCount: 0,
    successRate: 88,
    exampleCaptions: [
      'Coffee or tea? ☕️🍵\n\nThis is not a drill. This is THE question.\n\nI\'m ride or die coffee (specifically cold brew, extra shot, no sugar judge me).\n\nBut tea people? I respect your calm, collected energy. I just can\'t relate.\n\nDrop your drink of choice below and I\'ll judge you accordingly 😏',
      'Beach vacation or mountain retreat? 🏖️⛰️\n\nBeach squad:\n- Sun, sand, ocean therapy\n- Vitamin D overload\n- Seafood everything\n\nMountain crew:\n- Fresh air, hiking, peace\n- Cooler temps\n- Cozy cabin vibes\n\nI\'m Team Mountains all day (introvert energy). What about you? Defend your choice 👇'
    ],
    trending: true,
  },
  {
    name: 'Agree or Disagree',
    category: 'engagement' as const,
    pattern: '{bold_statement} → {reasoning} → {what_do_you_think}',
    description: 'Presents opinion to spark friendly debate in comments',
    niches: ['business', 'tech', 'fitness', 'lifestyle', 'food'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.5,
    usageCount: 0,
    successRate: 84,
    exampleCaptions: [
      'Agree or disagree: Side hustles are overrated 💼\n\nHear me out. Everyone\'s hustling 24/7, burning out, building businesses they don\'t even like just because "passive income" sounds sexy.\n\nMaybe... just maybe... it\'s okay to have a job you like and hobbies you enjoy without monetizing everything?\n\nNot every passion needs to be a profit center. Sometimes rest is the move.\n\nAm I crazy? Tell me in the comments 👇',
      'Agree or disagree: You should work out even when you don\'t feel like it 💪\n\nMy take: YES. Motivation is fleeting. Discipline is forever. The workouts you don\'t want to do are often the ones you need most.\n\nBUT (and this is important): rest days are sacred. There\'s a difference between "I don\'t feel like it" and "my body needs recovery."\n\nLearn the difference. What\'s your stance? 👇'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - FITNESS
  {
    name: 'Transformation Breakdown',
    category: 'structure' as const,
    pattern: '{stats} → {what_worked} → {what_didn\'t} → {key_takeaway}',
    description: 'Fitness transformation with actionable insights',
    niches: ['fitness'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 9.8,
    usageCount: 0,
    successRate: 91,
    exampleCaptions: [
      '6 months. 40lbs. Same gym. Different mindset 💪\n\nWhat worked:\n✓ Protein at every meal\n✓ 3x strength training/week\n✓ 10K steps daily\n✓ Sleep 7-8hrs (non-negotiable)\n\nWhat didn\'t:\n✗ Cardio for hours\n✗ Extreme calorie restriction\n✗ Skipping rest days\n✗ All-or-nothing thinking\n\nKey lesson: Consistency > perfection. Small daily actions compound into massive results.\n\nWhat\'s one small change you\'re making today? 👇'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - FOOD
  {
    name: 'Recipe Tease',
    category: 'structure' as const,
    pattern: '{mouth_watering_result} → {why_its_special} → {recipe_in_comments_or_swipe}',
    description: 'Shows delicious result to drive recipe engagement',
    niches: ['food'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.9,
    usageCount: 0,
    successRate: 87,
    exampleCaptions: [
      'This chocolate cake is so good it should be illegal 🍫🤤\n\nSeriously. It\'s:\n✓ Rich but not too sweet\n✓ Moist for DAYS\n✓ One bowl, no mixer\n✓ Ready in 45 min\n\nThe secret? Coffee in the batter. Trust me on this.\n\nDrop a 🍫 and I\'ll send you the full recipe. You need this in your life.',
      'That crispy edge. That gooey center. That chocolate chip to dough ratio 😍\n\nI\'ve been perfecting this cookie recipe for 2 years. 47 batches. So many taste testers (sorry not sorry neighbors).\n\nFinally cracked the code: browned butter + an extra egg yolk + overnight chill = PERFECTION.\n\nFull recipe is in my bio or comment COOKIE and I\'ll DM it to you 🍪'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - BUSINESS
  {
    name: 'Numbers Don\'t Lie',
    category: 'structure' as const,
    pattern: '{specific_metrics} → {what_changed} → {lesson_for_others}',
    description: 'Data-driven business insights with transparency',
    niches: ['business'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.4,
    usageCount: 0,
    successRate: 82,
    exampleCaptions: [
      'Month 1: $2,347 revenue\nMonth 6: $43,892 revenue\n\nSame product. Same market. Different strategy 📈\n\nWhat changed:\n- Stopped discounting (raised prices 40%)\n- Cut 6 products, focused on 2\n- Built email list (now 12K subscribers)\n- Asked for referrals (60% of new business)\n\nLesson: Growth isn\'t about doing more. It\'s about doing less, better.\n\nWhat would you focus on if you could only work on ONE thing? 👇'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - TRAVEL
  {
    name: 'Hidden Gem Reveal',
    category: 'structure' as const,
    pattern: '{obvious_location} → {but_skip_that} → {hidden_alternative} → {why_its_better}',
    description: 'Shares insider travel knowledge and alternatives',
    niches: ['travel'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.6,
    usageCount: 0,
    successRate: 84,
    exampleCaptions: [
      'Everyone goes to Santorini. Skip it. Go to Milos instead 🇬🇷\n\nHere\'s why:\n✓ Same stunning Greek islands vibe\n✓ 1/10th the tourists\n✓ Way more affordable\n✓ Better beaches (seriously)\n✓ More authentic local culture\n\nSantorini is beautiful but it\'s basically Instagram Disney World now. Milos is what Santorini used to be 10 years ago.\n\nTrust me on this. Save this for your Greece trip 📌\n\nWhat\'s your favorite underrated destination? Drop it below 👇'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - TECH
  {
    name: 'Tool Stack Breakdown',
    category: 'structure' as const,
    pattern: '{what_you_do} → {exact_tools_used} → {why_this_combo} → {results}',
    description: 'Shares specific tech stack with reasoning',
    niches: ['tech'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.8,
    usageCount: 0,
    successRate: 80,
    exampleCaptions: [
      'My entire productivity system runs on 3 tools (that\'s it) 🛠️\n\n1. Notion - brain dump, projects, docs\n2. Superhuman - email that doesn\'t make me cry\n3. Calendly - no more scheduling ping pong\n\nWhy this combo works:\n- Everything talks to each other\n- Minimal context switching\n- Actually gets used (simple > fancy)\n\nI tried 47 productivity apps. These 3 stuck. The rest was noise.\n\nWhat\'s your essential tool? Just one 👇'
    ],
    trending: false,
  },

  // NICHE-SPECIFIC PATTERNS - BEAUTY
  {
    name: 'Before Coffee vs After Coffee',
    category: 'structure' as const,
    pattern: '{morning_state} → {products_used} → {evening_state} → {what_made_difference}',
    description: 'Shows transformation with product recommendations',
    niches: ['beauty'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 9.1,
    usageCount: 0,
    successRate: 88,
    exampleCaptions: [
      'Me at 6am 😴 vs Me at 6pm ✨\n\nThe difference? This 5-minute face routine:\n\n1. Vitamin C serum (glow activator)\n2. Caffeine eye cream (bye bye puffiness)\n3. Moisturizer with SPF (non-negotiable)\n4. Tinted lip balm (looks put together, zero effort)\n\nThe MVP? That caffeine eye cream. Game changer for tired mom life.\n\nDrop a ☕️ if you need this routine in your life'
    ],
    trending: true,
  },

  // NICHE-SPECIFIC PATTERNS - PHOTOGRAPHY
  {
    name: 'Settings Breakdown',
    category: 'structure' as const,
    pattern: '{stunning_photo} → {exact_camera_settings} → {why_these_settings} → {try_this}',
    description: 'Educational content with actionable camera settings',
    niches: ['photography'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.4,
    usageCount: 0,
    successRate: 77,
    exampleCaptions: [
      'This shot 👆\n\nCamera settings:\n📷 f/2.8 (creamy background blur)\n⚡️ 1/500 (freeze motion)\n🎚 ISO 400 (low noise, good light)\n\nWhy these settings:\n- Wide aperture = subject pops\n- Fast shutter = no blur\n- Low-ish ISO = clean image\n\nShot at golden hour (20 min after sunset) for that warm glow.\n\nTry these settings tomorrow and tag me in your results! What do you usually shoot at? 👇'
    ],
    trending: false,
  },

  // ADDITIONAL DIVERSE PATTERNS
  {
    name: 'Confession Time',
    category: 'storytelling' as const,
    pattern: '{vulnerable_admission} → {why_you_hid_it} → {truth_reveal} → {normalize_it}',
    description: 'Builds trust through vulnerability and authenticity',
    niches: ['lifestyle', 'business', 'parenting', 'fitness', 'beauty'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 8.9,
    usageCount: 0,
    successRate: 87,
    exampleCaptions: [
      'Confession: I don\'t meal prep 🙈\n\nThere, I said it. Everyone in the fitness space swears by it and I just... can\'t. I tried for 3 months and hated every second.\n\nInstead? I keep it stupid simple:\n- Rotisserie chicken\n- Pre-washed greens\n- Minute rice\n- Frozen veggies\n\n5 minutes. Done. Same results.\n\nYou don\'t have to do what everyone else does. Find what actually works for YOUR life.\n\nWhat "essential" habit do you skip? Normalize it with me 👇',
      'Confession: half my content is created in my pajamas 😅\n\nThe behind-the-scenes is never as glamorous as the feed makes it look. Most days I\'m in sweats, messy bun, probably haven\'t brushed my teeth yet.\n\nBut the work gets done. The content goes out. The business runs.\n\nPerfection is overrated. Progress is everything.\n\nDrop a 👖 if you\'re also team pajama productivity'
    ],
    trending: true,
  },
  {
    name: 'Carousel Tip Series',
    category: 'structure' as const,
    pattern: '{compelling_first_slide} → {5-10_actionable_tips} → {save_this_cta}',
    description: 'Multi-slide educational content that drives saves',
    niches: ['business', 'tech', 'fitness', 'photography', 'DIY'],
    postTypes: ['post'] as const,
    avgEngagementRate: 10.5,
    usageCount: 0,
    successRate: 93,
    exampleCaptions: [
      '10 Instagram growth hacks nobody talks about (swipe for all) 👉\n\n1. Post when your audience is ACTIVE not when it\'s "optimal"\n2. Reply to every comment in the first hour\n3. Use 3-5 hashtags max (yes, really)\n4. Story replies > DMs for algorithm boost\n5. Carousel posts get 3x more saves\n\n(Swipe for 5 more that actually work)\n\nSave this and try one TODAY. Which tip surprised you most? 👇'
    ],
    trending: true,
  },
  {
    name: 'Day in the Life',
    category: 'storytelling' as const,
    pattern: '{morning} → {midday} → {evening} → {real_talk_takeaway}',
    description: 'Behind-the-scenes content showing real daily routine',
    niches: ['lifestyle', 'business', 'parenting', 'fitness', 'photography'],
    postTypes: ['post', 'reel'] as const,
    avgEngagementRate: 7.7,
    usageCount: 0,
    successRate: 79,
    exampleCaptions: [
      'A real day working from home (no filter) 🏡\n\n6am: Wake up, immediately step on Lego (parenthood)\n7am: Coffee #1, inbox zero attempt (failed)\n9am: Actual focused work (headphones = do not disturb)\n12pm: Lunch = leftover breakfast\n2pm: Meetings (why do these exist)\n4pm: Coffee #2, final push\n6pm: Close laptop, pretend I have work-life balance\n\nThe reality? Some days are productive. Some days are survival. Both are okay.\n\nWhat does your real day look like? No highlight reel 👇'
    ],
    trending: false,
  },
];

// Viral Hooks Seed Data
const viralHooks = [
  // FITNESS HOOKS
  { hookText: 'Hot take:', niche: 'fitness', avgEngagementBoost: 12.5, usageCount: 0 },
  { hookText: 'Unpopular opinion:', niche: 'fitness', avgEngagementBoost: 11.8, usageCount: 0 },
  { hookText: 'Real talk:', niche: 'fitness', avgEngagementBoost: 9.2, usageCount: 0 },
  { hookText: 'Stop doing this:', niche: 'fitness', avgEngagementBoost: 10.5, usageCount: 0 },
  { hookText: 'Nobody talks about this but', niche: 'fitness', avgEngagementBoost: 8.9, usageCount: 0 },

  // FOOD HOOKS
  { hookText: 'POV:', niche: 'food', avgEngagementBoost: 13.2, usageCount: 0 },
  { hookText: 'This is so good it should be illegal', niche: 'food', avgEngagementBoost: 11.4, usageCount: 0 },
  { hookText: 'If you know, you know', niche: 'food', avgEngagementBoost: 9.8, usageCount: 0 },
  { hookText: 'Controversial take:', niche: 'food', avgEngagementBoost: 10.2, usageCount: 0 },
  { hookText: 'Let me tell you about', niche: 'food', avgEngagementBoost: 8.1, usageCount: 0 },

  // TRAVEL HOOKS
  { hookText: 'Everyone goes to X. Skip it. Go here instead:', niche: 'travel', avgEngagementBoost: 14.1, usageCount: 0 },
  { hookText: 'Save this for your trip to', niche: 'travel', avgEngagementBoost: 12.7, usageCount: 0 },
  { hookText: 'Hidden gem alert:', niche: 'travel', avgEngagementBoost: 11.9, usageCount: 0 },
  { hookText: 'Tourists go here. Locals go here:', niche: 'travel', avgEngagementBoost: 13.5, usageCount: 0 },
  { hookText: 'This changed my entire trip:', niche: 'travel', avgEngagementBoost: 9.4, usageCount: 0 },

  // BUSINESS HOOKS
  { hookText: 'Here\'s what nobody tells you about', niche: 'business', avgEngagementBoost: 12.3, usageCount: 0 },
  { hookText: 'I spent $X so you don\'t have to:', niche: 'business', avgEngagementBoost: 13.8, usageCount: 0 },
  { hookText: 'This one change', niche: 'business', avgEngagementBoost: 10.6, usageCount: 0 },
  { hookText: 'Real numbers:', niche: 'business', avgEngagementBoost: 11.2, usageCount: 0 },
  { hookText: 'The mistake everyone makes:', niche: 'business', avgEngagementBoost: 9.7, usageCount: 0 },

  // TECH HOOKS
  { hookText: 'Stop using X. Use this instead:', niche: 'tech', avgEngagementBoost: 11.9, usageCount: 0 },
  { hookText: 'This tool changed everything:', niche: 'tech', avgEngagementBoost: 10.4, usageCount: 0 },
  { hookText: 'You\'re doing it wrong:', niche: 'tech', avgEngagementBoost: 12.1, usageCount: 0 },
  { hookText: 'I tested 47 tools. These 3 won:', niche: 'tech', avgEngagementBoost: 14.3, usageCount: 0 },
  { hookText: 'Before you buy another', niche: 'tech', avgEngagementBoost: 9.8, usageCount: 0 },

  // BEAUTY HOOKS
  { hookText: 'This $8 product works better than the $80 one:', niche: 'beauty', avgEngagementBoost: 15.2, usageCount: 0 },
  { hookText: 'Dupes that actually work:', niche: 'beauty', avgEngagementBoost: 13.4, usageCount: 0 },
  { hookText: 'Game changer alert:', niche: 'beauty', avgEngagementBoost: 11.7, usageCount: 0 },
  { hookText: 'This routine saved my skin:', niche: 'beauty', avgEngagementBoost: 10.9, usageCount: 0 },
  { hookText: 'PSA:', niche: 'beauty', avgEngagementBoost: 9.3, usageCount: 0 },

  // LIFESTYLE HOOKS
  { hookText: 'Let\'s normalize', niche: 'lifestyle', avgEngagementBoost: 12.8, usageCount: 0 },
  { hookText: 'Confession:', niche: 'lifestyle', avgEngagementBoost: 11.5, usageCount: 0 },
  { hookText: 'Can we talk about', niche: 'lifestyle', avgEngagementBoost: 10.1, usageCount: 0 },
  { hookText: 'Am I the only one who', niche: 'lifestyle', avgEngagementBoost: 13.9, usageCount: 0 },
  { hookText: 'This is your sign to', niche: 'lifestyle', avgEngagementBoost: 9.6, usageCount: 0 },

  // FASHION HOOKS
  { hookText: 'Outfit formula:', niche: 'fashion', avgEngagementBoost: 12.2, usageCount: 0 },
  { hookText: 'Style hack:', niche: 'fashion', avgEngagementBoost: 11.3, usageCount: 0 },
  { hookText: 'Repeat after me:', niche: 'fashion', avgEngagementBoost: 10.7, usageCount: 0 },
  { hookText: 'This piece > your entire closet:', niche: 'fashion', avgEngagementBoost: 9.9, usageCount: 0 },
  { hookText: 'How to look expensive on a budget:', niche: 'fashion', avgEngagementBoost: 14.6, usageCount: 0 },

  // PARENTING HOOKS
  { hookText: 'Parenting win:', niche: 'parenting', avgEngagementBoost: 11.8, usageCount: 0 },
  { hookText: 'No one prepared me for', niche: 'parenting', avgEngagementBoost: 13.2, usageCount: 0 },
  { hookText: 'Plot twist:', niche: 'parenting', avgEngagementBoost: 10.4, usageCount: 0 },
  { hookText: 'Tell me you\'re a parent without telling me', niche: 'parenting', avgEngagementBoost: 12.9, usageCount: 0 },
  { hookText: 'Today my kid:', niche: 'parenting', avgEngagementBoost: 9.8, usageCount: 0 },

  // PHOTOGRAPHY HOOKS
  { hookText: 'Camera settings for this shot:', niche: 'photography', avgEngagementBoost: 11.1, usageCount: 0 },
  { hookText: 'This changed my photography forever:', niche: 'photography', avgEngagementBoost: 12.4, usageCount: 0 },
  { hookText: 'Before I learned this vs after:', niche: 'photography', avgEngagementBoost: 13.7, usageCount: 0 },
  { hookText: 'The one setting nobody talks about:', niche: 'photography', avgEngagementBoost: 10.8, usageCount: 0 },
  { hookText: 'Same location. Different time. Completely different photo:', niche: 'photography', avgEngagementBoost: 14.2, usageCount: 0 },

  // ART HOOKS
  { hookText: 'Process video incoming:', niche: 'art', avgEngagementBoost: 10.6, usageCount: 0 },
  { hookText: 'Sketch vs final:', niche: 'art', avgEngagementBoost: 12.8, usageCount: 0 },
  { hookText: 'The detail work on this:', niche: 'art', avgEngagementBoost: 9.4, usageCount: 0 },
  { hookText: 'Hours of work in 30 seconds:', niche: 'art', avgEngagementBoost: 11.9, usageCount: 0 },
  { hookText: 'This took way longer than it looks:', niche: 'art', avgEngagementBoost: 10.2, usageCount: 0 },

  // DIY HOOKS
  { hookText: '$5 DIY that looks like $500:', niche: 'DIY', avgEngagementBoost: 15.8, usageCount: 0 },
  { hookText: 'This hack will save you so much money:', niche: 'DIY', avgEngagementBoost: 13.6, usageCount: 0 },
  { hookText: 'Before you hire someone, try this:', niche: 'DIY', avgEngagementBoost: 12.3, usageCount: 0 },
  { hookText: 'I can\'t believe this actually worked:', niche: 'DIY', avgEngagementBoost: 11.4, usageCount: 0 },
  { hookText: 'Total time: 20 minutes. Total cost:', niche: 'DIY', avgEngagementBoost: 10.7, usageCount: 0 },

  // MUSIC HOOKS
  { hookText: 'This sound >>>', niche: 'music', avgEngagementBoost: 9.8, usageCount: 0 },
  { hookText: 'When this part hits:', niche: 'music', avgEngagementBoost: 11.2, usageCount: 0 },
  { hookText: 'Behind the beat:', niche: 'music', avgEngagementBoost: 10.4, usageCount: 0 },
  { hookText: 'Producer breakdown:', niche: 'music', avgEngagementBoost: 9.1, usageCount: 0 },
  { hookText: 'If you don\'t have this on your playlist, are you even', niche: 'music', avgEngagementBoost: 12.7, usageCount: 0 },

  // GAMING HOOKS
  { hookText: 'This clutch moment:', niche: 'gaming', avgEngagementBoost: 13.4, usageCount: 0 },
  { hookText: 'When you finally beat', niche: 'gaming', avgEngagementBoost: 11.8, usageCount: 0 },
  { hookText: 'POV: you\'re', niche: 'gaming', avgEngagementBoost: 14.1, usageCount: 0 },
  { hookText: 'Build guide:', niche: 'gaming', avgEngagementBoost: 10.3, usageCount: 0 },
  { hookText: 'This strategy changed my entire game:', niche: 'gaming', avgEngagementBoost: 12.6, usageCount: 0 },

  // PETS HOOKS
  { hookText: 'My dog/cat:', niche: 'pets', avgEngagementBoost: 14.9, usageCount: 0 },
  { hookText: 'Tell me you have a dog without telling me', niche: 'pets', avgEngagementBoost: 13.7, usageCount: 0 },
  { hookText: 'POV: your pet', niche: 'pets', avgEngagementBoost: 15.2, usageCount: 0 },
  { hookText: 'This face when', niche: 'pets', avgEngagementBoost: 12.4, usageCount: 0 },
  { hookText: 'No thoughts. Just vibes:', niche: 'pets', avgEngagementBoost: 11.1, usageCount: 0 },
];

// Main seed function
async function seedDatabase() {
  try {
    Logger.info('SeedViralPatterns', 'Starting database seed...');

    // Clear existing data (optional - comment out if you want to preserve existing data)
    Logger.info('SeedViralPatterns', 'Clearing existing patterns and hooks...');
    await ViralPatternModel.deleteMany({});
    await ViralHookModel.deleteMany({});

    // Insert viral patterns
    Logger.info('SeedViralPatterns', `Inserting ${viralPatterns.length} viral patterns...`);
    const insertedPatterns = await ViralPatternModel.insertMany(viralPatterns);
    Logger.info('SeedViralPatterns', `✓ Inserted ${insertedPatterns.length} viral patterns`);

    // Insert viral hooks
    Logger.info('SeedViralPatterns', `Inserting ${viralHooks.length} viral hooks...`);
    const insertedHooks = await ViralHookModel.insertMany(viralHooks);
    Logger.info('SeedViralPatterns', `✓ Inserted ${insertedHooks.length} viral hooks`);

    // Summary by niche
    const patternsByNiche = viralPatterns.reduce((acc, pattern) => {
      pattern.niches.forEach(niche => {
        acc[niche] = (acc[niche] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const hooksByNiche = viralHooks.reduce((acc, hook) => {
      acc[hook.niche] = (acc[hook.niche] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Logger.info('SeedViralPatterns', '\n=== SEED SUMMARY ===');
    Logger.info('SeedViralPatterns', `Total Patterns: ${insertedPatterns.length}`);
    Logger.info('SeedViralPatterns', `Total Hooks: ${insertedHooks.length}`);
    Logger.info('SeedViralPatterns', '\nPatterns by Niche:');
    Object.entries(patternsByNiche).forEach(([niche, count]) => {
      Logger.info('SeedViralPatterns', `  ${niche}: ${count} patterns`);
    });
    Logger.info('SeedViralPatterns', '\nHooks by Niche:');
    Object.entries(hooksByNiche).forEach(([niche, count]) => {
      Logger.info('SeedViralPatterns', `  ${niche}: ${count} hooks`);
    });
    Logger.info('SeedViralPatterns', '\n===================\n');

    Logger.info('SeedViralPatterns', '✓ Database seed completed successfully!');
  } catch (error) {
    Logger.error('SeedViralPatterns', 'Error seeding database:', error);
    throw error;
  }
}

// Run seed script
async function main() {
  try {
    await connectToDatabase();
    await seedDatabase();
    Logger.info('SeedViralPatterns', 'Disconnecting from database...');
    await mongoose.disconnect();
    Logger.info('SeedViralPatterns', 'Done! ✨');
    process.exit(0);
  } catch (error) {
    Logger.error('SeedViralPatterns', 'Fatal error:', error);
    process.exit(1);
  }
}

// Execute main function
main();

export { seedDatabase, viralPatterns, viralHooks };
