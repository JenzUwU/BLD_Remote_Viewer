#!/bin/bash
set -e

export DISPLAY=:99
CDP_INTERNAL_PORT=9223
CDP_EXTERNAL_PORT=9222

Xvfb :99 -screen 0 1280x800x24 &
sleep 1

chromium \
  --display=:99 \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --remote-debugging-port=${CDP_INTERNAL_PORT} \
  --remote-debugging-address=127.0.0.1 \
  --remote-allow-origins=* \
  --window-size=1280,800 \
  --start-maximized \
  "about:blank" &
sleep 3

# Chromium binds CDP to 127.0.0.1 only; socat exposes it on 0.0.0.0 for Docker port mapping
socat TCP-LISTEN:${CDP_EXTERNAL_PORT},bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:${CDP_INTERNAL_PORT} &
sleep 1

x11vnc -display :99 -forever -nopw -shared -rfbport 5900 -noxdamage
