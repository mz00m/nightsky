import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Sky — What to see tonight",
  description:
    "A guide to tonight's sky based on your location and light pollution.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-midnight">{children}</body>
    </html>
  );
}
