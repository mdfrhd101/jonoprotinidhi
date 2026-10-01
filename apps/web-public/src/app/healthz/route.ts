/* Liveness probe for the hosting platform (Render health check). Public by design: it returns a constant and touches
   neither the API nor the database, so it stays reachable when the demo gate (src/middleware.ts) is on. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
