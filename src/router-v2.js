import entry from "./entry.js";
import accounts from "./accounts.js";

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/api/profile") return accounts.fetch(request, env, ctx);
    return entry.fetch(request, env, ctx);
  },
};
