import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createHelpHttpServer } from "./http.ts";

const dispatcher = new EnvHttpProxyAgent();
setGlobalDispatcher(dispatcher);
const server = createHelpHttpServer();
// 不提供 0.0.0.0 配置：本版只能复用本机 Pi，不能作为共享的企业服务。
server.listen(8001, "127.0.0.1", () => console.log("产品帮助 API：http://127.0.0.1:8001（仅本机）"));
server.on("error", () => { console.error("帮助 API 启动失败，请检查 8001 端口。"); process.exitCode = 1; });
const stop = () => { server.close(); server.closeAllConnections(); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
server.once("close", () => { void dispatcher.close(); });
