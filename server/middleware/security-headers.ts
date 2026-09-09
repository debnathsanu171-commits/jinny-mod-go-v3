/**
 * OWASP baseline + hardened headers.
 * CSP allows the app's own origin, Google Fonts, and the Grok extension script.
 * X-Frame-Options is SAMEORIGIN to prevent clickjacking while allowing same-origin iframes.
 */
const HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' https://grok.com 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'self'",
};

export default async function securityHeaders(
  _event: unknown,
  next: () => Promise<unknown>,
) {
  const result = await next();
  if (!(result instanceof Response)) return result;
  const headers = new Headers(result.headers);
  for (const [key, value] of Object.entries(HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}

