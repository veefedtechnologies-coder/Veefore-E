import { Application, Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import workspaceRoutes from './workspace.routes';
import contentRoutes from './content.routes';
import analyticsRoutes from './analytics.routes';
import socialAccountRoutes from './social-accounts.routes';
import schedulerRoutes from './scheduler.routes';
import aiRoutes from './ai.routes';
import thumbnailsRoutes from './thumbnails.routes';
import trendsRoutes from './trends.routes';
import automationRoutes from './automation.routes';
import billingRoutes from './billing.routes';

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

export function mountV1Routes(app: Application, basePath: string = '/api/v1'): void {
  app.use(`${basePath}/auth`, authRoutes);
  app.use(`${basePath}/user`, userRoutes);
  app.use(`${basePath}/workspaces`, workspaceRoutes);
  app.use(`${basePath}/content`, contentRoutes);
  app.use(`${basePath}/analytics`, analyticsRoutes);
  app.use(`${basePath}/social-accounts`, socialAccountRoutes);
  app.use(`${basePath}/scheduler`, schedulerRoutes);
  app.use(`${basePath}/ai`, aiRoutes);
  app.use(`${basePath}/thumbnails`, thumbnailsRoutes);
  app.use(`${basePath}/trends`, trendsRoutes);
  app.use(`${basePath}/automation`, automationRoutes);
  app.use(`${basePath}/billing`, billingRoutes);
}

const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/user', userRoutes);
v1Router.use('/workspaces', workspaceRoutes);
v1Router.use('/content', contentRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/social-accounts', socialAccountRoutes);
v1Router.use('/scheduler', schedulerRoutes);
v1Router.use('/ai', aiRoutes);
v1Router.use('/thumbnails', thumbnailsRoutes);
v1Router.use('/trends', trendsRoutes);
v1Router.use('/automation', automationRoutes);
v1Router.use('/billing', billingRoutes);

export default v1Router;
