import { createApp } from "./app.js";
import { readEnv } from "./env.js";

const env = readEnv();
const app = createApp();

app.listen(env.port, () => {
  console.log(`__SERVICE_NAME__ listening on ${env.port}`);
});
