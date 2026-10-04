import { existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, net, protocol, session } from "electron";

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

  protocol.handle(APP_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== APP_HOST) {
      return new Response("Not found", { status: 404 });
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
      const headers = new Headers(request.headers);
      const origin = headers.get("origin");
      if (origin && origin !== `${APP_SCHEME}://${APP_HOST}`) return new Response("Forbidden", { status: 403 });
      // The main process owns backend cookies; custom-scheme fetch does not persist them.
      headers.delete("origin");
      headers.delete("sec-fetch-site");
      headers.delete("cookie");
      const cookies = await session.defaultSession.cookies.get({ url: apiOrigin, name: "industrial_session" });
      if (cookies.length) headers.set("cookie", `industrial_session=${cookies[0].value}`);
      const response = await fetch(target.toString(), {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const value = /^industrial_session=([^;]*)/.exec(cookie)?.[1];
        if (value === undefined) continue;
        const maxAge = Number(/max-age=(\d+)/i.exec(cookie)?.[1] ?? 0);
        if (!value || !maxAge) await session.defaultSession.cookies.remove(apiOrigin, "industrial_session");
        else await session.defaultSession.cookies.set({
          url: apiOrigin, name: "industrial_session", value, path: "/", httpOnly: true,
          secure: target.protocol === "https:", sameSite: "lax", expirationDate: Date.now() / 1000 + maxAge,
        });
      }
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("set-cookie");
      return new Response(response.body, { status: response.status, headers: responseHeaders });
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

  if (!process.env.ELECTRON_RENDERER_URL) {
    const apiOrigin = configuredOrigin("INDUSTRIAL_API_ORIGIN", DEFAULT_API_ORIGIN, ["http:", "https:"]);
    const api = new URL(apiOrigin), ws = new URL(wsOrigin);
    if (api.host !== ws.host || (api.protocol === "https:") !== (ws.protocol === "wss:")) {
      throw new Error("Authenticated telemetry requires matching API and WebSocket origins.");
    }
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${wsOrigin}/ws/telemetry/pages/*`] }, (details, done) => {
      // 仅自有窗口的 app 主文档可复用后端 Cookie，不能把凭据交给外部页面或渲染器。
      if (details.webContentsId !== window.webContents.id || details.frame?.url.split("/#")[0] !== `${APP_SCHEME}://${APP_HOST}`) {
        done({ cancel: true }); return;
      }
      void session.defaultSession.cookies.get({ url: apiOrigin, name: "industrial_session" }).then(cookies => {
        const headers = { ...details.requestHeaders };
        delete headers.Origin; delete headers.origin; delete headers.Cookie; delete headers.cookie;
        if (cookies.length) headers.Cookie = `industrial_session=${cookies[0].value}`;
        done({ requestHeaders: headers });
      }, () => done({ cancel: true }));
    });
  }

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
