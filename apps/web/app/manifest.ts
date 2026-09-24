import type { MetadataRoute } from "next";

/** Lets Primer be installed to a phone's home screen (opens full-screen, like an app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Primer",
    short_name: "Primer",
    description: "Biotech jobs the moment they're posted, and every grad deadline in one place.",
    id: "/jobs",
    start_url: "/jobs",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0000f2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
