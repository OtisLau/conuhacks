# Building CONU

This guide covers how to set up and build CONU from source.

## Project Structure

```
conu/
├── client/       # Electron desktop app
├── engine/       # Python backend (AI/vision processing)
└── api_test/     # API testing scripts
```

## Prerequisites

- Python 3.13+
- Node.js 18+
- Tesseract OCR (`brew install tesseract` on macOS)

## Setup

### 1. Engine (Python Backend)

```bash
cd engine
./setup.sh
```

Or manually:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. API Test Environment

```bash
cd api_test
./setup.sh
```

Or manually:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Client (Electron App)

```bash
cd client
npm install
```

## Environment Variables

Create a `.env` file in the root directory with your API keys:

```
GOOGLE_API_KEY=your_gemini_api_key
```

## Running

### Start the Electron client:
```bash
cd client
npm start
```

### Run in dev mode:
```bash
cd client
npm run dev
```

### Run the engine CLI:
```bash
cd engine
source .venv/bin/activate
python -m engine
```

## Activating Virtual Environments

After setup, activate the Python environment before running:

```bash
# For engine
source engine/.venv/bin/activate

# For api_test
source api_test/venv/bin/activate
```

## Troubleshooting

### Python executable not found
If you get an error about Python not being found, make sure you've created the virtual environment with the correct name (`.venv` for engine, `venv` for api_test).

### Tesseract not found
Install Tesseract OCR:
```bash
brew install tesseract
```

### Permission errors on macOS
CONU requires accessibility permissions to capture screenshots and detect UI elements. You'll be prompted to grant these when you first run the app.
