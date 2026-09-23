import { contextBridge } from "electron";

const prefix = "--industrial-ws-origin=";
const wsOrigin = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

contextBridge.exposeInMainWorld("industrialDesktop", Object.freeze({
  wsOrigin: wsOrigin ?? "ws://127.0.0.1:8000",
}));
