🎯 Replit AI Agent Prompt: Full Admin Panel (Frontend + Backend + UI + Roles)

You are an expert full-stack engineer.

Create a professional, premium-grade admin panel for a SaaS application called Veefore. Use the following stack:

Backend: Node.js (Express.js) + TypeScript

Database: MongoDB Atlas

Frontend: React + TypeScript + Tailwind CSS

Authentication: JWT + SSO (Google, GitHub) + 2FA (TOTP)

Folder Structure: Modular with folders for routes, controllers, services, models, middlewares, utils

Frontend UI: Premium dashboard UI with sidebar, responsive layout, role-based component rendering, mobile-friendly

UI Color Theme: Use a clean black and white color scheme throughout the admin panel. Do not use gradients or vibrant colors. If needed for enhanced visual clarity or UI hierarchy (e.g., alert badges, CTA buttons), use subtle accent colors sparingly.

✅ Required Features (Backend APIs + Frontend Views)

1. Admin Authentication

JWT login and signup for admin

Admin roles: superadmin, support, billing, moderator, product, marketing, developer, sales, legal, aiops

SSO login via Google and GitHub (OAuth2)

Enable/disable Two-Factor Authentication (TOTP)

Store 2FA secret encrypted

Magic Link login

Track login IP, device fingerprint, and show alerts on new location login

Allow IP whitelisting per admin

Admin login audit log stored in DB



2. Role-Based Access Control (RBAC)

Middleware to restrict routes based on admin roles

Dynamic sidebar and UI per role (show only allowed modules)

RBAC permission schema in DB

Super Admin can create custom roles by entering role name, description, and selecting permissions from a checklist

Permissions include access to modules like: Users, Refunds, Subscriptions, Notifications, Popups, Logs, Analytics, etc. and other permission which have in the app

Created roles are stored in the DB and dynamically applied to new users

Admin panel displays all existing roles with ability to edit/delete

Role edit includes updating permissions

New roles appear in role assignment dropdown during onboarding

3. Admin Role Assignment & Onboarding Workflow

Super Admin can assign a predefined role to a new team member from a dropdown

Once assigned, system generates a unique user ID and password for the new admin

Auto-email the credentials and login link to the user's company email

Email includes an expiry-based invitation link (e.g., valid for 48 hours)

Admin enters company email for verification

System performs domain match & OTP check

If verified, mark status as pending approval

Super Admin or designated approver can manually approve onboarding

After approval, user proceeds with login

Security check includes IP/location validation and optional 2FA setup

On success, role-based UI and access are activated

Add admin invite management dashboard:

Track all pending, active, and expired invites

Resend email invitation or regenerate link

View approval status and approval history

Set invite expiration default in settings (e.g. 24h, 48h, 72h)

Automatically notify designated approvers (via email or in-app) when a new invite is pending approval

Include an approval queue with filters:

Filter by role, team, email domain, invite status

Search by email or name

Sort by request date or expiration

Approve/reject in bulk or individually (via email or in-app) when a new invite is pending approval

4. ✅ Analytics Features to Add (For Super Admin, Admin and Team with Permission):

📊 Revenue & Sales
Total Revenue (daily, monthly, all-time)

Revenue Breakdown by:

Subscription plans

Credit packs

Add-ons

Refunded Amount (and refund reason if available)

👤 Customer Metrics
Total Users / Customers

New Signups (daily, monthly)

Churned users (if applicable)

Active vs Inactive users

Top spenders

⚡ Credit & Feature Usage
Total Credits Purchased

Total Credits Spent (with filters by feature)

Most Used Features (e.g. AI writing, repurposing, thumbnail maker)

Credits Spent Per Feature / Module

Add-ons Purchased Count and revenue from each

🤖 AI Model Usage (by model)
Total OpenAI tokens used (gpt-4o, whisper, dall-e, etc.)

Total Vapi minutes used - this is for our company usage because we use vapi ai agent for customer care calling agent

Total transcription hours used

Other API/AI costs (optional breakdown if available)

💰 Plan Distribution
Number of users on:

Free plan

Each Paid plan (Starter, Pro, etc.)

Upgrade / downgrade trends

🔐 Access Control (RBAC)
Super Admin: Full access to everything.

Admin: Access only if granted via role permissions.

Team Members: Only if viewAnalytics: true permission is enabled in their RBAC policy.

5. Advanced Team Hierarchy & Admin Assignment

Super Admin has access to assign and manage admins according to organizational level or team hierarchy

Each role (Admin or Team Member) can be assigned a Level Tag (e.g., Level 1: Senior Lead, Level 2: Manager, Level 3: Associate)

Admin UI includes:

Hierarchical view of roles with drag-and-drop reordering

Level-based permission groupings for display and access control

When Super Admin assigns a new Admin:

Choose Role → Assign Level → Assign Team

Generate unique login credentials and auto-email

Admin (with permission) can:

Create team members → Assign level (e.g., L2, L3)

Reassign, promote, or resign a member from their role

View team structure as nested hierarchy

Team Leader visibility:

Higher-level admins can manage/view lower-level team members

Lower levels have limited visibility into peer/higher levels

Level-based restrictions applied to:

Ticket escalation rights

Refund approvals

Content moderation override rights

Report access and data views

Admin dashboard shows:

Org chart style team viewer

Summary of active members per level and team

Quick buttons: Promote, Demote, Reassign, Resign

Logs of all team actions (add, remove, level change, access toggle)

Alert Super Admin on any reassignment/resignation

UI supports search/filter by level, team, and role

6. User Management Module

GET /users → list all users

GET /users/:id → view full profile (email, phone, social handles)

PATCH /users/:id → update user info

POST /users/:id/ban → ban user

POST /users/:id/unban → unban user

Allow export of user profile (CSV/JSON)

Show social media performance (followers, engagement, OAuth-connected)

7. Refund Management

User-Facing Flow:

End users do not directly initiate refund in UI

Instead, they are prompted to send refund requests via email to support@veefore.com

Once email is received, a support ticket is automatically generated and visible in the ticket module

The system sends an auto-email acknowledgment to the user confirming ticket receipt

The refund team reviews the ticket, and based on configured eligibility rules, a manual or automatic refund is initiated

The ticket system shows real-time status updates linked to refund resolution (e.g., "Refund approved", "Refund issued")

Admins can configure SLA timers for ticket resolution (e.g., respond within 24h)

Trigger escalation alerts if SLA is breached (e.g., notify team lead or Super Admin)

Admins can configure eligibility criteria in settings:

Refund window (e.g., within 7/14 days)

Usage thresholds (used under 25%)

Risk status (not flagged)

Internal Admin Refund Handling:

POST /refund → process refund with transactionId, amount, reason, mode

Support full or partial refund

Allow refund method selection (original payment method, wallet, bank transfer)

Admin can request manual refund or trigger automatic if criteria met

Eligibility check:

Within return/refund window (7, 14, or custom days)

Check for flagged/high-risk user

Subscription or purchase status

Multi-step approval for large refunds

Add refund reason templates and custom notes

Attach evidence (e.g., screenshot, invoice)

Store all refund activity logs with:

Status: requested, approved, denied, refunded

Action by: admin ID and timestamp

Reason and notes

UI includes:

Filterable/refinable refund log (by date, status, user, admin)

Analytics: Refund ratio, most refunded products/plans

Export to CSV/JSON

Auto-alert for refund spikes (for finance/compliance team)

Refund history visible in user profile panel

Refund API includes secure validation of amount, access scope, and IP logs

After successful refund:

❌ Cancel any active subscriptions

🔄 Downgrade the user to free or previous plan

💳 Revoke paid feature access

🎁 Remove any promotional credits or bonuses linked to the refunded transaction

📜 Log all these service changes in the audit log

🔐 Update user permission schema to reflect new access rights

8. Notification System

POST /notify → send notification to user(s)

Web notification + Firebase/WebSocket + popup support

Schedule notifications

Targeting by segment or user ID

Notification history log

9. Popup Notification Management

POST /popup → Create popups with rules

Support scheduling (start/end), displayOn page (e.g., home)

A/B test support for popups

Show analytics: impressions, clicks

10. Subscription Management

🧮 Coupon Usage Limits & Tier Restrictions:

Limit coupon redemption per user, per plan, or per user segment

Restrict coupons to users with specific usage tier (e.g., Free users only, Enterprise only)

Configure minimum purchase threshold for eligibility

Option to prevent coupon stacking with other offers or sales

🚫 Coupon Stacking Rules:

Define rules to allow or block stacking of multiple discounts

Admin can whitelist combinations or restrict to one active coupon

UI warning for users trying to apply conflicting coupons

Stacking logic applied on checkout and during invoice generation

🔔 Real-time Coupon Redemption Alerts:

Notify admin or campaign owner via in-app alert or email when coupon is redeemed

Alerts include: user email, coupon code, discount applied, timestamp

Filter alert frequency (e.g., alert every 10 redemptions or for VIP users only)

📩 Auto-Expiry Notifications for Coupons:

Notify admin before a coupon expires (e.g., 24h or 3 days before)

Include link to extend, clone, or archive coupon

🔗 Coupon QR Code Generator:

Generate scannable QR code for each coupon

QR opens app or webpage with coupon pre-filled

Ideal for offline promotions, events, or referral printouts

📊 Coupon Analytics & Campaign Management:

Dashboard showing coupon performance: usage count, conversion rate, revenue influenced

Group coupons under named campaigns (e.g., 'Diwali Sale', 'New Year Blast')

Compare campaign performance across timeframes

Visualizations for most-used coupons, discount type impact, revenue uplift

Segment-based coupon redemption tracking (e.g., new users, enterprise clients)

🔁 Coupon Automation & Suggestions:

System auto-suggests applicable coupons to users at checkout based on:

User history (new/returning)

Region, plan interest, usage behavior

Cart size or credits selected

Admins can enable/disable auto-suggest logic per campaign

🔐 Coupon Permissions Control:

Super Admin can grant or restrict coupon generation rights per role

Admin can choose scope: global or limited to own role/team

Admins and their teams can edit credit pricing and add-on pricing dynamically

Update price per credit pack or feature usage tier

Enable or disable specific add-ons from admin panel

Track price history and update reasons in changelog

Coupon & Discount System:

Super Admin can enable/disable coupon permissions per role

Admins can create custom coupons with:

Coupon code (e.g., WELCOME50)

Type: flat or percentage discount

Target: all users or specific user(s) or segments

Scope: entire plan, only credit purchases, only add-ons

Expiry date (auto-disable after deadline)

Max usage limit (per user or global)

Internal-only or public

Redeemable via UI or manual apply by admin

Coupon usage logs with timestamp, user, and admin who created/applied

Auto-suggest active coupons in subscription UI or during checkout

Allow direct manual discount by admin (apply to individual user or all user)

Update pricing directly for selected user or all user (temporary override)

Give admin and their team if they have permission to select which they have to update pricing all or for selected user

Add comment for audit log and tracking

Auto-remove override on renewal if configured

Admin panel UI:

Coupon Generator:

Form with fields: Code, Type (Flat/Percent), Target (user/segment), Scope (subscription/add-ons/credits), Expiry, Usage Limit

Toggle: Internal-only / Public

Toggle: Enable stacking / Disallow stacking

Select: Apply to which pricing plan(s) or region

Multi-select: Applicable user segments / tiers

Toggle: Allow manual override for individual user or for all users

Date picker for expiry

Live preview of coupon card with estimated discount

Button: "Generate Coupon"

Button: "Test Coupon on User" (launch test modal)

Coupon Dashboard:

Search bar (by code/user/segment)

Filters: Status (active, expired), Usage stats, Campaign, Redemption range

Columns: Code, Type, Scope, Redeemed, Expiry, Status, Creator, Usage Tier

Bulk Actions: Activate, Expire, Clone, Delete

Row Actions: Edit, Extend, Archive, Download QR, View logs

Campaign Management UI:

Create/edit coupon campaigns with goals

Group coupons into promo campaigns

Performance: Total redemptions, Revenue, Avg. discount

Toggle auto-suggest enable/disable per campaign

Redemption Alerts Panel:

Toggle alerts on/off

Choose delivery method: in-app, email, Slack webhook

Alert condition: real-time, every X uses, VIP only

Expiry Notifications Settings:

Set alert window (e.g., 3 days before expiry)

Auto-reminder message builder

QR Generator:

Generate and preview coupon QR code

Format options: PNG, SVG, Web QR preview

Embed code for sharing or print

Permissions Toggle Panel:

Role-wise permission matrix (Create / Edit / Delete / Assign / View)

Toggle coupon creation for non-superadmin roles

Option to assign specific scopes per role (Add-on only, Subscriptions only)

Analytics View:

Bar chart: Coupon redemptions by day/week

Pie chart: Redemption share by coupon type

Leaderboard: Top-performing campaigns and users

Revenue impact from coupons, grouped by time/segment

Automation Controls:

Enable coupon auto-suggest (toggle)

Rule builder UI: if "Cart value > ₹1000" and "User is new", suggest "WELCOME10"

Preview of auto-suggest rules

Button: Test rules on mock user

Enable coupon auto-suggest

Condition builder: usage tier, cart value, geography

Toggle auto-apply during checkout

Region-Based Pricing Support:

Admin can define pricing by country or region (e.g., US, EU, India, SEA)

Set region-specific prices for monthly and annual plans

Configure currency (USD, EUR, INR) per region

Optionally apply tax rules or GST/VAT by region

Fallback global price if region-specific not defined

Display region pricing table in admin UI

Detect user region by IP or billing address

API auto-selects price variant based on user location

Admin can override region pricing per enterprise account

POST /subscription/update → change user plan

Admin panel includes a Subscription Plan Editor:

Create or update plan names (e.g., Starter, Growth, Enterprise)

Set monthly and annual pricing independently

Configure plan features, credit limits, and add-ons

Enable/disable plans or mark as internal-only

Apply plan changes instantly or schedule for future

Save draft versions before publishing

Maintain plan version history with audit trail

POST /plans → create new pricing plans

PATCH /plans/:id → update pricing, features, duration (monthly/yearly)

GET /plans → fetch all available pricing plans

Display changelog and upcoming changes to existing users in UI

Support custom offers, coupons, and one-time discounts

Pause/resume subscription with schedule

Trial extension, credit tracking, and limited-time bonus plans

Subscription history log with timestamps, admin actions, and reasons

Allow admins to:

Manually assign enterprise/custom plans

Switch plans instantly or on renewal

Revoke access for failed payments

Set usage limits per plan (API quota, credits, seats)

Enable plan upgrade/downgrade request queue

Schedule subscription changes (e.g., downgrade after trial)

Admin UI includes:

Plan selector dropdown + custom plan builder

Activity log per subscription

Subscription status badges (active, trialing, paused, expired)

Export subscriptions CSV

Integrate with Stripe or Razorpay for billing status sync

Alert system for expiring trials, overdue payments, or overuse

11. Support Tickets + Live Chat

Admin can configure one or more support email addresses (e.g., support@veefore.com, help@veefore.com)

System uses email-to-ticket parser to monitor inbox

When an email is received:

Automatically create a support ticket

Auto-assign category based on email address (e.g., refund@ → Refunds team)

Attach the email content, metadata (from, subject, body, attachments)

Send auto-response to user confirming ticket creation with ticket ID

Apply default status (open) and priority based on subject/body

Link ticket to user profile if email matches existing account

Log full email history under the ticket

Create SLA timer and track time since email received

AI auto-classifier: predict priority and category using ML model (e.g., low/medium/high + billing/support/compliance)

Language detector + translation: auto-detect language, translate to admin’s language (if foreign)

AI-generated reply suggestions: based on ticket content, the system offers 2–3 prewritten smart replies for agents to choose or edit (using GPT-style AI)

Auto-reply (optional): Admins can enable auto-send for AI-generated replies for low-priority tickets. Can be toggled globally or per category. All auto-replies are logged and marked with AI tag in thread

💬 Enhanced Reply Options for Admin Team:

Admins (or their team if permitted by role) can reply to tickets using:

Reply as team leader name (shows "Veefore Team – John Doe")

Reply using a selected sender email (e.g., support@veefore.com, billing@veefore.com, etc.)

System supports dynamic email routing so replies are sent from the selected outbound email ID

Admin UI includes dropdown to select the reply identity:

Default: same as the inbox receiving the original email

Optional: select alternate mail ID (configured in settings)

AI-powered response generator:

Shows 2–3 smart reply options (GPT-style)

Option to edit suggested replies before sending

Option to write manual reply using rich-text editor

Toggle to choose auto-send (low priority only) or manual approval

All replies are sent via SMTP or transactional mail API from selected sender ID

System logs full reply audit trail with:

Sender identity

Response type (AI/manual/template)

Admin name and role

Timestamp

Ticket status after reply

Attachments supported in replies (image, file, PDF)

Smart macros supported in reply templates (e.g., {{user_name}}, {{ticket_id}})

Admin reply UI includes:

Dropdown to select "Reply As" identity (team, admin, email)

Toggle for "AI Suggestion / Manual Reply"

Smart editor with formatting, saved replies, attachments

Send button shows selected sender address

Email log viewer (sent history + bounce/backlog tracking)

Admin UI:

Email Inbox Config Panel

Add/remove monitored support email addresses

Set rule: which category or team each email maps to

Test email webhook connection

Inbound Email Log

View raw email history and processing status

Manual retry or parse failed emails

Ticket Generator Settings

Default ticket priority

Auto-response message editor

Link default admin or team for each support email

Admin can view, filter, reply to support tickets

Assign tickets to team (support, billing, moderation)

Upload attachments (image, PDF, audio)

Real-time chat (WebSocket or polling)

UI with threaded messages, SLA tracking, escalation tags

SLA breach auto-escalation with alert to supervisors

Ticket statuses: open, in-progress, on hold, escalated, resolved, closed

Support ticket categories and sub-categories

Priority levels: low, medium, high, urgent

Internal notes (private between admins)

Email auto-responses with dynamic templates

Ticket search by email, tag, status, assignee, message keyword

Export tickets by status/date/team

Ticket auto-routing rules (e.g., refund → refund team, legal → legal team)

Custom ticket fields (set by super admin)

Ticket merge and split tools

Ticket satisfaction rating survey (optional)

Reopen closed tickets within a window (e.g., 7 days)

View ticket history on user profile

Link tickets to refund request or subscription event logs

Full audit log of actions on ticket (status change, reply, attachment, assignment)

Admin Panel UI includes:

Ticket Inbox with filters and sorting

Detailed ticket view with message thread, internal notes, history

Action buttons: Reply, Close, Reopen, Escalate, Assign, Add Note

Bulk actions: assign, close, delete

SLA countdown timer and badge display

Tabs: "All", "Mine", "Team", "Escalated", "Awaiting User", "Closed"

Notification bell for new/unread tickets

Quick templates and saved replies for fast responses

Admin UI:

Email Inbox Config Panel

Add/remove monitored support email addresses

Set rule: which category or team each email maps to

Test email webhook connection

Inbound Email Log

View raw email history and processing status

Manual retry or parse failed emails

Ticket Generator Settings

Default ticket priority

Auto-response message editor

Link default admin or team for each support email

Admin can view, filter, reply to support tickets

Assign tickets to team (support, billing, moderation)

Upload attachments (image, PDF, audio)

Real-time chat (WebSocket or polling)

UI with threaded messages, SLA tracking, escalation tags

SLA breach auto-escalation with alert to supervisors

Ticket statuses: open, in-progress, on hold, escalated, resolved, closed

Support ticket categories and sub-categories

Priority levels: low, medium, high, urgent

Internal notes (private between admins)

Email auto-responses with dynamic templates

Ticket search by email, tag, status, assignee, message keyword

Export tickets by status/date/team

Ticket auto-routing rules (e.g., refund → refund team, legal → legal team)

Custom ticket fields (set by super admin)

Ticket merge and split tools

Ticket satisfaction rating survey (optional)

Reopen closed tickets within a window (e.g., 7 days)

View ticket history on user profile

Link tickets to refund request or subscription event logs

Full audit log of actions on ticket (status change, reply, attachment, assignment)

Admin Panel UI includes:

Ticket Inbox with filters and sorting

Detailed ticket view with message thread, internal notes, history

Action buttons: Reply, Close, Reopen, Escalate, Assign, Add Note

Bulk actions: assign, close, delete

SLA countdown timer and badge display

Tabs: "All", "Mine", "Team", "Escalated", "Awaiting User", "Closed"

Notification bell for new/unread tickets

Quick templates and saved replies for fast responses

Admin can view, filter, reply to support tickets

Assign tickets to team (support, billing, moderation)

Upload attachments (image, PDF, audio)

Real-time chat (WebSocket or polling)

UI with threaded messages, SLA tracking, escalation tags

SLA breach auto-escalation with alert to supervisors

Ticket statuses: open, in-progress, on hold, escalated, resolved, closed

Support ticket categories and sub-categories

Priority levels: low, medium, high, urgent

Internal notes (private between admins)

Email auto-responses with dynamic templates

Ticket search by email, tag, status, assignee, message keyword

Export tickets by status/date/team

Ticket auto-routing rules (e.g., refund → refund team, legal → legal team)

Custom ticket fields (set by super admin)

Ticket merge and split tools

Ticket satisfaction rating survey (optional)

Reopen closed tickets within a window (e.g., 7 days)

View ticket history on user profile

Link tickets to refund request or subscription event logs

Full audit log of actions on ticket (status change, reply, attachment, assignment)

Admin Panel UI includes:

Ticket Inbox with filters and sorting

Detailed ticket view with message thread, internal notes, history

Action buttons: Reply, Close, Reopen, Escalate, Assign, Add Note

Bulk actions: assign, close, delete

SLA countdown timer and badge display

Tabs: "All", "Mine", "Team", "Escalated", "Awaiting User", "Closed"

Notification bell for new/unread tickets

Quick templates and saved replies for fast responses

Admin can view, filter, reply to tickets

Assign tickets to team (support, billing)

Upload attachments

Real-time chat (WebSocket or polling)

UI with threaded messages, SLA tracking

🔁 SLA Escalation & Fallback Rules

📌 Escalation Triggers

If a ticket is not responded to within the SLA window (e.g., 24 hours):

Mark ticket as SLA breached

Auto-assign to next-level support or team lead

Notify:

Assigned admin (email + in-app)

Escalation group (optional, configurable)

🛠️ Admin Configuration Options

SLA breach timeout: e.g., 24h, 48h (set per category or globally)

Escalation destination:

Role (e.g., escalate to superadmin, lead_support)

Named admin (manually selected fallback)

Enable multi-level escalation:

Level 1: Notify current assignee

Level 2: Reassign to team lead

Level 3: Escalate to Super Admin

Toggle auto-reply pause during escalation

Set max number of escalation hops (e.g., 3)

🔔 Escalation Alerts

Email + in-app alert (to next-level assignee)

Alert includes:

Ticket ID and subject

Last activity timestamp

Time since creation

Original assignee and team

🧾 Escalation Log

Each escalation step logged with:

Timestamp

Assignee before/after

Escalation reason (e.g., timeout, manual escalation)

Displayed in:

Ticket history panel

Audit trail module

Searchable escalation history for compliance

🧩 UI Enhancements

SLA countdown badge with red flash if nearing deadline

Escalated tickets tab: “⚠️ Escalated”

Filter: is:escalated, sla:breached, team:lead_support

SLA breach column on ticket list view

Escalation status visible in ticket header

🔖 Auto-Tagging of Escalated Tickets

Auto-apply tags like missed-SLA, high-priority-breach

Used for filtering, analytics, and compliance audits

Tags displayed in ticket list and ticket details

Included in exports and reports



12. Admin Team Management

Create admin teams (e.g., support, billing, product, sales)

Assign members with role + team-level permission

View team activity logs

Slack/email alerts on escalation

13. Maintenance Mode / App Control

Toggle maintenance mode

Store message + re-enable time

Middleware to block frontend while active (admin bypass)

14. System Logs + Audit Trails

Track all actions (login, refund, user edit)

Filter logs by admin, date, type

Display logs in searchable table

Add export options (CSV, PDF, JSON) for compliance and audits

Allow export of logs filtered by date range, admin role, and action type

Add digital signature/hash to exported logs for tamper-proof verification

Enable automatic cloud backup of audit logs (daily/weekly)

Store backups in secure cloud storage (e.g., AWS S3, Google Cloud Storage)

Admin panel shows last backup status and allows manual on-demand backup

Option to encrypt backup files before upload

15. Analytics Dashboard

Show metrics: total users, revenue, refund %, subscription breakdown

Analytics per feature, per team

Chart views (Recharts/Chart.js)

16. Extended Role-Specific Module Access

🔹 1. Super Admin / Owner

Full access to all modules: Users, Refunds, Billing, Analytics, Teams, Legal, AI Ops

Manage roles, billing, app configuration

🔹 2. Support Team

Access to: User profiles, support tickets, live chat

View/edit user sessions, reply to chats, escalate tickets

🔹 3. Refunds & Billing Team

Access to: Refund logs, transactions, invoice viewer, subscription tools

Issue refunds, credits, view payment methods

🔹 4. Moderation / Compliance Team

Access to: Flagged content, user reports, moderation logs

Take actions: remove content, suspend users

🔹 5. Product / Content Team

Access to: AI prompt templates, onboarding flows, CMS

Update FAQs, KB, tutorials, prompt behavior

🔹 6. Marketing / Analytics Team

Access to: Charts, engagement stats, A/B testing, campaigns

Launch email campaigns, view funnels, export reports

🔹 7. Technical Team / Developer Access

Access to: API logs, error traces, DB viewer (readonly), system monitor

Debug features, deploy patch updates

🔹 8. Sales & Onboarding Team

Access to: CRM data, enterprise clients, onboarding tasks

Assign agents, track onboarding progress, create special offers

🔹 9. Legal & Compliance Team

Access to: Policy documents, ToS version history, legal logs

Review external legal requests, manage compliance forms

🔹 10. AI Ops Team

Access to: AI logs, usage metrics, prompt tuning panel

Monitor token usage, hallucination rate, fallback prompts

17. UI/UX Requirements

Sidebar navigation grouped by module (Users, Refunds, Notifications, Tickets, Settings, Analytics, AI Ops, Legal)

Dashboard home with widgets

Use Tailwind UI/Flowbite for pro look

Responsive (mobile + desktop)

Top bar: profile dropdown, logout, role badge

Role-based menu rendering

Use modals for actions (ban user, refund request, send popup)

Custom 403 page if accessing restricted module

18. Export & Config

Include .env.example, replit.nix, package.json

Support environment-based config

Show .env usage clearly (JWT_SECRET, DB_URI, etc.)

19. Advanced Team-Level Automation & Approval Rules

🔄 Automated Workflows by Team Role & Level

Allow Super Admin to configure custom automation rules for approval, task assignment, and escalation based on:

Role (e.g., Refund Team)

Level (e.g., L1, L2, L3)

Ticket priority

Module (Refunds, Content, Moderation)

Automation Rule Builder UI:

IF conditions: team, level, ticket category, priority, time elapsed

THEN actions: assign to, escalate to, auto-approve, notify, log to audit

Toggle automation rule ON/OFF

Save and clone automation templates

🧠 Approval Routing Based on Role Level

Support multi-step approval for:

Refunds (above ₹X)

Coupon creation (above X% discount)

Subscription edits

Moderation actions

Legal document publishing

Define approval path:

Level 3 initiator → Level 2 reviewer → Level 1 approver → Super Admin final approval

Visual approval flow editor:

Drag-drop role hierarchy and approval path

Assign fallback approver per step

Approval Workflow Features:

Email + in-app alerts to each level

Comments/rejection reason at each step

Approval history log stored with timestamp and actor

View approval path in UI with current status

Retry workflow if approver is unavailable

Approval Delegation:

Allow level-based temporary delegation (e.g., L1 → L2 during absence)

Admin can set delegation period and notify replacement

Analytics:

Track avg. approval time per level/module

Highlight bottlenecks

Dashboard widget: "Pending Approvals by Level"



20. AI Compliance, Moderation & LLM Controls

🔐 LLM Usage Logging & Auditability

Track every prompt and response handled by LLM models used in app (ChatGPT, Claude, Gemini, etc.)

Store prompt/response pairs with:

Timestamp

Model name/version

Token count

Trigger module (e.g., ticket reply, refund note)

Admin/User ID

IP address + location + device fingerprint

Allow admin to search logs by keyword, user, or date range

Enable AI content flagging: hallucination rate > threshold, NSFW risk, bias score, repetition score

Flagged prompts get auto-tagged and reviewed by AI Ops or Legal

Export LLM logs in JSON/CSV for audits

UI to toggle logging by module or user group

Option to redact PII before storing (optional setting)

Add "AI Audit Log" module in Super Admin panel

⚙️ AI Response Controls & Safeguards

Admins can configure max tokens, temp, top-p per role or module

Allow per-role access to GPT-4, GPT-4-turbo, GPT-3.5, Claude, etc.

Block specific model access (e.g., Claude for legal, GPT for billing)

UI for configuring prompt templates, fallback prompts, blocked keywords

Auto-fallback:

If LLM fails, retry with lower temp or fallback model

Log all fallback attempts and resolutions

🧠 Moderation AI + Auto-Flagging System

Use OpenAI Moderation API or custom ML model for classifying:

Hate Speech

Harassment

NSFW/Sexual Content

Self-Harm or Abuse

Violence

Spam or Malicious Prompts

Score each input/output with probability + severity

Add auto-tag to flagged sessions (e.g., flag:harassment-high)

Super Admin dashboard for all AI flags across platform

Escalation rules:

Critical score > 0.9 → escalate to legal/moderation immediately

Medium → notify team lead

Low → log only

Support manual override with notes (auditable)

Provide "Moderation History" tab in user profiles and ticket threads

⚖️ Legal & Compliance Monitoring Panel

View flagged LLM logs with export options for legal review

Full audit trail of who accessed logs and when

Redacted view for non-superadmins

Integration with legal incident tracker

Provide "Report for Audit" button (generates PDF summary of flagged content, actions, team involved)

Role-based access control (only Legal/Compliance team with permission can view or export)

21. Admin Power Tools and Experience Enhancers

📊 Admin & Team Performance Analytics

Track per-admin and per-team metrics:

Avg. ticket resolution time

Refund approval times

Coupon success and usage rates

Leaderboards: Top performers by role, team, module

Weekly/monthly email reports to Super Admin and team leads

Dashboard widget: "Performance This Week"

🔐 Secure Action Verification

High-risk actions require:

OTP verification or re-authentication prompt

Marked as "Sensitive Action" in logs

Actions like deleting logs, changing user access, overriding pricing

Audit log includes: verification method, timestamp, admin ID

🔁 Rollback Controls for Critical Admin Actions

Undo recent actions:

Refund reversal

Deleted coupons or plans

Role or permission changes

UI: "Rollback Log" with filter by action, admin, date

Admins can submit rollback request with reason

Requires higher-level approval to finalize

🛡️ Abuse Detection & Auto-Defense Rules

Monitor for abuse triggers:

Coupon misuse (multi-account)

High refund volume from same IP

Suspicious account creation spikes

Rule-based detection with threshold configuration

Actions: Auto-flag, temporary ban, alert admins

Alerts shown in real-time to compliance/ops team

📢 Broadcast Center (Internal Notices)

Super Admin can push internal announcements:

System downtimes

Policy updates

Team performance updates

Notices appear as dismissible banners or alerts

Track views and dismiss actions by admin account

🌐 Multi-Language Admin UI Support

Support RTL and LTR layouts

Localize full UI content (based on admin-selected language)

Language selector in profile settings

Fallback to English if locale not fully available

Add JSON translation files per module/locale (e.g., en.json, hi.json, ar.json)

22. Enhanced Admin Experience Features

🧿 Realtime Activity Tracker (Mini Audit Feed)

Live sidebar widget: "Admin X updated user Y", "Refund issued for Z"

Stream updates in real-time using WebSockets

Filter by module or action type

Click to view action details or jump to logs

Super Admin can see all activity; other roles see filtered events

👤 Admin Session Management

Show all current sessions of an admin (IP, device, location, last active)

Allow Super Admin to force-logout any session

Show warning if admin is logged in from multiple locations/devices

Log session start, logout, and forced logout in audit trail

Support optional device fingerprint check

🛠️ Bulk Management Tools

Bulk edit options for:

Users: update status, ban/unban, export

Roles: assign/reassign roles, update permissions

Refunds: approve/deny selected

Coupons: expire, delete, extend validity

Bulk permission toggles by role, team, or level group

UI includes checkboxes, select-all, filters, confirmation modals

Audit log entry for each bulk operation

🌐 Webhook Management Module

Define webhooks for events:

Refund issued

Ticket closed

Subscription created/canceled/renewed

Configure HTTP method, endpoint URL, headers, and body template

Add HMAC signature verification

Retry on failure with exponential backoff

Log for each webhook attempt (status, response, retry count)

Alert admins on repeated webhook failures

UI to test webhook delivery and view retry logs

📣 Maintenance Banner to End Users

Super Admin can add a persistent site-wide banner (e.g., "Scheduled maintenance on 12 July at 10 PM")

Banner shows on all frontend pages, even when logged out

Configurable banner color (limited to alert variants: info, warning, error)

Set start and end time for display

Toggle visibility instantly

Optional dismissible banner setting

🔍 Inline Search Everywhere

Global search bar in top navigation

Search across modules: Users, Admins, Tickets, Refunds, Coupons, Subscriptions

Fuzzy matching with suggestions and icons

Navigate to exact entity view on click

Debounced + throttled search for performance

Keyboard shortcut to focus (e.g., Cmd + K)

🚀 Deliverables

Backend code (Express + MongoDB)

Frontend admin panel (React + Tailwind)

Role-based access

Clean, modern UI with sidebar layout

Full working system deployable on Replit

Use high-quality defaults, professional UX, and write modular, production-ready code.

→ Start generating full system now.

