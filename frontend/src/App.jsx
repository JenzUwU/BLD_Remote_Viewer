import { useCallback, useRef, useState } from 'react';
import BrowserCanvas from './components/BrowserCanvas';
import InputOverlay from './components/InputOverlay';
import ControlBar from './components/ControlBar';
import StatusHUD from './components/StatusHUD';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('stopped');
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState('—');
  const [url, setUrl] = useState('https://example.com');
  const frameTimesRef = useRef([]);

  const onWsFrame = useCallback((arrayBuffer) => {
    canvasRef.current?.drawFrame(arrayBuffer);

    const now = performance.now();
    frameTimesRef.current.push(now);
    const cutoff = now - 1000;
    frameTimesRef.current = frameTimesRef.current.filter((t) => t > cutoff);
    setFps(frameTimesRef.current.length);

    if (frameTimesRef.current.length >= 2) {
      const prev = frameTimesRef.current[frameTimesRef.current.length - 2];
      setLatency(Math.round(now - prev));
    }
  }, []);

  const handleStatus = useCallback((msg) => {
    if (msg.type === 'status') {
      setStatus(msg.status);
      if (msg.status !== 'error') setError(null);
    }
    if (msg.type === 'error' || (msg.type === 'status' && msg.status === 'error')) {
      setError(msg.message || 'An error occurred');
    }
  }, []);

  const { connected, send } = useWebSocket({
    onFrame: onWsFrame,
    onStatus: handleStatus,
  });

  const handleStart = () => {
    setError(null);
    frameTimesRef.current = [];
    setFps(0);
    send({ type: 'start' });
  };

  const handleStop = () => {
    send({ type: 'stop' });
  };

  const handleNavigate = (e) => {
    e.preventDefault();
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    send({ type: 'navigate', url: target });
  };

  const isLive = status === 'live';
  const isBooting = status === 'booting';

  return (
    <div className="app">
      <header className="app__nav">
        <h1 className="app__title">BLD Remote Browser</h1>
        <ControlBar status={status} onStart={handleStart} onStop={handleStop} />
      </header>

      <main className="app__main">
        <form className="url-bar" onSubmit={handleNavigate}>
          <input
            type="text"
            className="url-bar__input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter a URL and press Go"
            disabled={!isLive}
            spellCheck={false}
          />
          <button type="submit" className="url-bar__go" disabled={!isLive}>
            Go
          </button>
        </form>

        <div
          className={`browser-stage ${isLive ? 'browser-stage--live' : ''} ${isBooting ? 'browser-stage--booting' : ''}`}
        >
          <BrowserCanvas ref={canvasRef} />

          {!isLive && (
            <div
              className={`browser-stage__placeholder ${isBooting ? 'browser-stage__placeholder--booting' : ''}`}
            >
              {isBooting && <div className="spinner" />}
              <span>
                {isBooting
                  ? 'Booting container…'
                  : error
                    ? error
                    : 'Click Start Browser to begin'}
              </span>
            </div>
          )}

          <InputOverlay send={send} enabled={isLive} />
        </div>

        <StatusHUD
          connected={connected}
          status={status}
          fps={isLive ? fps : '—'}
          latency={isLive ? latency : '—'}
        />
      </main>
    </div>
  );
}
