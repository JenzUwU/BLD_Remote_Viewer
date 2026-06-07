require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { session } = require('./session');
const { startBrowser, stopBrowser, waitForPort } = require('./docker-manager');
const { VncRelay } = require('./vnc-relay');
const { CdpRelay } = require('./cdp-relay');

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    session: session.status,
    clients: session.clients.size,
  });
});

app.get('/api/status', (_req, res) => {
  const stats = session.vncRelay?.getStats() ?? null;
  res.json({
    status: session.status,
    containerId: session.containerId,
    frameRelay: stats,
  });
});

async function bootBrowser(ws) {
  if (session.status === 'booting' || session.status === 'live') {
    ws.send(JSON.stringify({ type: 'status', status: session.status }));
    return;
  }

  session.status = 'booting';
  session.broadcastJson({ type: 'status', status: 'booting' });

  try {
    const container = await startBrowser();
    session.container = container;
    session.containerId = container.id;

    await waitForPort(process.env.CDP_PORT || '9222');

    const cdpRelay = new CdpRelay();
    const page = await cdpRelay.connect();
    session.cdpRelay = cdpRelay;

    const vncRelay = new VncRelay(session);
    const mode = await vncRelay.start(page);
    session.vncRelay = vncRelay;

    session.status = 'live';
    session.broadcastJson({
      type: 'status',
      status: 'live',
      containerId: session.containerId,
      frameRelayMode: mode,
    });
  } catch (err) {
    session.status = 'stopped';
    await session.cleanup();
    session.broadcastJson({
      type: 'status',
      status: 'error',
      message: err.message,
    });
  }
}

async function stopSession() {
  session.status = 'stopping';
  session.broadcastJson({ type: 'status', status: 'stopping' });
  await session.cleanup();
  session.broadcastJson({ type: 'status', status: 'stopped' });
}

wss.on('connection', (ws) => {
  session.addClient(ws);

  ws.send(
    JSON.stringify({
      type: 'status',
      status: session.status,
      containerId: session.containerId,
    })
  );

  ws.on('message', async (raw) => {
    if (typeof raw !== 'string' && !(raw instanceof Buffer)) return;

    const text = raw.toString();
    if (text.startsWith('{')) {
      let event;
      try {
        event = JSON.parse(text);
      } catch {
        return;
      }

      switch (event.type) {
        case 'start':
          await bootBrowser(ws);
          break;
        case 'stop':
          await stopSession();
          break;
        default:
          if (session.cdpRelay) {
            try {
              await session.cdpRelay.handleInput(event);
            } catch (err) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  message: err.message,
                })
              );
            }
          }
          break;
      }
    }
  });

  ws.on('close', async () => {
    session.removeClient(ws);
    if (!session.hasClients() && session.status !== 'stopped') {
      await stopSession();
    }
  });
});

server.listen(PORT, () => {
  console.log(`BLD Remote Browser backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
