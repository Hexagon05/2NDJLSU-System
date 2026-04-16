import type { Metadata } from "next";
import "./globals.css";
import EmergencyMonitor from "@/components/EmergencyMonitor";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Log Truck - Logistics Support Unit",
  description: "Vehicle tracking and logistics management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)] transition-colors duration-300">
        <Providers>
          <EmergencyMonitor />
          {children}
        </Providers>
      </body>
    </html>
  );
}