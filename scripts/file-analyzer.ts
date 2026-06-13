/**
 * File Analyzer Script - Measures baseline metrics for codebase refactoring
 * This script uses TypeScript AST parser to analyze file size, complexity, and code duplication
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { glob } from 'glob';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface FileMetrics {
  filePath: string;
  lineCount: number;
  fileSize: number; // in bytes
  functions: number;
  classes: number;
  complexity: number;
  category: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface CodeDuplicationMetrics {
  file1: string;
  file2: string;
  similarityPercentage: number;
  duplicatedLines: number;
}

interface BaselineReport {
  timestamp: string;
  totalFiles: number;
  filesByCategory: {
    critical: FileMetrics[];
    high: FileMetrics[];
    medium: FileMetrics[];
    low: FileMetrics[];
  };
  averageFileSize: number;
  totalBundleSize: number;
  codeDuplicationPercentage: number;
  topLargestFiles: FileMetrics[];
  duplicationMatches: CodeDuplicationMetrics[];
}

/**
 * Calculate cyclomatic complexity of a TypeScript file
 */
function calculateComplexity(sourceFile: ts.SourceFile): number {
  let complexity = 1; // Base complexity

  function visit(node: ts.Node) {
    // Increment complexity for control flow statements
    if (
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isCaseClause(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCatchClause(node) ||
      (ts.isBinaryExpression(node) && 
        (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
         node.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    ) {
      complexity++;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return complexity;
}

/**
 * Count functions and classes in a TypeScript file
 */
function countDeclarations(sourceFile: ts.SourceFile): { functions: number; classes: number } {
  let functions = 0;
  let classes = 0;

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      functions++;
    }
    if (ts.isClassDeclaration(node)) {
      classes++;
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return { functions, classes };
}

/**
 * Analyze a single file and return metrics
 */
async function analyzeFile(filePath: string): Promise<FileMetrics> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const lineCount = lines.length;
  const fileSize = fs.statSync(filePath).size;

  // Parse TypeScript/JavaScript file
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const { functions, classes } = countDeclarations(sourceFile);
  const complexity = calculateComplexity(sourceFile);

  // Categorize file
  let category: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  if (lineCount > 1000) {
    category = 'CRITICAL';
  } else if (lineCount >= 500) {
    category = 'HIGH';
  } else if (lineCount >= 300) {
    category = 'MEDIUM';
  } else {
    category = 'LOW';
  }

  return {
    filePath,
    lineCount,
    fileSize,
    functions,
    classes,
    complexity,
    category
  };
}

/**
 * Simple code duplication detection using line-by-line comparison
 */
function detectDuplication(files: FileMetrics[]): CodeDuplicationMetrics[] {
  const duplications: CodeDuplicationMetrics[] = [];
  
  // This is a simplified version - in production, use a proper duplication detection library
  // For now, we'll just identify potential duplicates based on similar file patterns
  
  return duplications;
}

/**
 * Scan the codebase and generate baseline metrics report
 */
async function generateBaselineReport(): Promise<BaselineReport> {
  console.log('🔍 Scanning codebase...\n');

  const patterns = [
    'client/src/**/*.{ts,tsx}',
    'server/**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.test.ts',
    '!**/*.spec.ts',
    '!**/archive/**'
  ];

  const files = await glob(patterns, {
    cwd: path.resolve(__dirname, '..'),
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*', '**/archive/**']
  });

  console.log(`📁 Found ${files.length} files to analyze\n`);

  const allMetrics: FileMetrics[] = [];

  for (const file of files) {
    try {
      const metrics = await analyzeFile(file);
      allMetrics.push(metrics);
    } catch (error) {
      console.error(`Error analyzing ${file}:`, error);
    }
  }

  // Categorize files
  const critical = allMetrics.filter(m => m.category === 'CRITICAL');
  const high = allMetrics.filter(m => m.category === 'HIGH');
  const medium = allMetrics.filter(m => m.category === 'MEDIUM');
  const low = allMetrics.filter(m => m.category === 'LOW');

  // Calculate statistics
  const totalSize = allMetrics.reduce((sum, m) => sum + m.fileSize, 0);
  const averageFileSize = totalSize / allMetrics.length;

  // Get top 20 largest files
  const topLargestFiles = allMetrics
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 20);

  // Detect duplication (simplified)
  const duplicationMatches = detectDuplication(allMetrics);
  const codeDuplicationPercentage = 0; // Placeholder - would need proper implementation

  const report: BaselineReport = {
    timestamp: new Date().toISOString(),
    totalFiles: allMetrics.length,
    filesByCategory: {
      critical,
      high,
      medium,
      low
    },
    averageFileSize: Math.round(averageFileSize),
    totalBundleSize: totalSize,
    codeDuplicationPercentage,
    topLargestFiles,
    duplicationMatches
  };

  return report;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Print the baseline report to console and save to file
 */
async function printAndSaveReport(report: BaselineReport) {
  console.log('📊 BASELINE PERFORMANCE REPORT');
  console.log('═'.repeat(60));
  console.log(`Generated: ${new Date(report.timestamp).toLocaleString()}\n`);

  console.log('📈 Overall Statistics:');
  console.log(`  Total Files Analyzed: ${report.totalFiles}`);
  console.log(`  Average File Size: ${report.averageFileSize.toLocaleString()} lines`);
  console.log(`  Total Bundle Size: ${formatBytes(report.totalBundleSize)}`);
  console.log(`  Code Duplication: ${report.codeDuplicationPercentage.toFixed(2)}%\n`);

  console.log('🎯 Files by Category:');
  console.log(`  🔴 CRITICAL (>1000 lines): ${report.filesByCategory.critical.length} files`);
  console.log(`  🟠 HIGH (500-1000 lines): ${report.filesByCategory.high.length} files`);
  console.log(`  🟡 MEDIUM (300-500 lines): ${report.filesByCategory.medium.length} files`);
  console.log(`  🟢 LOW (<300 lines): ${report.filesByCategory.low.length} files\n`);

  console.log('📋 Top 10 Largest Files (Highest Priority):');
  report.topLargestFiles.slice(0, 10).forEach((file, index) => {
    const relativePath = file.filePath.replace(process.cwd(), '');
    console.log(`  ${index + 1}. ${relativePath}`);
    console.log(`     ${file.lineCount} lines | ${file.functions} functions | ${file.classes} classes | Complexity: ${file.complexity}`);
  });

  // Save report to JSON file
  const reportPath = path.resolve(__dirname, '../reports/baseline-metrics.json');
  await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${reportPath}`);

  // Save human-readable markdown report
  const mdReport = generateMarkdownReport(report);
  const mdPath = path.resolve(__dirname, '../reports/baseline-metrics.md');
  await fs.promises.writeFile(mdPath, mdReport);
  console.log(`✅ Markdown report saved to: ${mdPath}`);
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: BaselineReport): string {
  let md = `# Baseline Metrics Report\n\n`;
  md += `**Generated:** ${new Date(report.timestamp).toLocaleString()}\n\n`;
  md += `## Overall Statistics\n\n`;
  md += `- **Total Files Analyzed:** ${report.totalFiles}\n`;
  md += `- **Average File Size:** ${report.averageFileSize.toLocaleString()} lines\n`;
  md += `- **Total Bundle Size:** ${formatBytes(report.totalBundleSize)}\n`;
  md += `- **Code Duplication:** ${report.codeDuplicationPercentage.toFixed(2)}%\n\n`;

  md += `## Files by Category\n\n`;
  md += `| Category | Count | Description |\n`;
  md += `|----------|-------|-------------|\n`;
  md += `| 🔴 CRITICAL | ${report.filesByCategory.critical.length} | Files >1000 lines |\n`;
  md += `| 🟠 HIGH | ${report.filesByCategory.high.length} | Files 500-1000 lines |\n`;
  md += `| 🟡 MEDIUM | ${report.filesByCategory.medium.length} | Files 300-500 lines |\n`;
  md += `| 🟢 LOW | ${report.filesByCategory.low.length} | Files <300 lines |\n\n`;

  md += `## Top 20 Largest Files (Refactoring Priority)\n\n`;
  md += `| # | File | Lines | Functions | Classes | Complexity |\n`;
  md += `|---|------|-------|-----------|---------|------------|\n`;
  
  report.topLargestFiles.forEach((file, index) => {
    const relativePath = file.filePath.replace(process.cwd(), '').substring(1);
    md += `| ${index + 1} | ${relativePath} | ${file.lineCount} | ${file.functions} | ${file.classes} | ${file.complexity} |\n`;
  });

  md += `\n## Critical Files Requiring Immediate Refactoring\n\n`;
  report.filesByCategory.critical
    .sort((a, b) => b.lineCount - a.lineCount)
    .forEach((file) => {
      const relativePath = file.filePath.replace(process.cwd(), '').substring(1);
      md += `### ${relativePath}\n`;
      md += `- **Lines:** ${file.lineCount}\n`;
      md += `- **Functions:** ${file.functions}\n`;
      md += `- **Classes:** ${file.classes}\n`;
      md += `- **Cyclomatic Complexity:** ${file.complexity}\n`;
      md += `- **Category:** ${file.category}\n\n`;
    });

  return md;
}

/**
 * Main execution
 */
async function main() {
  try {
    const report = await generateBaselineReport();
    await printAndSaveReport(report);
    console.log('\n✨ Baseline metrics analysis complete!');
  } catch (error) {
    console.error('❌ Error generating baseline report:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();

export { generateBaselineReport, analyzeFile, type FileMetrics, type BaselineReport };
