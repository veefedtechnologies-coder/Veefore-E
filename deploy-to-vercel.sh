#!/bin/bash

# Deploy to Vercel - Fix Script
# This script commits the vercel.json fix and pushes to trigger deployment

echo "📦 Vercel Deployment Fix"
echo "========================"
echo ""

# Check if we're in the right directory
if [ ! -f "vercel.json" ]; then
    echo "❌ Error: vercel.json not found. Please run this script from the project root."
    exit 1
fi

# Show current git status
echo "📊 Current Git Status:"
git status --short
echo ""

# Add the fixed vercel.json
echo "➕ Adding vercel.json to git..."
git add vercel.json package.json
echo ""

# Commit the changes
echo "💾 Committing changes..."
git commit -m "Fix Vercel build: align vercel.json with Production Overrides

- Updated vercel.json buildCommand to use npm run client:build
- Set outputDirectory to dist/public to match vite.client.config.ts
- This resolves the 'Missing script: client:build' error"
echo ""

# Push to trigger Vercel deployment
echo "🚀 Pushing to remote repository..."
git push
echo ""

echo "✅ Done! Vercel will now auto-deploy with the correct configuration."
echo ""
echo "📋 Next steps:"
echo "1. Go to your Vercel dashboard"
echo "2. Check the deployment status"
echo "3. Monitor the build logs"
echo ""
echo "If the build fails, check VERCEL_FINAL_FIX.md for troubleshooting steps."
