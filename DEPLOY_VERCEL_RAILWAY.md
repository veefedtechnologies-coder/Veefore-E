# VeeFore Vercel & Railway Deployment Guide

This guide explains how to deploy the **Clients (Frontend)** to Vercel and the **Servers (Backend)** to Railway.

## 1. Prerequisites

-   **GitHub Repository**: Ensure your code is pushed to GitHub.
-   **Vercel Account**: For deploying the frontend.
-   **Railway Account**: For deploying the backend and MongoDB (if needed).

---

## 2. Deploy Main App (Frontend) to Vercel

1.  **Log in to Vercel** and click **"Add New..."** -> **"Project"**.
2.  **Import** your `Veefore` repository.
3.  **Configure Project**:
    -   **Root Directory**: `Veefore-E` (Click "Edit" next to Root Directory if it selects the top level).
    -   **Framework Preset**: Vite.
    -   **Build Command**: `npm run client:build` (Override the default).
    -   **Output Directory**: `dist/public` (Override the default).
4.  **Environment Variables**:
    -   `VITE_API_URL`: The URL of your Railway Main Server (e.g., `https://veefore-server.up.railway.app/api`).
5.  **Deploy**.

---

## 3. Deploy Admin Panel (Frontend) to Vercel

1.  **Add New Project** in Vercel.
2.  **Import** the *same* repository again.
3.  **Configure Project**:
    -   **Root Directory**: `Veefore-E/admin-panel`.
    -   **Framework Preset**: Vite.
    -   **Build Command**: `npm run client:build`.
    -   **Output Directory**: `dist/client`.
4.  **Environment Variables**:
    -   `VITE_API_URL`: The URL of your Railway Admin Server (e.g., `https://veefore-admin.up.railway.app/api`).
5.  **Deploy**.

---

## 4. Deploy Main Server (Backend) to Railway

1.  **Log in to Railway** and create a **"New Project"**.
2.  **Deploy from GitHub repo**.
3.  **Configure Service**:
    -   Go to **Settings** -> **Root Directory**: Set to `/Veefore-E`.
    -   **Build Command**: `npm run server:build`
    -   **Start Command**: `npm start`
4.  **Variables**:
    -   `NODE_ENV`: `production`
    -   `PORT`: `5000` (or leave default, Railway assigns one).
    -   `DATABASE_URL`: Your MongoDB connection string.
    -   `JWT_SECRET`: Your secret key.
    -   Add other keys from your `.env` file.
5.  **Networking**:
    -   Generate a Domain (e.g., `veefore-server.up.railway.app`). **Copy this URL** and update your Main App Vercel `VITE_API_URL`.

---

## 5. Deploy Admin Server (Backend) to Railway

1.  Add a **New Service** to your Railway project (or a new project).
2.  **Select the same GitHub repo**.
3.  **Configure Service**:
    -   Go to **Settings** -> **Root Directory**: Set to `/Veefore-E/admin-panel`.
    -   **Build Command**: `npm run server:build`
    -   **Start Command**: `npm start`
4.  **Variables**:
    -   `NODE_ENV`: `production`
    -   `PORT`: `8001` (or Railway default).
    -   `MONGODB_URI`: Connection string (can be same as main app or separate DB).
    -   `JWT_SECRET`: Secret key.
5.  **Networking**:
    -   Generate a Domain. **Copy this URL** and update your Admin Panel Vercel `VITE_API_URL`.

---

## Summary of URLs

| Service | Host | Config Location | Variable to Update |
| :--- | :--- | :--- | :--- |
| **Main Client** | Vercel | `Veefore-E/vercel.json` | `VITE_API_URL` (points to Main Server) |
| **Main Server** | Railway | `Veefore-E/package.json` | `CORS_ORIGIN` (allow Main Client URL) |
| **Admin Client**| Vercel | `admin-panel/vercel.json` | `VITE_API_URL` (points to Admin Server) |
| **Admin Server**| Railway | `admin-panel/package.json`| `CORS_ORIGIN` (allow Admin Client URL) |
