'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Loads a disc photo and swaps to the processed version as soon as the
 * background processor produces it.
 *
 * Image loads overlap (the original is still in flight when the processed
 * one is requested), so responses are sequence-guarded: a stale response can
 * never overwrite a newer one, which otherwise leaves the old photo on screen
 * until something else triggers a reload. Object URLs are revoked as they are
 * replaced.
 */
export function useProductImage(
  aggregateId: string,
  variant: 'original' | 'processed',
  fetcher: (url: string) => Promise<Response>
): string {
  const [imageUrl, setImageUrl] = useState('');
  const seqRef = useRef(0);
  const urlRef = useRef('');

  useEffect(() => {
    const seq = ++seqRef.current;

    (async () => {
      try {
        const response = await fetcher(
          `/api/queries/product-image?aggregateId=${aggregateId}&variant=${variant}`
        );
        if (!response.ok || seq !== seqRef.current) {
          return;
        }
        const blob = await response.blob();
        if (seq !== seqRef.current) {
          return;
        }
        const url = URL.createObjectURL(blob);
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
        }
        urlRef.current = url;
        setImageUrl(url);
      } catch (error) {
        console.error('Failed to load product image:', error);
      }
    })();
  }, [aggregateId, variant]);

  // Release the last object URL on unmount
  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
      }
    };
  }, []);

  return imageUrl;
}
