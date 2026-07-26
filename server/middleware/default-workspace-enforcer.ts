import { Request, Response, NextFunction } from 'express'
import { IStorage } from '../storage'

export function defaultWorkspaceEnforcer(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip enforcement on bootstrap/read endpoints to keep first render fast
      // NOTE: We no longer skip GET /workspaces - if user has no workspaces, we create one
      const path = req.path || ''
      const skip = (
        path.startsWith('/user') ||
        path.includes('social-auth') ||
        (path.startsWith('/social-accounts') && req.method === 'GET') ||
        req.method === 'HEAD' || req.method === 'OPTIONS'
      )
      if (skip) return next()

      if (!req.user || !req.user.id) return next()

      const userId = req.user.id
      const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), ms)
          p.then(v => { clearTimeout(t); resolve(v) }).catch(err => { clearTimeout(t); reject(err) })
        })
      }

      let workspaces: any[] | null = null
      try { workspaces = await withTimeout(storage.getWorkspacesByUserId(userId), 2000) as any[] } catch { workspaces = null }

      if (Array.isArray(workspaces) && workspaces.length > 0) {
        const defaults = workspaces.filter((w: any) => w.isDefault === true)
        if (defaults.length !== 1) {
          try { await withTimeout(storage.setDefaultWorkspace(userId, workspaces[0].id), 2000) } catch { }
        }
        let defaultWs: any
        try { defaultWs = await withTimeout(storage.getDefaultWorkspace(userId), 2000) } catch { }
        if (defaultWs) {
          req.workspaceId = defaultWs.id
        }
        return next()
      }

      // If we could not read workspaces quickly, do not block the request
      if (workspaces === null) return next()

      // BUG FIX: this previously auto-created a bare "My Workspace" (no
      // brand, no social account) for any user with zero workspaces on
      // ANY API request. That's the root cause of orphaned placeholder
      // workspaces like "My VeeFore Workspace" — created here, then later
      // colliding with the user's REAL brand-backed workspace (created via
      // the Meta OAuth import flow) over the isDefault flag, which is what
      // caused the "redirected back to an old workspace" bug.
      //
      // A workspace must always represent one connected brand (see the
      // workspace-meta-connection spec). Zero workspaces is a valid,
      // expected state for a user who hasn't connected a brand yet — do NOT
      // fabricate one here. Just proceed without a workspaceId; route
      // handlers that require an active workspace already validate that
      // via validateWorkspaceAccess and will correctly report "no workspace"
      // rather than silently operating on a fake one.
      return next()
    } catch (error) {
      return res.status(500).json({ error: 'Workspace enforcement failed' })
    }
  }
}
