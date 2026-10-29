import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Video Saver", description: "Private local video downloader", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#090b1c", width: "device-width", initialScale: 1 };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
