import { useCallback } from 'react';

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;

function mapCoords(offsetX, offsetY, clientWidth, clientHeight) {
  return {
    x: Math.round((offsetX / clientWidth) * VIEWPORT_W),
    y: Math.round((offsetY / clientHeight) * VIEWPORT_H),
  };
}

export function useInputCapture(send, enabled) {
  const handleMouseMove = useCallback(
    (e) => {
      if (!enabled) return;
      const { x, y } = mapCoords(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        e.currentTarget.clientWidth,
        e.currentTarget.clientHeight
      );
      send({ type: 'mousemove', x, y });
    },
    [send, enabled]
  );

  const handleClick = useCallback(
    (e) => {
      if (!enabled) return;
      const { x, y } = mapCoords(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        e.currentTarget.clientWidth,
        e.currentTarget.clientHeight
      );
      send({ type: 'click', x, y });
    },
    [send, enabled]
  );

  const handleMouseDown = useCallback(
    (e) => {
      if (!enabled) return;
      const { x, y } = mapCoords(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        e.currentTarget.clientWidth,
        e.currentTarget.clientHeight
      );
      send({ type: 'mousedown', x, y, button: 'left' });
    },
    [send, enabled]
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (!enabled) return;
      const { x, y } = mapCoords(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        e.currentTarget.clientWidth,
        e.currentTarget.clientHeight
      );
      send({ type: 'mouseup', x, y, button: 'left' });
    },
    [send, enabled]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled) return;
      e.preventDefault();
      send({ type: 'keydown', key: e.key });
    },
    [send, enabled]
  );

  const handleKeyUp = useCallback(
    (e) => {
      if (!enabled) return;
      e.preventDefault();
      send({ type: 'keyup', key: e.key });
    },
    [send, enabled]
  );

  const handleWheel = useCallback(
    (e) => {
      if (!enabled) return;
      e.preventDefault();
      const { x, y } = mapCoords(
        e.nativeEvent.offsetX,
        e.nativeEvent.offsetY,
        e.currentTarget.clientWidth,
        e.currentTarget.clientHeight
      );
      send({ type: 'scroll', x, y, delta: e.deltaY });
    },
    [send, enabled]
  );

  return {
    handleMouseMove,
    handleClick,
    handleMouseDown,
    handleMouseUp,
    handleKeyDown,
    handleKeyUp,
    handleWheel,
  };
}
