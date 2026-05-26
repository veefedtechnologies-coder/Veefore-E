# VeeFore Mobile App

## Overview
This is the React Native / Expo mobile application for VeeFore. It mirrors the core functionality of the web dashboard.

## Prerequisites
- Node.js & npm (already installed)
- Expo Go app on your physical device (iOS/Android) OR Android Studio / Xcode for emulators.

## Setup
1.  Navigate to the mobile directory:
    ```bash
    cd mobile
    ```

2.  Install dependencies (if not already done):
    ```bash
    npm install
    ```

## Running the App
Start the development server:
```bash
npx expo start
```

- **Scan the QR code** with your phone (using Expo Go).
- Press `a` to open in Android Emulator.
- Press `i` to open in iOS Simulator.

## Configuration
Authentication requires the backend server to be running.
- Ensure the main VeeFore server is running on port 3000.
- Update `lib/constants.ts` if testing on a physical device (replace `localhost` with your computer's LAN IP).

## Features
- **Authentication**: Login/Signup with persistent session.
- **Dashboard**: Real-time analytics summary.
- **Content**: View upcoming scheduled posts.
- **Accounts**: Manage connected social accounts.
- **Analytics**: Detailed performance metrics.
- **AI Copilot**: Chat assistant for content ideas.
