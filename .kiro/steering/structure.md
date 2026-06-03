# Project Structure

This project represents the frontend Host Dashboard PWA for ExplaraX Check-in, specifically focusing on Slice B1.
## Current Layout

```
Checkin/
├── src/
│   ├── components/       # Reusable UI elements (Modals, Progress Bars, Buttons)
│   ├── features/         # Feature-specific logic
│   │   └── prepare-sync/ # Slice B1 specific components and state
│   ├── api/              # API call wrappers (Laravel endpoints)
│   ├── styles/           # ExplaraX design system tokens
│   └── types/            # TypeScript definitions (if applicable)
└── .kiro/
    └── steering/         # AI assistant guidance files
        ├── product.md
        ├── tech.md
        └── structure.md
```

## Notes for AI Assistants

- Component Isolation: Ensure the Prepare Check-in modal and the event status badges are decoupled so they can be easily integrated into the broader ExplaraX layout.
- Error States: Place reusable error/empty state UI elements in the generic components/ directory, as they will be shared across the application.
