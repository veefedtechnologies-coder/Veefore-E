I am migrating this app from Replit to Cursor IDE.

Please generate a detailed README.md and .env.example for this project. Cover everything from scratch to advanced functionality, including AI, payment, and social integrations.

📝 1. README.md CONTENT STRUCTURE:

Include these sections in detail:

1. App Overview:

App name

What the app does

Target users

2. Features:

List of features (e.g., AI content generation, video creation, social posting, analytics, etc.)

Mention if any features are locked or plan-based

Role-based access or credit system logic

3. Tech Stack:

Frontend frameworks used (e.g., React, Next.js, etc.)

Backend setup (e.g., Node.js, Express)

Database (e.g., MongoDB or Firebase)

AI services (e.g., OpenAI, RunwayML, ElevenLabs, etc.)

Social media integrations (Instagram, YouTube, X/Twitter, etc.)

Payment gateway used (Stripe, Razorpay, etc.)

4. Folder Structure:

Explain key folders like:

/api

/routes

/services

/middleware

/utils

/frontend (if separated)

Any AI or social-specific directories

5. Environment Variables:

List and describe all required process.env or import.meta.env variables

Mention where they are used (e.g., OpenAI_KEY → in ai/generator.js)

Also generate .env.example

6. AI Integrations (Full Breakdown):

Which AI tools are used (e.g., GPT-4, SDXL, Runway Gen-2, ElevenLabs)

For each AI service:

Where it is implemented

How requests are triggered (e.g., frontend button → backend route → external API)

What the inputs/outputs are

How response is used in app (e.g., video URL, captions, thumbnails)

7. Social Media Integrations:

Which platforms are integrated: Instagram, YouTube, Twitter/X

What scopes/permissions are required

Which SDK or API is used (e.g., Meta Graph API)

How OAuth or access token flow is implemented

Where the API calls are made (e.g., routes/instagram.js)

What functionality is covered: auto post, auto comment reply, schedule, etc.

8. Payment System:

Payment provider used (e.g., Stripe, Razorpay)

Describe how subscriptions or credits work

Explain the payment flow:

Where frontend calls backend

How webhooks are handled

How payment success updates user status or credits

File/folder references for payments

9. Credit & Subscription System:

How credits work (per feature or per second for video)

Free trial logic

Booster or fallback logic

Subscription plans and what each plan unlocks

10. Running the App Locally:

Step-by-step instructions to run it outside Replit:

Clone the project

Create .env file using .env.example

Install dependencies

Start server/frontend

Port to run the backend and frontend

Build tools or scripts if any

11. Deployment Recommendations:

How to deploy this on Vercel, Render, or Railway

Which environment variables are required on deployment

Tips for rate limits or background jobs

12. License / Author Info (if any)

🧾 2. .env.example CONTENT:

List all environment variables used in the app

Add sample placeholder values

Include:

API keys (OpenAI, Runway, ElevenLabs, Firebase, etc.)

OAuth client IDs/secrets for social logins

Payment gateway keys (test + live if relevant)

Any custom backend settings (e.g., BASE_URL, PORT)

Credit or plan config variables (if used in .env)

📦 3. CLEANUP INSTRUCTIONS:

Tell me which files/folders are Replit-specific and should be deleted when moving to Cursor:

.replit, .replit.nix, .config/

Any secrets UI or internal tools

Also output full instructions on:

Setting up local environment in Cursor

Refactoring any Replit-specific hosting logic (like PORT = process.env.PORT || 3000)

📁 FORMAT:

Output README.md as a markdown block

Output .env.example as a code block

Output file/folder cleanup list

Output step-by-step local run instructions for Cursor

Make it accurate, beginner-friendly, production-ready, and professional. This should be ready to go as a public repo or Cursor project.