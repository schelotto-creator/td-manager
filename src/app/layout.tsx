import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TD Manager",
  description: "Simulador de baloncesto",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}