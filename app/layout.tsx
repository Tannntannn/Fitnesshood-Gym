import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
  title: "FitnessHood Attendance Monitoring",
  description: "FitnessHood attendance with scanner and dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <PageTransition>{children}</PageTransition>
        </Providers>
      </body>
    </html>
  );
}
