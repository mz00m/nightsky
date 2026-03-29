import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Sky — What to see tonight",
  description:
    "Satellites, debris, planets, and stars — based on your location and light pollution.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Night Sky",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen bg-midnight">{children}</body>
    </html>
  );
}
