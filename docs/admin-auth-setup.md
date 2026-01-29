# Admin auth: no-domain proxy + future domain switch

This repo uses cookie-based admin auth. Without a custom domain, Vercel and CloudFront
are cross-site, so the browser will not send the session cookie on admin API fetches.
The workaround is to proxy `/api/*` through Vercel so cookies stay first-party.

## Current setup (no custom domain)

### What to change
- **Vercel**: route `/api/*` to CloudFront via a rewrite (already configured in `apps/web/next.config.js`).
- **Vercel env**: point the admin UI at Vercel, not CloudFront.
- **ECS env**: keep `CORS_ORIGINS` to allow Vercel origins for any direct calls.

### Required env vars
Set these in **Vercel**:
- `ADMIN_API_BASE_URL=https://<your-vercel-app>.vercel.app`
- `ADMIN_API_PROXY_TARGET=https://d1hdxinyddlj1t.cloudfront.net`

Set these in **ECS (API task)**:
- `CORS_ORIGINS=*.vercel.app`

### How it works
1) Browser calls `https://<vercel>/api/auth/login`  
2) Vercel rewrites to `https://<cloudfront>/api/auth/login`  
3) Cookie is stored on the Vercel origin and sent with all `/api/*` fetches  
4) Admin pages work without cross-site cookie issues

## Future setup (once a domain exists)

When you own a domain, use first-party subdomains and remove the proxy.

### Target architecture
- `admin.example.com` → Vercel
- `api.example.com` → CloudFront (alternate domain + ACM cert)

### Required changes
1) **CloudFront**
   - Add alternate domain `api.example.com`
   - Attach ACM cert for `api.example.com`

2) **Vercel**
   - Add domain `admin.example.com`

3) **Env vars**
   - Vercel: `ADMIN_API_BASE_URL=https://api.example.com`
   - ECS: `CORS_ORIGINS=https://admin.example.com`
   - ECS: `AUTH_COOKIE_DOMAIN=.example.com` (optional but recommended)
   - ECS: `AUTH_COOKIE_SAMESITE=lax`

4) **Remove proxy**
   - Delete the `/api/*` rewrite in `apps/web/next.config.js`
   - Remove `ADMIN_API_PROXY_TARGET` from Vercel envs

## Prompt to use when the domain is ready

Copy/paste this prompt when you have a domain:

```
We now own the domain example.com. Please:
1) remove the /api/* rewrite proxy from apps/web/next.config.js
2) update docs and .env.example to reflect direct API calls
3) set admin cookie defaults for the new domain:
   AUTH_COOKIE_DOMAIN=.example.com
   AUTH_COOKIE_SAMESITE=lax
4) remind me of the exact Vercel + CloudFront settings to apply
```
