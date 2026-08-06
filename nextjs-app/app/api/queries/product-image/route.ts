import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getProductImage } from '@/lib/queries/product-queries';
import { getLogger } from '@/lib/logger';

const log = getLogger('api/queries/product-image');

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

    // JWT callers are scoped to their tenant; the processor supplies it
    const tenantId = auth.isApiKey ? searchParams.get('tenantId') : auth.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    // Get image
    const image = getProductImage(tenantId, aggregateId, variant);

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
    log.error('Get product image error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
