import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// SEC: Hands the operator PIN to the client only if the request already carries a
// valid admin_token cookie (i.e. the visitor passed the DASHBOARD_PASSWORD gate).
// This keeps OPERATOR_PIN out of the public NEXT_PUBLIC_* bundle while still letting
// the authenticated /dashboard/control page join the Socket.IO room as "operator".
export async function GET() {
  const token = cookies().get('admin_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const pin = process.env.OPERATOR_PIN;
  if (!pin) {
    return NextResponse.json({ error: 'OPERATOR_PIN no configurado en el servidor' }, { status: 503 });
  }

  return NextResponse.json({ pin });
}
