export default function StatusHUD({ connected, status, fps, latency }) {
  return (
    <div className="status-hud">
      <span className="status-hud__item">
        <span
          className={`status-hud__dot ${connected ? 'status-hud__dot--connected' : 'status-hud__dot--disconnected'}`}
        />
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <span className="status-hud__divider">|</span>
      <span className="status-hud__item">
        <span
          className={`status-hud__dot ${status === 'live' ? 'status-hud__dot--connected' : 'status-hud__dot--disconnected'}`}
        />
        {status === 'live' ? 'Live' : status === 'booting' ? 'Booting' : 'Idle'}
      </span>
      <span className="status-hud__divider">|</span>
      <span className="status-hud__item">
        <span className="status-hud__value">{fps}</span> fps
      </span>
      <span className="status-hud__divider">|</span>
      <span className="status-hud__item">
        <span className="status-hud__value">{latency}</span> ms latency
      </span>
    </div>
  );
}
