import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

// The admin API, shared by the Vite dev server (admin-api.ts) and the desktop app (electron/main.ts).
// It reads and writes <project>/src/content/site.json and stores uploads in <project>/public/work.

const MAX_UPLOAD = 40 * 1024 * 1024;
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]);
const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

// ---- publishing: commit the project's changes and push them to GitHub (which rebuilds the website) -------------------

const GIT_PATHS = ["git", "C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files (x86)\\Git\\cmd\\git.exe"];

// Runs git in the project folder. Tries the normal `git` first, then the usual Windows install folders (an app started
// from Explorer may not have seen the PATH change made when Git was installed).
async function git(root: string, args: string[], timeout = 5 * 60 * 1000): Promise<string> {
  for (const bin of GIT_PATHS) {
    try {
      return await new Promise<string>((resolve, reject) =>
        execFile(
          bin,
          args,
          { cwd: root, windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
          (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr) })) : resolve(String(stdout))),
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue; // this git is not here: try the next place
      const err = e as Error & { stderr?: string };
      throw new Error((err.stderr || err.message).trim().split("\n").slice(-4).join(" ").slice(0, 400));
    }
  }
  throw new Error("Git is not installed on this computer.");
}

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

    // How much is waiting to be published: files changed since the last commit, plus commits not pushed yet.
    if (route === "/publish/status" && req.method === "GET") {
      try {
        await git(root, ["rev-parse", "--is-inside-work-tree"], 20000);
      } catch (e) {
        send(res, 200, { git: false, reason: e instanceof Error ? e.message : "No git." });
        return true;
      }
      const changes = (await git(root, ["status", "--porcelain"], 60000)).split("\n").filter(Boolean).length;
      const ahead = parseInt(await git(root, ["rev-list", "--count", "@{u}..HEAD"], 20000).catch(() => "0"), 10) || 0;
      send(res, 200, { git: true, changes, ahead });
      return true;
    }

    if (route === "/publish" && req.method === "POST") {
      await git(root, ["rev-parse", "--is-inside-work-tree"], 20000).catch(() => {
        throw new Error("This project folder is not connected to GitHub yet.");
      });
      await git(root, ["add", "-A"], 120000);
      const changed = (await git(root, ["status", "--porcelain"], 60000)).trim().length > 0;
      if (changed) await git(root, ["commit", "-m", "Update site content"], 120000);
      // someone else (your mate) may have published since this copy was last updated: bring their changes in first
      try {
        await git(root, ["pull", "--rebase", "--autostash"], 3 * 60 * 1000);
      } catch (e) {
        await git(root, ["rebase", "--abort"], 30000).catch(() => undefined); // leave the project as it was
        throw new Error(`Could not combine your changes with the ones already published (${e instanceof Error ? e.message : "conflict"}). Ask the other person to publish first, then reopen the admin and try again.`);
      }
      await git(root, ["push"]);
      send(res, 200, { ok: true, committed: changed });
      return true;
    }
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : "Server error." });
    return true;
  }
  return false;
}
