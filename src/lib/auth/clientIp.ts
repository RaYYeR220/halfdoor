/** Trusted-proxy order: Vercel's own header, x-real-ip, then the right-most XFF hop (the leftmost is client-controlled). */
export function clientIp(req: Request): string {
  const h = req.headers;
  const vercel = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  const parts = h.get('x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean);
  return parts?.length ? parts[parts.length - 1] : 'unknown';
}
