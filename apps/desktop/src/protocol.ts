import { net, protocol } from "electron";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { apiOriginFromConfig, type DesktopRuntimeConfig } from "./config";

export const APP_SCHEME = "app";
export const APP_HOST = "-";

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Serves only files under webDistRoot. Path traversal outside that root is denied.
 */
export function attachAppProtocolHandler(
  webDistRoot: string,
  config: DesktopRuntimeConfig,
): void {
  const root = path.resolve(webDistRoot);
  const csp = buildCsp(apiOriginFromConfig(config));

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") {
      pathname = "/index.html";
    }

    const candidate = path.resolve(root, pathname.replace(/^\/+/, ""));
    const relative = path.relative(root, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Forbidden", { status: 403 });
    }

    let filePath = candidate;
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(root, "index.html");
    }

    const relativeFile = path.relative(root, filePath);
    if (
      !existsSync(filePath) ||
      relativeFile.startsWith("..") ||
      path.isAbsolute(relativeFile)
    ) {
      return new Response("Not found", { status: 404 });
    }

    // Prefer net.fetch for file URLs when possible; fall back to stream.
    try {
      const fileResponse = await net.fetch(pathToFileURL(filePath).toString());
      const headers = new Headers(fileResponse.headers);
      headers.set("Content-Type", contentTypeFor(filePath));
      headers.set("Content-Security-Policy", csp);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(fileResponse.body, {
        status: fileResponse.status,
        headers,
      });
    } catch {
      const stream = Readable.toWeb(createReadStream(filePath));
      return new Response(stream as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": contentTypeFor(filePath),
          "Content-Security-Policy": csp,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  });
}

export function appIndexUrl(): string {
  return `${APP_SCHEME}://${APP_HOST}/index.html`;
}
