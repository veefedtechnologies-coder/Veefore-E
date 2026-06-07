# CaptionVariationSelector - Visual Guide

## Component Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ✨ Caption Variations                        [↻ Regenerate All]        │
│  Choose your favorite or regenerate for new options                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │ [⚡ Viral]   │  │ [❤️ Authentic]│  │ [🎯 Balanced] │               │
│  │ Variation 1   │  │ Variation 2   │  │ Variation 3   │               │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤               │
│  │ Authenticity  │  │ Authenticity  │  │ Authenticity  │               │
│  │ ████████░░ 85 │  │ ██████████ 92 │  │ █████████░ 88 │               │
│  │               │  │               │  │               │               │
│  │ Caption:      │  │ Caption:      │  │ Caption:      │               │
│  │ ┌───────────┐ │  │ ┌───────────┐ │  │ ┌───────────┐ │               │
│  │ │POV: You   │ │  │ │I used to  │ │  │ │Easy week- │ │               │
│  │ │finally... │ │  │ │spend hrs..│ │  │ │night din..│ │               │
│  │ └───────────┘ │  │ └───────────┘ │  │ └───────────┘ │               │
│  │               │  │               │  │               │               │
│  │ Engagement:   │  │ Engagement:   │  │ Engagement:   │               │
│  │ ❤️ 6.5%      │  │ ❤️ 4.8%      │  │ ❤️ 5.5%      │               │
│  │ 💬 2.8%      │  │ 💬 3.5%      │  │ 💬 3.0%      │               │
│  │ 🔖 4.2%      │  │ 🔖 3.8%      │  │ 🔖 4.5%      │               │
│  │ 🔄 1.5%      │  │ 🔄 1.2%      │  │ 🔄 1.3%      │               │
│  │ 80% confidence│  │ 85% confidence│  │ 82% confidence│               │
│  │               │  │               │  │               │               │
│  │ Patterns:     │  │ Patterns:     │  │ Patterns:     │               │
│  │ [POV Hook]    │  │ [Personal...] │  │ [Listicle]    │               │
│  │               │  │               │  │               │               │
│  │ Hooks:        │  │               │  │ Hooks:        │               │
│  │ [📈 POV:]    │  │               │  │ [📈 Here's]  │               │
│  │               │  │               │  │               │               │
│  │ [Use Caption] │  │ [✓ Selected]  │  │ [Use Caption] │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ℹ️ About These Variations                                        │   │
│  │ Each variation is crafted using your unique voice profile...     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Color Coding

### Authenticity Score Meter
```
90-100: ████████████ (Green)   - Excellent, very human-like
80-89:  ████████████ (Blue)    - Good, passes threshold
70-79:  ████████████ (Yellow)  - Fair, needs improvement
0-69:   ████████████ (Red)     - Poor, sounds AI-generated
```

### Style Badges
```
⚡ Viral      (Purple) - Maximum engagement with trending patterns
❤️ Authentic  (Blue)   - Voice-first personal storytelling
🎯 Balanced   (Green)  - Proven formula + unique voice
```

## States

### Loading State
```
┌─────────────────────────────────────────┐
│                                         │
│              ↻ (spinning)               │
│                                         │
│  Generating authentic caption           │
│  variations...                          │
│                                         │
└─────────────────────────────────────────┘
```

### Empty State
```
┌─────────────────────────────────────────┐
│                                         │
│              ✨                         │
│                                         │
│        No variations yet                │
│                                         │
│  Generate AI-powered caption            │
│  variations to see different styles     │
│  and engagement predictions.            │
│                                         │
└─────────────────────────────────────────┘
```

### Selected State
```
┌─────────────────────┐
│ [✓]                │  <- Checkmark indicator top-right
│ [🎯 Balanced]     │
│ Variation 3       │
├───────────────────┤
│ ...               │
│                   │
│ [✓ Selected]      │  <- Button shows selected
└───────────────────┘
    Blue ring border    <- Visual feedback
```

### Hover State
```
┌─────────────────────┐
│ [⚡ Viral]        │
│ Variation 1       │  <- Slightly elevated
├───────────────────┤     with shadow
│ ...               │
│                   │
│ [Use This Caption]│
└─────────────────────┘
```

## Responsive Behavior

### Desktop (≥1024px)
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│Variation │ │Variation │ │Variation │  <- 3 columns
│    1     │ │    2     │ │    3     │
└──────────┘ └──────────┘ └──────────┘
```

### Tablet (768px-1023px)
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│Variation │ │Variation │ │Variation │  <- Still 3 columns
│    1     │ │    2     │ │    3     │     but narrower
└──────────┘ └──────────┘ └──────────┘
```

### Mobile (<768px)
```
┌─────────────────┐
│  Variation 1    │  <- Single column
└─────────────────┘     stacked
┌─────────────────┐
│  Variation 2    │
└─────────────────┘
┌─────────────────┐
│  Variation 3    │
└─────────────────┘
```

## Interactive Elements

### Buttons
```
Primary (Selected):
┌────────────────┐
│ ✓ Selected     │  Blue background
└────────────────┘

Outline (Not Selected):
┌────────────────┐
│ Use This       │  Transparent with border
│ Caption        │
└────────────────┘

Regenerate:
┌──────────────┐
│ ↻ Regenerate │  Top-right header button
│   All        │
└──────────────┐
```

### Badges
```
[⚡ Viral]      - Purple badge with icon
[❤️ Authentic]  - Blue badge with icon
[🎯 Balanced]   - Green badge with icon

[POV Hook]      - Outline badge for patterns
[📈 POV:]       - Secondary badge for hooks
```

## Information Hierarchy

```
1. Style Badge + Variation Number        <- Primary identification
2. Authenticity Score Meter              <- Quality indicator
3. Caption Preview                       <- Content preview
4. Engagement Predictions                <- Performance metrics
5. Patterns & Hooks                      <- Technical details
6. Action Button                         <- Call to action
```

## Animation & Transitions

```
Loading Spinner:     Infinite rotation
Authenticity Meter:  500ms width transition
Hover State:        300ms elevation + shadow
Selection:          Instant (no animation)
Card Appearance:    Fade-in on mount
```

## Dark Mode

All components support dark mode with appropriate color adjustments:
- Background: White → Dark gray
- Text: Dark gray → Light gray
- Borders: Light gray → Dark gray
- Accent colors: Maintained but adjusted for contrast

## Accessibility Features

```
✓ Keyboard Navigation:  All buttons focusable
✓ Color Independence:   Text labels supplement colors
✓ Semantic HTML:        Proper heading hierarchy
✓ Focus Indicators:     Visible focus states
✓ Touch Targets:        44x44px minimum
```

## Usage Context

This component appears:
1. After clicking "Generate AI Captions" button
2. When editing an existing post and requesting new variations
3. When regenerating after rejecting previous variations

It integrates with:
- Caption text input field (applies selected caption)
- Hashtag input (optionally applies suggested hashtags)
- Feedback system (tracks which variation was selected)

## Performance Considerations

- Lazy rendering of variations (only visible ones rendered)
- Optimized re-renders with React.memo (if needed)
- Efficient hover state management
- Scrollable caption preview to prevent layout issues
- Conditional rendering of optional fields
