import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VitalGlass Health Dashboard",
  description: "Visualize your labs, trends, and personalized health insights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-50`}
      >
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(129,140,248,0.16),_transparent_55%)] mix-blend-screen" />
          <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
            <header className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-lg shadow-sky-500/10 backdrop-blur-xl">
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-cyan-300 to-indigo-400 text-xs font-semibold text-slate-950 shadow-md shadow-sky-500/50">
                  VG
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-slate-50">
                    VitalGlass
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    Health dashboard
                  </span>
                </div>
              </Link>
              <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-200/85">
                <Link
                  href="/ingest"
                  className="rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90"
                >
                  Ingest
                </Link>
                <Link
                  href="/insights"
                  className="rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90"
                >
                  Insights
                </Link>
                <Link
                  href="/trends"
                  className="rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90"
                >
                  Trends
                </Link>
                <Link
                  href="/products"
                  className="rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90"
                >
                  Products
                </Link>
                <Link
                  href="/body"
                  className="hidden rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90 sm:inline-flex"
                >
                  Body map
                </Link>
                <Link
                  href="/wearables"
                  className="hidden rounded-full bg-slate-900/70 px-3 py-1 hover:bg-slate-800/90 sm:inline-flex"
                >
                  Wearables
                </Link>
              </nav>
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
