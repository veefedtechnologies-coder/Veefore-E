# How to Free Port 5000 on macOS

## Problem
Port 5000 is being used by macOS **ControlCenter** (AirPlay Receiver), preventing your VeeFore app from starting.

Error: `listen EADDRINUSE: address already in use 0.0.0.0:5000`

## Solution: Disable AirPlay Receiver

### Option 1: Disable AirPlay Receiver (Recommended)

1. **Open System Settings** (or System Preferences on older macOS)
   - Click the Apple menu () → System Settings

2. **Go to General → AirDrop & Handoff**
   - On older macOS: **Sharing**

3. **Turn OFF "AirPlay Receiver"**
   - Uncheck or toggle off "AirPlay Receiver"
   - This will free up port 5000

4. **Verify port is free:**
   ```bash
   lsof -i:5000
   ```
   Should return nothing or "No such file or directory"

### Option 2: Use a Different Port (Quick Fix)

If you don't want to disable AirPlay, you can run your app on a different port:

```bash
# Run on port 3000 instead
PORT=3000 npm run dev
```

Then access your app at: http://localhost:3000

### Option 3: Kill ControlCenter Process (Temporary)

**Warning:** This is temporary - ControlCenter will restart!

```bash
# Find the process
lsof -ti:5000

# Kill it (replace PID with actual number)
kill -9 <PID>
```

This only works until macOS restarts the process.

---

## After Disabling AirPlay Receiver

Once you've disabled AirPlay Receiver:

1. **Verify port 5000 is free:**
   ```bash
   lsof -i:5000
   ```

2. **Change PORT back to 5000 in your .env:**
   ```bash
   cd /Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E
   sed -i.bak 's/^PORT=3000/PORT=5000/' server/.env
   ```

3. **Start your app:**
   ```bash
   npm run dev
   ```

4. **Access your app:**
   - Open browser: http://localhost:5000

---

## Why This Happens

- **macOS Monterey (12) and later** uses port 5000 for AirPlay Receiver by default
- This is a system service that allows your Mac to receive AirPlay streams
- Many developers face this issue

## Alternative Ports

If you need AirPlay and can't disable it, consider using these ports instead:
- **3000** - Common for React/Node apps
- **8000** - Common alternative
- **8080** - Another popular choice
- **4000** - Less commonly used

---

## Quick Commands

```bash
# Check what's using port 5000
lsof -i:5000

# Check what's using port 3000
lsof -i:3000

# Kill all node processes
pkill -9 node

# Start app on specific port
PORT=5000 npm run dev
```

---

**Recommendation:** Disable AirPlay Receiver if you don't use it. Most developers don't need this feature and it conflicts with common development ports.
