This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy UI (Vercel) + Backend (Railway)
This repo also contains an Express backend vendored under `backend/`.

### Backend → Railway
1. Create/open a Railway project with working directory `backend/` (relative to this repo root).
2. Run:
   - `npm install`
   - `npm start` (runs `node index.js`)
3. Set environment variables:
   - `PORT`
   - `CORS_ORIGIN` = your Vercel UI URL (example: `https://your-app.vercel.app`)
4. Ensure Railway includes `backend/reports/**` (especially `backend/reports/report1.pdf`).

### UI → Vercel
1. Vercel project root: this `frontend/` directory.
2. Set environment variable:
   - `NEXT_PUBLIC_API_BASE_URL` = your Railway backend base URL (example: `https://xxxx.up.railway.app`)

### Must-match pairing
- Vercel `NEXT_PUBLIC_API_BASE_URL` must point to Railway backend URL
- Railway `CORS_ORIGIN` must be your Vercel UI URL
