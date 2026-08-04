import { createEmbedProxy } from "@fsj/demo-kit/server";
export const proxy = createEmbedProxy({
  audience: "modular-rag-assistant",
  publicPaths: ["/dock", "/dock-host.js"],
});
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
