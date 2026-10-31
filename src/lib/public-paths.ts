/*
  Which paths belong to the coach console.

  A bare `startsWith('/coach')` also matches /coaching — the public landing
  page — so every signed-out visitor from an Instagram bio was bounced to the
  login screen. The console is /coach itself and everything under /coach/.
*/
export function isCoachPath(pathname: string) {
  return pathname === '/coach' || pathname.startsWith('/coach/');
}
