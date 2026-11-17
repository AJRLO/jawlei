import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { handleAdminApi } from "../admin-handler";

// The desktop admin. It opens the same admin page as /admin, but from a local window: a small server on 127.0.0.1
// serves the admin page, the API (which edits the chosen Jawlei project folder) and the project's uploaded images.
// "Preview" runs the project's own Vite dev server and opens the real site; "Build" makes the deployable site.

const PREVIEW_PORT = 5188;
const configFile = () => path.join(app.getPath("userData"), "config.json");

let projectDir = "";
let win: BrowserWindow | null = null;
let previewWin: BrowserWindow | null = null;
let previewProc: ChildProcess | null = null;

const isProject = (dir: string) => fs.existsSync(path.join(dir, "src", "content", "site.json"));

function loadProject() {
  const fromEnv = process.env.JAWLEI_PROJECT;
  if (fromEnv && isProject(fromEnv)) return fromEnv;
  try {
    const saved = JSON.parse(fs.readFileSync(configFile(), "utf8")).project as string;
    if (saved && isProject(saved)) return saved;
  } catch {
    /* first launch */
  }
  return "";
}

function saveProject(dir: string) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ project: dir }));
}

async function chooseProject(): Promise<string> {
  for (;;) {
    const r = await dialog.showOpenDialog(win ?? undefined!, {
      title: "Choose your Jawlei website folder",
      properties: ["openDirectory"],
    });
    if (r.canceled || !r.filePaths[0]) return "";
    if (isProject(r.filePaths[0])) {
      projectDir = r.filePaths[0];
      saveProject(projectDir);
      stopPreview();
      return projectDir;
    }
    await dialog.showMessageBox({
      type: "warning",
      message: "That is not the Jawlei website folder.",
      detail: "Pick the folder that contains src/content/site.json (the one with package.json in it).",
    });
  }
}

// ---- local server -----------------------------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".otf": "font/otf",
};

function serveFile(res: http.ServerResponse, file: string) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
}

function startServer(): Promise<number> {
  const rendererDir = path.join(__dirname, "renderer");
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const port = (server.address() as net.AddressInfo).port;
      if (req.headers.host !== `127.0.0.1:${port}`) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const p = decodeURIComponent(url.pathname);

      if (p.startsWith("/api/")) {
        if (!projectDir || !(await handleAdminApi(req, res, p.slice(4), url.searchParams, projectDir))) {
          res.statusCode = 404;
          res.end("Not found");
        }
        return;
      }
      if (p.startsWith("/work/") && projectDir) {
        const name = path.basename(p);
        return serveFile(res, path.join(projectDir, "public", "work", name));
      }
      const file = path.join(rendererDir, p === "/" ? "index.html" : p);
      if (!file.startsWith(rendererDir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      serveFile(res, file);
    });
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

// ---- preview and build (run the project's own Vite, using this app's built-in Node) --------------------------------

const viteBin = () => path.join(projectDir, "node_modules", "vite", "bin", "vite.js");

function runVite(args: string[]) {
  return spawn(process.execPath, [viteBin(), ...args], {
    cwd: projectDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
  });
}

function stopPreview() {
  previewProc?.kill();
  previewProc = null;
  previewWin?.close();
}

function waitForPort(port: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => {
        s.destroy();
        if (Date.now() > end) resolve(false);
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

async function openPreview(): Promise<{ ok: boolean; error?: string }> {
  if (!projectDir) return { ok: false, error: "No project folder chosen." };
  if (!fs.existsSync(viteBin())) {
    return { ok: false, error: 'The project has no node_modules yet. Run "npm install" in the project folder once.' };
  }
  if (!previewProc) {
    previewProc = runVite(["--port", String(PREVIEW_PORT), "--strictPort", "--host", "127.0.0.1"]);
    previewProc.on("exit", () => (previewProc = null));
    previewProc.stdout?.resume();
    previewProc.stderr?.resume();
  }
  if (!(await waitForPort(PREVIEW_PORT, 30000))) {
    stopPreview();
    return { ok: false, error: "The preview did not start. Is another program using port 5188?" };
  }
  if (previewWin && !previewWin.isDestroyed()) {
    previewWin.focus();
  } else {
    previewWin = new BrowserWindow({ width: 1400, height: 900, title: "Jawlei preview", autoHideMenuBar: true });
    previewWin.loadURL(`http://127.0.0.1:${PREVIEW_PORT}/`);
    previewWin.on("closed", () => (previewWin = null));
  }
  return { ok: true };
}

function buildSite(): Promise<{ ok: boolean; log: string; dist: string }> {
  const dist = path.join(projectDir, "dist");
  if (!projectDir || !fs.existsSync(viteBin())) {
    return Promise.resolve({ ok: false, log: 'The project has no node_modules yet. Run "npm install" in the project folder once.', dist });
  }
  return new Promise((resolve) => {
    let log = "";
    const proc = runVite(["build"]);
    proc.stdout?.on("data", (d) => (log += d));
    proc.stderr?.on("data", (d) => (log += d));
    proc.on("exit", (code) => resolve({ ok: code === 0, log: log.slice(-1500), dist }));
  });
}

// ---- app ----------------------------------------------------------------------------------------------------------

ipcMain.handle("project:get", () => projectDir);
ipcMain.handle("project:choose", async () => {
  const dir = await chooseProject();
  if (dir) win?.reload();
  return dir || projectDir;
});
ipcMain.handle("preview:open", () => openPreview());
ipcMain.handle("site:build", async () => {
  const r = await buildSite();
  if (r.ok) void shell.openPath(r.dist);
  return r;
});

app.whenReady().then(async () => {
  const port = await startServer();
  win = new BrowserWindow({
    width: 1300,
    height: 900,
    title: "Jawlei admin",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url) && !url.startsWith(`http://127.0.0.1:${port}`)) void shell.openExternal(url);
    return { action: "deny" };
  });

  projectDir = loadProject();
  if (!projectDir) {
    await dialog.showMessageBox({
      message: "Welcome to the Jawlei admin.",
      detail: "First, choose your Jawlei website folder (the one with package.json and src inside it).",
    });
    if (!(await chooseProject())) {
      app.quit();
      return;
    }
  }
  void win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => previewProc?.kill());
