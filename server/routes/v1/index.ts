import { Application, Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import workspaceRoutes from './workspace.routes';
import contentRoutes from './content.routes';
import analyticsRoutes from './analytics.routes';
import analyticsReportsRoutes from './analytics-reports.routes';
import socialAccountRoutes from './social-accounts.routes';
import schedulerRoutes from './scheduler.routes';
import aiRoutes from './ai.routes';
import thumbnailsRoutes from './thumbnails.routes';
import trendsRoutes from './trends.routes';
import automationRoutes from './automation.routes';
import billingRoutes from './billing.routes';
import webhooksRoutes from './webhooks.routes';
import healthRoutes from './health.routes';
import activityRoutes from './activity.routes';
import socialAuthRoutes from './social-auth.routes';
import voiceProfileRoutes from './voice-profile.routes';
import { autopilotRouter } from '../../features/autopilot/routes/autopilot.routes';
// NOTE: googleAuthRoutes (./google-auth.routes) removed — it was an orphaned
// duplicate of the live OAuth implementation in server/routes/auth.ts
// (mounted at /api/auth/google/*). Nothing called /api/(v1/)google-auth/*.

export { default as authRoutes } from './auth.routes';
export { default as userRoutes } from './user.routes';
export { default as workspaceRoutes } from './workspace.routes';
export { default as contentRoutes } from './content.routes';
export { default as analyticsRoutes } from './analytics.routes';
export { default as socialAccountRoutes } from './social-accounts.routes';
export { default as schedulerRoutes } from './scheduler.routes';
export { default as aiRoutes } from './ai.routes';
export { default as thumbnailsRoutes } from './thumbnails.routes';
export { default as trendsRoutes } from './trends.routes';
export { default as automationRoutes } from './automation.routes';
export { default as billingRoutes } from './billing.routes';
export { default as webhooksRoutes } from './webhooks.routes';
export { default as healthRoutes } from './health.routes';
import { default as earlyAccessRoutes } from './early-access.routes';

export { default as activityRoutes } from './activity.routes';
export { default as voiceProfileRoutes } from './voice-profile.routes';

export function mountV1Routes(
  app: Application,
  basePath: string = '/api/v1'
): void {
  app.use(`${basePath}/auth`, authRoutes);
  app.use(`${basePath}/user`, userRoutes);
  app.use(`${basePath}/workspaces`, workspaceRoutes);
  app.use(`${basePath}/content`, contentRoutes);
  app.use(`${basePath}/analytics`, analyticsRoutes);
  app.use(`${basePath}/analytics/reports`, analyticsReportsRoutes);
  app.use(`${basePath}/social-accounts`, socialAccountRoutes);
  app.use(`${basePath}/social-auth`, socialAuthRoutes);
  app.use(`${basePath}/scheduler`, schedulerRoutes);
  app.use(`${basePath}/ai`, aiRoutes);
  app.use(`${basePath}/voice-profile`, voiceProfileRoutes);
  app.use(`${basePath}/thumbnails`, thumbnailsRoutes);
  app.use(`${basePath}/trends`, trendsRoutes);
  app.use(`${basePath}/automation`, automationRoutes);
  // NOTE: `billingRoutes` is deliberately NOT mounted here.
  //
  // `mountV1Routes` is called twice (once with '/api', once with '/api/v1')
  // because the client genuinely uses both prefixes for most resources. For
  // billing that produced two independent copies of every money-handling
  // endpoint — two rate limiters, two audit-middleware chains, and two paths any
  // future auth fix would have to be applied to consistently.
  //
  // Billing is now mounted exactly once, from `registerRoutes` in server/routes.ts.
  // See `mountBillingRoutes` below.
  app.use(`${basePath}/activity`, activityRoutes);
  app.use(`${basePath}/autopilot`, autopilotRouter);
  app.use('/webhook', webhooksRoutes);
  app.use('/api', healthRoutes);
}

/**
 * Mount the billing router exactly once, at a single canonical path.
 *
 * Billing endpoints move money, so having them reachable at two prefixes is a
 * liability rather than a convenience: every guard has to be kept in sync across
 * both, and a fix applied to one silently leaves the other exposed.
 *
 * `/api/billing` is chosen as the canonical path because no client code
 * references `/api/v1/billing`. Note that the primary subscription API is
 * `/api/v2/subscription/*`; this legacy router now only serves the one-time
 * credit/add-on order endpoints.
 */
export function mountBillingRoutes(
  app: Application,
  basePath: string = '/api/billing'
): void {
  app.use(basePath, billingRoutes);
}

const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/user', userRoutes);
v1Router.use('/workspaces', workspaceRoutes);
v1Router.use('/content', contentRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/social-accounts', socialAccountRoutes);
v1Router.use('/social-auth', socialAuthRoutes);
v1Router.use('/scheduler', schedulerRoutes);
v1Router.use('/ai', aiRoutes);
v1Router.use('/voice-profile', voiceProfileRoutes);
v1Router.use('/thumbnails', thumbnailsRoutes);
v1Router.use('/trends', trendsRoutes);
v1Router.use('/automation', automationRoutes);
// This standalone `v1Router` is currently unused (server/routes.ts mounts via
// mountV1Routes instead). If it is ever wired up, drop this billing line —
// billing must stay mounted exactly once, via mountBillingRoutes.
v1Router.use('/billing', billingRoutes);
v1Router.use('/activity', activityRoutes);
v1Router.use('/autopilot', autopilotRouter);

export default v1Router;
