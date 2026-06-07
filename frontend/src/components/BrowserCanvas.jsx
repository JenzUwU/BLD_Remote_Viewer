import { forwardRef, useImperativeHandle, useRef } from 'react';

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;

const BrowserCanvas = forwardRef(function BrowserCanvas(_props, ref) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  useImperativeHandle(ref, () => ({
    drawFrame(arrayBuffer) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (!ctxRef.current) {
        canvas.width = VIEWPORT_W;
        canvas.height = VIEWPORT_H;
        ctxRef.current = canvas.getContext('2d');
      }

      const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        ctxRef.current.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
      };

      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    },
  }));

  return <canvas ref={canvasRef} className="browser-canvas" />;
});

export default BrowserCanvas;
