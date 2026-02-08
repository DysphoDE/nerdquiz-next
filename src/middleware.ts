import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Pfade die NICHT geschützt werden (Login, Auth-API)
const PUBLIC_PATHS = ['/admin/login', '/api/admin/auth'];

/**
 * Erzeugt den erwarteten Session-Token aus dem Admin-Passwort.
 * Muss identisch zur Funktion in auth/route.ts sein.
 * 
 * Hinweis: In Edge Middleware ist kein Node.js `crypto` verfügbar,
 * daher nutzen wir die Web Crypto API (SubtleCrypto).
 */
async function createSessionToken(password: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || password;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Login-Seite und Auth-API sind öffentlich
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Prüfe ob Admin-Passwort konfiguriert ist
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    // Kein Passwort gesetzt = Admin deaktiviert in Production
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse('Admin panel disabled', { status: 403 });
    }
    // In Development ohne Passwort erlauben
    return NextResponse.next();
  }

  // Erwarteten Session-Token berechnen
  const expectedToken = await createSessionToken(adminPassword);

  // Prüfe Authorization Header (Basic Auth)
  const authHeader = request.headers.get('authorization');
  
  if (authHeader) {
    const [type, credentials] = authHeader.split(' ');
    
    if (type === 'Basic' && credentials) {
      try {
        const decoded = atob(credentials);
        const [, password] = decoded.split(':');
        
        // Passwort prüfen: Token daraus berechnen und vergleichen
        if (password) {
          const providedToken = await createSessionToken(password);
          if (providedToken === expectedToken) {
            return NextResponse.next();
          }
        }
      } catch {
        // Invalid base64
      }
    }
  }

  // Prüfe Cookie (Session-Token, nicht das Klartext-Passwort)
  const authCookie = request.cookies.get('admin_auth');
  
  if (authCookie?.value === expectedToken) {
    return NextResponse.next();
  }

  // Nicht authentifiziert - zeige Login-Dialog oder fordere Basic Auth an
  // Für API-Routen: 401 mit Basic Auth Header
  if (pathname.startsWith('/api/admin')) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin API"',
      },
    });
  }

  // Für Admin-Seiten: Redirect zur Login-Seite
  const loginUrl = new URL('/admin/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

