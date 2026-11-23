/** Platform headers are trusted only on Vercel; elsewhere (or when absent) the right-most XFF hop is used. */
export function clientIp(req: Request): string {
  const h = req.headers;
  if (process.env.VERCEL) {
    const vercel = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    if (vercel) return vercel;
    const real = h.get('x-real-ip')?.trim();
    if (real) return real;
  }
  const parts = h.get('x-forwarded-for')?.split(',').map((x) => x.trim()).filter(Boolean);
  return parts?.length ? parts[parts.length - 1] : 'unknown';
}
