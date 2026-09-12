import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const wrangler=join(root,"node_modules","wrangler","bin","wrangler.js");
const iterations=100000;
const roles={admin:"Admin",panitia01:"Admin",viewer:"Viewer"};
const sql=value=>`'${String(value).replaceAll("'","''")}'`;

function validate(password,username){if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!(/[^A-Za-z0-9]/.test(password))||password.toLowerCase().includes(username.toLowerCase()))throw new Error("Password minimal 12 karakter, huruf besar/kecil, angka, simbol, dan tidak mengandung username.");}
function run(statement){const dir=mkdtempSync(join(tmpdir(),"hotmix-dev-user-")),file=join(dir,"user.sql");writeFileSync(file,statement,{mode:0o600});const result=spawnSync(process.execPath,[wrangler,"d1","execute","swasembada-hotmix","--local","--config","wrangler.dev.jsonc","--file",file],{cwd:root,stdio:"inherit",windowsHide:true});rmSync(dir,{recursive:true,force:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}

const [usernameArg,roleArg="admin",...nameParts]=process.argv.slice(2),username=String(usernameArg||"").trim(),roleKey=String(roleArg||"").toLowerCase(),displayName=nameParts.join(" ").trim()||username,password=process.env.HOTMIX_DEV_PASSWORD||"";
if(!/^[A-Za-z0-9._-]{3,64}$/.test(username))throw new Error("Usage: HOTMIX_DEV_PASSWORD=... node scripts/dev-user.mjs <username> <admin|panitia01|viewer> <display name>");
if(!roles[roleKey])throw new Error("Role harus admin, panitia01, atau viewer.");
if(!password)throw new Error("Set environment variable HOTMIX_DEV_PASSWORD terlebih dahulu.");
validate(password,username);
const salt=randomBytes(16),hash=pbkdf2Sync(password,salt,iterations,32,"sha256");
run(`INSERT INTO app_users (id,username,display_name,role,role_key,password_salt,password_hash,password_iterations,active,failed_attempts) VALUES (${sql(randomUUID())},${sql(username)},${sql(displayName)},${sql(roles[roleKey])},${sql(roleKey)},${sql(salt.toString("base64url"))},${sql(hash.toString("base64url"))},${iterations},1,0) ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,role_key=excluded.role_key,password_salt=excluded.password_salt,password_hash=excluded.password_hash,password_iterations=excluded.password_iterations,active=1,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP;`);
console.log(`DEV user ${username} (${roleKey}) siap digunakan.`);
