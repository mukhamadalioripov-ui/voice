import http from "http";
import { env } from "./env.js";
import { buildHttpApp } from "./http.js";
import { attachSocketIO } from "./ws.js";

async function main() {
  const app = buildHttpApp();
  const server = http.createServer(app);

  attachSocketIO(server);

  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`server listening on :${env.PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
