import { createApp } from "./app.js";
import { readEnv } from "./env.js";

const env = readEnv();
const app = createApp();

app.listen(env.port, () => {
  console.log(`admin listening on ${env.port}`);
});
