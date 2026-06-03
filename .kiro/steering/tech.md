This project is the frontend Progressive Web App (PWA) for the ExplaraX Host Dashboard[cite: 1, 2]. 

## Core Technologies
- **Framework:** React 18+ (Strictly use Functional Components and React Hooks)
- **Build Tool:** Vite
- **Language:** JavaScript/JSX (or TypeScript/TSX if configured)
- **Styling:** Vanilla CSS or CSS Modules using ExplaraX tokens (Primary: `#7E57C2`, Background: `#FFFFFF`, Text: `#3B3535`).
- **Backend Integration:** Interacts with ExplaraX Core (Laravel) via standard `fetch` API for endpoints like `POST /internal/checkin/prepare/{event_id}`[cite: 1].

## Common Commands

| Task    | Command |
|---------|---------|
| Scaffold| `npm create vite@latest . -- --template react` |
| Install | `npm install` |
| Build   | `npm run build` |
| Run dev | `npm run dev`   |