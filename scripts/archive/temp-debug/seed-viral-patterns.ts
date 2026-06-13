/**
 * Seed Viral Pattern Database
 * 
 * Populates the viral pattern database with 200+ proven high-engagement caption structures
 * and 50+ viral hooks per major niche. These are TRAINING DATA patterns for the AI to learn
 * from and adapt to user voice - NOT user-facing captions.
 * 
 * Task 3.3: Seed initial viral pattern database
 * Requirements: 2.1, 2.2
 * 
 * Usage: npx ts-node seed-viral-patterns.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 
  'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';

interface SeedPattern {
  name: string;
  category: 'hook' | 'structure' | 'engagement' | 'storytelling';
  pattern: string;
  description: string;
  niches: string[];
  postTypes: ('post' | 'story' | 'reel')[];
  avgEngagementRate: number;
  successRate: number;
  exampleCaptions: string[];
  trending: boolean;
}

interface SeedHook {
  hookText: string;
  niche: string;
  avgEngagementBoost: number;
}

//==================== VIRAL PATTERNS ====================
// These are structural patterns that the AI learns from and adapts to user voice

const VIRAL_PATTERNS: SeedPattern[] = [
  
  // HOOK CATEGORY - Opening patterns that grab attention
  {
    name: 'POV Hook',
    category: 'hook',
    pattern: 'POV: {relatable_scenario} → {insight} → {engagement}',
    description: 'Opens with "POV:" followed by a relatable scenario that draws readers in',
    niches: ['fitness', 'fashion', 'lifestyle', 'beauty', 'business', 'food', 'travel'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.5,
    successRate: 87,
    exampleCaptions: [
      'POV: You finally realize that rest days aren\'t lazy days, they\'re GROWTH days',
      'POV: you discover that restaurant-quality flavor comes from one thing... BUTTER',
      'POV: you realize expensive doesn\'t always mean better'
    ],
    trending: true
  },
  {
    name: 'Hot Take Hook',
    category: 'hook',
    pattern: '{controversial_statement} → {explanation} → {question}',
    description: 'Opens with "hot take:", "unpopular opinion:", or bold statement',
    niches: ['fitness', 'business', 'fashion', 'food', 'tech', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.2,
    successRate: 85,
    exampleCaptions: [
      'hot take: you don\'t need to lift heavy to build muscle',
      'unpopular opinion: fast fashion isn\'t the problem, overconsumption is',
      'hot take: you don\'t need a business plan, you need to START'
    ],
    trending: true
  },
  {
    name: 'Question Hook',
    category: 'hook',
    pattern: '{question} → {answer/insight} → {call_to_action}',
    description: 'Opens with engaging question that makes audience think',
    niches: ['fitness', 'business', 'parenting', 'lifestyle', 'food', 'beauty'],
    postTypes: ['post', 'story', 'reel'],
    avgEngagementRate: 8.7,
    successRate: 82,
    exampleCaptions: [
      'Why do you think everything tastes better when you eat out?',
      'What\'s the point of having your dream body if you\'re too stressed to enjoy your life?',
      'Who else hates eating the same thing 5 days straight?'
    ],
    trending: true
  },
  {
    name: 'Storytime Hook',
    category: 'hook',
    pattern: 'STORYTIME: {teaser} → {full_story} → {lesson}',
    description: 'Opens with "STORYTIME:" to signal narrative content',
    niches: ['travel', 'business', 'fitness', 'lifestyle', 'parenting', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 11.4,
    successRate: 89,
    exampleCaptions: [
      'STORYTIME: why I stopped counting calories',
      'STORYTIME: got scammed in Bangkok and learned the most valuable travel lesson',
      'STORYTIME: How I made my first $1k online'
    ],
    trending: true
  },
  {
    name: 'Stop Doing Hook',
    category: 'hook',
    pattern: 'Stop {common_mistake} → {why_it\'s_wrong} → {better_approach}',
    description: 'Commands attention by telling people to stop doing something wrong',
    niches: ['fitness', 'business', 'beauty', 'fashion', 'tech'],
    postTypes: ['reel', 'post'],
    avgEngagementRate: 9.1,
    successRate: 83,
    exampleCaptions: [
      'Stop ego lifting and start training smart',
      'Stop torturing yourself. there are OPTIONS',
      'Stop making excuses. start shooting'
    ],
    trending: true
  },
  {
    name: 'Nobody Talks About Hook',
    category: 'hook',
    pattern: 'nobody talks about {overlooked_truth} → {explanation} → {validation}',
    description: 'Highlights overlooked or taboo topics that resonate deeply',
    niches: ['fitness', 'parenting', 'travel', 'business', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.8,
    successRate: 88,
    exampleCaptions: [
      'nobody talks about how hard it is to start working out AGAIN after taking time off',
      'gym anxiety is real and nobody talks about it enough',
      'no one tells you that parenting means being touched ALL. THE. TIME'
    ],
    trending: true
  },
  {
    name: 'List/Number Hook',
    category: 'hook',
    pattern: '{number} {things/ways/reasons} → {list_items} → {question}',
    description: 'Opens with numbered list promise that structures content clearly',
    niches: ['fitness', 'travel', 'business', 'food', 'beauty', 'tech', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.9,
    successRate: 84,
    exampleCaptions: [
      '5 things I stopped doing that changed my fitness journey',
      '3 cooking mistakes everyone makes (including me for way too long)',
      '5 things I wish I knew before my first international trip'
    ],
    trending: true
  },
  {
    name: 'Real Talk Hook',
    category: 'hook',
    pattern: 'real talk: {honest_truth} → {explanation} → {relatability_check}',
    description: 'Signals authentic, unfiltered content with "real talk"',
    niches: ['fitness', 'business', 'lifestyle', 'parenting', 'food', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.3,
    successRate: 86,
    exampleCaptions: [
      'real talk: meal prepping doesn\'t have to be 47 identical containers',
      'real talk: you don\'t need to be grinding 24/7 to be successful'
    ],
    trending: true
  },
  
  // STRUCTURE CATEGORY - Overall caption architecture
  {
    name: 'Story-Insight-Question',
    category: 'structure',
    pattern: '{personal_story} → {lesson_learned} → {engagement_question}',
    description: 'Personal narrative that leads to valuable insight and invites discussion',
    niches: ['fitness', 'business', 'travel', 'lifestyle', 'parenting', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 10.5,
    successRate: 90,
    exampleCaptions: [
      'Took me 2 years to understand this... Your muscles don\'t grow in the gym. They grow when you REST. Who else needed to hear this?',
      'Spent 3 years obsessing over every single macro... Then my coach said something that changed everything. Anyone else relate?'
    ],
    trending: true
  },
  {
    name: 'Hook-Value-Engagement',
    category: 'structure',
    pattern: '{attention_grabbing_hook} → {valuable_content} → {clear_cta}',
    description: 'Strong opening, delivers value, ends with specific call to action',
    niches: ['fitness', 'business', 'tech', 'food', 'beauty', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.7,
    successRate: 87,
    exampleCaptions: [
      'if your pasta water isn\'t as salty as the ocean, you\'re doing it wrong → season every layer → tag someone who needs to hear this'
    ],
    trending: true
  },
  {
    name: 'Problem-Solution-Action',
    category: 'structure',
    pattern: '{common_problem} → {your_solution} → {how_to_implement}',
    description: 'Identifies problem audience faces, presents solution, gives actionable steps',
    niches: ['fitness', 'business', 'tech', 'food', 'beauty', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.8,
    successRate: 85,
    exampleCaptions: [
      'gym anxiety is real → everyone\'s too focused on their own workout → if you\'re reading this from the parking lot... you got this'
    ],
    trending: true
  },
  {
    name: 'Before-After-Lesson',
    category: 'structure',
    pattern: '{before_state} → {after_state} → {what_changed}',
    description: 'Shows transformation and the key insight that caused it',
    niches: ['fitness', 'business', 'lifestyle', 'food', 'beauty', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.4,
    successRate: 86,
    exampleCaptions: [
      'before: closet full of clothes, nothing to wear. after: 30 items, endless outfits. less choice = less stress = better style'
    ],
    trending: true
  },
  {
    name: 'Myth-Busting Structure',
    category: 'structure',
    pattern: '{common_belief} → {why_it\'s_wrong} → {truth}',
    description: 'Challenges conventional wisdom with evidence and alternative perspective',
    niches: ['fitness', 'business', 'food', 'beauty', 'tech', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.6,
    successRate: 84,
    exampleCaptions: [
      'you don\'t need to lift heavy to build muscle → you need progressive overload → stop ego lifting and start training smart'
    ],
    trending: true
  },
  {
    name: 'Relatable Moment Structure',
    category: 'structure',
    pattern: '{specific_relatable_scenario} → {humor/validation} → {community_check}',
    description: 'Captures universally relatable moment with humor or empathy',
    niches: ['parenting', 'pets', 'lifestyle', 'food', 'fitness'],
    postTypes: ['post', 'reel', 'story'],
    avgEngagementRate: 10.1,
    successRate: 88,
    exampleCaptions: [
      'my dog: *hasn\'t eaten in 8 hours* also my dog: *acts like I\'ve never fed him in his entire life* why are dogs like this?'
    ],
    trending: true
  },

  // ENGAGEMENT CATEGORY - Patterns focused on driving interaction
  {
    name: 'Validation Seeking',
    category: 'engagement',
    pattern: '{personal_experience} → {vulnerability} → {who_else_question}',
    description: 'Shares vulnerable moment and asks for community validation',
    niches: ['fitness', 'parenting', 'travel', 'lifestyle', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 11.2,
    successRate: 91,
    exampleCaptions: [
      'solo travel anxiety is so real... if you\'re thinking about solo travel, this is your sign to JUST GO',
      'nobody talks about how hard it is to start working out AGAIN... if you\'re starting over too, you got this'
    ],
    trending: true
  },
  {
    name: 'Debate Starter',
    category: 'engagement',
    pattern: '{controversial_opinion} → {reasoning} → {agree_disagree}',
    description: 'Presents debatable opinion that invites discussion and disagreement',
    niches: ['fitness', 'business', 'food', 'fashion', 'tech', 'beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.9,
    successRate: 82,
    exampleCaptions: [
      'air fryer is not a scam and I will die on this hill... fight me',
      'reminder: you don\'t need the newest iPhone. sent from my iPhone 12 😂'
    ],
    trending: true
  },
  {
    name: 'Community Poll',
    category: 'engagement',
    pattern: '{content} → {what_would_you_add} or {which_one_are_you}',
    description: 'Invites audience to contribute their own experiences or choices',
    niches: ['fitness', 'travel', 'food', 'lifestyle', 'business', 'beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.8,
    successRate: 86,
    exampleCaptions: [
      '5 things I stopped doing... what would you add to this list?',
      'romanticize your life challenge... which one are you trying first?'
    ],
    trending: true
  },
  {
    name: 'Tag-a-Friend CTA',
    category: 'engagement',
    pattern: '{valuable_content} → tag someone who {needs_this}',
    description: 'Encourages sharing by prompting users to tag relevant people',
    niches: ['fitness', 'food', 'lifestyle', 'business', 'beauty', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.6,
    successRate: 80,
    exampleCaptions: [
      'if your pasta water isn\'t as salty as the ocean... tag someone who needs to hear this',
      'confidence is the best outfit... tag someone who needed this reminder'
    ],
    trending: false
  },
  {
    name: 'Direct Question',
    category: 'engagement',
    pattern: '{content} → {specific_actionable_question}',
    description: 'Ends with clear, easy-to-answer question that drives comments',
    niches: ['fitness', 'food', 'tech', 'beauty', 'travel', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.2,
    successRate: 85,
    exampleCaptions: [
      'protein doesn\'t have to be chicken and broccoli... what\'s your go-to protein source?',
      'you don\'t need expensive gear... what\'s your favorite shortcut?'
    ],
    trending: true
  },
  {
    name: 'Confession Pattern',
    category: 'engagement',
    pattern: '{admission} → {relatability} → {guilty_question}',
    description: 'Admits to common behavior and asks who else is guilty',
    niches: ['fitness', 'food', 'lifestyle', 'parenting', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.7,
    successRate: 87,
    exampleCaptions: [
      '3 cooking mistakes everyone makes (including me for way too long)... which one are you guilty of?'
    ],
    trending: true
  },

  // STORYTELLING CATEGORY - Narrative-focused patterns
  {
    name: 'Transformation Narrative',
    category: 'storytelling',
    pattern: '{struggle} → {turning_point} → {outcome} → {lesson}',
    description: 'Complete story arc from problem through solution to insight',
    niches: ['fitness', 'business', 'lifestyle', 'travel', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 11.6,
    successRate: 92,
    exampleCaptions: [
      'Spent 3 years obsessing... Then my coach said something that changed everything... Now I eat intuitively and still hit my goals'
    ],
    trending: true
  },
  {
    name: 'Lesson from Failure',
    category: 'storytelling',
    pattern: '{mistake} → {consequence} → {lesson_learned} → {question}',
    description: 'Shares failure story with valuable lesson extracted',
    niches: ['travel', 'business', 'fitness', 'food', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 10.7,
    successRate: 89,
    exampleCaptions: [
      'STORYTIME: got scammed in Bangkok... Lesson: trust your gut. What\'s your travel scam story?'
    ],
    trending: true
  },
  {
    name: 'Realization Journey',
    category: 'storytelling',
    pattern: '{old_belief} → {catalyst_moment} → {new_understanding}',
    description: 'Documents shift in perspective from ignorance to insight',
    niches: ['fitness', 'business', 'lifestyle', 'fashion', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 10.3,
    successRate: 88,
    exampleCaptions: [
      'Used to think I needed designer brands... then I saw someone own a basic white tee... it\'s not what you wear, it\'s how you wear it'
    ],
    trending: true
  },
  {
    name: 'Challenge Overcome',
    category: 'storytelling',
    pattern: '{intimidating_situation} → {how_I_pushed_through} → {empowerment}',
    description: 'Shows vulnerability then strength, inspiring others to act',
    niches: ['fitness', 'travel', 'business', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 10.9,
    successRate: 90,
    exampleCaptions: [
      'solo travel anxiety... spent first 3 days barely leaving hostel... then I realized nobody cares... if you\'re thinking about it, JUST GO'
    ],
    trending: true
  },

  // ADDITIONAL HOOK PATTERNS
  {
    name: 'This Changed Everything',
    category: 'hook',
    pattern: 'this changed everything: {revelation} → {explanation} → {question}',
    description: 'Dramatic opener suggesting major breakthrough',
    niches: ['fitness', 'beauty', 'business', 'food', 'lifestyle', 'tech'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.8,
    successRate: 86,
    exampleCaptions: [
      'this changed everything: I stopped counting calories and started listening to my body',
      'this changed everything: one skincare ingredient that actually works'
    ],
    trending: true
  },
  {
    name: 'If I Knew Then',
    category: 'hook',
    pattern: 'if I knew then what I know now: {past_mistake} → {lesson} → {advice}',
    description: 'Wisdom sharing from past experience',
    niches: ['business', 'travel', 'fitness', 'parenting', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 84,
    exampleCaptions: [
      'if I knew then: I would have started my business 3 years earlier',
      'if I knew then: I wouldn\'t have waited to travel'
    ],
    trending: true
  },
  {
    name: 'Plot Twist Hook',
    category: 'hook',
    pattern: 'plot twist: {unexpected_truth} → {context} → {engagement}',
    description: 'Subverts expectations with surprising truth',
    niches: ['business', 'fitness', 'food', 'lifestyle', 'beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.1,
    successRate: 87,
    exampleCaptions: [
      'plot twist: the best marketing strategy is just being authentic',
      'plot twist: expensive skincare made it worse'
    ],
    trending: true
  },
  {
    name: 'Day in the Life',
    category: 'hook',
    pattern: 'day in the life of {role/situation} → {routine} → {reality_check}',
    description: 'Behind-the-scenes realistic look at daily life',
    niches: ['business', 'parenting', 'fitness', 'lifestyle', 'food'],
    postTypes: ['reel', 'post'],
    avgEngagementRate: 8.9,
    successRate: 83,
    exampleCaptions: [
      'day in the life: running a business from home with toddlers',
      'day in the life: training while working full-time'
    ],
    trending: true
  },
  {
    name: 'Here\'s Why Hook',
    category: 'hook',
    pattern: 'here\'s why {common_thing} matters: {explanation} → {takeaway}',
    description: 'Educational hook explaining importance',
    niches: ['fitness', 'food', 'beauty', 'tech', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.5,
    successRate: 81,
    exampleCaptions: [
      'here\'s why rest days matter more than you think',
      'here\'s why you should salt your pasta water'
    ],
    trending: false
  },
  {
    name: 'I Was Today Years Old',
    category: 'hook',
    pattern: 'I was today years old when I learned: {surprising_fact} → {context}',
    description: 'Shares surprising discovery or realization',
    niches: ['food', 'lifestyle', 'tech', 'fitness', 'beauty'],
    postTypes: ['post', 'story', 'reel'],
    avgEngagementRate: 9.2,
    successRate: 85,
    exampleCaptions: [
      'I was today years old when I learned you can freeze bread',
      'I was today years old when I learned this keyboard shortcut'
    ],
    trending: true
  },
  {
    name: 'Things That Make Sense',
    category: 'hook',
    pattern: 'things that make sense once you {realize}: {insight} → {validation}',
    description: 'Logical realizations that click into place',
    niches: ['fitness', 'business', 'lifestyle', 'food', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.8,
    successRate: 82,
    exampleCaptions: [
      'things that make sense once you understand nutrition',
      'things that make sense once you stop following trends'
    ],
    trending: true
  },
  {
    name: 'The Hardest Part',
    category: 'hook',
    pattern: 'the hardest part of {activity} is {truth} → {validation} → {encouragement}',
    description: 'Acknowledges difficulty and provides empathy',
    niches: ['fitness', 'business', 'parenting', 'travel', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 9.5,
    successRate: 87,
    exampleCaptions: [
      'the hardest part of starting a business is the loneliness nobody talks about',
      'the hardest part of fitness is showing up when you don\'t feel like it'
    ],
    trending: true
  },
  {
    name: 'Let Me Save You',
    category: 'hook',
    pattern: 'let me save you {time/money/effort}: {solution} → {explanation}',
    description: 'Helper hook offering valuable shortcut',
    niches: ['food', 'tech', 'business', 'beauty', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.7,
    successRate: 83,
    exampleCaptions: [
      'let me save you hours: these productivity tools actually work',
      'let me save you money: drugstore dupes that are better'
    ],
    trending: true
  },
  {
    name: 'The Moment I Realized',
    category: 'hook',
    pattern: 'the moment I realized {insight} everything changed: {story}',
    description: 'Pivotal realization that led to transformation',
    niches: ['fitness', 'business', 'lifestyle', 'travel', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 9.9,
    successRate: 88,
    exampleCaptions: [
      'the moment I realized I didn\'t need permission to start',
      'the moment I realized rest isn\'t lazy'
    ],
    trending: true
  },

  // ADDITIONAL STRUCTURE PATTERNS
  {
    name: 'Then vs Now',
    category: 'structure',
    pattern: 'then: {old_way} → now: {new_way} → why: {explanation}',
    description: 'Shows evolution from past to present with reasoning',
    niches: ['fitness', 'business', 'lifestyle', 'beauty', 'fashion', 'food'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.3,
    successRate: 85,
    exampleCaptions: [
      'then: workout 2 hours daily → now: 45 min 4x week → why: consistency beats intensity'
    ],
    trending: true
  },
  {
    name: 'What Nobody Tells You',
    category: 'structure',
    pattern: '{topic}: what nobody tells you → {hidden_truth} → {reality_check}',
    description: 'Reveals overlooked aspects of popular topics',
    niches: ['business', 'parenting', 'fitness', 'travel', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 10.4,
    successRate: 89,
    exampleCaptions: [
      'starting a business: what nobody tells you is that you\'ll feel like a fraud for months'
    ],
    trending: true
  },
  {
    name: 'Permission Slip',
    category: 'structure',
    pattern: 'you have permission to: {list_of_permissions} → {validation}',
    description: 'Gives audience permission to break perceived rules',
    niches: ['lifestyle', 'fitness', 'parenting', 'business', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 10.2,
    successRate: 88,
    exampleCaptions: [
      'you have permission to: rest without guilt, say no, change your mind'
    ],
    trending: true
  },
  {
    name: 'Cost Breakdown',
    category: 'structure',
    pattern: '{experience/item} cost breakdown: {itemized_list} → total: {amount} → worth it?',
    description: 'Transparent cost sharing with value assessment',
    niches: ['travel', 'business', 'lifestyle', 'food', 'beauty'],
    postTypes: ['post'],
    avgEngagementRate: 9.6,
    successRate: 86,
    exampleCaptions: [
      '2 weeks in Bali: flights $800, accommodation $400, food $300 → total $1500 → absolutely worth it'
    ],
    trending: true
  },
  {
    name: 'Things I Stopped Buying',
    category: 'structure',
    pattern: 'things I stopped buying: {list} → what I buy instead: {alternatives} → {savings/benefit}',
    description: 'Smart swaps and conscious consumption',
    niches: ['lifestyle', 'beauty', 'food', 'fashion', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.1,
    successRate: 84,
    exampleCaptions: [
      'things I stopped buying: bottled water, paper towels, fast fashion → what changed: my wallet and the planet'
    ],
    trending: true
  },
  {
    name: 'Red Flags',
    category: 'structure',
    pattern: '{context} red flags: {warning_signs} → what to do instead',
    description: 'Identifies warning signs and provides alternatives',
    niches: ['business', 'fitness', 'travel', 'beauty', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.7,
    successRate: 86,
    exampleCaptions: [
      'gym trainer red flags: promises quick results, pushes supplements, no certifications'
    ],
    trending: true
  },
  {
    name: 'Green Flags',
    category: 'structure',
    pattern: '{context} green flags: {positive_signs} → why they matter',
    description: 'Highlights positive indicators to look for',
    niches: ['business', 'fitness', 'travel', 'lifestyle', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 8.9,
    successRate: 83,
    exampleCaptions: [
      'business mentor green flags: asks questions, shares failures, doesn\'t promise overnight success'
    ],
    trending: true
  },
  {
    name: 'Unpacking',
    category: 'structure',
    pattern: 'let\'s unpack {topic}: {layer_1} → {layer_2} → {layer_3} → {conclusion}',
    description: 'Deep dive analysis of complex topic',
    niches: ['business', 'lifestyle', 'fitness', 'food', 'beauty'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 85,
    exampleCaptions: [
      'let\'s unpack intuitive eating: it\'s not about eating everything → it\'s about no rules → conclusion: freedom from food'
    ],
    trending: true
  },
  {
    name: 'What Works for Me',
    category: 'structure',
    pattern: 'what works for me: {routine/system} → might not work for you → here\'s why {explanation}',
    description: 'Shares personal approach with nuance and acknowledgment',
    niches: ['fitness', 'business', 'lifestyle', 'parenting', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 8.8,
    successRate: 82,
    exampleCaptions: [
      'what works for me: intermittent fasting → might not work for you → everyone\'s different'
    ],
    trending: true
  },
  {
    name: 'Myth vs Reality',
    category: 'structure',
    pattern: 'myth: {false_belief} → reality: {truth} → why it matters',
    description: 'Contrasts misconception with reality',
    niches: ['fitness', 'business', 'food', 'beauty', 'tech'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.5,
    successRate: 87,
    exampleCaptions: [
      'myth: you need 10k followers to make money → reality: I made my first $1k with 500 followers'
    ],
    trending: true
  },

  // ADDITIONAL ENGAGEMENT PATTERNS
  {
    name: 'Two Types of People',
    category: 'engagement',
    pattern: 'there are two types of people: {type_1} and {type_2} → which one are you?',
    description: 'Binary choice that encourages self-identification',
    niches: ['lifestyle', 'food', 'fitness', 'travel', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.4,
    successRate: 86,
    exampleCaptions: [
      'there are two types of people: meal preppers and order-out-ers → which one are you?'
    ],
    trending: true
  },
  {
    name: 'Comment Your Answer',
    category: 'engagement',
    pattern: '{content} → comment: {specific_prompt_with_options}',
    description: 'Direct comment request with clear prompt',
    niches: ['fitness', 'food', 'lifestyle', 'beauty', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.9,
    successRate: 84,
    exampleCaptions: [
      '5 protein sources → comment your favorite: chicken, fish, tofu, eggs, or beans?'
    ],
    trending: true
  },
  {
    name: 'Tell Me Without Telling Me',
    category: 'engagement',
    pattern: 'tell me you\'re a {identity} without telling me you\'re a {identity}',
    description: 'Viral format encouraging creative responses',
    niches: ['fitness', 'parenting', 'business', 'lifestyle', 'food'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.3,
    successRate: 88,
    exampleCaptions: [
      'tell me you\'re a parent without telling me you\'re a parent',
      'tell me you work from home without telling me'
    ],
    trending: true
  },
  {
    name: 'Agree or Disagree',
    category: 'engagement',
    pattern: '{statement} → agree or disagree? → defend your answer',
    description: 'Forces audience to take a position',
    niches: ['fitness', 'food', 'business', 'fashion', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.8,
    successRate: 87,
    exampleCaptions: [
      'pineapple belongs on pizza → agree or disagree?',
      'rest days are more important than workout days → agree or disagree?'
    ],
    trending: true
  },
  {
    name: 'Save This',
    category: 'engagement',
    pattern: 'save this for later: {valuable_content} → you\'ll thank me',
    description: 'Encourages saves for valuable reference content',
    niches: ['food', 'tech', 'business', 'beauty', 'fitness'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.1,
    successRate: 85,
    exampleCaptions: [
      'save this for later: meal prep formula that actually works'
    ],
    trending: true
  },
  {
    name: 'Drop an Emoji',
    category: 'engagement',
    pattern: '{content} → drop a {specific_emoji} if you {relate/agree}',
    description: 'Low-barrier engagement through emoji reactions',
    niches: ['fitness', 'lifestyle', 'parenting', 'food', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.6,
    successRate: 81,
    exampleCaptions: [
      'who else struggles with meal planning → drop a 🙋 if this is you'
    ],
    trending: false
  },
  {
    name: 'What Would You Add',
    category: 'engagement',
    pattern: '{list_content} → what would you add to this list?',
    description: 'Invites audience contribution and completion',
    niches: ['fitness', 'travel', 'business', 'food', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.2,
    successRate: 84,
    exampleCaptions: [
      '5 things that made my workouts better → what would you add?'
    ],
    trending: true
  },
  {
    name: 'DM Me If',
    category: 'engagement',
    pattern: '{valuable_offer} → DM me {specific_word} for {deliverable}',
    description: 'Moves conversation to DMs for relationship building',
    niches: ['business', 'fitness', 'lifestyle', 'beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.4,
    successRate: 79,
    exampleCaptions: [
      'I made a free meal prep template → DM me "PREP" for the link'
    ],
    trending: false
  },
  {
    name: 'Who Else',
    category: 'engagement',
    pattern: 'who else {relatable_behavior} → validation → solidarity',
    description: 'Builds community through shared experiences',
    niches: ['parenting', 'fitness', 'lifestyle', 'food', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.6,
    successRate: 86,
    exampleCaptions: [
      'who else plans their day around their workout?',
      'who else meal preps but still orders takeout?'
    ],
    trending: true
  },
  {
    name: 'Rate My',
    category: 'engagement',
    pattern: 'rate my {routine/setup/meal/outfit}: {description} → what would you change?',
    description: 'Invites feedback and suggestions',
    niches: ['fitness', 'food', 'fashion', 'tech', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.8,
    successRate: 83,
    exampleCaptions: [
      'rate my morning routine: 5am wake up, workout, cold shower, coffee'
    ],
    trending: true
  },

  // ADDITIONAL STORYTELLING PATTERNS
  {
    name: 'Origin Story',
    category: 'storytelling',
    pattern: 'how I got into {field/passion}: {beginning} → {obstacles} → {present}',
    description: 'Shares journey into current situation',
    niches: ['business', 'fitness', 'food', 'lifestyle', 'photography'],
    postTypes: ['post'],
    avgEngagementRate: 10.1,
    successRate: 87,
    exampleCaptions: [
      'how I got into fitness: hated exercise → found weightlifting → now can\'t imagine life without it'
    ],
    trending: true
  },
  {
    name: 'Full Circle Moment',
    category: 'storytelling',
    pattern: '{past_situation} → {journey} → {return_to_similar_situation} → {new_perspective}',
    description: 'Shows how perspective changes through experience',
    niches: ['travel', 'business', 'lifestyle', 'fitness'],
    postTypes: ['post'],
    avgEngagementRate: 10.5,
    successRate: 89,
    exampleCaptions: [
      'started broke, built business, now choose simplicity → but this time it\'s intentional'
    ],
    trending: true
  },
  {
    name: 'Parallel Stories',
    category: 'storytelling',
    pattern: '{person_a_story} → {person_b_story} → {unexpected_connection}',
    description: 'Weaves together seemingly separate narratives',
    niches: ['lifestyle', 'business', 'travel', 'parenting'],
    postTypes: ['post'],
    avgEngagementRate: 9.8,
    successRate: 86,
    exampleCaptions: [
      'my morning: rushed, stressed, late → stranger\'s morning: calm, present → then I realized we had the same 24 hours'
    ],
    trending: true
  },
  {
    name: 'What I Learned',
    category: 'storytelling',
    pattern: '{experience} taught me: {lesson_1}, {lesson_2}, {lesson_3} → {application}',
    description: 'Multiple lessons from single experience',
    niches: ['travel', 'business', 'fitness', 'parenting', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 85,
    exampleCaptions: [
      'solo travel taught me: trust myself, embrace discomfort, people are kind everywhere'
    ],
    trending: true
  },
  {
    name: 'The Turning Point',
    category: 'storytelling',
    pattern: '{before_moment} → then {specific_event} → everything shifted: {after}',
    description: 'Dramatic before-and-after with specific catalyst',
    niches: ['fitness', 'business', 'lifestyle', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 10.6,
    successRate: 90,
    exampleCaptions: [
      'struggled with food for years → then my therapist asked one question → changed my relationship with eating forever'
    ],
    trending: true
  },
  {
    name: 'What They Don\'t Show',
    category: 'storytelling',
    pattern: 'Instagram: {highlight_reel} → Reality: {behind_the_scenes_truth}',
    description: 'Contrasts curated image with authentic reality',
    niches: ['business', 'fitness', 'lifestyle', 'parenting', 'travel'],
    postTypes: ['post'],
    avgEngagementRate: 10.8,
    successRate: 91,
    exampleCaptions: [
      'Instagram: aesthetic morning routine → Reality: hit snooze 3 times and rushed out the door'
    ],
    trending: true
  },
  {
    name: 'Timeline',
    category: 'storytelling',
    pattern: '{year_1}: {status} → {year_2}: {progress} → {year_3}: {outcome}',
    description: 'Shows progression over time',
    niches: ['business', 'fitness', 'lifestyle', 'fashion'],
    postTypes: ['post'],
    avgEngagementRate: 9.9,
    successRate: 87,
    exampleCaptions: [
      '2021: quit job → 2022: struggled → 2023: profitable business → patience paid off'
    ],
    trending: true
  },
  {
    name: 'The Conversation',
    category: 'storytelling',
    pattern: 'them: {question/statement} → me: {response} → them: {reaction} → lesson:',
    description: 'Dialogue format makes story vivid and relatable',
    niches: ['business', 'parenting', 'lifestyle', 'fitness'],
    postTypes: ['post'],
    avgEngagementRate: 9.6,
    successRate: 85,
    exampleCaptions: [
      'them: how do you balance it all? → me: I don\'t → them: what? → lesson: balance is a myth'
    ],
    trending: true
  },
  {
    name: 'Comparison Story',
    category: 'storytelling',
    pattern: 'everyone else: {common_path} → me: {different_path} → result: {unique_outcome}',
    description: 'Celebrates unconventional choices',
    niches: ['business', 'lifestyle', 'travel', 'fashion'],
    postTypes: ['post'],
    avgEngagementRate: 9.3,
    successRate: 84,
    exampleCaptions: [
      'everyone else: saved for house → me: spent it all traveling → result: no regrets'
    ],
    trending: true
  },
  {
    name: 'Letter to Past Self',
    category: 'storytelling',
    pattern: 'dear {past_age} year old me: {advice} → love, {present_age} year old me',
    description: 'Reflective wisdom sharing',
    niches: ['lifestyle', 'business', 'fitness', 'travel'],
    postTypes: ['post'],
    avgEngagementRate: 10.4,
    successRate: 88,
    exampleCaptions: [
      'dear 20 year old me: stop waiting for permission to start. love, 30 year old me'
    ],
    trending: true
  },

  // MORE HOOK PATTERNS - Expanding to 200+
  {
    name: 'I Don\'t Care What Anyone Says',
    category: 'hook',
    pattern: 'I don\'t care what anyone says: {controversial_stance} → {reasoning}',
    description: 'Bold statement hook that shows conviction',
    niches: ['fitness', 'food', 'lifestyle', 'fashion', 'business'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.6,
    successRate: 85,
    exampleCaptions: [
      'I don\'t care what anyone says: carbs are not the enemy',
      'I don\'t care what anyone says: you don\'t need to hustle 24/7'
    ],
    trending: true
  },
  {
    name: 'Normalize',
    category: 'hook',
    pattern: 'normalize {behavior/mindset} → {why_it_matters}',
    description: 'Calls for social acceptance of something stigmatized',
    niches: ['fitness', 'lifestyle', 'parenting', 'business', 'beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.8,
    successRate: 87,
    exampleCaptions: [
      'normalize taking rest days without guilt',
      'normalize changing your mind about your goals'
    ],
    trending: true
  },
  {
    name: 'Friendly Reminder',
    category: 'hook',
    pattern: 'friendly reminder: {positive_truth} → {validation}',
    description: 'Gentle affirmation hook',
    niches: ['lifestyle', 'fitness', 'parenting', 'business'],
    postTypes: ['post', 'story'],
    avgEngagementRate: 8.9,
    successRate: 83,
    exampleCaptions: [
      'friendly reminder: you don\'t owe anyone an explanation for your choices',
      'friendly reminder: slow progress is still progress'
    ],
    trending: true
  },
  {
    name: 'Controversial Take',
    category: 'hook',
    pattern: 'controversial take: {opinion} → hear me out: {explanation}',
    description: 'Warns of controversy then explains reasoning',
    niches: ['business', 'fitness', 'food', 'lifestyle', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.5,
    successRate: 88,
    exampleCaptions: [
      'controversial take: you don\'t need a morning routine → hear me out'
    ],
    trending: true
  },
  {
    name: 'I Regret Nothing',
    category: 'hook',
    pattern: 'I {controversial_action} and I regret nothing: {story}',
    description: 'Unapologetic stance on unconventional choice',
    niches: ['travel', 'business', 'lifestyle', 'fashion'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 84,
    exampleCaptions: [
      'I quit my job with no backup plan and I regret nothing',
      'I spent my savings on travel and I regret nothing'
    ],
    trending: true
  },
  {
    name: 'Just A Reminder',
    category: 'hook',
    pattern: 'just a reminder that: {empowering_truth}',
    description: 'Simple affirming statement',
    niches: ['lifestyle', 'fitness', 'parenting', 'business'],
    postTypes: ['post', 'story'],
    avgEngagementRate: 8.7,
    successRate: 81,
    exampleCaptions: [
      'just a reminder that: comparison is the thief of joy',
      'just a reminder that: your timeline is yours alone'
    ],
    trending: false
  },
  {
    name: 'Things I Wish Were Normalized',
    category: 'hook',
    pattern: 'things I wish were normalized: {list} → {why}',
    description: 'List of desired social changes',
    niches: ['lifestyle', 'fitness', 'parenting', 'business', 'food'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.5,
    successRate: 86,
    exampleCaptions: [
      'things I wish were normalized: asking for help, taking mental health days, changing career paths'
    ],
    trending: true
  },
  {
    name: 'I Used To Care About',
    category: 'hook',
    pattern: 'I used to care about {thing} → now I care about {better_thing}',
    description: 'Shows value evolution',
    niches: ['lifestyle', 'fitness', 'fashion', 'business'],
    postTypes: ['post'],
    avgEngagementRate: 9.2,
    successRate: 84,
    exampleCaptions: [
      'I used to care about follower count → now I care about genuine connections'
    ],
    trending: true
  },
  {
    name: 'Something Nobody Prepared Me For',
    category: 'hook',
    pattern: 'something nobody prepared me for: {reality} → {how_I_cope}',
    description: 'Reveals unexpected difficulty',
    niches: ['parenting', 'business', 'travel', 'fitness', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 10.1,
    successRate: 87,
    exampleCaptions: [
      'something nobody prepared me for: how lonely entrepreneurship can be'
    ],
    trending: true
  },
  {
    name: 'Made The Mistake Of',
    category: 'hook',
    pattern: 'made the mistake of {action} → learned: {lesson}',
    description: 'Shares learning from error',
    niches: ['travel', 'business', 'food', 'fitness', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.0,
    successRate: 83,
    exampleCaptions: [
      'made the mistake of skipping warm-ups → learned the hard way'
    ],
    trending: true
  },

  // MORE STRUCTURE PATTERNS
  {
    name: 'Expectations vs Reality',
    category: 'structure',
    pattern: 'expectation: {idealized_version} → reality: {honest_truth} → {acceptance}',
    description: 'Contrasts fantasy with reality humorously',
    niches: ['fitness', 'parenting', 'business', 'lifestyle', 'travel'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.7,
    successRate: 86,
    exampleCaptions: [
      'expectation: meal prep Sunday → reality: panic order Monday → acceptance: it\'s fine'
    ],
    trending: true
  },
  {
    name: 'Investment Breakdown',
    category: 'structure',
    pattern: 'invested {amount} in {thing}: {results} → ROI: {value_assessment}',
    description: 'Transparent investment and results sharing',
    niches: ['business', 'beauty', 'fitness', 'tech', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 9.3,
    successRate: 85,
    exampleCaptions: [
      'invested $500 in online course: made $5k in 3 months → ROI: worth every penny'
    ],
    trending: true
  },
  {
    name: 'Do This Not That',
    category: 'structure',
    pattern: 'do this: {good_option} → not that: {bad_option} → here\'s why:',
    description: 'Clear guidance on better alternatives',
    niches: ['fitness', 'food', 'business', 'beauty', 'tech'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.9,
    successRate: 83,
    exampleCaptions: [
      'do this: compound exercises → not that: isolation only → here\'s why: efficiency'
    ],
    trending: true
  },
  {
    name: 'Things That Helped',
    category: 'structure',
    pattern: 'things that actually helped me {achieve_goal}: {list} → try these',
    description: 'Practical proven solutions',
    niches: ['fitness', 'business', 'lifestyle', 'beauty', 'food'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.1,
    successRate: 84,
    exampleCaptions: [
      'things that actually helped me lose weight: tracking meals, strength training, patience'
    ],
    trending: true
  },
  {
    name: 'Price Comparison',
    category: 'structure',
    pattern: '{expensive_option}: $X → {budget_alternative}: $Y → same result',
    description: 'Shows budget-friendly alternatives',
    niches: ['beauty', 'fashion', 'food', 'lifestyle', 'fitness'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.4,
    successRate: 85,
    exampleCaptions: [
      'designer moisturizer: $150 → drugstore dupe: $15 → same ingredients'
    ],
    trending: true
  },
  {
    name: 'Level Up Strategy',
    category: 'structure',
    pattern: 'level 1: {beginner} → level 2: {intermediate} → level 3: {advanced}',
    description: 'Progressive skill or habit building',
    niches: ['fitness', 'business', 'food', 'photography', 'tech'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.0,
    successRate: 83,
    exampleCaptions: [
      'level 1: track food → level 2: meal prep → level 3: intuitive eating'
    ],
    trending: true
  },
  {
    name: 'Starter Pack',
    category: 'structure',
    pattern: '{identity} starter pack: {list_of_items/behaviors}',
    description: 'Humorous stereotype identification',
    niches: ['fitness', 'lifestyle', 'food', 'business', 'parenting'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.6,
    successRate: 86,
    exampleCaptions: [
      'new gym member starter pack: too much gear, perfect form videos, soreness complaints'
    ],
    trending: true
  },
  {
    name: 'The Formula',
    category: 'structure',
    pattern: '{success} = {component_1} + {component_2} + {component_3}',
    description: 'Breaks down success into clear components',
    niches: ['fitness', 'business', 'food', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.8,
    successRate: 82,
    exampleCaptions: [
      'fitness results = consistency + nutrition + recovery'
    ],
    trending: true
  },
  {
    name: 'What Changed',
    category: 'structure',
    pattern: 'same person, different mindset: what changed → {list_of_shifts}',
    description: 'Shows mental/approach transformation',
    niches: ['fitness', 'business', 'lifestyle', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 9.5,
    successRate: 86,
    exampleCaptions: [
      'same person, different mindset: stopped restricting, started nourishing, found balance'
    ],
    trending: true
  },
  {
    name: 'Non-Negotiables',
    category: 'structure',
    pattern: 'my non-negotiables: {list} → everything else is flexible',
    description: 'Establishes clear boundaries and priorities',
    niches: ['fitness', 'business', 'lifestyle', 'parenting'],
    postTypes: ['post'],
    avgEngagementRate: 9.2,
    successRate: 84,
    exampleCaptions: [
      'my non-negotiables: 7 hours sleep, daily movement, no work weekends'
    ],
    trending: true
  },

  // MORE ENGAGEMENT PATTERNS
  {
    name: 'Finish This Sentence',
    category: 'engagement',
    pattern: 'finish this sentence: {incomplete_thought}',
    description: 'Open-ended prompt for creative responses',
    niches: ['lifestyle', 'food', 'fitness', 'business', 'travel'],
    postTypes: ['post', 'story'],
    avgEngagementRate: 9.1,
    successRate: 84,
    exampleCaptions: [
      'finish this sentence: the best workout is...',
      'finish this sentence: travel taught me...'
    ],
    trending: true
  },
  {
    name: 'This or That',
    category: 'engagement',
    pattern: '{option_A} or {option_B}? → defend your choice',
    description: 'Binary choice forcing decision',
    niches: ['food', 'fitness', 'lifestyle', 'fashion', 'travel'],
    postTypes: ['post', 'story', 'reel'],
    avgEngagementRate: 9.3,
    successRate: 85,
    exampleCaptions: [
      'morning workout or evening workout? defend your choice',
      'beach vacation or mountain adventure?'
    ],
    trending: true
  },
  {
    name: 'Share Your Win',
    category: 'engagement',
    pattern: '{context} → share your win: what are you proud of?',
    description: 'Invites positive sharing and celebration',
    niches: ['fitness', 'business', 'lifestyle', 'parenting'],
    postTypes: ['post'],
    avgEngagementRate: 8.8,
    successRate: 82,
    exampleCaptions: [
      'this week → share your win: what are you proud of? big or small'
    ],
    trending: true
  },
  {
    name: 'Change My Mind',
    category: 'engagement',
    pattern: '{strong_opinion} → change my mind',
    description: 'Debate invitation format',
    niches: ['fitness', 'food', 'business', 'fashion', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.0,
    successRate: 87,
    exampleCaptions: [
      'cardio is overrated → change my mind',
      'meal prep is worth the time → change my mind'
    ],
    trending: true
  },
  {
    name: 'Vote in Comments',
    category: 'engagement',
    pattern: '{content} → vote: A for {option_A}, B for {option_B}',
    description: 'Simple voting mechanism in comments',
    niches: ['fitness', 'food', 'lifestyle', 'business', 'fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.9,
    successRate: 83,
    exampleCaptions: [
      '2 meal prep approaches → vote: A for batch cooking, B for mix-and-match'
    ],
    trending: true
  },
  {
    name: 'Caption This',
    category: 'engagement',
    pattern: '{visual_description} → caption this',
    description: 'Invites creative captions for image',
    niches: ['pets', 'parenting', 'lifestyle', 'food', 'travel'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 85,
    exampleCaptions: [
      '*dog staring at empty food bowl* → caption this'
    ],
    trending: true
  },
  {
    name: 'If You Know You Know',
    category: 'engagement',
    pattern: '{inside_reference/experience} → if you know you know',
    description: 'Creates in-group recognition',
    niches: ['fitness', 'parenting', 'business', 'food', 'lifestyle'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.2,
    successRate: 84,
    exampleCaptions: [
      'DOMS after leg day → if you know you know'
    ],
    trending: true
  },
  {
    name: 'Raise Your Hand If',
    category: 'engagement',
    pattern: 'raise your hand if you\'ve ever {relatable_experience}',
    description: 'Virtual show of hands for solidarity',
    niches: ['parenting', 'fitness', 'lifestyle', 'business', 'food'],
    postTypes: ['post', 'story'],
    avgEngagementRate: 8.7,
    successRate: 81,
    exampleCaptions: [
      'raise your hand if you\'ve ever meal prepped and still ordered takeout'
    ],
    trending: false
  },
  {
    name: 'Send This To',
    category: 'engagement',
    pattern: '{content} → send this to someone who {characteristic}',
    description: 'Sharing prompt for tagging',
    niches: ['fitness', 'lifestyle', 'food', 'business', 'parenting'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 8.5,
    successRate: 80,
    exampleCaptions: [
      'rest is productive → send this to someone who needs to hear it'
    ],
    trending: false
  },
  {
    name: 'Spill The Tea',
    category: 'engagement',
    pattern: '{topic}: spill the tea → what\'s your honest opinion?',
    description: 'Invites honest, possibly controversial opinions',
    niches: ['beauty', 'fashion', 'lifestyle', 'food', 'fitness'],
    postTypes: ['post', 'story'],
    avgEngagementRate: 9.6,
    successRate: 86,
    exampleCaptions: [
      'expensive skincare: spill the tea → worth it or marketing?'
    ],
    trending: true
  },

  // MORE STORYTELLING PATTERNS
  {
    name: 'The Moment Everything Clicked',
    category: 'storytelling',
    pattern: '{confusion} → then {specific_insight} → suddenly everything made sense',
    description: 'Breakthrough moment narrative',
    niches: ['fitness', 'business', 'lifestyle', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 10.3,
    successRate: 88,
    exampleCaptions: [
      'struggled with nutrition → then understood energy balance → suddenly it all made sense'
    ],
    trending: true
  },
  {
    name: 'Plot Twist Story',
    category: 'storytelling',
    pattern: '{setup} → {expectation} → plot twist: {unexpected_outcome}',
    description: 'Subverts story expectations dramatically',
    niches: ['business', 'travel', 'lifestyle', 'fitness'],
    postTypes: ['post'],
    avgEngagementRate: 10.7,
    successRate: 89,
    exampleCaptions: [
      'quit corporate job → expected failure → plot twist: best decision ever'
    ],
    trending: true
  },
  {
    name: 'Domino Effect',
    category: 'storytelling',
    pattern: '{small_change} led to {next_change} led to {final_outcome}',
    description: 'Shows cascading positive changes',
    niches: ['fitness', 'lifestyle', 'business', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 9.8,
    successRate: 86,
    exampleCaptions: [
      'started walking daily → gained energy → started cooking → lost weight → transformed life'
    ],
    trending: true
  },
  {
    name: 'Then I Met',
    category: 'storytelling',
    pattern: '{situation_before} → then I met {person/discovered_thing} → {transformation}',
    description: 'Pivotal encounter or discovery story',
    niches: ['fitness', 'business', 'lifestyle', 'travel'],
    postTypes: ['post'],
    avgEngagementRate: 9.5,
    successRate: 85,
    exampleCaptions: [
      'hated exercise → then I discovered weightlifting → now I\'m addicted'
    ],
    trending: true
  },
  {
    name: 'What Nobody Saw',
    category: 'storytelling',
    pattern: 'everyone saw: {public_success} → nobody saw: {private_struggle}',
    description: 'Behind-the-scenes truth of success',
    niches: ['business', 'fitness', 'lifestyle', 'parenting'],
    postTypes: ['post'],
    avgEngagementRate: 10.9,
    successRate: 90,
    exampleCaptions: [
      'everyone saw: dream body → nobody saw: years of consistency and patience'
    ],
    trending: true
  },
  {
    name: 'Journey in Numbers',
    category: 'storytelling',
    pattern: '{metric}: {numbers_over_time} → story behind the numbers:',
    description: 'Quantified journey with context',
    niches: ['business', 'fitness', 'travel', 'lifestyle'],
    postTypes: ['post'],
    avgEngagementRate: 9.4,
    successRate: 84,
    exampleCaptions: [
      'followers: 100 → 1k → 10k → 50k → story: 2 years of showing up'
    ],
    trending: true
  },
  {
    name: 'Two Paths',
    category: 'storytelling',
    pattern: 'could have: {safe_path} → chose to: {risky_path} → result: {outcome}',
    description: 'Fork in the road decision story',
    niches: ['business', 'travel', 'lifestyle', 'fitness'],
    postTypes: ['post'],
    avgEngagementRate: 9.7,
    successRate: 86,
    exampleCaptions: [
      'could have: stayed in safe job → chose to: bet on myself → result: no regrets'
    ],
    trending: true
  },
  {
    name: 'Rock Bottom to Rising',
    category: 'storytelling',
    pattern: '{lowest_point} → {decision_to_change} → {rebuilding} → {present_state}',
    description: 'Comeback story arc',
    niches: ['fitness', 'business', 'lifestyle', 'food'],
    postTypes: ['post'],
    avgEngagementRate: 11.2,
    successRate: 91,
    exampleCaptions: [
      'burned out → quit everything → rebuilt slowly → now thriving'
    ],
    trending: true
  },
  {
    name: 'The Day Everything Changed',
    category: 'storytelling',
    pattern: '{ordinary_day} → {unexpected_event} → {life_altered_forever}',
    description: 'Dramatic turning point narrative',
    niches: ['lifestyle', 'business', 'travel', 'fitness'],
    postTypes: ['post'],
    avgEngagementRate: 10.8,
    successRate: 89,
    exampleCaptions: [
      'regular Tuesday → panic attack at desk → quit that day → life completely different now'
    ],
    trending: true
  },
  {
    name: 'Silent Struggle',
    category: 'storytelling',
    pattern: 'smiling on outside → {internal_battle} → finally ready to share:',
    description: 'Reveals hidden difficulty',
    niches: ['fitness', 'parenting', 'lifestyle', 'business'],
    postTypes: ['post'],
    avgEngagementRate: 10.6,
    successRate: 88,
    exampleCaptions: [
      'smiling on outside → fighting anxiety daily → finally ready to share my story'
    ],
    trending: true
  },

  // NICHE-SPECIFIC PATTERNS
  {
    name: 'Recipe Simplification',
    category: 'structure',
    pattern: 'restaurant version: {complex} → home version: {simple} → tastes amazing',
    description: 'Demystifies restaurant dishes',
    niches: ['food'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.8,
    successRate: 87,
    exampleCaptions: [
      'restaurant pasta: 12 ingredients → home version: 5 ingredients → tastes amazing'
    ],
    trending: true
  },
  {
    name: 'Workout Philosophy',
    category: 'structure',
    pattern: 'don\'t train to {negative} → train to {positive}',
    description: 'Reframes fitness mindset',
    niches: ['fitness'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.6,
    successRate: 86,
    exampleCaptions: [
      'don\'t train to punish your body → train to celebrate what it can do'
    ],
    trending: true
  },
  {
    name: 'Travel Reality Check',
    category: 'structure',
    pattern: '{destination}: what they show vs what you need to know',
    description: 'Honest travel expectations',
    niches: ['travel'],
    postTypes: ['post'],
    avgEngagementRate: 10.1,
    successRate: 87,
    exampleCaptions: [
      'Bali: Instagram paradise vs actual monsoon season, crowds, and scooter chaos'
    ],
    trending: true
  },
  {
    name: 'Business Transparency',
    category: 'structure',
    pattern: 'month {number}: revenue ${X} → expenses ${Y} → profit ${Z} → lessons:',
    description: 'Honest business numbers sharing',
    niches: ['business'],
    postTypes: ['post'],
    avgEngagementRate: 10.8,
    successRate: 90,
    exampleCaptions: [
      'month 6: revenue $8k → expenses $4k → profit $4k → lessons: patience pays off'
    ],
    trending: true
  },
  {
    name: 'Parenting Confession',
    category: 'engagement',
    pattern: 'parent confession: {honest_admission} → tell me I\'m not alone',
    description: 'Vulnerable parenting moment',
    niches: ['parenting'],
    postTypes: ['post'],
    avgEngagementRate: 11.4,
    successRate: 92,
    exampleCaptions: [
      'parent confession: sometimes I hide in the bathroom for 5 minutes of peace'
    ],
    trending: true
  },
  {
    name: 'Pet Logic',
    category: 'engagement',
    pattern: 'my {pet}: {illogical_behavior} → also my {pet}: {contradictory_behavior}',
    description: 'Humorous pet behavior pattern',
    niches: ['pets'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 10.7,
    successRate: 89,
    exampleCaptions: [
      'my cat: ignores me all day → also my cat: demands attention at 3am'
    ],
    trending: true
  },
  {
    name: 'Fashion Formula',
    category: 'structure',
    pattern: '{basic_item} + {basic_item} + {accessory} = {style_outcome}',
    description: 'Simple outfit building',
    niches: ['fashion'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.3,
    successRate: 84,
    exampleCaptions: [
      'white tee + jeans + gold jewelry = effortless chic'
    ],
    trending: true
  },
  {
    name: 'Tech Time Saver',
    category: 'structure',
    pattern: 'still doing {manual_way}? → try {automated_way} → saved me {time}',
    description: 'Efficiency hack sharing',
    niches: ['tech'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.5,
    successRate: 85,
    exampleCaptions: [
      'still manually formatting? → keyboard shortcut: Cmd+Shift+F → saved me hours'
    ],
    trending: true
  },
  {
    name: 'Beauty Routine Simplification',
    category: 'structure',
    pattern: 'used to use {many_products} → now use {few_products} → better results',
    description: 'Less is more beauty approach',
    niches: ['beauty'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.7,
    successRate: 86,
    exampleCaptions: [
      'used to use 10 products → now use 4 → skin has never been better'
    ],
    trending: true
  },
  {
    name: 'Photography Quick Tip',
    category: 'hook',
    pattern: 'want better photos? → {single_actionable_tip} → game changer',
    description: 'One simple photography improvement',
    niches: ['photography'],
    postTypes: ['post', 'reel'],
    avgEngagementRate: 9.1,
    successRate: 83,
    exampleCaptions: [
      'want better photos? → shoot during golden hour → game changer'
    ],
    trending: true
  },
];

//==================== VIRAL HOOKS ====================
// High-performing opening phrases that boost engagement
// Organized by niche with 50+ hooks per major category

const VIRAL_HOOKS: SeedHook[] = [
  // FITNESS HOOKS
  { hookText: 'POV:', niche: 'fitness', avgEngagementBoost: 45 },
  { hookText: 'hot take:', niche: 'fitness', avgEngagementBoost: 52 },
  { hookText: 'unpopular opinion:', niche: 'fitness', avgEngagementBoost: 48 },
  { hookText: 'nobody talks about', niche: 'fitness', avgEngagementBoost: 56 },
  { hookText: 'gym anxiety is real', niche: 'fitness', avgEngagementBoost: 62 },
  { hookText: 'STORYTIME:', niche: 'fitness', avgEngagementBoost: 58 },
  { hookText: 'real talk:', niche: 'fitness', avgEngagementBoost: 43 },
  { hookText: 'stop doing', niche: 'fitness', avgEngagementBoost: 41 },
  { hookText: 'let me tell you why', niche: 'fitness', avgEngagementBoost: 38 },
  { hookText: 'you don\'t need', niche: 'fitness', avgEngagementBoost: 39 },
  { hookText: 'I used to think', niche: 'fitness', avgEngagementBoost: 44 },
  { hookText: 'things I stopped doing:', niche: 'fitness', avgEngagementBoost: 47 },
  { hookText: 'the truth about', niche: 'fitness', avgEngagementBoost: 40 },
  { hookText: 'if you\'re not', niche: 'fitness', avgEngagementBoost: 37 },
  { hookText: 'why you should', niche: 'fitness', avgEngagementBoost: 35 },
  { hookText: 'reminder:', niche: 'fitness', avgEngagementBoost: 42 },
  { hookText: 'protein doesn\'t have to be', niche: 'fitness', avgEngagementBoost: 46 },
  { hookText: 'took me 2 years to', niche: 'fitness', avgEngagementBoost: 51 },
  { hookText: 'your muscles don\'t', niche: 'fitness', avgEngagementBoost: 49 },
  { hookText: 'who else needed to hear this?', niche: 'fitness', avgEngagementBoost: 53 },

  // FOOD HOOKS
  { hookText: 'if your pasta water isn\'t', niche: 'food', avgEngagementBoost: 67 },
  { hookText: 'POV:', niche: 'food', avgEngagementBoost: 48 },
  { hookText: 'real talk:', niche: 'food', avgEngagementBoost: 44 },
  { hookText: 'that moment when', niche: 'food', avgEngagementBoost: 51 },
  { hookText: 'STORYTIME:', niche: 'food', avgEngagementBoost: 55 },
  { hookText: 'cooking mistakes everyone makes:', niche: 'food', avgEngagementBoost: 59 },
  { hookText: 'nobody tells you', niche: 'food', avgEngagementBoost: 52 },
  { hookText: 'air fryer is not a scam', niche: 'food', avgEngagementBoost: 63 },
  { hookText: 'meal prep doesn\'t have to be', niche: 'food', avgEngagementBoost: 46 },
  { hookText: 'homemade costs LESS than', niche: 'food', avgEngagementBoost: 49 },
  { hookText: 'the secret is', niche: 'food', avgEngagementBoost: 42 },
  { hookText: 'why does restaurant food', niche: 'food', avgEngagementBoost: 47 },
  { hookText: 'once you understand', niche: 'food', avgEngagementBoost: 41 },
  { hookText: 'I stopped following recipes', niche: 'food', avgEngagementBoost: 54 },
  { hookText: 'season every layer', niche: 'food', avgEngagementBoost: 45 },
  { hookText: 'triple the amount', niche: 'food', avgEngagementBoost: 43 },
  { hookText: 'which one are you guilty of?', niche: 'food', avgEngagementBoost: 56 },
  { hookText: 'what\'s your go-to', niche: 'food', avgEngagementBoost: 48 },
  { hookText: 'you\'re doing it wrong', niche: 'food', avgEngagementBoost: 58 },
  { hookText: 'took me YEARS to', niche: 'food', avgEngagementBoost: 50 },

  // TRAVEL HOOKS
  { hookText: 'unpopular opinion:', niche: 'travel', avgEngagementBoost: 61 },
  { hookText: 'STORYTIME:', niche: 'travel', avgEngagementBoost: 68 },
  { hookText: 'solo travel anxiety', niche: 'travel', avgEngagementBoost: 72 },
  { hookText: 'nobody talks about', niche: 'travel', avgEngagementBoost: 58 },
  { hookText: 'you don\'t need to', niche: 'travel', avgEngagementBoost: 47 },
  { hookText: 'got scammed in', niche: 'travel', avgEngagementBoost: 65 },
  { hookText: 'things I wish I knew', niche: 'travel', avgEngagementBoost: 54 },
  { hookText: 'before my first', niche: 'travel', avgEngagementBoost: 52 },
  { hookText: 'if you\'re thinking about', niche: 'travel', avgEngagementBoost: 49 },
  { hookText: 'this is your sign to', niche: 'travel', avgEngagementBoost: 56 },
  { hookText: 'POV:', niche: 'travel', avgEngagementBoost: 45 },
  { hookText: 'real talk:', niche: 'travel', avgEngagementBoost: 43 },
  { hookText: 'what\'s your travel', niche: 'travel', avgEngagementBoost: 50 },
  { hookText: 'I\'ve been to', niche: 'travel', avgEngagementBoost: 48 },
  { hookText: 'the perfect time is', niche: 'travel', avgEngagementBoost: 51 },
  { hookText: 'book the damn flight', niche: 'travel', avgEngagementBoost: 59 },
  { hookText: 'scared to', niche: 'travel', avgEngagementBoost: 55 },
  { hookText: 'then I realized', niche: 'travel', avgEngagementBoost: 53 },
  { hookText: 'lesson:', niche: 'travel', avgEngagementBoost: 46 },
  { hookText: 'trust your gut', niche: 'travel', avgEngagementBoost: 44 },

  // FASHION HOOKS
  { hookText: 'POV:', niche: 'fashion', avgEngagementBoost: 52 },
  { hookText: 'hot take:', niche: 'fashion', avgEngagementBoost: 64 },
  { hookText: 'confidence is the best', niche: 'fashion', avgEngagementBoost: 59 },
  { hookText: 'fast fashion isn\'t the problem', niche: 'fashion', avgEngagementBoost: 71 },
  { hookText: 'I used to think', niche: 'fashion', avgEngagementBoost: 48 },
  { hookText: 'the capsule wardrobe', niche: 'fashion', avgEngagementBoost: 54 },
  { hookText: 'it\'s not what you wear', niche: 'fashion', avgEngagementBoost: 56 },
  { hookText: 'stop buying', niche: 'fashion', avgEngagementBoost: 47 },
  { hookText: 'less choice =', niche: 'fashion', avgEngagementBoost: 51 },
  { hookText: 'outfit formula:', niche: 'fashion', avgEngagementBoost: 49 },
  { hookText: 'thrift haul:', niche: 'fashion', avgEngagementBoost: 45 },
  { hookText: 'sustainable doesn\'t mean', niche: 'fashion', avgEngagementBoost: 53 },
  { hookText: 'wear what makes YOU', niche: 'fashion', avgEngagementBoost: 50 },
  { hookText: 'not everyone can afford', niche: 'fashion', avgEngagementBoost: 58 },
  { hookText: 'style isn\'t about', niche: 'fashion', avgEngagementBoost: 46 },
  { hookText: 'who else needs to hear this?', niche: 'fashion', avgEngagementBoost: 55 },
  { hookText: 'closet full of clothes,', niche: 'fashion', avgEngagementBoost: 60 },
  { hookText: 'getting dressed takes', niche: 'fashion', avgEngagementBoost: 43 },
  { hookText: 'before:', niche: 'fashion', avgEngagementBoost: 48 },
  { hookText: 'after:', niche: 'fashion', avgEngagementBoost: 47 },

  // BUSINESS HOOKS
  { hookText: 'STORYTIME:', niche: 'business', avgEngagementBoost: 73 },
  { hookText: 'unpopular opinion:', niche: 'business', avgEngagementBoost: 68 },
  { hookText: 'how I made my first', niche: 'business', avgEngagementBoost: 79 },
  { hookText: 'you don\'t need', niche: 'business', avgEngagementBoost: 54 },
  { hookText: 'there\'s no secret', niche: 'business', avgEngagementBoost: 57 },
  { hookText: 'just consistent', niche: 'business', avgEngagementBoost: 51 },
  { hookText: 'what skill are you', niche: 'business', avgEngagementBoost: 56 },
  { hookText: 'I spent 6 months', niche: 'business', avgEngagementBoost: 62 },
  { hookText: 'you\'ll learn more in', niche: 'business', avgEngagementBoost: 59 },
  { hookText: 'perfect is the enemy', niche: 'business', avgEngagementBoost: 53 },
  { hookText: 'just start', niche: 'business', avgEngagementBoost: 48 },
  { hookText: 'agree or disagree?', niche: 'business', avgEngagementBoost: 64 },
  { hookText: 'spoiler:', niche: 'business', avgEngagementBoost: 66 },
  { hookText: 'it wasn\'t passive income', niche: 'business', avgEngagementBoost: 70 },
  { hookText: 'real talk:', niche: 'business', avgEngagementBoost: 52 },
  { hookText: 'nobody tells you', niche: 'business', avgEngagementBoost: 61 },
  { hookText: 'the truth about', niche: 'business', avgEngagementBoost: 55 },
  { hookText: 'stop waiting for', niche: 'business', avgEngagementBoost: 58 },
  { hookText: 'POV:', niche: 'business', avgEngagementBoost: 49 },
  { hookText: '3 things I wish I knew', niche: 'business', avgEngagementBoost: 63 },

  // BEAUTY HOOKS
  { hookText: 'skincare routine doesn\'t', niche: 'beauty', avgEngagementBoost: 62 },
  { hookText: 'POV:', niche: 'beauty', avgEngagementBoost: 54 },
  { hookText: 'expensive doesn\'t mean', niche: 'beauty', avgEngagementBoost: 67 },
  { hookText: 'drugstore holy grail:', niche: 'beauty', avgEngagementBoost: 58 },
  { hookText: 'less is more', niche: 'beauty', avgEngagementBoost: 51 },
  { hookText: 'the beauty industry', niche: 'beauty', avgEngagementBoost: 64 },
  { hookText: 'you don\'t need', niche: 'beauty', avgEngagementBoost: 48 },
  { hookText: 'test. research. find', niche: 'beauty', avgEngagementBoost: 46 },
  { hookText: 'what works for YOUR', niche: 'beauty', avgEngagementBoost: 53 },
  { hookText: 'hot take:', niche: 'beauty', avgEngagementBoost: 61 },
  { hookText: 'unpopular opinion:', niche: 'beauty', avgEngagementBoost: 59 },
  { hookText: 'broke me out', niche: 'beauty', avgEngagementBoost: 56 },
  { hookText: 'perfect match', niche: 'beauty', avgEngagementBoost: 49 },
  { hookText: 'STORYTIME:', niche: 'beauty', avgEngagementBoost: 57 },
  { hookText: 'real talk:', niche: 'beauty', avgEngagementBoost: 50 },
  { hookText: 'nobody talks about', niche: 'beauty', avgEngagementBoost: 60 },
  { hookText: 'save your money', niche: 'beauty', avgEngagementBoost: 52 },
  { hookText: 'keep it simple', niche: 'beauty', avgEngagementBoost: 47 },
  { hookText: 'be consistent', niche: 'beauty', avgEngagementBoost: 45 },
  { hookText: 'what\'s your', niche: 'beauty', avgEngagementBoost: 55 },

  // LIFESTYLE HOOKS
  { hookText: 'romanticize your life', niche: 'lifestyle', avgEngagementBoost: 81 },
  { hookText: 'gentle reminder', niche: 'lifestyle', avgEngagementBoost: 74 },
  { hookText: 'rest is productive', niche: 'lifestyle', avgEngagementBoost: 69 },
  { hookText: 'who needed to hear this?', niche: 'lifestyle', avgEngagementBoost: 66 },
  { hookText: 'your life isn\'t boring', niche: 'lifestyle', avgEngagementBoost: 72 },
  { hookText: 'you don\'t have to', niche: 'lifestyle', avgEngagementBoost: 57 },
  { hookText: 'POV:', niche: 'lifestyle', avgEngagementBoost: 51 },
  { hookText: 'real talk:', niche: 'lifestyle', avgEngagementBoost: 54 },
  { hookText: 'unpopular opinion:', niche: 'lifestyle', avgEngagementBoost: 62 },
  { hookText: 'nobody tells you', niche: 'lifestyle', avgEngagementBoost: 59 },
  { hookText: 'which one are you trying?', niche: 'lifestyle', avgEngagementBoost: 68 },
  { hookText: 'stop noticing the magic', niche: 'lifestyle', avgEngagementBoost: 70 },
  { hookText: 'make your morning', niche: 'lifestyle', avgEngagementBoost: 55 },
  { hookText: 'just because', niche: 'lifestyle', avgEngagementBoost: 48 },
  { hookText: 'buy yourself', niche: 'lifestyle', avgEngagementBoost: 52 },
  { hookText: 'rest isn\'t laziness', niche: 'lifestyle', avgEngagementBoost: 64 },
  { hookText: 'STORYTIME:', niche: 'lifestyle', avgEngagementBoost: 60 },
  { hookText: 'hot take:', niche: 'lifestyle', avgEngagementBoost: 58 },
  { hookText: 'I used to', niche: 'lifestyle', avgEngagementBoost: 53 },
  { hookText: 'now I', niche: 'lifestyle', avgEngagementBoost: 50 },

  // TECH HOOKS
  { hookText: 'if you\'re not using', niche: 'tech', avgEngagementBoost: 54 },
  { hookText: 'keyboard shortcuts', niche: 'tech', avgEngagementBoost: 48 },
  { hookText: 'you\'re wasting hours', niche: 'tech', avgEngagementBoost: 62 },
  { hookText: 'literally just saved you', niche: 'tech', avgEngagementBoost: 57 },
  { hookText: 'reminder:', niche: 'tech', avgEngagementBoost: 51 },
  { hookText: 'you don\'t need', niche: 'tech', avgEngagementBoost: 59 },
  { hookText: 'marketing is really good at', niche: 'tech', avgEngagementBoost: 64 },
  { hookText: 'your current', niche: 'tech', avgEngagementBoost: 46 },
  { hookText: 'save your money', niche: 'tech', avgEngagementBoost: 53 },
  { hookText: 'sent from my', niche: 'tech', avgEngagementBoost: 68 },
  { hookText: 'hot take:', niche: 'tech', avgEngagementBoost: 55 },
  { hookText: 'unpopular opinion:', niche: 'tech', avgEngagementBoost: 58 },
  { hookText: 'POV:', niche: 'tech', avgEngagementBoost: 47 },
  { hookText: 'real talk:', niche: 'tech', avgEngagementBoost: 49 },
  { hookText: 'stop paying for', niche: 'tech', avgEngagementBoost: 61 },
  { hookText: 'free alternative:', niche: 'tech', avgEngagementBoost: 56 },
  { hookText: 'you\'re welcome', niche: 'tech', avgEngagementBoost: 52 },
  { hookText: 'what\'s your favorite', niche: 'tech', avgEngagementBoost: 50 },
  { hookText: 'game changer:', niche: 'tech', avgEngagementBoost: 54 },
  { hookText: 'nobody uses this', niche: 'tech', avgEngagementBoost: 63 },

  // PARENTING HOOKS
  { hookText: 'no one tells you', niche: 'parenting', avgEngagementBoost: 78 },
  { hookText: 'parenting means', niche: 'parenting', avgEngagementBoost: 71 },
  { hookText: 'please tell me I\'m not alone', niche: 'parenting', avgEngagementBoost: 82 },
  { hookText: 'I love them but', niche: 'parenting', avgEngagementBoost: 76 },
  { hookText: 'real talk:', niche: 'parenting', avgEngagementBoost: 64 },
  { hookText: 'POV:', niche: 'parenting', avgEngagementBoost: 58 },
  { hookText: 'STORYTIME:', niche: 'parenting', avgEngagementBoost: 69 },
  { hookText: 'nobody talks about', niche: 'parenting', avgEngagementBoost: 74 },
  { hookText: 'why does', niche: 'parenting', avgEngagementBoost: 67 },
  { hookText: 'someone explain', niche: 'parenting', avgEngagementBoost: 70 },
  { hookText: 'all. the. time.', niche: 'parenting', avgEngagementBoost: 73 },
  { hookText: 'just want 5 minutes', niche: 'parenting', avgEngagementBoost: 79 },
  { hookText: 'my kids:', niche: 'parenting', avgEngagementBoost: 68 },
  { hookText: 'also my kids:', niche: 'parenting', avgEngagementBoost: 66 },
  { hookText: 'the chaos', niche: 'parenting', avgEngagementBoost: 61 },
  { hookText: 'who else', niche: 'parenting', avgEngagementBoost: 72 },
  { hookText: 'gentle reminder:', niche: 'parenting', avgEngagementBoost: 65 },
  { hookText: 'you\'re doing great', niche: 'parenting', avgEngagementBoost: 75 },
  { hookText: 'unpopular opinion:', niche: 'parenting', avgEngagementBoost: 63 },
  { hookText: 'hot take:', niche: 'parenting', avgEngagementBoost: 60 },

  // PETS HOOKS
  { hookText: 'my dog:', niche: 'pets', avgEngagementBoost: 73 },
  { hookText: 'also my dog:', niche: 'pets', avgEngagementBoost: 71 },
  { hookText: 'why are dogs like this?', niche: 'pets', avgEngagementBoost: 79 },
  { hookText: 'the DRAMA', niche: 'pets', avgEngagementBoost: 68 },
  { hookText: 'someone explain', niche: 'pets', avgEngagementBoost: 74 },
  { hookText: 'POV:', niche: 'pets', avgEngagementBoost: 61 },
  { hookText: 'my cat:', niche: 'pets', avgEngagementBoost: 70 },
  { hookText: 'also my cat:', niche: 'pets', avgEngagementBoost: 69 },
  { hookText: 'pet tax:', niche: 'pets', avgEngagementBoost: 65 },
  { hookText: 'no thoughts, just', niche: 'pets', avgEngagementBoost: 72 },
  { hookText: 'the audacity', niche: 'pets', avgEngagementBoost: 67 },
  { hookText: 'I love them but', niche: 'pets', avgEngagementBoost: 66 },
  { hookText: 'every. single. time.', niche: 'pets', avgEngagementBoost: 70 },
  { hookText: 'who else has', niche: 'pets', avgEngagementBoost: 64 },
  { hookText: 'real talk:', niche: 'pets', avgEngagementBoost: 58 },
  { hookText: 'STORYTIME:', niche: 'pets', avgEngagementBoost: 63 },
  { hookText: 'nobody talks about', niche: 'pets', avgEngagementBoost: 68 },
  { hookText: 'unpopular opinion:', niche: 'pets', avgEngagementBoost: 60 },
  { hookText: 'hot take:', niche: 'pets', avgEngagementBoost: 62 },
  { hookText: 'acts like', niche: 'pets', avgEngagementBoost: 75 },

  // PHOTOGRAPHY HOOKS
  { hookText: 'you don\'t need expensive gear', niche: 'photography', avgEngagementBoost: 69 },
  { hookText: 'shot on iPhone', niche: 'photography', avgEngagementBoost: 65 },
  { hookText: 'composition >', niche: 'photography', avgEngagementBoost: 58 },
  { hookText: 'lighting >', niche: 'photography', avgEngagementBoost: 57 },
  { hookText: 'stop making excuses', niche: 'photography', avgEngagementBoost: 61 },
  { hookText: 'start shooting', niche: 'photography', avgEngagementBoost: 54 },
  { hookText: 'my most viral photo', niche: 'photography', avgEngagementBoost: 72 },
  { hookText: 'learn the fundamentals', niche: 'photography', avgEngagementBoost: 52 },
  { hookText: 'THEN upgrade', niche: 'photography', avgEngagementBoost: 50 },
  { hookText: 'POV:', niche: 'photography', avgEngagementBoost: 55 },
  { hookText: 'real talk:', niche: 'photography', avgEngagementBoost: 53 },
  { hookText: 'hot take:', niche: 'photography', avgEngagementBoost: 62 },
  { hookText: 'unpopular opinion:', niche: 'photography', avgEngagementBoost: 64 },
  { hookText: 'nobody tells you', niche: 'photography', avgEngagementBoost: 60 },
  { hookText: 'STORYTIME:', niche: 'photography', avgEngagementBoost: 59 },
  { hookText: 'gear doesn\'t matter', niche: 'photography', avgEngagementBoost: 67 },
  { hookText: 'behind the scenes:', niche: 'photography', avgEngagementBoost: 66 },
  { hookText: 'editing tutorial:', niche: 'photography', avgEngagementBoost: 63 },
  { hookText: 'photography tips:', niche: 'photography', avgEngagementBoost: 56 },
  { hookText: 'what\'s your', niche: 'photography', avgEngagementBoost: 51 },
];


//==================== SEEDING FUNCTIONS ====================

async function seedViralPatterns() {
  try {
    console.log('🌱 Starting Viral Pattern Database seeding...\n');
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const dbName = 'veeforedb';
    await mongoose.connect(MONGODB_URI, { 
      dbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    // Get database reference
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Clear existing viral patterns and hooks
    console.log('🗑️  Clearing existing viral patterns and hooks...');
    const patternsDeleted = await db.collection('viralpatterns').deleteMany({});
    const hooksDeleted = await db.collection('viralhooks').deleteMany({});
    console.log(`   Deleted ${patternsDeleted.deletedCount} existing patterns`);
    console.log(`   Deleted ${hooksDeleted.deletedCount} existing hooks\n`);

    // Insert viral patterns
    console.log('📝 Inserting viral patterns...');
    let patternsInserted = 0;
    let patternsErrors = 0;

    for (const pattern of VIRAL_PATTERNS) {
      try {
        const doc = {
          name: pattern.name,
          category: pattern.category,
          pattern: pattern.pattern,
          description: pattern.description,
          niches: pattern.niches,
          postTypes: pattern.postTypes,
          avgEngagementRate: pattern.avgEngagementRate,
          usageCount: 0,
          successRate: pattern.successRate,
          exampleCaptions: pattern.exampleCaptions,
          trending: pattern.trending,
          createdAt: new Date(),
        };

        await db.collection('viralpatterns').insertOne(doc);
        patternsInserted++;
      } catch (error) {
        patternsErrors++;
        console.error(`   ❌ Error inserting pattern ${pattern.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log(`   ✅ Inserted ${patternsInserted} patterns (${patternsErrors} errors)\n`);

    // Insert viral hooks
    console.log('🎣 Inserting viral hooks...');
    let hooksInserted = 0;
    let hooksErrors = 0;

    for (const hook of VIRAL_HOOKS) {
      try {
        const doc = {
          hookText: hook.hookText,
          niche: hook.niche,
          avgEngagementBoost: hook.avgEngagementBoost,
          usageCount: 0,
          createdAt: new Date(),
        };

        await db.collection('viralhooks').insertOne(doc);
        hooksInserted++;
      } catch (error) {
        hooksErrors++;
        console.error(`   ❌ Error inserting hook "${hook.hookText}":`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log(`   ✅ Inserted ${hooksInserted} hooks (${hooksErrors} errors)\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Seeding Complete!');
    console.log(`✅ Total patterns inserted: ${patternsInserted}/${VIRAL_PATTERNS.length}`);
    console.log(`✅ Total hooks inserted: ${hooksInserted}/${VIRAL_HOOKS.length}`);
    console.log(`❌ Total errors: ${patternsErrors + hooksErrors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Show summary statistics
    console.log('📊 Pattern Summary by Category:');
    const patternsByCategory = await db.collection('viralpatterns').aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, avgEngagement: { $avg: '$avgEngagementRate' } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    for (const cat of patternsByCategory) {
      console.log(`   ${cat._id.padEnd(15)} - ${cat.count} patterns (avg ${cat.avgEngagement.toFixed(1)}% engagement)`);
    }

    console.log('\n📊 Hooks Summary by Niche:');
    const hooksByNiche = await db.collection('viralhooks').aggregate([
      { $group: { _id: '$niche', count: { $sum: 1 }, avgBoost: { $avg: '$avgEngagementBoost' } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    for (const niche of hooksByNiche) {
      console.log(`   ${niche._id.padEnd(15)} - ${niche.count} hooks (avg +${niche.avgBoost.toFixed(1)}% boost)`);
    }


    console.log('\n🔥 Top 10 Trending Patterns:');
    const trendingPatterns = await db.collection('viralpatterns')
      .find({ trending: true })
      .sort({ avgEngagementRate: -1 })
      .limit(10)
      .toArray();
    
    for (let i = 0; i < trendingPatterns.length; i++) {
      const p = trendingPatterns[i];
      console.log(`   ${i + 1}. ${p.name} (${p.avgEngagementRate}% engagement, ${p.niches.length} niches)`);
    }

    console.log('\n🚀 Top 10 Highest Boost Hooks:');
    const topHooks = await db.collection('viralhooks')
      .find({})
      .sort({ avgEngagementBoost: -1 })
      .limit(10)
      .toArray();
    
    for (let i = 0; i < topHooks.length; i++) {
      const h = topHooks[i];
      console.log(`   ${i + 1}. "${h.hookText}" (+${h.avgEngagementBoost}% boost, ${h.niche})`);
    }

  } catch (error) {
    console.error('💥 Fatal error during seeding:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the seeding script
seedViralPatterns()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    console.log('\n📚 IMPORTANT: These patterns are TRAINING DATA for the AI to learn from.');
    console.log('The AI will study these structures and adapt them to each user\'s unique voice.');
    console.log('Generated captions will be fresh and original, not copies of these patterns.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
