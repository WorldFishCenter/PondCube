import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/components/theme-provider";
import pkg from "@/package.json"; // server component: only the version reaches the page
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "PondCube · Collect",
  description: "Pond operator data collection for WorldFish PondCube.",
  appleWebApp: { title: "PondCube" }, // iOS home screen label (the manifest covers the rest)
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#115e59" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <ServiceWorker />
        {/* Clerk's styles go in Tailwind's components layer: above preflight, below utilities, so the
            shadcn theme's classes win. (A custom layer would need an @layer order line, which the CSS build drops.) */}
        <ClerkProvider appearance={{ theme: shadcn, cssLayerName: "components" }}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <footer className="pb-6 text-center text-xs text-muted-foreground">PondCube Collect v{pkg.version}</footer>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
