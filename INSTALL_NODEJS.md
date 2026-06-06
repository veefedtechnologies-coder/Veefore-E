# Install Node.js and Run VeeFore

## Step 1: Install Node.js

### Method 1: Official Installer (Recommended for Beginners)

1. **Go to:** https://nodejs.org/
2. **Download:** Click the big green button that says "LTS" (Long Term Support)
3. **Install:** 
   - Open the downloaded file (node-vXX.XX.X.pkg)
   - Click "Continue" through the installer
   - Enter your Mac password when asked
   - Wait for installation to complete

4. **Verify Installation:**
   - Open **Terminal** (Applications → Utilities → Terminal)
   - Type: `node --version`
   - Press Enter
   - You should see something like: `v20.11.0`

### Method 2: Using Homebrew (For Advanced Users)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify
node --version
npm --version
```

---

## Step 2: Run Your VeeFore App

After Node.js is installed, open Terminal and run:

```bash
# 1. Go to your project folder
cd /Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E

# 2. Install all dependencies (this will take 2-5 minutes)
npm install

# 3. Start the development server
npm run dev
```

---

## Step 3: Access Your App

Once the server starts, you'll see:

```
🚀 Server running on http://localhost:5000
```

**Open your browser and go to:** http://localhost:5000

---

## Troubleshooting

### "npm: command not found"
- Node.js is not installed correctly
- Close Terminal and open a NEW Terminal window
- Try `node --version` again

### "Port 5000 already in use"
- Another app is using port 5000
- Run: `lsof -i :5000` to see what's using it
- Or change port in `server/.env`: `PORT=5001`

### "Cannot find module"
- Dependencies not installed
- Run: `npm install` again
- Make sure you're in the correct folder

### "MongoDB connection failed"
- Your MongoDB URI might be incorrect
- Check `server/.env` file
- Make sure MongoDB Atlas is accessible

---

## Quick Check: Is Node.js Installed?

Open Terminal and run:

```bash
node --version
npm --version
```

If both commands show version numbers, you're ready to run the app!

If you see "command not found", Node.js is not installed yet.

---

## Need Help?

1. **Check if Node.js is installed:** `node --version`
2. **Check if you're in the right folder:** `pwd` (should show: `/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E`)
3. **Check if dependencies are installed:** `ls node_modules` (should show many folders)

---

## After Installation

Once your app is running:

1. ✅ Visit http://localhost:5000
2. ✅ Sign up with: `arpitchoudhary128@gmail.com`
3. ✅ Explore the dashboard
4. ✅ Connect your Instagram account
5. ✅ Create your first AI-powered content!

---

**Need more help?** Check the comprehensive analysis document for detailed information about your app.
