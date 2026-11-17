import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// The admin API, shared by the Vite dev server (admin-api.ts) and the desktop app (electron/main.ts).
// It reads and writes <project>/src/content/site.json and stores uploads in <project>/public/work.

const MAX_UPLOAD = 40 * 1024 * 1024;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);
const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("That file is too large."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// `route` is the path after /api (for example "/content"). Returns false if the route is not part of the API.
export async function handleAdminApi(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  searchParams: URLSearchParams,
  root: string,
): Promise<boolean> {
  const contentFile = path.join(root, "src", "content", "site.json");
  const uploadDir = path.join(root, "public", "work");
  const fontDir = path.join(root, "public", "fonts", "custom");

  // Only the admin page itself may call this. A page on another website sends a different Origin, so it is refused.
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    send(res, 403, { error: "Not allowed." });
    return true;
  }

  try {
    if (route === "/content" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(fs.readFileSync(contentFile, "utf8"));
      return true;
    }

    if (route === "/content" && req.method === "PUT") {
      const data = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString("utf8"));
      if (!data || typeof data !== "object" || !data.home || !data.about || !data.work) {
        send(res, 400, { error: "That is not site content." });
        return true;
      }
      fs.writeFileSync(contentFile, JSON.stringify(data, null, 2) + "\n");
      send(res, 200, { ok: true });
      return true;
    }

    if (route === "/upload" && req.method === "POST") {
      const isFont = searchParams.get("kind") === "font";
      const original = searchParams.get("name") ?? (isFont ? "font" : "image");
      const ext = path.extname(original).toLowerCase();
      if (!(isFont ? FONT_EXT : IMAGE_EXT).has(ext)) {
        send(res, 400, { error: isFont ? "Only .ttf, .otf, .woff and .woff2 font files can be uploaded." : "Only image files can be uploaded." });
        return true;
      }
      const base =
        path
          .basename(original)
          .slice(0, -ext.length)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || (isFont ? "font" : "image");
      const file = `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${ext}`;
      const body = await readBody(req, MAX_UPLOAD);
      const dir = isFont ? fontDir : uploadDir;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), body);
      send(res, 200, { path: isFont ? `/fonts/custom/${file}` : `/work/${file}` });
      return true;
    }

    if (route === "/upload" && req.method === "DELETE") {
      const p = searchParams.get("path") ?? "";
      const m = /^\/(work|fonts\/custom)\/([a-z0-9._-]+)$/i.exec(p); // only files directly inside public/work or public/fonts/custom
      if (!m || m[2].startsWith(".")) {
        send(res, 400, { error: "Bad path." });
        return true;
      }
      const target = path.join(m[1] === "work" ? uploadDir : fontDir, m[2]);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      send(res, 200, { ok: true });
      return true;
    }
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : "Server error." });
    return true;
  }
  return false;
}
