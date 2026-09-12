import base from "./router-feature.js";
import userUpdate from "./user-update.js";

export default{async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path==="/api/account/update"&&request.method==="PUT")return userUpdate.fetch(request,env,ctx);return base.fetch(request,env,ctx)}};
