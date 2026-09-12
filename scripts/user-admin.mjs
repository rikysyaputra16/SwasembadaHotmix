import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const wranglerBin = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const DB_NAME = process.env.D1_DATABASE || "swasembada-hotmix";
const ITERATIONS = 100000;
const ROLES = new Set(["Admin", "Panitia", "Viewer"]);

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWranglerSql(statement) {
  const dir = mkdtempSync(join(tmpdir(), "hotmix-user-"));
  const file = join(dir, "user.sql");
  writeFileSync(file, statement, { mode: 0o600 });
  const result = spawnSync(process.execPath, [wranglerBin, "d1", "execute", DB_NAME, "--remote", "--file", file], {
    stdio: "inherit",
    cwd: projectRoot,
    windowsHide: true,
  });
  rmSync(dir, { recursive: true, force: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function readHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error("Jalankan perintah ini dari terminal interaktif.");
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let value = "";
    const onData = (buffer) => {
      const text = buffer.toString("utf8");
      for (const char of text) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(130);
        if (char === "\u007f" || char === "\b") {
          if (value.length) value = value.slice(0, -1);
          continue;
        }
        value += char;
        process.stdout.write("*");
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding(null);
    process.stdin.on("data", onData);
  });
}

function validatePassword(password, username) {
  const checks = [
    [password.length >= 12, "minimal 12 karakter"],
    [/[a-z]/.test(password), "huruf kecil"],
    [/[A-Z]/.test(password), "huruf besar"],
    [/\d/.test(password), "angka"],
    [/[^A-Za-z0-9]/.test(password), "simbol"],
    [!password.toLowerCase().includes(username.toLowerCase()), "tidak mengandung username"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  if (missing.length) throw new Error(`Password harus memiliki: ${missing.join(", ")}.`);
}

async function passwordMaterial(username) {
  const first = await readHidden("Password baru: ");
  const second = await readHidden("Ulangi password: ");
  if (first !== second) throw new Error("Password tidak sama.");
  validatePassword(first, username);
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(first, salt, ITERATIONS, 32, "sha256");
  return {
    salt: salt.toString("base64url"),
    hash: hash.toString("base64url"),
  };
}

async function main() {
  const [command, usernameArg, roleArg, ...nameParts] = process.argv.slice(2);
  const username = String(usernameArg || "").trim();
  if (!command || !username) {
    console.log("Usage:");
    console.log("  node scripts/user-admin.mjs create <username> <Admin|Panitia|Viewer> <display name>");
    console.log("  node scripts/user-admin.mjs reset-password <username>");
    console.log("  node scripts/user-admin.mjs set-role <username> <Admin|Panitia|Viewer>");
    console.log("  node scripts/user-admin.mjs enable <username>");
    console.log("  node scripts/user-admin.mjs disable <username>");
    process.exit(1);
  }
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) throw new Error("Username tidak valid.");

  if (command === "create") {
    const role = roleArg;
    const displayName = nameParts.join(" ").trim() || username;
    if (!ROLES.has(role)) throw new Error("Role harus Admin, Panitia, atau Viewer.");
    const material = await passwordMaterial(username);
    runWranglerSql(`
      INSERT INTO app_users (
        id, username, display_name, role, password_salt, password_hash,
        password_iterations, active, failed_attempts, locked_until
      ) VALUES (
        ${sql(randomUUID())}, ${sql(username)}, ${sql(displayName)}, ${sql(role)},
        ${sql(material.salt)}, ${sql(material.hash)}, ${ITERATIONS}, 1, 0, NULL
      );
    `);
    console.log(`User ${username} (${role}) berhasil dibuat.`);
    return;
  }

  if (command === "reset-password") {
    const material = await passwordMaterial(username);
    runWranglerSql(`
      UPDATE app_users
      SET password_salt=${sql(material.salt)}, password_hash=${sql(material.hash)},
          password_iterations=${ITERATIONS}, failed_attempts=0, locked_until=NULL,
          updated_at=CURRENT_TIMESTAMP
      WHERE username=${sql(username)} COLLATE NOCASE;
      DELETE FROM auth_sessions WHERE user_id IN (
        SELECT id FROM app_users WHERE username=${sql(username)} COLLATE NOCASE
      );
    `);
    console.log(`Password ${username} berhasil direset dan seluruh sesi lama dicabut.`);
    return;
  }

  if (command === "set-role") {
    if (!ROLES.has(roleArg)) throw new Error("Role harus Admin, Panitia, atau Viewer.");
    runWranglerSql(`
      UPDATE app_users SET role=${sql(roleArg)}, updated_at=CURRENT_TIMESTAMP
      WHERE username=${sql(username)} COLLATE NOCASE;
      DELETE FROM auth_sessions WHERE user_id IN (
        SELECT id FROM app_users WHERE username=${sql(username)} COLLATE NOCASE
      );
    `);
    console.log(`Role ${username} diubah menjadi ${roleArg}; sesi lama dicabut.`);
    return;
  }

  if (command === "enable" || command === "disable") {
    const active = command === "enable" ? 1 : 0;
    runWranglerSql(`
      UPDATE app_users SET active=${active}, failed_attempts=0, locked_until=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE username=${sql(username)} COLLATE NOCASE;
      DELETE FROM auth_sessions WHERE user_id IN (
        SELECT id FROM app_users WHERE username=${sql(username)} COLLATE NOCASE
      );
    `);
    console.log(`User ${username} ${active ? "diaktifkan" : "dinonaktifkan"}.`);
    return;
  }

  throw new Error("Command tidak dikenal.");
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
