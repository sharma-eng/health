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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-slate-900`}
      >
        <div className="min-h-screen bg-white text-slate-900">
          <header className="flex items-center justify-between px-10 py-5">
            <div className="text-sm font-semibold text-slate-900">FitMaker</div>
            <nav className="flex items-center justify-center">
              <div className="flex gap-6 rounded-full bg-black px-8 py-2 text-xs font-medium text-white shadow-lg">
                <Link href="/" className="opacity-80 hover:opacity-100">
                  Home
                </Link>
                <Link href="/data" className="opacity-100">
                  Data
                </Link>
                <span className="opacity-80">Protocol</span>
                <span className="opacity-80">Concierge</span>
                <span className="opacity-80">Marketplace</span>
              </div>
            </nav>
            <div className="flex items-center gap-6 text-xs text-slate-600">
              <button className="hover:text-slate-900">Invite Friend</button>
              <button className="hover:text-slate-900">More ▾</button>
            </div>
          </header>
          <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl px-10 pb-12 pt-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
