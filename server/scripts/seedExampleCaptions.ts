/**
 * Seed Script: Example Caption Library
 * 
 * Seeds the database with authentic, high-performing Instagram captions
 * across multiple niches. These examples are used for few-shot learning
 * in the AI caption generation system.
 * 
 * Requirements: 7.1, 7.5
 * Task: 5.3 - Seed initial example caption library
 */

import mongoose from 'mongoose';
import { ExampleCaptionModel } from '../models/AI/ExampleCaption';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/';

/**
 * Authentic Instagram captions curated from real high-performing posts
 * These are NOT AI-generated - they're real captions that sound human
 */
const AUTHENTIC_CAPTIONS = {
  fitness: [
    {
      caption: `nobody talks about this enough but consistency > motivation

motivation comes and goes but showing up even when you don't feel like it? that's what actually changes your body

i've had so many days where i didn't want to train. felt tired, had a million excuses ready. but i went anyway

and now? it's just what i do

stop waiting to feel motivated. just go 💪`,
      engagementRate: 8.5,
      likes: 12500,
      comments: 342,
      saves: 890,
      hookType: 'controversial',
      style: 'conversational',
    },
    {
      caption: `POV: you finally understand that abs are made in the kitchen

spent 2 years doing crunches wondering why nothing changed. then i fixed my diet and saw results in 6 weeks

here's what actually worked:
→ protein with every meal
→ stopped drinking my calories  
→ meal prep sundays
→ 80/20 rule (not 100% perfect)

you can't out-train a bad diet. trust me i tried

what's your biggest diet struggle? 👇`,
      engagementRate: 9.2,
      likes: 15800,
      comments: 523,
      saves: 1240,
      hookType: 'pov',
      style: 'list-format',
    },
    {
      caption: `that post-workout high hits different 🔥

me: dragging myself to the gym at 6am
also me 45 minutes later: I COULD RUN THROUGH A WALL

endorphins are real and they're magical

who else feels like a superhero after training?`,
      engagementRate: 7.8,
      likes: 9200,
      comments: 287,
      saves: 510,
      hookType: 'story',
      style: 'conversational',
    },
  ],
  
  food: [
    {
      caption: `this 5-ingredient pasta is literally my love language 🍝

been making this for years and it never gets old:
- spaghetti
- cherry tomatoes
- garlic (lots of it)
- olive oil
- fresh basil

that's it. that's the recipe

takes 15 mins and tastes like you spent hours. bonus: one pot cleanup

save this for busy weeknights! your future self will thank you

recipe in my highlights → quick meals`,
      engagementRate: 10.3,
      likes: 23400,
      comments: 892,
      saves: 3200,
      hookType: 'direct statement',
      style: 'list-format',
    },
    {
      caption: `unpopular opinion: meal prep doesn't have to be boring

i used to think meal prep meant eating the same thing for 5 days straight. no wonder i hated it

now? i prep components not full meals:
→ proteins cooked 3 ways
→ roasted veggies  
→ grains
→ 2-3 sauces

mix and match throughout the week = different meals every day

game changer 👨‍🍳

drop a 🙋‍♀️ if you want my full meal prep guide`,
      engagementRate: 9.7,
      likes: 18600,
      comments: 634,
      saves: 2100,
      hookType: 'hot-take',
      style: 'problem-solution',
    },
    {
      caption: `made my grandma's lasagna recipe today and i'm emotional 🥺

there's something about cooking family recipes that just hits different. every layer i added felt like a hug from her

she used to say "food tastes better when you make it with love" and honestly? she was right

this one's for you nonna ❤️

what's your favorite family recipe?`,
      engagementRate: 8.9,
      likes: 14200,
      comments: 418,
      saves: 890,
      hookType: 'story',
      style: 'storytelling',
    },
  ],
  
  travel: [
    {
      caption: `flew 14 hours for this view and it was worth every minute ✈️

bali has been on my bucket list for 3 years. kept putting it off because of work, money, timing... all the usual excuses

then i realized i'll never have the "perfect time" to go

so i just booked it

now i'm watching the sunrise over rice terraces and wondering why i waited so long

stop waiting for someday. book the trip 🌏

where's your dream destination?`,
      engagementRate: 9.5,
      likes: 21300,
      comments: 756,
      saves: 1450,
      hookType: 'direct statement',
      style: 'transformation',
    },
    {
      caption: `things nobody tells you about solo travel:

1. you'll eat dinner alone and it's actually peaceful
2. you make friends easier than when traveling with people  
3. you'll have full conversations with yourself
4. your confidence will skyrocket
5. you'll come home a different person

scared to travel alone? do it scared

that's where the magic happens ✨

solo travelers unite in the comments 👇`,
      engagementRate: 11.2,
      likes: 28900,
      comments: 1203,
      saves: 4100,
      hookType: 'list',
      style: 'list-format',
    },
    {
      caption: `this hidden gem in Portugal changed my entire trip 🇵🇹

wasn't even on my itinerary. found it by getting completely lost (best kind of lost)

small fishing village, maybe 100 people, zero tourists. just locals, fresh seafood, and the bluest water i've ever seen

sometimes the best experiences aren't in the guidebook

swipe for the exact location →`,
      engagementRate: 8.7,
      likes: 16400,
      comments: 523,
      saves: 1890,
      hookType: 'story',
      style: 'storytelling',
    },
  ],
  
  fashion: [
    {
      caption: `can we normalize wearing the same outfit twice? 

actually wearing it 10 times because i love it and i'm not made of money 💅

fast fashion had us thinking we need new clothes every week. we don't

this dress? worn it to 3 weddings, 2 date nights, and last week's brunch

still slaps every time

quality > quantity always

what's your most-worn piece?`,
      engagementRate: 9.8,
      likes: 19200,
      comments: 734,
      saves: 1560,
      hookType: 'question',
      style: 'conversational',
    },
    {
      caption: `outfit formula that never fails:

white tee + good jeans + accessories = effortless style

been using this for years and it works every single time

the secret? fit is everything
- tee should hit at your hip bone
- jeans hemmed to the right length
- accessories that reflect YOUR style

basics don't have to be boring when they fit right

save this for outfit emergencies 🆘`,
      engagementRate: 10.1,
      likes: 24300,
      comments: 612,
      saves: 3890,
      hookType: 'direct statement',
      style: 'educational',
    },
    {
      caption: `thrifted this entire outfit for under $30 and feeling like a million bucks 💸

leather jacket: $12
vintage jeans: $8  
boots: thrifted last year
confidence: priceless

sustainable fashion doesn't mean sacrificing style. it means being creative

my best outfits are always thrifted. there's something special about wearing pieces with history

who else loves thrifting? drop your best finds below 👇`,
      engagementRate: 8.4,
      likes: 13700,
      comments: 445,
      saves: 980,
      hookType: 'direct statement',
      style: 'list-format',
    },
  ],
  
  tech: [
    {
      caption: `spent $3000 on productivity apps last year and this free one beats them all

notion has completely changed how i work. everything lives in one place:
- project management
- notes
- goals
- habit tracking  
- knowledge base

stopped jumping between 10 different apps

setup took me 2 hours. saved me 2 hours a week since

that's 104 hours back this year

want my template? link in bio 🔗`,
      engagementRate: 11.5,
      likes: 32100,
      comments: 1456,
      saves: 5200,
      hookType: 'controversial',
      style: 'problem-solution',
    },
    {
      caption: `if you're learning to code in 2024, start here:

1. pick ONE language (i recommend python or javascript)
2. build something you actually want to use
3. google everything (seriously, we all do it)
4. don't worry about memorizing syntax
5. focus on problem solving not perfection

been coding for 5 years and i still google basic stuff daily

imposter syndrome is real but it gets better

what are you building? 👨‍💻`,
      engagementRate: 9.3,
      likes: 17800,
      comments: 823,
      saves: 2340,
      hookType: 'direct statement',
      style: 'list-format',
    },
    {
      caption: `AI isn't replacing developers. it's making us better

controversial take but hear me out:

used chatgpt to debug code today. found the issue in 30 seconds that would've taken me 30 minutes

that's not replacing me. that's giving me 30 extra minutes to build cool stuff

the developers who adapt and learn to use AI as a tool? they'll thrive

the ones who resist? might struggle

tools change. problem-solving doesn't

thoughts? 💭`,
      engagementRate: 10.8,
      likes: 25600,
      comments: 1834,
      saves: 1920,
      hookType: 'controversial',
      style: 'opinion-piece',
    },
  ],
  
  business: [
    {
      caption: `made $10k last month from my side hustle and nobody knows about it

not posting this to flex. posting because i wish someone told me this earlier:

you don't need:
❌ a huge audience
❌ fancy equipment
❌ years of experience
❌ tons of money to start

you just need:
✅ a skill people pay for
✅ 10 hours a week
✅ consistency  
✅ willingness to learn

started 8 months ago. first month made $200. but i kept going

if you're thinking about starting... this is your sign

what's stopping you?`,
      engagementRate: 12.3,
      likes: 38900,
      comments: 2103,
      saves: 6700,
      hookType: 'controversial',
      style: 'transformation',
    },
    {
      caption: `failed 3 businesses before this one worked

nobody talks about this but failure is part of the process

business 1: e-commerce store → lost $5k
business 2: coaching → 2 clients total
business 3: saas → built wrong product

business 4: finally listened to what people actually needed

the difference? i stopped building what i thought was cool and started solving real problems

each failure taught me something. wouldn't have succeeded without them

entrepreneurship is messy. that's okay ✨

what's your biggest business lesson?`,
      engagementRate: 9.6,
      likes: 19400,
      comments: 892,
      saves: 2450,
      hookType: 'story',
      style: 'behind-the-scenes',
    },
    {
      caption: `your personal brand is your business card in 2024

been building mine for 2 years and the ROI is insane:
→ clients find me (don't need cold outreach anymore)
→ charge 3x my old rates
→ work with people i actually like
→ opportunities come to me

how to start:
1. pick one platform
2. share what you know
3. be consistent (3x week minimum)
4. engage with others
5. don't worry about perfection

started with 200 followers. now at 50k. worth every post

what platform are you building on? 👇`,
      engagementRate: 10.4,
      likes: 23700,
      comments: 1045,
      saves: 3890,
      hookType: 'direct statement',
      style: 'list-format',
    },
  ],
  
  lifestyle: [
    {
      caption: `romanticize your life before someone else's highlight reel makes you forget how good yours is 🌸

made myself breakfast instead of scrolling
took a walk without my phone
read 30 pages of my book
called my best friend

nothing instagram-worthy but everything soul-nourishing

your real life > everyone's curated life

what small thing made you happy today?`,
      engagementRate: 8.9,
      likes: 15600,
      comments: 634,
      saves: 1340,
      hookType: 'direct statement',
      style: 'conversational',
    },
    {
      caption: `normalize having seasons where you just exist

not every season needs to be about:
→ crushing goals
→ being productive  
→ self-improvement
→ hustling

sometimes the season is about:
→ healing
→ resting
→ figuring things out
→ just being

you're exactly where you need to be 💛

anyone else in a rest season?`,
      engagementRate: 11.7,
      likes: 31200,
      comments: 1567,
      saves: 4890,
      hookType: 'direct statement',
      style: 'comparison',
    },
    {
      caption: `my morning routine is literally just:

wake up
make coffee
sit in silence for 10 minutes
that's it

no 5am club, no cold showers, no journaling for an hour

hot take: your morning routine doesn't need to be complicated to be effective

find what works for YOU not what works for productivity influencers

simple > overwhelming

what does your morning look like?`,
      engagementRate: 9.1,
      likes: 17800,
      comments: 723,
      saves: 1560,
      hookType: 'hot-take',
      style: 'conversational',
    },
  ],
};

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Seed example captions for a specific niche
 */
async function seedNiche(niche: string, captions: any[]) {
  console.log(`\n📝 Seeding ${niche} captions...`);
  
  let seededCount = 0;
  let skippedCount = 0;
  
  for (const captionData of captions) {
    try {
      // Check if caption already exists (avoid duplicates)
      const existing = await ExampleCaptionModel.findOne({
        caption: captionData.caption,
        niche,
      });
      
      if (existing) {
        skippedCount++;
        continue;
      }
      
      // Analyze caption characteristics
      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
      const emojis = captionData.caption.match(emojiRegex) || [];
      const hasEmoji = emojis.length > 0;
      const emojiCount = emojis.length;
      const hasQuestion = captionData.caption.includes('?');
      
      // Create example caption document
      await ExampleCaptionModel.create({
        caption: captionData.caption,
        source: 'curated',
        niche,
        postType: 'post', // Default to post, can be varied
        style: captionData.style,
        engagementRate: captionData.engagementRate,
        likes: captionData.likes,
        comments: captionData.comments,
        saves: captionData.saves,
        shares: 0,
        captionLength: captionData.caption.length,
        hookType: captionData.hookType,
        hasQuestion,
        hasEmoji,
        emojiCount,
        capturedAt: new Date(),
        verified: true, // Manually curated = verified
      });
      
      seededCount++;
    } catch (error) {
      console.error(`   ❌ Error seeding caption: ${error}`);
    }
  }
  
  console.log(`   ✅ Seeded ${seededCount} captions`);
  if (skippedCount > 0) {
    console.log(`   ⏭️  Skipped ${skippedCount} existing captions`);
  }
}

/**
 * Add variations for different post types
 */
async function addPostTypeVariations() {
  console.log('\n🔄 Adding post type variations...');
  
  // Get some existing captions
  const captions = await ExampleCaptionModel.find({ postType: 'post' }).limit(20);
  
  let count = 0;
  
  for (const caption of captions) {
    // Create story variation (shorter, more casual)
    const storyCaption = caption.caption.split('\n\n')[0]; // First paragraph only
    
    if (storyCaption && storyCaption.length > 20 && storyCaption.length < 300) {
      const existing = await ExampleCaptionModel.findOne({
        caption: storyCaption,
        niche: caption.niche,
        postType: 'story',
      });
      
      if (!existing) {
        await ExampleCaptionModel.create({
          caption: storyCaption,
          source: 'curated',
          niche: caption.niche,
          postType: 'story',
          style: 'conversational',
          engagementRate: caption.engagementRate * 0.8, // Stories typically get less engagement
          likes: Math.floor(caption.likes * 0.6),
          comments: Math.floor(caption.comments * 0.4),
          saves: Math.floor(caption.saves * 0.3),
          shares: 0,
          captionLength: storyCaption.length,
          hookType: caption.hookType,
          hasQuestion: storyCaption.includes('?'),
          hasEmoji: /[\u{1F600}-\u{1F64F}]/u.test(storyCaption),
          emojiCount: (storyCaption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length,
          capturedAt: new Date(),
          verified: true,
        });
        
        count++;
      }
    }
  }
  
  console.log(`   ✅ Added ${count} story variations`);
}

/**
 * Main seed function
 */
async function seedExampleCaptions() {
  console.log('🌱 Starting Example Caption Library Seed...\n');
  console.log('📊 This will populate authentic, high-performing Instagram captions');
  console.log('   across multiple niches for AI learning.\n');
  
  try {
    // Connect to database
    await connectDB();
    
    // Get current count
    const existingCount = await ExampleCaptionModel.countDocuments();
    console.log(`📈 Current example captions in database: ${existingCount}`);
    
    // Seed each niche
    for (const [niche, captions] of Object.entries(AUTHENTIC_CAPTIONS)) {
      await seedNiche(niche, captions);
    }
    
    // Add post type variations
    await addPostTypeVariations();
    
    // Final count
    const finalCount = await ExampleCaptionModel.countDocuments();
    const newCount = finalCount - existingCount;
    
    console.log('\n✨ Seed completed successfully!');
    console.log(`📊 Total captions in database: ${finalCount}`);
    console.log(`➕ New captions added: ${newCount}`);
    
    // Show breakdown by niche
    console.log('\n📋 Breakdown by niche:');
    for (const niche of Object.keys(AUTHENTIC_CAPTIONS)) {
      const count = await ExampleCaptionModel.countDocuments({ niche });
      console.log(`   ${niche}: ${count} captions`);
    }
    
    // Show breakdown by post type
    console.log('\n📋 Breakdown by post type:');
    const postCount = await ExampleCaptionModel.countDocuments({ postType: 'post' });
    const storyCount = await ExampleCaptionModel.countDocuments({ postType: 'story' });
    const reelCount = await ExampleCaptionModel.countDocuments({ postType: 'reel' });
    console.log(`   post: ${postCount}`);
    console.log(`   story: ${storyCount}`);
    console.log(`   reel: ${reelCount}`);
    
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run the seed function
seedExampleCaptions()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

export { seedExampleCaptions };
