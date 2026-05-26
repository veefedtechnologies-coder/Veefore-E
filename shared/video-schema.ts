import { pgTable, text, timestamp, integer, boolean, jsonb, uuid, serial } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Video generation jobs table
export const videoJobs = pgTable('video_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  status: text('status', { enum: ['draft', 'generating', 'completed', 'failed'] }).notNull().default('draft'),
  
  // User preferences
  duration: integer('duration').notNull(), // in seconds
  voiceProfile: jsonb('voice_profile').$type<{
    gender: 'male' | 'female' | 'neutral';
    language: string;
    accent: string;
    tone: string;
  }>(),
  enableAvatar: boolean('enable_avatar').default(false),
  enableMusic: boolean('enable_music').default(true),
  visualStyle: text('visual_style').default('cinematic'),
  motionEngine: text('motion_engine', { enum: ['auto', 'runway', 'animatediff'] }).default('auto'),
  
  // Generated content
  script: jsonb('script').$type<{
    scenes: Array<{
      id: string;
      narration: string;
      description: string;
      emotion: string;
      duration: number;
    }>;
  }>(),
  
  // Media files
  sceneImages: jsonb('scene_images').$type<string[]>(),
  sceneVideos: jsonb('scene_videos').$type<string[]>(),
  voiceFiles: jsonb('voice_files').$type<string[]>(),
  avatarVideo: text('avatar_video'),
  finalVideo: text('final_video'),
  
  // Metadata
  creditsUsed: integer('credits_used').default(0),
  processingTime: integer('processing_time'), // in seconds
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User credits table
export const userCredits = pgTable('user_credits', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  credits: integer('credits').notNull().default(100),
  totalUsed: integer('total_used').notNull().default(0),
  lastRefresh: timestamp('last_refresh').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Create insert schemas
export const insertVideoJobSchema = createInsertSchema(videoJobs);
export const insertUserCreditsSchema = createInsertSchema(userCredits);

// Types
export type VideoJob = typeof videoJobs.$inferSelect;
export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type UserCredits = typeof userCredits.$inferSelect;
export type InsertUserCredits = z.infer<typeof insertUserCreditsSchema>;

// Scene data type
export type Scene = {
  id: string;
  narration: string;
  description: string;
  emotion: string;
  duration: number;
};

// Voice profile type
export type VoiceProfile = {
  gender: 'male' | 'female' | 'neutral';
  language: string;
  accent: string;
  tone: string;
};