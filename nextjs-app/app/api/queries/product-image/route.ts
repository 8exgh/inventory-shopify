import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getProductImage } from '@/lib/queries/product-queries';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const auth = requireAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const aggregateId = searchParams.get('aggregateId');
    const variant = searchParams.get('variant') === 'processed' ? 'processed' : 'original';

    if (!aggregateId) {
      return NextResponse.json(
        { error: 'Missing aggregateId' },
        { status: 400 }
      );
    }

    // Get image
    const image = getProductImage(aggregateId, variant);

    if (!image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    // This was the original return code before fixing typescript error:
    // Return binary image data
    // return new NextResponse(image.blob, {
    //   status: 200,
    //   headers: {
    //     'Content-Type': image.mimeType,
    //     'Cache-Control': 'public, max-age=31536000, immutable'
    //   }
    // });

      return new NextResponse(new Uint8Array(image.blob), {
          status: 200,
          headers: {
              'Content-Type': image.mimeType,
          }
      });

  } catch (error: any) {
    console.error('Get product image error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
