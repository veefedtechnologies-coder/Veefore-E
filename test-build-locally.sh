#!/bin/bash

# Test Vercel Build Locally
# This script runs the same build command that Vercel will use

echo "🧪 Testing Vercel Build Locally"
echo "==============================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist/public
echo ""

# Run the same command Vercel will use
echo "🔨 Running: npm run client:build"
echo "This is the same command Vercel will execute."
echo ""

npm run client:build

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build succeeded!"
    echo ""
    echo "📦 Build output location:"
    ls -lah dist/public | head -10
    echo ""
    echo "🎉 The build works! You can now push to trigger Vercel deployment."
    echo ""
    echo "To deploy:"
    echo "  git add package.json"
    echo "  git commit -m 'Fix Vercel build: remove test file type checking'"
    echo "  git push"
else
    echo ""
    echo "❌ Build failed!"
    echo ""
    echo "The build failed locally, so it will also fail on Vercel."
    echo "Fix the errors shown above before pushing."
    echo ""
    echo "Common issues:"
    echo "  - TypeScript errors in source files (not test files)"
    echo "  - Missing dependencies"
    echo "  - Vite config issues"
fi
