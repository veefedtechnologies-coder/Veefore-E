# Requirements Document

## Introduction

This feature delivers a brand-new, world-class marketing landing page for **Veefore** — an AI-native social media management and automation platform for Indian creators, small businesses, and agencies. The new page is built from the complete design brief in `VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md` and must feel like the work of a top-tier studio: colourful, electric, alive, and globally professional in execution.

The defining characteristic of this work is **strict non-destructive isolation**. The existing production landing page (`client/src/features/landing/Landing.tsx`, served at route `/`) must remain completely untouched. The new landing page is created as a fully self-contained React feature, reachable **only** at the `/landing` route for testing, with the `/landing` route re-pointed from the old component to the new one.

The design brief specifies a vanilla HTML/CSS/JS implementation, but the actual codebase is a React + Vite + wouter + Tailwind SPA. The new landing page is therefore implemented as a self-contained React feature that preserves the design intent 1:1 (identical visuals, scroll path, colour system, sections, and animations) using the project's existing libraries (GSAP, Lenis, Three.js / React Three Fiber, Framer Motion) driven inside the React component lifecycle.

The signature visual is an **animated SVG scroll path** that draws itself as the user scrolls, winding left and right through every section with a colour-shifting tip dot, springing section nodes, ripple rings, and labels.

## Glossary

- **New_Landing_Page**: The brand-new marketing page being built by this feature, a self-contained React feature folder, served only at `/landing`.
- **Existing_Landing_Page**: The current production landing page implemented in `client/src/features/landing/Landing.tsx`, served at route `/`. Out of scope for modification.
- **Router**: The application routing logic in `client/src/App.tsx` (wouter-based) that maps URL paths to page components.
- **Scroll_Path**: The animated SVG bezier path that runs the full page height, draws on scroll, and connects sections with glowing nodes.
- **Tip_Dot**: The bright circle that rides the drawn frontier of the Scroll_Path and shifts colour through gradient zones.
- **Section_Node**: A glowing dot placed at each section waypoint on the Scroll_Path that springs in, fires a ripple ring, and displays a label when the path frontier passes it.
- **Custom_Cursor**: The two-element (dot + ring) cursor system that replaces the native pointer on the New_Landing_Page.
- **Smooth_Scroll**: The Lenis-driven smooth scrolling behaviour applied to the New_Landing_Page.
- **Caption_Demo**: The functional interactive AI caption generator in the Live Demo section.
- **Caption_Proxy**: The server-side API endpoint that calls the AI provider on behalf of the Caption_Demo so the AI provider API key is never exposed to the client.
- **Colour_System**: The fixed palette — deep navy backgrounds (`#040C18`, `#071428`, `#0A1F3A`) with coral `#FF4D2E`, cyan `#00D4FF`, gold `#FFB800`, mint `#00FF87`, rose `#FF2D7A` — that contains zero purple.
- **Reduced_Motion**: The browser-reported `prefers-reduced-motion: reduce` user preference.
- **Mobile_Breakpoint**: A viewport width of 768px or less.
- **Page_Load_Sequence**: The choreographed 2.4-second entrance animation that runs once when the New_Landing_Page mounts.

## Requirements

### Requirement 1: Non-Destructive Isolation of the Existing Landing Page

**User Story:** As the product owner, I want the new landing page to be built without altering the existing landing page, so that the live homepage at `/` keeps working exactly as before while the new page is evaluated.

#### Acceptance Criteria

1. THE New_Landing_Page SHALL be implemented entirely in newly created files under a dedicated feature folder separate from `client/src/features/landing/`.
2. THE feature SHALL preserve the contents of `client/src/features/landing/Landing.tsx` without modification.
3. THE feature SHALL preserve the behaviour and rendered output of the route `/` without modification.
4. WHERE the New_Landing_Page requires shared utilities that already exist in the codebase, THE feature SHALL import them read-only without modifying their source.
5. IF a shared file must change to support the New_Landing_Page, THEN THE feature SHALL instead create a new New_Landing_Page-scoped copy rather than editing the shared file.

### Requirement 2: Routing the New Landing Page to `/landing`

**User Story:** As a developer testing the new design, I want the new landing page to load at `/landing`, so that I can review it in isolation without touching the production homepage.

#### Acceptance Criteria

1. WHEN a user navigates to the route `/landing`, THE Router SHALL render the New_Landing_Page.
2. WHEN a user navigates to the route `/`, THE Router SHALL render the Existing_Landing_Page.
3. THE Router SHALL keep `/landing` listed as a public (unauthenticated) route.
4. THE feature SHALL change only the component mapping for the `/landing` case in `client/src/App.tsx` and SHALL leave the mapping for `/` unchanged.
5. WHILE the New_Landing_Page module is loading, THE Router SHALL display the existing route loading fallback.

### Requirement 3: Refactored, Independently Testable Section Architecture

**User Story:** As a developer maintaining the page, I want the new landing page organised into well-structured section components, so that each section can be tested and changed independently rather than living in one giant file.

#### Acceptance Criteria

1. THE New_Landing_Page SHALL compose the page from separate section components, one per section, located under the New_Landing_Page feature folder.
2. THE New_Landing_Page root component SHALL act as an orchestrator that arranges the section components in document order and SHALL NOT contain the full inline markup of every section.
3. THE New_Landing_Page SHALL render each section component such that it can be imported and mounted independently for testing.
4. THE New_Landing_Page SHALL place reusable building blocks (Scroll_Path, Custom_Cursor, shared primitives, constants, hooks) in clearly separated modules within the feature folder.

### Requirement 4: Colour System and Zero-Purple Constraint

**User Story:** As a brand owner, I want the page to follow the exact Veefore colour system with no purple anywhere, so that the visual identity is consistent and on-brand.

#### Acceptance Criteria

1. THE New_Landing_Page SHALL render all backgrounds, text, borders, gradients, shadows, and glows using only colours from the Colour_System.
2. THE New_Landing_Page SHALL NOT apply any colour outside the Colour_System in any gradient, border, shadow, glow, or fill, including any purple hue.
3. THE New_Landing_Page SHALL use deep navy values `#040C18`, `#071428`, and `#0A1F3A` for primary, card, and alternate-section backgrounds respectively.
4. THE New_Landing_Page SHALL use the fonts Syne for display headings, DM Sans for body text, and JetBrains Mono for numbers, labels, and metrics.
5. THE New_Landing_Page SHALL scope all of its styling so that no styles leak to the Existing_Landing_Page or other routes, regardless of whether those styles comply with the Colour_System.

### Requirement 5: Animated SVG Scroll Path

**User Story:** As a visitor, I want a glowing neon line to draw itself and guide my eye through the page as I scroll, so that the page feels alive and memorable.

#### Acceptance Criteria

1. THE Scroll_Path SHALL render as an SVG that spans the full scrollable height of the New_Landing_Page.
2. WHEN the user scrolls from top to bottom, THE Scroll_Path SHALL progressively draw the line from undrawn to fully drawn in exact proportion to scroll progress.
3. THE Scroll_Path SHALL route through section waypoints in a left/right winding curve rather than a straight vertical line.
4. THE Scroll_Path SHALL apply a multi-stop gradient using only Colour_System colours (coral, gold, cyan, mint, rose) with no purple.
5. THE Scroll_Path SHALL render a dual-layer effect consisting of a thin crisp line and a wider blurred copy to produce a neon glow.
6. WHILE the user scrolls, THE Tip_Dot SHALL move along the drawn frontier of the Scroll_Path and SHALL shift its fill colour to match the current gradient zone.
7. WHEN the drawn frontier of the Scroll_Path reaches a Section_Node position, THE Scroll_Path SHALL spring the Section_Node in, fire one expanding ripple ring, and reveal the section label.
8. THE Scroll_Path SHALL recalculate its geometry when the viewport is resized and after the page finishes loading.
9. THE Scroll_Path SHALL render below all page content using a stacking order that places content above the path.
10. THE Scroll_Path SHALL set pointer events to none so that the path never intercepts clicks on content beneath the pointer.
11. WHILE the viewport width is at or below the Mobile_Breakpoint, THE New_Landing_Page SHALL NOT render the Scroll_Path.
12. WHILE Reduced_Motion is active, THE New_Landing_Page SHALL NOT render the Scroll_Path.
13. WHEN the New_Landing_Page component unmounts, THE Scroll_Path SHALL remove its injected DOM and detach its scroll, resize, and load listeners.

### Requirement 6: Navigation Section

**User Story:** As a visitor, I want a navigation bar at the top, so that I can identify the brand and reach key destinations.

#### Acceptance Criteria

1. THE Navigation SHALL remain fixed at the top of the viewport.
2. WHEN the user scrolls past 80px from the top, THE Navigation SHALL apply a blurred navy background.
3. WHILE the user is within 80px of the top, THE Navigation SHALL render a transparent background, and the transparent and blurred background states SHALL be mutually exclusive based on scroll position.
4. THE Navigation SHALL display the "Veefore" wordmark, the center links Home, Features, How It Works, Pricing, and Blog, and a "Try Free" call-to-action.
5. WHEN the user hovers the "Try Free" call-to-action, THE Navigation SHALL apply a coral glow hover state.
6. WHILE the viewport width is at or below the Mobile_Breakpoint, THE Navigation SHALL present a hamburger control that opens a full-screen overlay menu.

### Requirement 7: Hero Section

**User Story:** As a visitor, I want an electric hero with a 3D card and live elements, so that I immediately understand the product and feel its energy.

#### Acceptance Criteria

1. THE Hero SHALL occupy the full viewport height and SHALL use a section identifier of `hero`.
2. THE Hero SHALL reserve explicit space for the 3D canvas so that no layout shift occurs after the canvas renders.
3. THE Hero SHALL render an animated card containing a bar chart, an engagement gauge, and metric rows.
4. WHEN the user moves the pointer, THE Hero SHALL tilt the animated card within a maximum of plus or minus 8 degrees on the X axis and plus or minus 6 degrees on the Y axis.
5. WHEN the pointer stops moving, THE Hero SHALL maintain the animated card at its current tilt.
6. THE Hero SHALL render orbiting platform badges that each orbit continuously.
7. THE Hero SHALL cycle floating notification toasts that slide in, pause, and slide out in a continuous loop.
8. THE Hero SHALL render a background particle field using Colour_System colours.
9. WHILE Reduced_Motion is active, THE Hero SHALL render its content in a static state without the looping motion of card float, orbit, toasts, and particles.

### Requirement 8: Social Proof Ticker Section

**User Story:** As a visitor, I want a moving ribbon of testimonials, so that I get quick social proof.

#### Acceptance Criteria

1. THE Ticker SHALL render a full-width horizontal marquee that loops seamlessly with no visible gap or jump.
2. WHEN the user hovers the Ticker while Reduced_Motion is not active, THE Ticker SHALL pause its animation.
3. WHILE Reduced_Motion is active, THE Ticker SHALL remain stationary regardless of hover state.

### Requirement 9: Problem Section

**User Story:** As a visitor, I want to see the pain points the product solves, so that I recognise my own struggles.

#### Acceptance Criteria

1. THE Problem section SHALL use a section identifier of `problem` and SHALL display exactly six pain-point cards.
2. IF more than six pain-point cards are provided, THEN THE Problem section SHALL display only the first six cards and SHALL hide any extras.
3. WHEN a Problem card enters the viewport, THE Problem section SHALL flip the card in on the Y axis with a stagger between cards.
4. WHILE Reduced_Motion is active, THE Problem section SHALL reveal the cards without the flip animation.

### Requirement 10: Features Section

**User Story:** As a visitor, I want to explore the product's core capabilities, so that I understand what the platform does.

#### Acceptance Criteria

1. THE Features section SHALL use a section identifier of `features` and SHALL present five feature panels.
2. WHILE the Features section is pinned to the viewport, THE Features section SHALL pan the five panels horizontally in response to vertical scroll.
3. THE Features section SHALL render each of the five panels with its specified accent colour from the Colour_System (coral, cyan, gold, mint, rose).
4. WHILE the viewport width is at or below the Mobile_Breakpoint, THE Features section SHALL present the panels in a vertically stacked, scrollable layout instead of horizontal pinned scrolling.
5. WHILE Reduced_Motion is active, THE Features section SHALL present the panels without pinned horizontal scrolling animation.

### Requirement 11: How It Works Section

**User Story:** As a visitor, I want to see how quickly I can get started, so that I feel confident onboarding is easy.

#### Acceptance Criteria

1. THE How_It_Works section SHALL use a section identifier of `how-it-works` and SHALL present three sequential steps.
2. WHEN the How_It_Works section enters the viewport while Reduced_Motion is not active, THE How_It_Works section SHALL draw the connecting dotted path from start to end.
3. WHILE Reduced_Motion is active, THE How_It_Works section SHALL display the steps and connecting path in a static state without path-drawing animation, hover effects, or micro-interactions.

### Requirement 12: Live Demo Section with Server-Side AI Proxy

**User Story:** As a visitor, I want to generate real AI captions without signing up, so that I can experience the product's value immediately.

#### Acceptance Criteria

1. THE Live_Demo section SHALL use a section identifier of `demo` and SHALL provide a topic text field, a niche selector, a tone selector, and a generate control.
2. WHEN the user activates the generate control with a topic provided, THE Caption_Demo SHALL request captions from the Caption_Proxy and SHALL display a shimmer loading state until the response arrives.
3. WHEN the Caption_Proxy returns captions, THE Caption_Demo SHALL display three caption cards, each with a copy control.
4. WHEN the user activates a caption card copy control, THE Caption_Demo SHALL copy that caption text to the clipboard.
5. THE Caption_Proxy SHALL call the AI provider server-side and SHALL keep the AI provider API key out of all client-delivered code and responses.
6. IF the topic field is empty when the generate control is activated, THEN THE Caption_Demo SHALL prompt the user to enter a topic and SHALL NOT call the Caption_Proxy.
7. IF the Caption_Proxy returns an error or no captions, THEN THE Caption_Demo SHALL display a descriptive error message and SHALL allow the user to retry.
8. THE Caption_Proxy SHALL be reachable without user authentication and SHALL apply rate limiting to limit abuse of the unauthenticated endpoint.

### Requirement 13: Pricing Section

**User Story:** As a visitor, I want clear pricing in Indian Rupees, so that I can choose a plan without currency confusion.

#### Acceptance Criteria

1. THE Pricing section SHALL use a section identifier of `pricing` and SHALL present three plan tiers in Indian Rupees.
2. THE Pricing section SHALL visually elevate the middle tier and SHALL mark it as the most popular plan.
3. WHEN the user toggles between monthly and annual billing, THE Pricing section SHALL animate the displayed prices to the values for the selected billing period.
4. WHILE Reduced_Motion is active, THE Pricing section SHALL update the displayed prices instantly without the counting animation.

### Requirement 14: Testimonials Section

**User Story:** As a visitor, I want to read what creators say, so that I trust the product.

#### Acceptance Criteria

1. THE Testimonials section SHALL use a section identifier of `testimonials` and SHALL present testimonial cards in a masonry layout.
2. WHEN a testimonial card enters the viewport, THE Testimonials section SHALL fade the card in with a stagger between cards.
3. WHEN the user hovers a testimonial card, THE Testimonials section SHALL apply an accent glow and lift the card.
4. WHILE the viewport width is at or below the Mobile_Breakpoint, THE Testimonials section SHALL present the cards in a single-column layout.

### Requirement 15: FAQ Section

**User Story:** As a visitor, I want answers to common questions, so that I can resolve doubts before signing up.

#### Acceptance Criteria

1. THE FAQ section SHALL use a section identifier of `faq` and SHALL present eight question-and-answer items as an accordion.
2. WHEN the user activates a closed FAQ item, THE FAQ section SHALL expand that item and collapse any other open item so that at most one item is open at a time.
3. WHEN a FAQ item is expanded, THE FAQ section SHALL rotate the item indicator and reveal the answer with a slide-down transition.

### Requirement 16: Final CTA Section

**User Story:** As a visitor, I want a strong closing call to action, so that I know how to start.

#### Acceptance Criteria

1. THE Final_CTA section SHALL use a section identifier of `cta` and SHALL present a headline, supporting text, a primary call-to-action, a secondary call-to-action, and trust badges.
2. THE Final_CTA section SHALL render a radial glow and particles using Colour_System colours, and SHALL render the particles even when their drifting motion is disabled.
3. WHEN the user hovers the primary call-to-action, THE Final_CTA section SHALL apply a coral glow hover state.
4. WHILE Reduced_Motion is active, THE Final_CTA section SHALL render its content without drifting particle motion.

### Requirement 17: Footer Section

**User Story:** As a visitor, I want a footer with links and brand information, so that I can find secondary destinations.

#### Acceptance Criteria

1. THE Footer SHALL present at least four content columns and a bottom bar with copyright and legal links, and MAY present additional columns when content needs require them.
2. WHEN the user hovers a Footer social icon, THE Footer SHALL apply a coral glow hover state.

### Requirement 18: Custom Cursor and Smooth Scroll

**User Story:** As a visitor on a desktop device, I want a custom cursor and buttery smooth scrolling, so that the page feels crafted and premium.

#### Acceptance Criteria

1. WHILE the pointer is over the New_Landing_Page on a device that supports a fine pointer, THE Custom_Cursor SHALL render a dot that snaps to the pointer and a ring that follows with lerp delay.
2. WHEN the pointer hovers a clickable element, THE Custom_Cursor SHALL expand and restyle the ring to its hover state.
3. THE New_Landing_Page SHALL apply Smooth_Scroll across the full page using Lenis.
4. WHILE Reduced_Motion is active, THE New_Landing_Page SHALL disable Smooth_Scroll inertia and SHALL render the native cursor instead of the Custom_Cursor.
5. WHILE the viewport width is at or below the Mobile_Breakpoint, THE New_Landing_Page SHALL render the native cursor instead of the Custom_Cursor.
6. WHEN the New_Landing_Page component unmounts, THE New_Landing_Page SHALL destroy the Smooth_Scroll instance and remove the Custom_Cursor listeners, and SHALL treat the cleanup as incomplete if either operation fails.

### Requirement 19: Page Load Sequence

**User Story:** As a visitor, I want a choreographed entrance animation, so that the page feels polished from the first moment.

#### Acceptance Criteria

1. WHEN the New_Landing_Page mounts, THE Page_Load_Sequence SHALL animate the navigation, hero eyebrow, headline, subheadline, call-to-action buttons, trust stats, 3D card, orbiting badges, particle field, and Scroll_Path entrance in the order specified by the design brief.
2. WHILE Reduced_Motion is active, THE New_Landing_Page SHALL display the final state of all Page_Load_Sequence elements and SHALL NOT run the entrance animation in any form.

### Requirement 20: Responsive Layout

**User Story:** As a mobile visitor, I want the page to look great on small screens, so that I have a good experience on my phone.

#### Acceptance Criteria

1. WHILE the viewport width is as small as 375px, THE New_Landing_Page SHALL render every section in a readable, non-overflowing layout.
2. THE New_Landing_Page SHALL adapt multi-column section layouts to stacked single-column layouts at the Mobile_Breakpoint.
3. THE New_Landing_Page SHALL NOT cause horizontal page overflow at any supported viewport width, including the maximum supported width.

### Requirement 21: Accessibility and Reduced Motion

**User Story:** As a visitor who prefers reduced motion or uses assistive technology, I want the page to respect my settings and be navigable, so that I can use it comfortably.

#### Acceptance Criteria

1. WHILE Reduced_Motion is active, THE New_Landing_Page SHALL suppress all animations across all sections, including continuous, entrance, and interaction-triggered animations such as hover and click effects.
2. THE New_Landing_Page SHALL provide text alternatives for non-text content used to convey information.
3. THE New_Landing_Page SHALL keep interactive controls reachable and operable via keyboard.
4. THE New_Landing_Page SHALL provide a visible focus indicator on interactive controls.

### Requirement 22: Performance

**User Story:** As a visitor, I want the page to load fast and stay stable, so that the experience feels smooth and professional.

#### Acceptance Criteria

1. THE New_Landing_Page SHALL reserve explicit dimensions for the Three.js canvas and media so that no cumulative layout shift occurs after load.
2. THE New_Landing_Page SHALL cap the Three.js renderer pixel ratio at a maximum of 2.
3. THE New_Landing_Page SHALL load non-critical images with lazy loading.
4. THE New_Landing_Page SHALL preload the display, body, and mono fonts.
5. WHEN the New_Landing_Page component unmounts, THE New_Landing_Page SHALL dispose the Three.js scene resources and cancel animation frames so that no memory is leaked.

### Requirement 23: Library Adaptation to the React Stack

**User Story:** As a developer, I want the vanilla-JS design brief adapted to the existing React stack, so that the page preserves the intended design while fitting the codebase.

#### Acceptance Criteria

1. THE New_Landing_Page SHALL implement the design intent using libraries available in the project (GSAP, Lenis, Three.js or React Three Fiber, Framer Motion) driven within the React component lifecycle.
2. WHEN the New_Landing_Page mounts and the libraries required by an effect are available, THE New_Landing_Page SHALL initialise that effect after mount and SHALL tear it down on unmount.
3. WHERE one or more libraries required by the design brief are not already project dependencies, THE feature SHALL add each missing library individually as a pinned dependency before use.
4. THE New_Landing_Page SHALL preserve the visual design, section order, colour system, scroll path behaviour, and animations described in the design brief on a one-to-one basis.
