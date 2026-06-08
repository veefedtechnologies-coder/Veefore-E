import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function verifySystem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    
    console.log('='.repeat(80));
    console.log('AUTHENTIC INSTAGRAM CAPTION GENERATION SYSTEM - DATABASE VALIDATION');
    console.log('='.repeat(80));
    console.log();
    
    // Check Viral Patterns
    const viralPatterns = await mongoose.connection.db.collection('viralpatterns').countDocuments();
    console.log(`✓ Viral Patterns: ${viralPatterns} patterns`);
    
    // Check Viral Hooks
    const viralHooks = await mongoose.connection.db.collection('viralhooks').countDocuments();
    console.log(`✓ Viral Hooks: ${viralHooks} hooks`);
    
    // Check Niche Contexts
    const nicheContexts = await mongoose.connection.db.collection('nichecontexts').countDocuments();
    console.log(`✓ Niche Contexts: ${nicheContexts} contexts`);
    
    // Check Example Captions
    const exampleCaptions = await mongoose.connection.db.collection('examplecaptions').countDocuments();
    console.log(`✓ Example Captions: ${exampleCaptions} captions`);
    
    // Check Voice Profiles
    const voiceProfiles = await mongoose.connection.db.collection('voiceprofiles').countDocuments();
    console.log(`✓ Voice Profiles: ${voiceProfiles} profiles`);
    
    // Check Generated Captions
    const generatedCaptions = await mongoose.connection.db.collection('generatedcaptions').countDocuments();
    console.log(`✓ Generated Captions: ${generatedCaptions} captions tracked`);
    
    // Check Caption Feedback
    const captionFeedback = await mongoose.connection.db.collection('captionfeedback').countDocuments();
    console.log(`✓ Caption Feedback: ${captionFeedback} feedback records`);
    
    console.log();
    console.log('='.repeat(80));
    console.log('DATABASE VALIDATION COMPLETE');
    console.log('='.repeat(80));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifySystem();
