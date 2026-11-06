import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";

const ASSET_EXTENSIONS = new Set([
  ".js",
  ".css",
  ".map",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".txt",
  ".webmanifest",
]);

/** True when the path looks like a static asset (never SPA-fallback). */
export function looksLikeStaticAsset(pathname: string): boolean {
  const ext = extname(pathname).toLowerCase();
  return ext !== "" && ASSET_EXTENSIONS.has(ext);
}

/**
 * Strip trailing slash so Vite `base: "./"` resolves assets from `/`
 * (e.g. `/app/` → `/app`). Electron keeps HashRouter and is unaffected.
 */
export function shouldStripTrailingSlash(pathname: string): boolean {
  if (pathname === "/" || !pathname.endsWith("/")) return false;
  if (pathname.startsWith("/api")) return false;
  return true;
}

export async function registerStaticSite(
  app: FastifyInstance,
  webDistDir: string,
): Promise<void> {
  const root = resolve(webDistDir);
  if (!existsSync(root)) {
    app.log.warn(
      { webDistDir: root },
      "WEB_DIST_DIR missing — static UI not registered (API-only mode)",
    );
    return;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    wildcard: false,
    decorateReply: true,
  });

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.url.split("?")[0] ?? "/";

    if (url.startsWith("/api")) {
      return reply.code(404).send({ error: "Not Found" });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply.code(404).send({ error: "Not Found" });
    }

    if (shouldStripTrailingSlash(url)) {
      const target = url.replace(/\/+$/, "") || "/";
      return reply.redirect(target, 302);
    }

    if (looksLikeStaticAsset(url)) {
      return reply.code(404).type("text/plain").send("Not Found");
    }

    return reply.type("text/html").sendFile("index.html");
  });
}
