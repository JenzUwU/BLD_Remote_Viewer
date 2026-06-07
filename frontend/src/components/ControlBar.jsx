function statusLabel(status) {
  switch (status) {
    case 'live':
      return 'Live';
    case 'booting':
      return 'Connecting';
    case 'stopping':
      return 'Stopping';
    case 'error':
      return 'Error';
    default:
      return 'Stopped';
  }
}

export default function ControlBar({ status, onStart, onStop }) {
  const isLive = status === 'live';
  const isBooting = status === 'booting' || status === 'stopping';

  return (
    <div className="control-bar">
      <button
        className="control-bar__btn control-bar__btn--start"
        onClick={onStart}
        disabled={isLive || isBooting}
      >
        Start Browser
      </button>
      <button
        className="control-bar__btn control-bar__btn--stop"
        onClick={onStop}
        disabled={!isLive && !isBooting}
      >
        Stop
      </button>
      <span
        className={`status-pill status-pill--${status === 'live' ? 'live' : status === 'booting' ? 'booting' : status === 'error' ? 'error' : ''}`}
      >
        <span className="status-pill__dot" />
        {statusLabel(status)}
      </span>
    </div>
  );
}
