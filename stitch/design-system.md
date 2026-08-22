---
name: BaseMind
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bcc9c6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#879391'
  outline-variant: '#3d4947'
  surface-tint: '#6bd8cb'
  primary: '#6bd8cb'
  on-primary: '#003732'
  primary-container: '#29a195'
  on-primary-container: '#00302b'
  inverse-primary: '#006a61'
  secondary: '#4ae176'
  on-secondary: '#003915'
  secondary-container: '#00b954'
  on-secondary-container: '#004119'
  tertiary: '#7bd0ff'
  on-tertiary: '#00354a'
  tertiary-container: '#009bd1'
  on-tertiary-container: '#002d40'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#6bff8f'
  secondary-fixed-dim: '#4ae176'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005321'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 24px
  unit-xl: 48px
---

## Brand & Style
The design system is engineered for a high-performance B2B SaaS environment specializing in RAG-based AI. The brand personality is **Technical, Reliable, and Precise**, evoking a sense of calm intelligence. 

The aesthetic follows a **Modern/Tech-Forward** style, blending the systematic precision of developer tools with the polished accessibility of enterprise software. It utilizes a dark-first approach to reduce eye strain for power users, relying on subtle depth, clear information hierarchy, and high-contrast accents to guide the user through complex AI workflows.

## Colors
The palette is rooted in a deep oceanic foundation, providing a stable environment for vibrant AI-driven status indicators.

- **Primary (#0D9488):** Used for main action buttons, active states, and branding elements. It represents the "Mind" or the intelligence of the system.
- **Secondary (#22C55E):** Reserved for success states, active AI agents, and "live" indicators.
- **Foundation (#0F172A):** The core background color for the dark theme.
- **Surface Tiers:** Use incremental shifts in the navy foundation (10% lighter per tier) to differentiate navigation, sidebars, and main workspace cards.
- **High-Contrast Text:** Primary text must maintain a contrast ratio of at least 7:1 against the foundation to ensure readability of technical documentation.

## Typography
This design system utilizes a dual-font strategy to balance technical utility with a modern edge. 

- **Geist** is used for all headings and code-related snippets. Its mono-spaced influence and sharp terminals communicate the technical nature of AI and RAG configurations.
- **Inter** is used for the UI and body copy. It is selected for its exceptional legibility at small sizes within data-heavy dashboards and complex settings panels.

Use **Geist** for "Headline" roles to create a rhythmic "tech" feel. Use **Inter** for all interactive components, form fields, and long-form body text.

## Layout & Spacing
The layout uses a **Fluid Grid** system based on an 8px spacing rhythm. 

- **Desktop (1440px+):** 12-column grid with 24px gutters. Use wide margins (40px) to give technical configurations room to breathe.
- **Tablet (768px - 1439px):** 8-column grid with 24px gutters.
- **Mobile (<767px):** 4-column grid with 16px gutters and 16px side margins.

For complex AI agent configuration screens, use a "Split-Pane" layout where the left 2/3rds is for building/logic and the right 1/3rd is a persistent chat preview or debugging console.

## Elevation & Depth
Elevation is communicated through **Tonal Layers** supplemented by **Subtle Ambient Shadows**. Since the interface is primarily dark, traditional shadows are replaced by a "glowing" or "lifted" technique:

- **Level 0 (Foundation):** The darkest base navy (#0F172A). Used for the main background.
- **Level 1 (Surface):** A slightly lighter navy. Used for sidebar containers and persistent navigation.
- **Level 2 (Card):** Used for modular blocks of information. Features a 1px border (Opacity 10% white) to define edges without adding visual weight.
- **Level 3 (Overlay):** Modals and dropdowns. These use a 15% opacity white shadow with a 20px blur to create a "halo" effect, suggesting the element is floating above the workspace.

## Shapes
The design system uses **Soft (0.25rem)** roundedness as its default. This creates a professional, "tool-like" appearance that feels engineered rather than casual.

- **Standard Elements:** 4px radius (Buttons, Inputs, Small Cards).
- **Large Containers:** 8px radius (Main Content areas, Large Cards).
- **Interactive States:** On hover, focus rings should follow the element's radius precisely with a 2px offset.

## Components
- **Modular Cards:** Cards should have no background fill on Level 1 surfaces, defined only by a subtle border. On the Foundation (Level 0), cards use a slightly lighter navy fill.
- **Buttons:** 
    - *Primary:* Solid Teal (#0D9488) with white text. Geist Bold 14px.
    - *Ghost:* Transparent with a Teal border. Used for secondary actions.
- **Input Fields:** Darker than the surface they sit on. Use a 2px Teal bottom border on focus to provide a tech-forward "terminal" feel.
- **AI Agent Status Chips:** Use a vibrant green pulse animation for "Live" agents. Use Secondary (#22C55E) for the background with 10% opacity and a solid 100% opacity text.
- **Terminal/Code Blocks:** Always use a pure black background (#000000) with Geist font for maximum contrast and a "pro" developer experience.
- **Lists:** Use 1px horizontal dividers (Opacity 5% white) rather than alternating row colors to maintain a clean, high-end look.