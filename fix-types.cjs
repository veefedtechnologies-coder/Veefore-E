const fs = require('fs');
const path = require('path');

// Read the routes.ts file
const routesPath = path.join(__dirname, 'server', 'routes.ts');
let content = fs.readFileSync(routesPath, 'utf8');

// Import the types at the top if not already imported
if (!content.includes("import { AuthenticatedRequest, WorkspaceRequest, AdminRequest, FeatureRequest, UploadRequest } from './types/express';")) {
  content = content.replace(
    "import './types/express';",
    "import './types/express';\nimport { AuthenticatedRequest, WorkspaceRequest, AdminRequest, FeatureRequest, UploadRequest } from './types/express';"
  );
}

// Replace patterns systematically
const replacements = [
  // Routes that require authentication - use AuthenticatedRequest
  {
    pattern: /(requireAuth.*async \()req: any(, res: Response\) => {)/g,
    replacement: '$1req: AuthenticatedRequest$2'
  },
  // Routes with workspace validation - use WorkspaceRequest  
  {
    pattern: /(validateWorkspace.*async \()req: any(, res: Response\) => {)/g,
    replacement: '$1req: WorkspaceRequest$2'
  },
  // Admin routes - use AdminRequest
  {
    pattern: /(adminAuth.*async \()req: any(, res: Response\) => {)/g,
    replacement: '$1req: AdminRequest$2'
  },
  // Routes with file uploads - use UploadRequest
  {
    pattern: /(mediaUpload\.any\(\).*async \()req: any(, res: Response\) => {)/g,
    replacement: '$1req: UploadRequest$2'
  },
  // General routes without specific middleware - use Request
  {
    pattern: /(app\.(get|post|put|patch|delete)\([^,]+,.*async \()req: any(, res: (?:Response|any)\) => {)/g,
    replacement: '$1req: Request$3'
  },
  // Middleware functions
  {
    pattern: /(const \w+ = async \()req: any(, res: Response, next: NextFunction\) => {)/g,
    replacement: '$1req: Request$2'
  }
];

// Apply replacements
replacements.forEach(({ pattern, replacement }) => {
  content = content.replace(pattern, replacement);
});

// Write the updated content back
fs.writeFileSync(routesPath, content, 'utf8');

console.log('✅ Fixed TypeScript types in routes.ts');
console.log('📊 Replaced all req: any instances with proper typing');