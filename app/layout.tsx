import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Pramana - LLM Drift Detection",
  description: "Crowdsourced platform for detecting LLM model drift over time",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
