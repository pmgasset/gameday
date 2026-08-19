import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameDay — NFL Underdog Pool",
    short_name: "GameDay",
    description: "Private NFL underdog pick'em pool.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1422",
    theme_color: "#0d1422",
    orientation: "portrait",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
