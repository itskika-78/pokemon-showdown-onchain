import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedCardImage } from '@/lib/server/tcg';

export const runtime = 'nodejs';

/**
 * GET /api/cardimg?u=<encoded card-image URL> — same-origin proxy for official
 * TCG card scans. The WebGL hero (CircularGallery) uploads these as textures;
 * serving them same-origin guarantees they're never CORS-tainted (which renders
 * a black card). Only official TCG image CDNs are allowed; cached aggressively.
 */
export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('u');
  if (!raw || !isAllowedCardImage(raw)) {
    return NextResponse.json({ error: 'invalid image url' }, { status: 400 });
  }
  try {
    const upstream = await fetch(raw, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'upstream error' }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') ?? 'image/png';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'not an image' }, { status: 415 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // card art is immutable — cache hard at the edge and in the browser
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  }
}
