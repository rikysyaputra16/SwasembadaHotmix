import entry from "./entry.js";
import accounts from "./accounts.js";

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    const handled = path === "/api/profile" || path === "/api/admin/users" || path === "/api/admin/roles" || path === "/api/admin/user-password";
    if (handled) return accounts.fetch(request, env, ctx);
    return entry.fetch(request, env, ctx);
  },
};
