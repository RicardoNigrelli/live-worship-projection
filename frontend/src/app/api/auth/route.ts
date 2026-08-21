import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password, demo } = await request.json();

    // Pieza de portafolio publica: "Ver demo" evita que un visitante tenga
    // que conocer/escribir la contraseña real para entrar. Sin riesgo real:
    // esta build corre con datos sinteticos, no la instalacion real de un
    // cliente.
    if (demo === true || password === process.env.DASHBOARD_PASSWORD) {
      const response = NextResponse.json({ success: true });
      // NOTE: path must be '/' (not '/dashboard') even though only /dashboard/* pages
      // check this cookie in middleware.ts. /dashboard/control also needs it sent to
      // /api/operator-pin (an /api/* route, outside /dashboard) to fetch the operator
      // PIN — a cookie scoped to path=/dashboard is never attached to /api requests,
      // which silently broke that flow ("No se pudo verificar la sesión de operador").
      response.cookies.set('admin_token', 'authed_admin_' + Date.now(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      return response;
    }

    return NextResponse.json({ success: false, error: 'Contraseña incorrecta' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Bad Request' }, { status: 400 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return response;
}
