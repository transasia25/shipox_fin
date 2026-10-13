import type { NextConfig } from "next";

/**
 * Адрес бэкенда, к которому фронт проксирует `/api`.
 *
 * Прокси нужен из-за Safari: кука сессии ставится бэкендом, и если ходить к
 * нему напрямую на другой домен, для браузера она сторонняя. Safari такие куки
 * не сохраняет вообще («Предотвращать перекрёстное отслеживание» включено по
 * умолчанию), и после входа приложение не открывалось. Через прокси API живёт
 * на том же origin, что страница, и кука становится своей.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? "https://209-38-247-75.sslip.io:8443";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
