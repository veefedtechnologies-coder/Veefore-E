# Veefore Analytics Engineering & Coding Rules

Version: 1.0

---

# Purpose

This document defines the engineering standards that every developer and AI coding agent must follow when implementing the Veefore Analytics module.

These rules are mandatory.

If any documentation conflicts with these rules, stop implementation and report the conflict.

Never guess.

---

# Rule 1 — Documentation First

Read the documentation before writing code.

Implementation order:

README.md

IMPLEMENTATION_ORDER.md

Product Foundation

Metrics Dictionary

Design System

Dashboard Architecture

Widget Library

Dashboard Specifications

Data Architecture

Backend Architecture

Data Contracts

Database

AI Intelligence

Never skip documents.

---

# Rule 2 — No Assumptions

If documentation does not define something:

DO NOT invent it.

Instead:

Document the missing requirement.

Report it.

Wait for clarification.

---

# Rule 3 — Reuse Everything

Never create duplicate:

Components

Hooks

Utilities

Services

Charts

Tables

Filters

Cards

Modals

Buttons

Skeletons

Always search existing code before creating new code.

---

# Rule 4 — Component First

If a UI is reusable:

Build a component.

Never duplicate JSX.

Never duplicate styling.

Never duplicate logic.

---

# Rule 5 — Follow Design System

Every UI must follow:

Typography

Spacing

Colors

Animations

Elevation

Icons

Grid

Responsive rules

Accessibility

Never create custom UI styles outside the Design System.

---

# Rule 6 — Dashboard Consistency

Every dashboard follows the same layout.

Header

↓

Filters

↓

AI Summary

↓

KPIs

↓

Charts

↓

Tables

↓

Recommendations

↓

Alerts

↓

Export

Never change this order.

---

# Rule 7 — No Hardcoded Values

Never hardcode:

Metrics

Platforms

Dates

IDs

Colors

API URLs

Limits

Benchmarks

Everything comes from configuration or APIs.

---

# Rule 8 — Strong Type Safety

No any.

No ignored errors.

Strict TypeScript.

Use shared interfaces.

Reuse types.

---

# Rule 9 — Backend Rules

Business logic belongs in backend.

Frontend displays data.

Frontend never calculates analytics.

Frontend never calculates KPIs.

Frontend never calculates AI scores.

---

# Rule 10 — API Rules

Never call social platform APIs directly from frontend.

Always use Veefore backend.

Use versioned APIs.

Handle errors gracefully.

---

# Rule 11 — Database Rules

Never expose MongoDB schema to frontend.

Always use API contracts.

Never query collections directly from frontend.

---

# Rule 12 — Performance

Every implementation should prioritize:

Lazy loading

Code splitting

Memoization

Caching

Pagination

Virtualization

Background processing

Avoid unnecessary re-renders.

---

# Rule 13 — Loading States

Every page must include:

Skeleton

Empty State

Error State

Refreshing State

Partial Data State

Never show a blank screen.

---

# Rule 14 — Accessibility

Every feature must support:

Keyboard navigation

Screen readers

Focus states

High contrast

Reduced motion

WCAG 2.2 AA

---

# Rule 15 — Responsive Design

Support:

Desktop

Laptop

Tablet

Mobile

Ultra-wide

Do not build desktop-only features.

---

# Rule 16 — AI Rules

AI must never invent analytics.

AI recommendations require supporting evidence.

Display confidence level.

Separate facts from predictions.

---

# Rule 17 — Security

Never expose:

Tokens

Secrets

Private APIs

Internal IDs

Workspace data from other users

Always validate permissions.

---

# Rule 18 — Logging

Log:

Errors

Sync failures

Queue failures

API failures

AI failures

Do not log secrets.

---

# Rule 19 — Error Handling

Every feature must handle:

Offline

Timeout

Rate limit

Permission denied

No data

Partial data

Server error

Retry state

---

# Rule 20 — Code Quality

Follow:

SOLID Principles

DRY

KISS

Composition over inheritance

Single Responsibility

Reusable architecture

---

# Rule 21 — Testing

Every major feature requires:

Unit tests

Integration tests

Component tests

Accessibility tests

Manual QA checklist

---

# Rule 22 — Git Rules

Small commits.

One feature per PR.

Meaningful commit messages.

Never commit broken code.

---

# Rule 23 — Documentation

When implementation changes:

Update documentation.

Update changelog.

Update API contracts.

Update diagrams if required.

Documentation is part of the feature.

---

# Rule 24 — Enterprise UX

Every implementation should feel:

Fast

Consistent

Professional

Predictable

Accessible

High quality

Do not build MVP-quality UI for Analytics.

Analytics is a flagship enterprise feature.

---

# Rule 25 — Before Completing Any Task

Verify:

✓ No TypeScript errors

✓ No ESLint errors

✓ Responsive

✓ Accessible

✓ Dark mode

✓ Light mode

✓ No duplicated code

✓ Performance acceptable

✓ Uses shared components

✓ Documentation updated

✓ Tests passing

---

# Golden Rule

Never optimize for speed over maintainability.

Never optimize for clever code over readable code.

Never optimize for shortcuts over architecture.

Every implementation should be production-ready, scalable, and consistent with the Veefore Analytics architecture.