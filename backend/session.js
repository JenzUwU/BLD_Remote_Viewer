class Session {
  constructor() {
    this.container = null;
    this.containerId = null;
    this.vncRelay = null;
    this.cdpRelay = null;
    this.status = 'stopped';
    this.clients = new Set();
  }

  addClient(ws) {
    this.clients.add(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  hasClients() {
    return this.clients.size > 0;
  }

  broadcast(data, isBinary = false) {
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data, { binary: isBinary });
      }
    }
  }

  broadcastJson(payload) {
    this.broadcast(JSON.stringify(payload));
  }

  async cleanup() {
    if (this.vncRelay) {
      this.vncRelay.stop();
      this.vncRelay = null;
    }

    if (this.cdpRelay) {
      await this.cdpRelay.disconnect();
      this.cdpRelay = null;
    }

    if (this.container) {
      try {
        await this.container.stop({ t: 5 });
      } catch {
        // container may already be stopped
      }
      try {
        await this.container.remove({ force: true });
      } catch {
        // container may already be removed
      }
      this.container = null;
      this.containerId = null;
    }

    this.status = 'stopped';
  }
}

const session = new Session();

module.exports = { Session, session };
