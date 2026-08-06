'use client';

import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  // Receives the captured photo as base64 (no data: prefix), always JPEG
  onCapture: (base64: string) => void;
}

/**
 * In-page camera with a crosshair overlay. The native camera opened by
 * <input capture> is system UI that cannot be drawn over, so a live
 * getUserMedia preview is the only way to show an aiming guide.
 */
export function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Stop the camera when leaving the page
    return () => stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      setActive(true);
      // The video element renders on the next tick once active flips
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (err: any) {
      setError('Camera unavailable - use the file picker below instead.');
      console.error('getUserMedia failed:', err);
    }
  }

  function cancel() {
    stopStream();
    setActive(false);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onCapture(dataUrl.split(',')[1]);

    stopStream();
    setActive(false);
  }

  if (!active) {
    return (
      <div>
        <button
          type="button"
          onClick={startCamera}
          className="w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-gray-900"
        >
          Open camera
        </button>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full"
        />
        {/* Crosshair + centering circle overlay (sized to the color-sampling
            region so the disc lands where the estimator looks) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <g stroke="white" strokeWidth="0.6" opacity="0.9">
              <line x1="50" y1="30" x2="50" y2="44" />
              <line x1="50" y1="56" x2="50" y2="70" />
              <line x1="30" y1="50" x2="44" y2="50" />
              <line x1="56" y1="50" x2="70" y2="50" />
              <circle cx="50" cy="50" r="28" fill="none" strokeDasharray="3 2" />
            </g>
            <g stroke="black" strokeWidth="0.15" opacity="0.5">
              <circle cx="50" cy="50" r="28" fill="none" />
            </g>
          </svg>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={capture}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          Take photo
        </button>
        <button
          type="button"
          onClick={cancel}
          className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
