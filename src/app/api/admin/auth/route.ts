import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * Erzeugt einen HMAC-basierten Session-Token aus dem Admin-Passwort.
 * So wird niemals das Klartext-Passwort im Cookie gespeichert.
 */
function createSessionToken(password: string): string {
  const secret = process.env.SESSION_SECRET || password;
  return crypto.createHmac('sha256', secret).update(password).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { error: 'Admin not configured' },
        { status: 500 }
      );
    }

    // Timing-safe Vergleich gegen Brute-Force
    const passwordBuffer = Buffer.from(password || '');
    const adminBuffer = Buffer.from(adminPassword);
    
    if (passwordBuffer.length !== adminBuffer.length || !crypto.timingSafeEqual(passwordBuffer, adminBuffer)) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Setze Auth-Cookie mit Session-Token (nicht das Klartext-Passwort!)
    const sessionToken = createSessionToken(adminPassword);
    const cookieStore = await cookies();
    cookieStore.set('admin_auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 Tage
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  // Logout - Cookie löschen
  const cookieStore = await cookies();
  cookieStore.delete('admin_auth');
  
  return NextResponse.json({ success: true });
}

