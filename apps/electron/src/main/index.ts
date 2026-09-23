import { existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, net, protocol } from "electron";

const APP_SCHEME = "app";
const APP_HOST = "industrial-monitoring";
const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";
const DEFAULT_WS_ORIGIN = "ws://127.0.0.1:8000";

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    codeCache: true,
  },
}]);

function configuredOrigin(name: string, fallback: string, protocols: string[]): string {
  const candidate = process.env[name] ?? fallback;
  const url = new URL(candidate);
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return url.origin;
}

function registerAppProtocol(): void {
  const rendererRoot = resolve(__dirname, "../renderer");
  const apiOrigin = configuredOrigin("INDUSTRIAL_API_ORIGIN", DEFAULT_API_ORIGIN, ["http:", "https:"]);

  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== APP_HOST) {
      return new Response("Not found", { status: 404 });
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
      return net.fetch(target.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      });
    }

    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
    let filePath = resolve(rendererRoot, requestedPath || "index.html");
    const relativePath = relative(rendererRoot, filePath);
    if (relativePath.startsWith("..") || relativePath === "") {
      filePath = join(rendererRoot, "index.html");
    } else if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(rendererRoot, "index.html");
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): BrowserWindow {
  const wsOrigin = configuredOrigin("INDUSTRIAL_WS_ORIGIN", DEFAULT_WS_ORIGIN, ["ws:", "wss:"]);
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: "#0e1d2b",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [`--industrial-ws-origin=${wsOrigin}`],
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.once("ready-to-show", () => window.show());

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/editor/demo`);
  } else {
    void window.loadURL(`${APP_SCHEME}://${APP_HOST}/#/editor/demo`);
  }
  return window;
}

app.whenReady().then(() => {
  if (!process.env.ELECTRON_RENDERER_URL) registerAppProtocol();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
