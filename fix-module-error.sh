#!/bin/bash

# Fix: "Failed to fetch dynamically imported module" Error
# This script clears all caches and rebuilds the frontend

echo "🔧 Fixing module loading error..."
echo ""

# Step 1: Clear Vite cache
echo "📦 Step 1: Clearing Vite build cache..."
rm -rf client/node_modules/.vite
rm -rf client/dist
rm -rf dist
rm -rf .vite
echo "✅ Vite cache cleared"
echo ""

# Step 2: Rebuild frontend
echo "🔨 Step 2: Rebuilding frontend..."
cd client
npm run build
cd ..
echo "✅ Frontend rebuilt"
echo ""

echo "🎉 Cache cleared and frontend rebuilt!"
echo ""
echo "📋 Next steps:"
echo "1. Clear your browser cache:"
echo "   - Open DevTools (F12)"
echo "   - Go to Application tab"
echo "   - Click 'Clear site data'"
echo "   - Check all boxes and click 'Clear site data'"
echo ""
echo "2. Restart your backend server:"
echo "   - Press Ctrl+C to stop"
echo "   - Run: npm run dev"
echo ""
echo "3. Test in Incognito mode:"
echo "   - Open new Incognito window (Cmd+Shift+N)"
echo "   - Go to: https://app.veefore.com/signin"
echo "   - Click 'Continue with Google'"
echo ""
