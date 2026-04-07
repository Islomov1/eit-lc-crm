import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,   // кэш динамических страниц 30 сек
      static: 180,   // кэш статических 3 мин
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;