import type { Plugin } from "vite";
import { handleAdminApi } from "./admin-handler";

// Dev-server-only: serves the admin API while `npm run dev` is running. It does not exist in the production build,
// so a deployed site has no way to be edited.
export default function adminApi(): Plugin {
  return {
    name: "jawlei-admin-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const handled = await handleAdminApi(req, res, url.pathname, url.searchParams, process.cwd());
        if (!handled) next();
      });
    },
  };
}
