import entry from "./entry.js";
import accounts from "./accounts.js";

export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url),path=url.pathname;
    if(path==="/api/profile"||path==="/api/admin/users"||path==="/api/admin/roles")return accounts.fetch(request,env,ctx);
    if(path==="/app-16.js"&&request.method==="GET"){
      url.pathname="/app-16-dev.js";
      return entry.fetch(new Request(url,request),env,ctx);
    }
    return entry.fetch(request,env,ctx);
  },
};
