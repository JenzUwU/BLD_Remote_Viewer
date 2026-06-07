# BLD Remote Browser Control System
## Architecture & Build Plan

---

## What We're Building

A local-only mini TeamViewer for a browser.

- Hit **Start Browser** in your web UI
- A Docker container spins up with Chromium inside a virtual display
- The screen streams back to your UI in real time via WebSocket
- You click, scroll, and type in the web UI — it happens inside the container

Everything runs on `localhost`. No cloud. No deployment.

---

## Colour Palette

| Name | Hex | Role |
|---|---|---|
| Yankees Blue | `#0D273D` | Primary background, nav, dark surfaces |
| Teal Blue | `#3E6985` | Buttons, active states, borders |
| Pewter Blue | `#8AA7BC` | Secondary text, muted UI elements |
| Pastel Blue | `#A6BED1` | Hover states, subtle fills |
| Columbia Blue | `#CDD7DF` | Light backgrounds, card surfaces |
| Off-white | `#F0F4F6` | Page background |

**Typography:** Playfair Display (headings) + DM Sans (body/UI). Same editorial serif-meets-clean-sans pairing as the reference.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Node.js + Express |
| Real-time | WebSocket (`ws` library) |
| Container runtime | Docker (local daemon via socket) |
| Virtual display | Xvfb (X virtual framebuffer) |
| Browser | Chromium headless |
| Screen capture | x11vnc → noVNC WebSocket bridge |
| Input relay | Chrome DevTools Protocol (CDP) via `puppeteer-core` |

---

## System Architecture

```
┌────────────────────────────────────────────────────────┐
│                  Web UI  (localhost:3000)               │
│                                                        │
│  ┌──────────────┐  ┌────────────────┐  ┌───────────┐  │
│  │ Canvas stream│  │ Input capture  │  │ Controls  │  │
│  │ (drawImage)  │  │ click/scroll/  │  │ Start/Stop│  │
│  │              │  │ keydown        │  │ Status HUD│  │
│  └──────────────┘  └────────────────┘  └───────────┘  │
└───────────────────────┬────────────────────────────────┘
                        │  WebSocket (ws://)
                        │  ← JPEG frames (binary)
                        │  → { type, x, y, key, delta }
┌───────────────────────┴────────────────────────────────┐
│              Node.js Backend  (localhost:4000)          │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Docker API   │  │ Frame pump   │  │ CDP bridge  │  │
│  │ start/stop   │  │ VNC→WS relay │  │ input relay │  │
│  │ container    │  │ (jpeg stream)│  │ via puppeteer│ │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
└───────────────────────┬────────────────────────────────┘
                        │  Docker socket + port binds
┌───────────────────────┴────────────────────────────────┐
│           Docker Container  (ephemeral)                 │
│                                                        │
│   Xvfb :99  ──►  Chromium  ──►  x11vnc (port 5900)    │
│   (1280×800)      (headed,        (streams display)    │
│                   --display=:99)                       │
│                                                        │
│   CDP port 9222 exposed for puppeteer input relay      │
└────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
bld-remote-browser/
│
├── docker/
│   ├── Dockerfile          # Ubuntu + Xvfb + Chromium + x11vnc
│   └── entrypoint.sh       # Start Xvfb → Chromium → x11vnc
│
├── backend/
│   ├── index.js            # Express + WebSocket server
│   ├── docker-manager.js   # Docker API: start / stop / inspect
│   ├── vnc-relay.js        # Connect to x11vnc, pump JPEG frames to WS clients
│   ├── cdp-relay.js        # puppeteer-core CDP: relay mouse/keyboard/scroll
│   └── session.js          # Track active container per client
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── BrowserCanvas.jsx   # <canvas> draws incoming frames
│   │   │   ├── InputOverlay.jsx    # Captures and sends mouse/keyboard events
│   │   │   ├── ControlBar.jsx      # Start/Stop button, status indicator
│   │   │   └── StatusHUD.jsx       # FPS counter, latency, connection state
│   │   ├── hooks/
│   │   │   ├── useWebSocket.js
│   │   │   └── useInputCapture.js
│   │   └── styles/
│   │       └── tokens.css          # All colour + font CSS variables
│   └── vite.config.js
│
├── .env
├── docker-compose.yml      # Optional: orchestrate backend + container together
└── README.md
```

---

## Build Phases

### Phase 1 — Docker image (Day 1, ~2h)

**Goal:** A container that opens Chromium on a virtual display and streams it over VNC.

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y \
    chromium-browser xvfb x11vnc
COPY entrypoint.sh /entrypoint.sh
EXPOSE 5900 9222
CMD ["/entrypoint.sh"]
```

`entrypoint.sh`:
```bash
Xvfb :99 -screen 0 1280x800x24 &
sleep 1
chromium-browser --display=:99 --no-sandbox \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --start-maximized "about:blank" &
sleep 1
x11vnc -display :99 -forever -nopw -shared -rfbport 5900
```

**Test:** `docker build` → `docker run -p 5900:5900 -p 9222:9222` → connect with any VNC client → you see Chromium.

---

### Phase 2 — Node.js backend (Day 1, ~3h)

**Goal:** API to spin containers, relay VNC frames over WebSocket, relay input over CDP.

#### `docker-manager.js`
Uses `dockerode` (npm package wrapping Docker socket):
```js
const Docker = require('dockerode')
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

async function startBrowser() {
  const container = await docker.createContainer({
    Image: 'bld-browser',
    ExposedPorts: { '5900/tcp': {}, '9222/tcp': {} },
    HostConfig: { PortBindings: {
      '5900/tcp': [{ HostPort: '5900' }],
      '9222/tcp': [{ HostPort: '9222' }]
    }}
  })
  await container.start()
  return container.id
}
```

#### `vnc-relay.js`
Connects to x11vnc, reads raw framebuffer updates (RFB protocol), converts to JPEG, and blasts them to all WebSocket clients as binary messages.

Options:
- Use `rfb` npm package to speak RFB natively
- Or shell out to `ffmpeg` capturing the VNC port: `ffmpeg -f vnc -i :5900 -vf fps=15 -q:v 5 -f mjpeg pipe:1`

**ffmpeg approach is simpler and more reliable for v1.**

#### `cdp-relay.js`
```js
const puppeteer = require('puppeteer-core')

const browser = await puppeteer.connect({
  browserURL: 'http://localhost:9222'
})
const page = (await browser.pages())[0]

// On WS message from client:
async function handleInput(event) {
  if (event.type === 'mousemove') await page.mouse.move(event.x, event.y)
  if (event.type === 'click')     await page.mouse.click(event.x, event.y)
  if (event.type === 'keydown')   await page.keyboard.press(event.key)
  if (event.type === 'scroll')    await page.mouse.wheel({ deltaY: event.delta })
}
```

#### `index.js` — WebSocket server
```
ws://localhost:4000
  ← binary:  JPEG frame buffer
  → json:    { type: 'click', x: 400, y: 200 }
  → json:    { type: 'keydown', key: 'Enter' }
  → json:    { type: 'scroll', delta: 120 }
  → json:    { type: 'start' }
  → json:    { type: 'stop' }
```

---

### Phase 3 — React frontend (Day 2, ~4h)

**Goal:** A polished UI with a live canvas, input capture, and controls — in the blue palette.

#### `BrowserCanvas.jsx`
```jsx
// Receives binary WS messages, draws them to <canvas>
const onMessage = (event) => {
  const blob = new Blob([event.data], { type: 'image/jpeg' })
  const url  = URL.createObjectURL(blob)
  const img  = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
  }
  img.src = url
}
```

#### `InputOverlay.jsx`
Sits as an absolutely-positioned `<div>` over the canvas. Captures:
- `onMouseMove` → `{ type: 'mousemove', x, y }` (coordinate-mapped to 1280×800)
- `onClick` → `{ type: 'click', x, y }`
- `onKeyDown` → `{ type: 'keydown', key }`
- `onWheel` → `{ type: 'scroll', delta }`

**Important:** Must normalise coordinates from canvas CSS size → actual browser viewport size (1280×800).

#### `ControlBar.jsx`
- **Start Browser** button → sends `{ type: 'start' }` over WS → triggers container boot
- **Stop** button → `{ type: 'stop' }` → kills container
- Status pill: `Connecting` / `Live` / `Stopped`

---

### Phase 4 — Polish + UI (Day 2, ~2h)

**CSS variables in `tokens.css`:**
```css
:root {
  --yankees:   #0D273D;
  --teal:      #3E6985;
  --pewter:    #8AA7BC;
  --pastel:    #A6BED1;
  --columbia:  #CDD7DF;
  --offwhite:  #F0F4F6;

  --font-display: 'Playfair Display', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
}
```

**UI Layout:**
```
┌─────────────────────────────────────────────────┐
│  BLD Remote Browser           [Start] [Stop]    │  ← nav: yankees bg, playfair wordmark
├─────────────────────────────────────────────────┤
│                                                 │
│   ┌─────────────────────────────────────────┐   │
│   │                                         │   │
│   │           LIVE CANVAS (16:9)            │   │  ← canvas with teal border when live
│   │         1280×800 → scaled down          │   │
│   │                                         │   │
│   └─────────────────────────────────────────┘   │
│                                                 │
│   ● Live  |  15 fps  |  48ms latency            │  ← status HUD: pewter text
└─────────────────────────────────────────────────┘
```

---

## Key Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| VNC RFB protocol is complex | Use ffmpeg mjpeg pipe approach for v1 — simple stdin/stdout |
| Container takes 3–5s to start | Show animated "booting" state in UI, poll readiness on port 9222 |
| Coordinate mismatch (canvas vs viewport) | Always normalise: `realX = (e.offsetX / canvas.clientWidth) * 1280` |
| Docker socket perms on Linux | Run backend with appropriate group, or mount `/var/run/docker.sock` |
| Chrome sandbox issues in Docker | `--no-sandbox --disable-setuid-sandbox` flags required |
| VNC frame rate too high | Cap at 15fps server-side, add client-side frame drop if lagging |

---

## npm Packages Needed

**Backend:**
```
express ws dockerode puppeteer-core
```

**Frontend:**
```
react vite @vitejs/plugin-react
```

**Docker image:**
```
ubuntu:22.04 + chromium-browser + xvfb + x11vnc
```

---

## Environment Variables (`.env`)

```env
BACKEND_PORT=4000
VNC_PORT=5900
CDP_PORT=9222
DOCKER_IMAGE=bld-browser
FRAME_RATE=15
VIEWPORT_W=1280
VIEWPORT_H=800
```

---

## What to Build First (Cursor/Antigravity Order)

1. `docker/Dockerfile` + `entrypoint.sh` — get Chromium visible in VNC viewer
2. `backend/docker-manager.js` — start/stop containers from Node
3. `backend/vnc-relay.js` (ffmpeg pipe approach) — get frames flowing to WS
4. `frontend/BrowserCanvas.jsx` — draw frames on canvas
5. `backend/cdp-relay.js` — input forwarding
6. `frontend/InputOverlay.jsx` — send events from canvas
7. `frontend/ControlBar.jsx` + styling — make it look good

> If you get stuck anywhere, the most likely culprit is Docker socket permissions or the VNC→WS relay. Both have well-documented solutions on GitHub.

---

## Stretch Goals (if time allows)

- URL bar in the UI that sends a CDP `page.goto()` command
- Screenshot capture button
- Multi-session support (one container per WS client)
- Mobile-touch event mapping

---

*Built for BLD SDE Intern Assignment — all running on localhost, no deployment required.*
