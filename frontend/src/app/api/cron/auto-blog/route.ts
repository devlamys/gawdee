import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || request.headers.get('x-gawdee-cron-token') || '';
  const backendUrl = env.internalApiUrl;

  try {
    const res = await fetch(`${backendUrl}/cron/auto-blog?token=${encodeURIComponent(token)}`, {
      headers: {
        'x-gawdee-cron-token': token,
      },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err.message || 'Cron execution failed' }, { status: 500 });
  }
}
