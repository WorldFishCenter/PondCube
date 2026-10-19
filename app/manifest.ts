import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home screen"). Icons: app/icon.svg + public/icon-*.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", // the installed app's identity: keep it if start_url ever changes
    name: "PondCube Collect",
    short_name: "PondCube",
    description: "Pond operator data collection for WorldFish PondCube.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff", // splash screen: the light theme's --background
    theme_color: "#0f766e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
