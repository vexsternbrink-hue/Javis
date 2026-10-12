import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jarvis",
  description: "Dein persönlicher KI-Assistent",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Jarvis", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0e15",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="h-full min-h-dvh bg-bg text-text">{children}</body>
    </html>
  );
}
