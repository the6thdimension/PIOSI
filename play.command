#!/bin/bash
# PIOSI — double-click launcher for macOS.
# Finder runs .command files in Terminal on double-click. This serves the game
# over a local HTTP server and opens it in your default browser.
#
# First time only: if double-clicking shows "permission denied", run once in
# Terminal:  chmod +x play.command   (or right-click the file → Open).

# Always run from the folder this script lives in.
cd "$(dirname "$0")" || exit 1

PORT=8000

# Pick an available Python (modern macOS ships python3; older systems use python).
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo ""
  echo "  Python is required to run PIOSI."
  echo "  Install it from https://www.python.org/downloads/ (or run: xcode-select --install)"
  echo "  Alternatively, with Node installed:  npx http-server -p $PORT"
  echo ""
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

# Open the browser a moment after the server starts (so the first load succeeds).
( sleep 1; open "http://localhost:$PORT" ) &

echo ""
echo "  PIOSI is running at  http://localhost:$PORT"
echo "  Close this window or press Ctrl+C to stop the game."
echo ""

# Replace this shell with the server so Ctrl+C / closing the window stops it cleanly.
exec "$PY" -m http.server "$PORT"
