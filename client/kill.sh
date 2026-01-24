#!/bin/bash
# Kill all CONU Electron processes

echo "Killing CONU Electron processes..."

# First try graceful kill
pkill -f "Electron.*conu/client"

# Wait a second
sleep 1

# Force kill any remaining
pkill -9 -f "Electron.*conu/client" 2>/dev/null

# Also kill all Electron processes just to be sure
killall -9 Electron 2>/dev/null
killall -9 "Electron Helper" 2>/dev/null

echo "Done! All Electron processes killed."
