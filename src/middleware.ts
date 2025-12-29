import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Pfade die NICHT geschützt werden (Login, Auth-API)
const PUBLIC_PATHS = ['/admin/login', '/api/admin/auth'];

export function middleware(request: NextRequest) {
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

  // Prüfe Authorization Header (Basic Auth)
  const authHeader = request.headers.get('authorization');
  
  if (authHeader) {
    const [type, credentials] = authHeader.split(' ');
    
    if (type === 'Basic' && credentials) {
      try {
        const decoded = atob(credentials);
        const [username, password] = decoded.split(':');
        
        // Username ist egal, nur Passwort zählt
        if (password === adminPassword) {
          return NextResponse.next();
        }
      } catch {
        // Invalid base64
      }
    }
  }

  // Prüfe Cookie (für bereits eingeloggte Sessions)
  const authCookie = request.cookies.get('admin_auth');
  
  if (authCookie?.value === adminPassword) {
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

