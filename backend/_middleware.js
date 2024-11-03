// pages/api/_middleware.js

import { NextResponse } from 'next/server';

export function middleware(req) {
    const allowedOrigins = ['http://localhost:9194', 'https://vocab.storbeck.me'];
    const origin = req.headers.get('origin');

    if (allowedOrigins.includes(origin)) {
        return NextResponse.next();
    }

    return new NextResponse('CORS Error: Origin not allowed', { status: 403 });
}
