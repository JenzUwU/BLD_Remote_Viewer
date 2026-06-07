const Docker = require('dockerode');

const docker = new Docker({
  socketPath:
    process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock',
});

const IMAGE_NAME = process.env.DOCKER_IMAGE || 'bld-browser';
const VNC_PORT = process.env.VNC_PORT || '5900';
const CDP_PORT = process.env.CDP_PORT || '9222';

async function ensureImage() {
  try {
    await docker.getImage(IMAGE_NAME).inspect();
    return true;
  } catch {
    return false;
  }
}

async function startBrowser() {
  const imageExists = await ensureImage();
  if (!imageExists) {
    throw new Error(
      `Docker image "${IMAGE_NAME}" not found. Build it first: docker build -t ${IMAGE_NAME} ./docker`
    );
  }

  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    ExposedPorts: {
      '5900/tcp': {},
      '9222/tcp': {},
    },
    HostConfig: {
      PortBindings: {
        '5900/tcp': [{ HostPort: VNC_PORT }],
        '9222/tcp': [{ HostPort: CDP_PORT }],
      },
      AutoRemove: false,
    },
  });

  await container.start();
  return container;
}

async function stopBrowser(container) {
  if (!container) return;

  try {
    await container.stop({ t: 5 });
  } catch {
    // already stopped
  }

  try {
    await container.remove({ force: true });
  } catch {
    // already removed
  }
}

async function waitForPort(port, timeoutMs = 45000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`CDP port ${port} did not become ready within ${timeoutMs}ms`);
}

module.exports = {
  docker,
  startBrowser,
  stopBrowser,
  waitForPort,
  IMAGE_NAME,
  VNC_PORT,
  CDP_PORT,
};
