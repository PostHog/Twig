import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const guton = localFont({
  src: [
    { path: "../fonts/guton/Guton-Regular.otf", weight: "400" },
    { path: "../fonts/guton/Guton-Medium.otf", weight: "500" },
    { path: "../fonts/guton/Guton-SemiBold.otf", weight: "600" },
    { path: "../fonts/guton/Guton-Bold.otf", weight: "700" },
    { path: "../fonts/guton/Guton-ExtraBold.otf", weight: "800" },
    { path: "../fonts/guton/Guton-Black.otf", weight: "900" },
  ],
  variable: "--font-guton",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "../fonts/JetBrainsMono/JetBrainsMono-Regular.woff2",
      weight: "400",
    },
    {
      path: "../fonts/JetBrainsMono/JetBrainsMono-Medium.woff2",
      weight: "500",
    },
    {
      path: "../fonts/JetBrainsMono/JetBrainsMono-SemiBold.woff2",
      weight: "600",
    },
    { path: "../fonts/JetBrainsMono/JetBrainsMono-Bold.woff2", weight: "700" },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Twig",
  description: "Twig",
  icons: {
    icon: { url: "/assets/favicon-light.svg", type: "image/svg+xml" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${guton.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
