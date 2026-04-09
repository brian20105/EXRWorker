import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { readOwnerBotDesiredState } from "./owner-bot-state";
import fs from "fs";
import path from "path";
import { spawn as spawnProcess } from "child_process";

// Import keep_alive side effect (runs on startup)
// @ts-ignore - keep_alive.js is a plain JS file with no exports
import("../keep_alive.js").catch(() => {});

const app = express();
const httpServer = createServer(app);
const OWNER_BOT_PID_FILE = path.resolve(process.cwd(), ".owner-bot.pid");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function readOwnerBotPid(): number | null {
  try {
    const raw = fs.readFileSync(OWNER_BOT_PID_FILE, "utf8").trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startSavedOwnerBotIfNeeded(): void {
  if (readOwnerBotDesiredState() !== "on") return;

  const existingPid = readOwnerBotPid();
  if (existingPid && isPidRunning(existingPid)) return;

  try {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawnProcess(npmCmd, ["run", "bot", "--", "--owner-dashboard-managed"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    log("restored owner-managed bot state: on", "server");
  } catch (error: any) {
    log(`failed to restore owner-managed bot state: ${error?.message || error}`, "server");
  }
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 2000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "2000", 10);
  const listenOptions: any = { port, host: "0.0.0.0" };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", (err: any) => {
      log(`http server error: ${err.message}`, "server");
      reject(err);
    });

    httpServer.listen(listenOptions, () => {
      log(`serving on port ${port}`);
      resolve();
    });
  }).catch((err: any) => {
    if (err?.code === "EADDRINUSE") {
      log(`port ${port} already in use; exiting to avoid duplicate bot instances`, "server");
    }
    process.exit(1);
  });

  // Start Discord bot only when explicitly enabled via RUN_BOT=true
  const runBot = (process.env.RUN_BOT || "false").trim().toLowerCase() === "true";
  if (runBot) {
    const { startBot } = await import("./bot");
    await startBot();
  } else {
    log("RUN_BOT is not true, skipping Discord bot startup", "server");
    startSavedOwnerBotIfNeeded();
  }
})();
