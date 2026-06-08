#!/bin/bash

# Fix App Hanging - Remove Manifest and Deploy

echo "🔧 Fixing App Hanging Issue"
echo "============================"
echo ""

cd /Users/arpitchoudhary/Documents/Veefore_v4/Veefore-E

echo "📝 Changes made:"
echo "  - Removed manifest.json"
echo "  - Removed manifest link from index.html"
echo ""

echo "📊 Git status:"
git status --short
echo ""

echo "➕ Adding changes to git..."
git add client/index.html
git add -u  # Adds deleted files

echo ""
echo "💾 Committing changes..."
git commit -m "Fix app hanging: remove manifest.json causing initialization issues"

if [ $? -eq 0 ]; then
    echo ""
    echo "🚀 Pushing to trigger Vercel deployment..."
    git push
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully pushed!"
        echo ""
        echo "📋 Next steps:"
        echo "  1. Wait 2-3 minutes for Vercel to deploy"
        echo "  2. Visit https://veefore.com"
        echo "  3. Do a hard refresh (Cmd+Shift+R or Ctrl+Shift+R)"
        echo "  4. App should now work without hanging!"
        echo ""
        echo "🔍 Monitor deployment:"
        echo "  https://vercel.com/dashboard"
    else
        echo ""
        echo "❌ Push failed. Check your git remote configuration."
    fi
else
    echo ""
    echo "❌ Commit failed or no changes to commit."
fi
