import { z } from 'zod';
export declare const videoJobs: any;
export declare const userCredits: any;
export declare const insertVideoJobSchema: any;
export declare const insertUserCreditsSchema: any;
export type VideoJob = typeof videoJobs.$inferSelect;
export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type UserCredits = typeof userCredits.$inferSelect;
export type InsertUserCredits = z.infer<typeof insertUserCreditsSchema>;
export type Scene = {
    id: string;
    narration: string;
    description: string;
    emotion: string;
    duration: number;
};
export type VoiceProfile = {
    gender: 'male' | 'female' | 'neutral';
    language: string;
    accent: string;
    tone: string;
};
