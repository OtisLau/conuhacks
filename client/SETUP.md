# Setup Instructions

This guide covers the installation and setup of the CONU AI Screen Tutorial Guide application.

## Prerequisites

### System Requirements

- **macOS** (primary platform) or Linux
- **Node.js** v18+ (recommend v20 LTS)
- **Python** 3.11+
- **Tesseract OCR** installed on your system

### macOS Specific

You need to grant **Accessibility permissions** for global mouse tracking:
1. Open **System Preferences** > **Security & Privacy** > **Privacy** > **Accessibility**
2. Add your terminal app (Terminal, iTerm, VS Code, etc.)
3. Add Electron when prompted

---

## Tech Stack Overview

### Client (Electron Desktop App)

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | ^28.3.3 | Desktop application framework |
| React | ^19.2.4 | UI components |
| TypeScript | ^5.9.3 | Type-safe JavaScript |
| Vite | ^7.3.1 | Fast build tool |
| electron-vite | ^5.0.0 | Electron + Vite integration |
| Zustand | ^5.0.10 | State management |
| uiohook-napi | ^1.5.4 | Global mouse/keyboard hooks |
| robotjs | ^0.6.0 | Mouse automation |
| ws | ^8.19.0 | WebSocket client |

### Backend (Python API)

| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | ^0.109.0 | REST/WebSocket API |
| Uvicorn | ^0.27.0 | ASGI server |
| Pillow | ^10.0.0 | Image processing |
| pytesseract | ^0.3.10 | OCR text recognition |
| google-generativeai | ^0.3.0 | Gemini AI for planning |
| websockets | ^12.0 | WebSocket support |

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd conuhacks
```

### 2. Backend Setup (Engine)

#### Install Tesseract OCR

**macOS (Homebrew):**
```bash
brew install tesseract
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install tesseract-ocr
```

#### Create Python Virtual Environment

```bash
cd engine
python3.11 -m venv .venv
source .venv/bin/activate
```

#### Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### Configure Environment Variables

Create a `.env` file in the `engine/` directory:

```bash
# engine/.env
GEMINI_API_KEY=your_gemini_api_key_here
```

You can get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey).

### 3. Client Setup (Electron App)

#### Install Node Dependencies

```bash
cd client
npm install
```

**Note:** Native modules (`uiohook-napi`, `robotjs`) may require build tools:

**macOS:**
```bash
xcode-select --install
```

**Linux:**
```bash
sudo apt-get install build-essential libx11-dev libxkbfile-dev
```

#### Build the Application

```bash
npm run build:react
```

---

## Running the Application

### 1. Start the Backend Server

In one terminal:

```bash
cd engine
source .venv/bin/activate
python -m engine --port 8000
```

The backend will be available at `http://127.0.0.1:8000`.

### 2. Start the Electron App

In another terminal:

```bash
cd client
npm run start:react
```

---

## Development

### Development Mode

**Backend** (with auto-reload):
```bash
cd engine
source .venv/bin/activate
uvicorn engine:app --reload --host 127.0.0.1 --port 8000
```

**Client** (with hot module replacement):
```bash
cd client
npm run dev:react
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build:react` | Build production version |
| `npm run start:react` | Build and run production |
| `npm run dev:react` | Run with Vite dev server (HMR) |
| `npm run typecheck` | Type-check without building |
| `npm run kill` | Kill running Electron processes |

### Type Checking

```bash
npm run typecheck
```

---

## Project Structure

```
conuhacks/
├── client/                     # Electron + React application
│   ├── src/
│   │   ├── main/              # Electron main process (TypeScript)
│   │   │   ├── index.ts       # Main entry point
│   │   │   ├── services/      # Backend bridge, WebSocket
│   │   │   └── mouse_events/  # Global mouse tracking
│   │   │
│   │   ├── renderer/          # React UI (TypeScript)
│   │   │   ├── overlay/       # Main overlay window
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   └── store/     # Zustand stores
│   │   │   └── spotlight/     # Spotlight window
│   │   │
│   │   ├── preload/           # Electron preload scripts
│   │   │   ├── overlay.ts
│   │   │   └── spotlight.ts
│   │   │
│   │   └── shared/            # Shared types and utilities
│   │       ├── types/         # TypeScript interfaces
│   │       ├── constants/     # IPC channels
│   │       └── utils/         # Helper functions
│   │
│   ├── out/                   # Build output (electron-vite)
│   ├── electron.vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── engine/                    # Python backend
    ├── __main__.py           # Entry point
    ├── config.py             # Configuration
    ├── core/                 # Core functionality
    ├── locators/             # Element location
    ├── planner/              # AI task planning
    ├── cache/                # OCR caching
    ├── utils/                # Utilities
    ├── requirements.txt
    └── .env                  # Environment variables
```

---

## Troubleshooting

### WebSocket Connection Failed

**Error:** `WebSocket is not defined`

This was fixed by adding the `ws` package for Node.js WebSocket support:
```bash
npm install ws
npm install -D @types/ws
```

### Global Mouse Tracking Not Working

1. Check Accessibility permissions (macOS)
2. Restart the app after granting permissions
3. Check console for `Failed to start mouse hooks` error

### Backend Connection Issues

1. Ensure the backend is running on port 8000
2. Check firewall settings
3. Verify the `.env` file has a valid `GEMINI_API_KEY`

### Native Module Build Errors

If `uiohook-napi` or `robotjs` fail to build:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Or rebuild native modules
npm rebuild
```

### Tesseract Not Found

Ensure Tesseract is installed and in your PATH:
```bash
which tesseract
tesseract --version
```

---

## API Endpoints

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/readiness` | Service readiness |
| POST | `/screenshot` | Capture screenshot |
| POST | `/plan` | Generate task plan |
| POST | `/locate` | Find element on screen |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `/ws/run` | Real-time task execution |

---

## Environment Variables

### Backend (engine/.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `PORT` | No | Server port (default: 8000) |

### Client

The client connects to `ws://127.0.0.1:8000` by default. This can be configured via:
- `ENGINE_WS_URL` environment variable
- Or modify `src/main/services/TaskWebSocket.ts`
