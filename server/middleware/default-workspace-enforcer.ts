import { Request, Response, NextFunction } from 'express'
import { IStorage } from '../storage'

export function defaultWorkspaceEnforcer(storage: IStorage) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip enforcement on bootstrap/read endpoints to keep first render fast
      const path = req.path || ''
      const skip = (
        path.startsWith('/user') ||
        (path.startsWith('/workspaces') && req.method === 'GET') ||
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
          try { await withTimeout(storage.setDefaultWorkspace(userId, workspaces[0].id), 2000) } catch {}
        }
        let defaultWs: any
        try { defaultWs = await withTimeout(storage.getDefaultWorkspace(userId), 2000) } catch {}
        if (defaultWs) {
          req.workspaceId = defaultWs.id
        }
        return next()
      }

      // If we could not read workspaces quickly, do not block the request
      if (workspaces === null) return next()

      let user: any
      try { user = await withTimeout(storage.getUser(userId), 2000) } catch {}
      const name = user?.displayName ? `${user.displayName}'s Workspace` : 'My Workspace'

      try {
        const ws = await withTimeout(storage.createWorkspace({ name, userId, isDefault: true, theme: 'space' }), 3000)
        req.workspaceId = ws.id
        return next()
      } catch (err: any) {
        return res.status(409).json({
          error: 'DEFAULT_WORKSPACE_REQUIRED',
          message: 'Workspace creation failed. Please retry.',
          hint: 'Click Retry Workspace Creation or sign out and back in.',
          details: err?.message || 'unknown'
        })
      }
    } catch (error) {
      return res.status(500).json({ error: 'Workspace enforcement failed' })
    }
  }
}
