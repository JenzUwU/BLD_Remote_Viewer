const { spawn } = require('child_process');
const { CDP_PORT } = require('./docker-manager');

const FRAME_RATE = parseInt(process.env.FRAME_RATE || '15', 10);
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

class VncRelay {
  constructor(session, port = process.env.VNC_PORT || '5900') {
    this.session = session;
    this.port = port;
    this.process = null;
    this.buffer = Buffer.alloc(0);
    this.frameCount = 0;
    this.lastFrameTime = Date.now();
    this.mode = 'ffmpeg';
    this.cdpInterval = null;
    this.cdpPage = null;
    this.running = false;
  }

  async start(cdpPage = null) {
    this.running = true;
    this.cdpPage = cdpPage;

    const ffmpegStarted = await this.tryFfmpeg();

    if (!ffmpegStarted && cdpPage) {
      this.mode = 'cdp';
      this.startCdpFallback();
    } else if (!ffmpegStarted) {
      throw new Error(
        'Could not start frame relay. Install ffmpeg with VNC support, or ensure CDP is available.'
      );
    }

    return this.mode;
  }

  tryFfmpeg() {
    return new Promise((resolve) => {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'vnc',
        '-i',
        `127.0.0.1:${this.port}`,
        '-vf',
        `fps=${FRAME_RATE}`,
        '-q:v',
        '5',
        '-f',
        'mjpeg',
        'pipe:1',
      ];

      try {
        this.process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch {
        resolve(false);
        return;
      }

      let resolved = false;

      this.process.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      this.process.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('Invalid data') || msg.includes('No such file')) {
          if (!resolved) {
            resolved = true;
            this.stop();
            resolve(false);
          }
        }
      });

      this.process.stdout.on('data', (chunk) => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
        this.handleChunk(chunk);
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.stop();
          resolve(false);
        }
      }, 3000);
    });
  }

  startCdpFallback() {
    const intervalMs = Math.round(1000 / FRAME_RATE);

    this.cdpInterval = setInterval(async () => {
      if (!this.running || !this.cdpPage) return;

      try {
        const frame = await this.cdpPage.screenshot({
          type: 'jpeg',
          quality: 60,
        });
        this.emitFrame(frame);
      } catch {
        // page may be navigating
      }
    }, intervalMs);
  }

  handleChunk(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    let start = this.buffer.indexOf(SOI);
    let end = this.buffer.indexOf(EOI, start);

    while (start !== -1 && end !== -1) {
      const frame = this.buffer.subarray(start, end + 2);
      this.emitFrame(frame);
      this.buffer = this.buffer.subarray(end + 2);
      start = this.buffer.indexOf(SOI);
      end = this.buffer.indexOf(EOI, start);
    }
  }

  emitFrame(frame) {
    this.frameCount += 1;
    this.lastFrameTime = Date.now();
    this.session.broadcast(frame, true);
  }

  getStats() {
    return {
      fps: FRAME_RATE,
      frameCount: this.frameCount,
      lastFrameTime: this.lastFrameTime,
      mode: this.mode,
    };
  }

  stop() {
    this.running = false;

    if (this.cdpInterval) {
      clearInterval(this.cdpInterval);
      this.cdpInterval = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.buffer = Buffer.alloc(0);
  }
}

module.exports = { VncRelay };
