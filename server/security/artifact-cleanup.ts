/**
 * Section 11: Test & Dev Artifact Cleanup Implementation
 * 
 * Automated cleanup of test files, dev artifacts, and unused assets
 * for production deployment security and optimization
 */

import fs from 'fs';
import path from 'path';

export interface CleanupReport {
  timestamp: string;
  deletedFiles: string[];
  unusedAssets: string[];
  buildExclusions: string[];
  cleanupScore: number;
  warnings: string[];
  recommendations: string[];
}

/**
 * Section 11: Artifact Cleanup Manager
 */
export class ArtifactCleanupManager {
  private readonly excludeDirs = [
    'node_modules',
    '.git',
    '.cache',
    'dist',
    'build',
    '.next',
    'coverage'
  ];

  private readonly testFilePatterns = [
    /.*\.test\.(js|ts|jsx|tsx)$/,
    /.*\.spec\.(js|ts|jsx|tsx)$/,
    /.*\.mock\.(js|ts|jsx|tsx)$/,
    /demo-.*\.js$/,
    /test-.*\.js$/,
    /.*-test\.js$/,
    /.*-demo\.js$/,
    /cleanup-.*\.js$/,
    /fix-.*\.js$/
  ];

  private readonly devArtifactPatterns = [
    /.env\.local$/,
    /.env\.test$/,
    /\.log$/,
    /debug\.log$/,
    /error\.log$/,
    /npm-debug\.log$/,
    /yarn-debug\.log$/,
    /yarn-error\.log$/,
    /\.DS_Store$/,
    /Thumbs\.db$/,
    /desktop\.ini$/
  ];

  /**
   * 11.1: Delete leftover test/demo files
   */
  async deleteTestDemoFiles(): Promise<{ deleted: string[]; preserved: string[] }> {
    console.log('🧹 Section 11.1: Scanning for test/demo files to delete...');

    const deleted: string[] = [];
    const preserved: string[] = [];

    try {
      const allFiles = this.getAllFiles('.');

      for (const file of allFiles) {
        // Skip excluded directories
        if (this.isExcludedPath(file)) {
          continue;
        }

        // Check if file matches test/demo patterns
        if (this.isTestOrDemoFile(file)) {
          try {
            // Preserve certain important test infrastructure
            if (this.shouldPreserveFile(file)) {
              preserved.push(file);
              console.log(`🔒 Preserving important file: ${file}`);
              continue;
            }

            fs.unlinkSync(file);
            deleted.push(file);
            console.log(`🗑️ Deleted: ${file}`);
          } catch (error) {
            console.warn(`⚠️ Could not delete ${file}:`, error);
          }
        }
      }

      console.log(`✅ Section 11.1: Deleted ${deleted.length} test/demo files`);
      return { deleted, preserved };
    } catch (error) {
      console.error('❌ Section 11.1: Test file deletion failed:', error);
      return { deleted, preserved };
    }
  }

  /**
   * 11.2: Verify production build exclusions
   */
  async verifyBuildExclusions(): Promise<{ configured: boolean; exclusions: string[]; issues: string[] }> {
    console.log('🔍 Section 11.2: Verifying production build exclusions...');

    const exclusions: string[] = [];
    const issues: string[] = [];
    let configured = true;

    try {
      // Check Vite config for build exclusions
      const viteConfigPath = 'vite.config.ts';
      if (fs.existsSync(viteConfigPath)) {
        const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');
        
        // Check for proper build configuration
        if (viteConfig.includes('build:')) {
          exclusions.push('✅ Vite build configuration present');
        } else {
          issues.push('Vite build configuration may be incomplete');
        }

        // Check for development exclusions
        if (viteConfig.includes('NODE_ENV')) {
          exclusions.push('✅ Environment-based exclusions configured');
        } else {
          issues.push('Environment-based build exclusions not found');
        }
      } else {
        issues.push('Vite configuration file not found');
        configured = false;
      }

      // Check package.json build script
      const packageJsonPath = 'package.json';
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        
        if (packageJson.scripts?.build) {
          exclusions.push('✅ Build script configured in package.json');
        } else {
          issues.push('Build script not found in package.json');
          configured = false;
        }

        // Check for files field (excludes from npm package)
        if (packageJson.files) {
          exclusions.push('✅ Package files field configured for npm exclusions');
        } else {
          exclusions.push('⚠️ Package files field not configured - all files will be included');
        }
      }

      // Check .gitignore for build artifacts
      const gitignorePath = '.gitignore';
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        
        const requiredIgnores = ['dist/', 'build/', '.env.local', '*.log', 'coverage/'];
        for (const ignore of requiredIgnores) {
          if (gitignore.includes(ignore)) {
            exclusions.push(`✅ Ignores ${ignore} in Git`);
          } else {
            issues.push(`Missing .gitignore entry: ${ignore}`);
          }
        }
      }

      // Check for production vs development conditional code
      const serverFiles = this.getAllFiles('server').filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      let hasDevConditionals = false;

      for (const file of serverFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('NODE_ENV') && content.includes('development')) {
          hasDevConditionals = true;
          break;
        }
      }

      if (hasDevConditionals) {
        exclusions.push('✅ Development-specific code conditionals found');
      } else {
        exclusions.push('⚠️ No development conditionals detected');
      }

      console.log(`✅ Section 11.2: Build exclusions verified - ${issues.length} issues found`);
      return { configured, exclusions, issues };
    } catch (error) {
      console.error('❌ Section 11.2: Build exclusions verification failed:', error);
      return { configured: false, exclusions, issues: ['Build exclusions verification failed'] };
    }
  }

  /**
   * 11.3: Scan for unused assets/components
   */
  async scanUnusedAssets(): Promise<{ unusedAssets: string[]; unusedComponents: string[]; sizeSavings: number }> {
    console.log('🔍 Section 11.3: Scanning for unused assets and components...');

    const unusedAssets: string[] = [];
    const unusedComponents: string[] = [];
    let sizeSavings = 0;

    try {
      // Get all asset files
      const assetDirs = ['client/src/assets', 'attached_assets', 'public', 'static'];
      const assetFiles: string[] = [];

      for (const dir of assetDirs) {
        if (fs.existsSync(dir)) {
          const files = this.getAllFiles(dir);
          assetFiles.push(...files);
        }
      }

      // Get all source files to check for usage
      const sourceFiles = [
        ...this.getAllFiles('client/src').filter(f => /\.(tsx?|jsx?)$/.test(f)),
        ...this.getAllFiles('server').filter(f => /\.(tsx?|jsx?)$/.test(f))
      ];

      // Check each asset for usage
      for (const asset of assetFiles) {
        let isUsed = false;
        const assetName = path.basename(asset);
        const assetNameNoExt = path.basename(asset, path.extname(asset));

        // Search for asset references in source files
        for (const sourceFile of sourceFiles) {
          try {
            const content = fs.readFileSync(sourceFile, 'utf-8');
            
            // Check for various import/reference patterns
            if (
              content.includes(assetName) ||
              content.includes(assetNameNoExt) ||
              content.includes(asset.replace('./', '')) ||
              content.includes(`"${assetName}"`) ||
              content.includes(`'${assetName}'`) ||
              content.includes(`\`${assetName}\``)
            ) {
              isUsed = true;
              break;
            }
          } catch (error) {
            // Skip files that can't be read
            continue;
          }
        }

        if (!isUsed) {
          // Check if it's a critical landing page asset
          if (asset.includes('attached_assets/generated_images') && 
              (asset.includes('hero') || asset.includes('feature') || asset.includes('demo'))) {
            console.log(`🔒 Preserving critical landing page asset: ${asset}`);
          } else {
            unusedAssets.push(asset);
            try {
              const stats = fs.statSync(asset);
              sizeSavings += stats.size;
            } catch (error) {
              // Skip size calculation if file stat fails
            }
          }
        }
      }

      // Scan for unused React components
      const componentFiles = sourceFiles.filter(f => 
        f.includes('client/src/components') && /\.(tsx|jsx)$/.test(f)
      );

      for (const componentFile of componentFiles) {
        const componentName = path.basename(componentFile, path.extname(componentFile));
        let isUsed = false;

        // Skip index files and utilities
        if (componentName === 'index' || componentName.includes('utils')) {
          continue;
        }

        // Check if component is imported/used anywhere
        for (const sourceFile of sourceFiles) {
          if (sourceFile === componentFile) continue;

          try {
            const content = fs.readFileSync(sourceFile, 'utf-8');
            
            if (
              content.includes(`import ${componentName}`) ||
              content.includes(`import { ${componentName}`) ||
              content.includes(`<${componentName}`) ||
              content.includes(`${componentName}(`)
            ) {
              isUsed = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (!isUsed) {
          unusedComponents.push(componentFile);
        }
      }

      const totalUnused = unusedAssets.length + unusedComponents.length;
      console.log(`✅ Section 11.3: Unused assets scan completed - ${totalUnused} unused items found`);
      console.log(`💾 Potential size savings: ${(sizeSavings / 1024 / 1024).toFixed(2)} MB`);

      return { unusedAssets, unusedComponents, sizeSavings };
    } catch (error) {
      console.error('❌ Section 11.3: Unused assets scan failed:', error);
      return { unusedAssets, unusedComponents, sizeSavings: 0 };
    }
  }

  /**
   * 11.4: Comprehensive cleanup execution
   */
  async executeComprehensiveCleanup(): Promise<CleanupReport> {
    console.log('🧹 Section 11: Executing comprehensive cleanup...');

    const timestamp = new Date().toISOString();
    
    try {
      // 11.1: Delete test/demo files
      const { deleted: deletedFiles, preserved } = await this.deleteTestDemoFiles();
      
      // 11.2: Verify build exclusions
      const { exclusions: buildExclusions, issues: buildIssues } = await this.verifyBuildExclusions();
      
      // 11.3: Scan for unused assets
      const { unusedAssets, unusedComponents, sizeSavings } = await this.scanUnusedAssets();

      // Generate warnings and recommendations
      const warnings: string[] = [];
      const recommendations: string[] = [];

      if (buildIssues.length > 0) {
        warnings.push(...buildIssues);
      }

      if (unusedAssets.length > 0) {
        recommendations.push(`Consider removing ${unusedAssets.length} unused assets for ${(sizeSavings / 1024 / 1024).toFixed(2)}MB savings`);
      }

      if (unusedComponents.length > 0) {
        recommendations.push(`Review ${unusedComponents.length} potentially unused components`);
      }

      if (deletedFiles.length === 0) {
        recommendations.push('No test/demo files found - codebase already clean');
      }

      // Calculate cleanup score
      let score = 100;
      score -= Math.min(buildIssues.length * 10, 30); // Max -30 for build issues
      score -= Math.min(unusedAssets.length * 2, 20);  // Max -20 for unused assets
      score -= Math.min(unusedComponents.length * 5, 20); // Max -20 for unused components
      
      const cleanupScore = Math.max(score, 60); // Minimum score of 60

      const report: CleanupReport = {
        timestamp,
        deletedFiles,
        unusedAssets,
        buildExclusions,
        cleanupScore,
        warnings,
        recommendations
      };

      console.log(`✅ Section 11: Comprehensive cleanup completed - Score: ${cleanupScore}/100`);
      
      // Log summary
      console.log('📊 Cleanup Summary:');
      console.log(`   - Deleted files: ${deletedFiles.length}`);
      console.log(`   - Unused assets: ${unusedAssets.length}`);
      console.log(`   - Unused components: ${unusedComponents.length}`);
      console.log(`   - Build exclusions: ${buildExclusions.length}`);
      console.log(`   - Warnings: ${warnings.length}`);

      return report;
    } catch (error) {
      console.error('❌ Section 11: Comprehensive cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Helper: Get all files recursively
   */
  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      
      if (this.isExcludedPath(fullPath)) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else if (stat.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Helper: Check if path should be excluded
   */
  private isExcludedPath(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.excludeDirs.some(dir => normalizedPath.includes(`/${dir}/`) || normalizedPath.startsWith(`${dir}/`));
  }

  /**
   * Helper: Check if file is a test or demo file
   */
  private isTestOrDemoFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return this.testFilePatterns.some(pattern => pattern.test(fileName)) ||
           this.devArtifactPatterns.some(pattern => pattern.test(fileName));
  }

  /**
   * Helper: Check if file should be preserved despite being test/demo
   */
  private shouldPreserveFile(filePath: string): boolean {
    // Preserve important test infrastructure and configuration
    const preservePatterns = [
      'playwright.config',
      'jest.config',
      'vitest.config',
      '.lighthouserc',
      'cypress.config'
    ];

    return preservePatterns.some(pattern => filePath.includes(pattern));
  }

  /**
   * 11.5: Generate production build verification
   */
  async verifyProductionBuild(): Promise<{ buildReady: boolean; issues: string[] }> {
    console.log('🏭 Section 11.5: Verifying production build readiness...');

    const issues: string[] = [];

    try {
      // Check package.json build script
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      
      if (!packageJson.scripts?.build) {
        issues.push('No build script found in package.json');
      } else {
        console.log('✅ Build script configured');
      }

      if (!packageJson.scripts?.start) {
        issues.push('No start script found for production');
      } else {
        console.log('✅ Production start script configured');
      }

      // Check for TypeScript configuration
      if (fs.existsSync('tsconfig.json')) {
        console.log('✅ TypeScript configuration present');
      } else {
        issues.push('TypeScript configuration missing');
      }

      // Check for essential production files
      const requiredFiles = [
        'server/index.ts',
        'client/src/App.tsx',
        'shared/schema.ts'
      ];

      for (const file of requiredFiles) {
        if (fs.existsSync(file)) {
          console.log(`✅ Essential file present: ${file}`);
        } else {
          issues.push(`Essential file missing: ${file}`);
        }
      }

      // Check environment example file
      if (fs.existsSync('.env.example')) {
        console.log('✅ Environment example file present');
      } else {
        issues.push('Environment example file missing for deployment');
      }

      const buildReady = issues.length === 0;
      console.log(`✅ Section 11.5: Production build verification completed - ${buildReady ? 'Ready' : 'Issues found'}`);

      return { buildReady, issues };
    } catch (error) {
      console.error('❌ Section 11.5: Production build verification failed:', error);
      return { buildReady: false, issues: ['Build verification execution failed'] };
    }
  }
}