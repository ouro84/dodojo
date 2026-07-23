import type { Metadata } from "next";
import "./globals.css";
import PwaBoot from "@/components/pwa/PwaBoot";

export const metadata: Metadata = {
  title: "Dodojo",
  description:
    "Transforme ta liste de tâches en combat de boss d'arcade quotidien.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
