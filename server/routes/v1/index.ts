import { Application, Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import workspaceRoutes from './workspace.routes';
import contentRoutes from './content.routes';
import analyticsRoutes from './analytics.routes';
import socialAccountRoutes from './social-accounts.routes';

export { default as authRoutes } from './auth.routes';
export { default as userRoutes } from './user.routes';
export { default as workspaceRoutes } from './workspace.routes';
export { default as contentRoutes } from './content.routes';
export { default as analyticsRoutes } from './analytics.routes';
export { default as socialAccountRoutes } from './social-accounts.routes';

export function mountV1Routes(app: Application, basePath: string = '/api/v1'): void {
  app.use(`${basePath}/auth`, authRoutes);
  app.use(`${basePath}/user`, userRoutes);
  app.use(`${basePath}/workspaces`, workspaceRoutes);
  app.use(`${basePath}/content`, contentRoutes);
  app.use(`${basePath}/analytics`, analyticsRoutes);
  app.use(`${basePath}/social-accounts`, socialAccountRoutes);
}

const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/user', userRoutes);
v1Router.use('/workspaces', workspaceRoutes);
v1Router.use('/content', contentRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/social-accounts', socialAccountRoutes);

export default v1Router;
