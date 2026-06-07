const puppeteer = require('puppeteer-core');
const { CDP_PORT } = require('./docker-manager');

class CdpRelay {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async connect(timeoutMs = 30000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        this.browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${CDP_PORT}`,
          defaultViewport: {
            width: parseInt(process.env.VIEWPORT_W || '1280', 10),
            height: parseInt(process.env.VIEWPORT_H || '800', 10),
          },
        });

        const pages = await this.browser.pages();
        this.page = pages[0] || (await this.browser.newPage());
        return this.page;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    throw new Error(`Could not connect to CDP on port ${CDP_PORT}`);
  }

  async handleInput(event) {
    if (!this.page) return;

    const x = Math.round(event.x ?? 0);
    const y = Math.round(event.y ?? 0);

    switch (event.type) {
      case 'mousemove':
        await this.page.mouse.move(x, y);
        break;
      case 'click':
        await this.page.mouse.click(x, y);
        break;
      case 'mousedown':
        await this.page.mouse.move(x, y);
        await this.page.mouse.down({ button: event.button || 'left' });
        break;
      case 'mouseup':
        await this.page.mouse.move(x, y);
        await this.page.mouse.up({ button: event.button || 'left' });
        break;
      case 'keydown':
        await this.page.keyboard.down(event.key);
        break;
      case 'keyup':
        await this.page.keyboard.up(event.key);
        break;
      case 'scroll':
        await this.page.mouse.move(x, y);
        await this.page.mouse.wheel({ deltaY: event.delta ?? 0 });
        break;
      case 'navigate':
        if (event.url) {
          await this.page.goto(event.url, { waitUntil: 'domcontentloaded' });
        }
        break;
      default:
        break;
    }
  }

  async disconnect() {
    if (this.browser) {
      try {
        await this.browser.disconnect();
      } catch {
        // already disconnected
      }
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { CdpRelay };
