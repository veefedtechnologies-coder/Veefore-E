---
version: alpha
name: Veefore AI-First SaaS Landing Page
description: A dark-themed, high-density landing page for an AI-driven social media growth platform. It features a sophisticated bento grid, glassmorphic application mockups, and subtle indigo atmospheric lighting.
colors:
  primary: "#FFFFFF"
  background: "#09090b"
  surface: "#18181b"
  accent: "#6366f1"
  text-main: "#FFFFFF"
  text-muted: "#a1a1aa"
  border: "rgba(255, 255, 255, 0.05)"
typography:
  family: "Inter, sans-serif"
  weights:
    light: 300
    regular: 400
    medium: 500
    semibold: 600
  sizes:
    hero: 72px
    section-title: 36px
    body-lg: 20px
    body-md: 16px
    body-sm: 14px
    caption: 12px
spacing:
  container-max: 1280px
  section-padding: 128px
  element-gap: 16px
rounded:
  default: 6px
  component: 8px
  card: 16px
  pill: 9999px
components:
  button-primary: "bg-white text-black rounded-md px-6 py-3 font-medium"
  button-secondary: "bg-transparent border border-white/10 text-white rounded-md px-6 py-3 font-medium"
  card: "bg-zinc-900/30 border border-white/5 rounded-2xl p-8 backdrop-blur-sm"
  badge: "bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-zinc-300"
---

## Overview
Veefore utilizes a "Dark Mode Default" aesthetic characterized by high-contrast white text against a Zinc-950 background. The design is modern and technical, leaning into the "AI Laboratory" feel through the use of glassmorphism, subtle indigo glows, and wireframe-inspired iconography. The layout is structured around a central 1280px container with significant vertical breathing room and a hierarchical bento grid for feature exposition.

## Colors
The palette is strictly monochrome with a single functional accent color:
- **Background**: Zinc-950 (#09090b) serves as the base for the entire page.
- **Surfaces**: Zinc-900 and Zinc-950 are layered using 5% white borders to create depth.
- **Accent**: Indigo-500 (#6366f1) is used sparingly for AI-specific highlights, glows, and status indicators (at low opacities like 10% or 20%).
- **Text**: Pure white for headings; Zinc-400 for secondary descriptions.
- **Success**: Green-500 for "operational" status indicators.
- **Warning**: Amber-500 for "Review" status badges.

## Typography
The interface uses a single typeface, Inter, with heavy reliance on tracking and weight to differentiate hierarchy:
- **Headlines**: Semi-bold weight with tight tracking (`tracking-tight`). Desktop hero size at 72px.
- **Body Text**: Zinc-400 color with a leading of approximately 1.5-1.6 for readability.
- **Mono-esque**: Small caps or uppercase tracking-widest used for labels (e.g., "TRUSTED BY").
- **Small Text**: 14px for nav links and 12px for badges and meta info.

## Layout
- **Grid System**: 12-column logic expressed as a 3-column bento grid on desktop, collapsing to 1 column on mobile.
- **Navigation**: Fixed top bar (80px height) with `backdrop-blur-md` and a 5% white bottom border.
- **Padding**: Large vertical sections (96px to 128px) with specific mobile overrides (64px to 80px).
- **Containment**: Max-width of 1280px (7xl) with 24px (px-6) horizontal padding.

## Elevation & Depth
Depth is achieved through layering and lighting rather than traditional drop shadows:
- **Atmospheric Glows**: Large (40rem) circular divs with 100px blurs and 5-10% Indigo opacity placed behind key elements.
- **Glassmorphism**: Panels use `bg-white/[0.02]` or `bg-zinc-950/80` with `backdrop-blur-md` to appear suspended over the background glows.
- **Borders**: 1px solid borders using `white/5` or `white/10` define the silhouette of every card and section.

## Shapes
- **Containers**: Large features use a 16px (rounded-2xl) radius.
- **Input/Buttons**: Standard components use an 8px (rounded-md) radius.
- **Badges**: Pills (rounded-full) are used for feature tags and intro banners.
- **Icons**: Icons are enclosed in 8px rounded squares with light border treatments.

## Components
- **Navigation Bar**: Transparent-to-blur transition, containing a high-contrast logo and a right-aligned CTA group.
- **Intro Banner**: A pill-shaped interactive link with an icon, centered above the hero headline.
- **Bento Cards**: Interactive containers with hidden hover states (opacity-0 to 100 on interior glows). Features include custom internal layouts like progress bars and avatar clusters.
- **AI Chat Mockup**: A structured panel with a sidebar, message bubbles (zinc-800 for user, indigo-500/5 for AI), and a floating input bar.
- **Visual Calendar**: An abstract grid of 1:1 aspect ratio squares with varying fill levels to represent scheduled content.

## Page Sections

### Navigation
A persistent top bar. Features the "VEEFORE" logo in medium weight, tracking-tighter. Desktop links are 14px Zinc-400. Includes a white "Start free trial" button as the primary action.

### Hero Section
High-density center-aligned area. Includes an atmospheric 40rem indigo blur. Headline is a massive 72px white title. Below, a complex UI mockup illustrates the "AI Studio" with a chat interface, a sidebar with navigation icons (Dashboard, Planner, Analytics), and a "Content Generation" dashboard.

### Social Proof
A horizontal band with `bg-white/[0.02]`. Features five generic brand names (VERITAS, LUMINA, etc.) in uppercase semi-bold text, 50% opacity, and grayscale.

### Feature Bento Grid
A 2-1 layout grid. Large cards (2/3 width) focus on AI Generation and Collaboration. Small cards (1/3 width) focus on Multi-platform and Analytics. Cards change background intensity on hover.

### Automation Deep Dive
A split-screen section. Left side contains a headline, 18px body text, and a checkmark list. Right side features an abstract 4x2 calendar grid mockup with varied indigo and white opacity fills.

### CTA Section
A high-impact terminal section with a central indigo glow. Re-states the primary value proposition with two large buttons: a white "Free Trial" button and a dark "Pricing" button.

### Footer
A 5-column layout (on large screens) with a secondary logo, mission statement, and link clusters (Product, Resources, Company). Bottom row includes copyright and legal links in 12px Zinc-500.

## Motion & Interaction
- **Transitions**: Global `transition-colors` applied to all interactive links and buttons.
- **Hover States**: Buttons shift from white to `zinc-200`; card backgrounds shift from `zinc-900/30` to `zinc-900/50`.
- **Glow Reveals**: Hidden indigo blurs (`opacity-0`) inside bento cards become visible on hover.
- **Navigation**: Backdrop blur remains active during scroll to maintain legibility over page content.

## Do's and Don'ts
- **Do**: Use very subtle borders (5-10% opacity) to separate dark elements.
- **Do**: Maintain a minimum of 24px padding within cards.
- **Do**: Use the indigo accent only for AI-related functions or status.
- **Don't**: Use solid black (#000) for the background; stick to Zinc-950.
- **Don't**: Use heavy box shadows; rely on border-white/5 for definition.
- **Don't**: Change the typeface; Inter is the sole source of visual voice.

## Accessibility
- **Contrast**: While the theme is dark, the white text (100% opacity) against Zinc-950 exceeds AA standards for headlines.
- **Focus**: Interaction cues are limited to color transitions; ensure keyboard focus states are visible.
- **Hierarchy**: Uses semantic `<nav>`, `<main>`, `<section>`, and `<footer>` tags for document structure.

## Assets
- **Framework**: https://cdn.tailwindcss.com
- **Icon Library**: https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js
- **Fonts**: https://fonts.googleapis.com
- **Font Storage**: https://fonts.gstatic.com
- **Primary Font**: https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap
