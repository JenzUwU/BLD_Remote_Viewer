import { useInputCapture } from '../hooks/useInputCapture';

export default function InputOverlay({ send, enabled }) {
  const handlers = useInputCapture(send, enabled);

  if (!enabled) return null;

  return (
    <div
      className="input-overlay"
      tabIndex={0}
      onMouseMove={handlers.handleMouseMove}
      onClick={handlers.handleClick}
      onMouseDown={handlers.handleMouseDown}
      onMouseUp={handlers.handleMouseUp}
      onKeyDown={handlers.handleKeyDown}
      onKeyUp={handlers.handleKeyUp}
      onWheel={handlers.handleWheel}
    />
  );
}
