const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MAX_PROOF_SIZE = 10 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function badRequest(message) {
  return json({ ok: false, error: message }, 400);
}

function safeText(value, max = 5000) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max);
}

function integer(value, field, { min = 0, allowZero = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || (!allowZero && n === 0)) {
    throw new Error(`${field} tidak valid.`);
  }
  return n;
}

function requireId(value, field = "ID") {
  const id = safeText(value, 80).trim();
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`${field} tidak valid.`);
  return id;
}

function validateMember(input) {
  const planType = safeText(input.planType, 30) || "Tetap";
  if (!new Set(["Tetap", "Custom", "Bayar Penuh"]).has(planType)) throw new Error("Jenis angsuran tidak valid.");
  const active = safeText(input.aktif, 10) || "Ya";
  if (!new Set(["Ya", "Tidak"]).has(active)) throw new Error("Status aktif tidak valid.");
  return {
    id: requireId(input.id, "ID anggota"),
    nama: safeText(input.nama, 200).trim(),
    noRumah: safeText(input.noRumah, 80).trim(),
    noHp: safeText(input.noHp, 200).trim(),
    totalBiaya: integer(input.totalBiaya, "Total biaya"),
    nominalAngsuran: integer(input.nominalAngsuran ?? 0, "Nominal angsuran"),
    lamaAngsuran: safeText(input.lamaAngsuran, 80).trim(),
    planType,
    tanggalAngsuran: safeText(input.tanggalAngsuran, 80).trim() || "10",
    catatan: safeText(input.catatan, 5000),
    petugas: safeText(input.petugas, 150).trim() || "Panitia",
    pendamping: safeText(input.pendamping, 300),
    aktif: active,
  };
}

function validatePlan(input) {
  const type = safeText(input.type, 30) || "Tetap";
  if (!new Set(["Tetap", "Custom", "Bayar Penuh"]).has(type)) throw new Error("Jenis rencana tidak valid.");
  const dueMonth = safeText(input.dueMonth, 7);
  if (!/^\d{4}-\d{2}$/.test(dueMonth)) throw new Error("Periode tagihan tidak valid.");
  return {
    id: requireId(input.id, "ID rencana"),
    memberId: requireId(input.memberId, "ID anggota"),
    type,
    sequence: integer(input.sequence, "Urutan angsuran", { min: 1, allowZero: false }),
    dueMonth,
    dueLabel: safeText(input.dueLabel, 80).trim() || "10",
    amount: integer(input.amount, "Nominal rencana"),
    note: safeText(input.note, 5000),
  };
}

function validatePayment(input) {
  const date = safeText(input.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Tanggal pembayaran tidak valid.");
  return {
    id: requireId(input.id, "ID pembayaran"),
    memberId: requireId(input.memberId, "ID anggota"),
    date,
    amount: integer(input.amount, "Nominal pembayaran", { min: 1, allowZero: false }),
    category: safeText(input.category, 80).trim() || "Cicilan",
    method: safeText(input.method, 80).trim() || "Transfer",
    period: safeText(input.period, 80),
    paymentType: safeText(input.paymentType, 80),
    receiver: safeText(input.receiver, 200).trim() || "Bendahara",
    note: safeText(input.note, 5000),
    timestamp: safeText(input.timestamp, 80).trim() || new Date().toISOString(),
    proofName: safeText(input.proofName, 300),
    proofType: safeText(input.proofType, 120),
    proofPath: safeText(input.proofPath, 700),
  };
}

function memberStatement(db, m) {
  return db.prepare(`
    INSERT INTO members (
      id,name,house_no,phone,total_cost,installment_amount,installment_term,
      plan_type,installment_due,initial_note,officer,companion,active,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, house_no=excluded.house_no, phone=excluded.phone,
      total_cost=excluded.total_cost, installment_amount=excluded.installment_amount,
      installment_term=excluded.installment_term, plan_type=excluded.plan_type,
      installment_due=excluded.installment_due, initial_note=excluded.initial_note,
      officer=excluded.officer, companion=excluded.companion, active=excluded.active,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    m.id, m.nama, m.noRumah, m.noHp, m.totalBiaya, m.nominalAngsuran,
    m.lamaAngsuran, m.planType, m.tanggalAngsuran, m.catatan,
    m.petugas, m.pendamping, m.aktif
  );
}

function planStatement(db, p) {
  return db.prepare(`
    INSERT INTO installment_plans (
      id,member_id,plan_type,sequence_no,due_month,due_label,amount,note,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      member_id=excluded.member_id, plan_type=excluded.plan_type,
      sequence_no=excluded.sequence_no, due_month=excluded.due_month,
      due_label=excluded.due_label, amount=excluded.amount, note=excluded.note,
      updated_at=CURRENT_TIMESTAMP
  `).bind(p.id, p.memberId, p.type, p.sequence, p.dueMonth, p.dueLabel, p.amount, p.note);
}

function paymentStatement(db, p) {
  return db.prepare(`
    INSERT INTO payments (
      id,member_id,payment_date,amount,category,method,period_label,payment_type,
      receiver,note,recorded_at,proof_name,proof_type,proof_key,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      member_id=excluded.member_id, payment_date=excluded.payment_date,
      amount=excluded.amount, category=excluded.category, method=excluded.method,
      period_label=excluded.period_label, payment_type=excluded.payment_type,
      receiver=excluded.receiver, note=excluded.note, recorded_at=excluded.recorded_at,
      proof_name=excluded.proof_name, proof_type=excluded.proof_type,
      proof_key=excluded.proof_key, updated_at=CURRENT_TIMESTAMP
  `).bind(
    p.id, p.memberId, p.date, p.amount, p.category, p.method, p.period,
    p.paymentType, p.receiver, p.note, p.timestamp, p.proofName || null,
    p.proofType || null, p.proofPath || null
  );
}

async function bootstrap(env) {
  const [membersResult, plansResult, paymentsResult, settingsResult] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM members ORDER BY CAST(REPLACE(house_no,'/','') AS INTEGER), house_no, name"),
    env.DB.prepare("SELECT * FROM installment_plans ORDER BY member_id, sequence_no"),
    env.DB.prepare("SELECT * FROM payments ORDER BY payment_date, recorded_at, id"),
    env.DB.prepare("SELECT key, value FROM app_settings"),
  ]);

  const members = (membersResult.results || []).map((r) => ({
    id: r.id,
    nama: r.name,
    noRumah: r.house_no,
    noHp: r.phone || "",
    totalBiaya: Number(r.total_cost || 0),
    nominalAngsuran: Number(r.installment_amount || 0),
    lamaAngsuran: r.installment_term || "",
    planType: r.plan_type || "Tetap",
    tanggalAngsuran: r.installment_due || "10",
    catatan: r.initial_note || "",
    petugas: r.officer || "Panitia",
    pendamping: r.companion || "",
    aktif: r.active || "Ya",
  }));

  const plans = (plansResult.results || []).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    type: r.plan_type,
    sequence: Number(r.sequence_no || 0),
    dueMonth: r.due_month,
    dueLabel: r.due_label || "10",
    amount: Number(r.amount || 0),
    note: r.note || "",
  }));

  const payments = (paymentsResult.results || []).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    date: r.payment_date,
    amount: Number(r.amount || 0),
    category: r.category || "Cicilan",
    method: r.method || "Transfer",
    period: r.period_label || "",
    paymentType: r.payment_type || "",
    receiver: r.receiver || "Bendahara",
    note: r.note || "",
    timestamp: r.recorded_at,
    proofName: r.proof_name || "",
    proofType: r.proof_type || "",
    proofPath: r.proof_key || "",
  }));

  const settings = Object.fromEntries((settingsResult.results || []).map((r) => [r.key, r.value ?? ""]));
  return {
    members,
    plans,
    payments,
    fileName: "Swasembada_Hotmix_RT_Atas.xlsx",
    reportMonth: settings.reportMonth || "",
    historyMonth: settings.historyMonth || "",
    historyMember: settings.historyMember || "",
    defaultReceiver: settings.defaultReceiver || "",
    paymentBank: settings.paymentBank || "",
    paymentAccount: settings.paymentAccount || "",
    paymentAccountName: settings.paymentAccountName || "",
    cashCollectors: settings.cashCollectors || "",
    defaultOfficer: settings.defaultOfficer || "",
    defaultCompanion: settings.defaultCompanion || "",
  };
}

async function mutate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Payload JSON tidak valid.");
  }

  try {
    switch (body.type) {
      case "member-upsert": {
        const member = validateMember(body.member || {});
        const plans = Array.isArray(body.plans) ? body.plans.map(validatePlan) : [];
        if (plans.some((p) => p.memberId !== member.id)) throw new Error("Rencana tidak sesuai dengan anggota.");
        const statements = [
          memberStatement(env.DB, member),
          env.DB.prepare("DELETE FROM installment_plans WHERE member_id = ?").bind(member.id),
          ...plans.map((p) => planStatement(env.DB, p)),
        ];
        await env.DB.batch(statements);
        break;
      }
      case "member-delete": {
        const id = requireId(body.id, "ID anggota");
        const proofRows = await env.DB.prepare(
          "SELECT proof_key FROM payments WHERE member_id = ? AND proof_key IS NOT NULL AND proof_key <> ''"
        ).bind(id).all();
        await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(id).run();
        for (const row of proofRows.results || []) {
          await env.PROOFS.delete(row.proof_key).catch((error) => console.error("r2_cleanup_error", error));
        }
        break;
      }
      case "plan-upsert": {
        const plan = validatePlan(body.plan || {});
        const statements = [planStatement(env.DB, plan)];
        if (body.memberPlanType) {
          const type = safeText(body.memberPlanType, 30);
          if (!new Set(["Tetap", "Custom", "Bayar Penuh"]).has(type)) throw new Error("Jenis angsuran anggota tidak valid.");
          statements.push(env.DB.prepare("UPDATE members SET plan_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(type, plan.memberId));
        }
        await env.DB.batch(statements);
        break;
      }
      case "plan-delete": {
        const id = requireId(body.id, "ID rencana");
        await env.DB.prepare("DELETE FROM installment_plans WHERE id = ?").bind(id).run();
        break;
      }
      case "plans-replace": {
        const memberId = requireId(body.memberId, "ID anggota");
        const plans = Array.isArray(body.plans) ? body.plans.map(validatePlan) : [];
        if (plans.some((p) => p.memberId !== memberId)) throw new Error("Rencana tidak sesuai dengan anggota.");
        await env.DB.batch([
          env.DB.prepare("DELETE FROM installment_plans WHERE member_id = ?").bind(memberId),
          ...plans.map((p) => planStatement(env.DB, p)),
        ]);
        break;
      }
      case "payment-upsert": {
        const payment = validatePayment(body.payment || {});
        const existing = await env.DB.prepare("SELECT proof_key FROM payments WHERE id = ?").bind(payment.id).first();
        await paymentStatement(env.DB, payment).run();
        if (existing?.proof_key && existing.proof_key !== payment.proofPath) {
          await env.PROOFS.delete(existing.proof_key).catch((error) => console.error("r2_cleanup_error", error));
        }
        break;
      }
      case "payment-delete": {
        const id = requireId(body.id, "ID pembayaran");
        const existing = await env.DB.prepare("SELECT proof_key FROM payments WHERE id = ?").bind(id).first();
        await env.DB.prepare("DELETE FROM payments WHERE id = ?").bind(id).run();
        if (existing?.proof_key) {
          await env.PROOFS.delete(existing.proof_key).catch((error) => console.error("r2_cleanup_error", error));
        }
        break;
      }
      default:
        return badRequest("Jenis mutasi tidak dikenal.");
    }
    return json({ ok: true });
  } catch (error) {
    console.error("mutation_error", error);
    return badRequest(error?.message || "Mutasi gagal.");
  }
}

async function updateSettings(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Payload JSON tidak valid.");
  }
  const allowed = ["reportMonth", "historyMonth", "historyMember"];
  const statements = [];
  for (const key of allowed) {
    if (!(key in body)) continue;
    statements.push(
      env.DB.prepare(`
        INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
      `).bind(key, safeText(body[key], 200))
    );
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ ok: true });
}

function safeFileName(name) {
  return safeText(name || "bukti", 180)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "bukti";
}

async function uploadProof(request, env, paymentId) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return badRequest("File bukti tidak ditemukan.");
  if (file.size <= 0 || file.size > MAX_PROOF_SIZE) return badRequest("Ukuran bukti maksimal 10 MB.");
  if (!ALLOWED_PROOF_TYPES.has(file.type)) return badRequest("Tipe file bukti tidak didukung.");

  const safeName = safeFileName(file.name);
  const key = `proofs/${paymentId}/${crypto.randomUUID()}-${safeName}`;
  await env.PROOFS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { paymentId, originalName: safeName },
  });

  // Do not delete the previous object here. The payment row is updated in a
  // separate request; deleting the old proof before D1 commits can create a
  // broken database reference. The payment-upsert mutation cleans it up only
  // after the new D1 row is safely committed.
  return json({ ok: true, name: safeName, type: file.type, key });
}

async function getProof(env, key) {
  if (!key || !key.startsWith("proofs/")) return badRequest("Key bukti tidak valid.");
  const object = await env.PROOFS.get(key);
  if (!object) return json({ ok: false, error: "Bukti tidak ditemukan di R2." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function deleteProof(env, key) {
  if (!key || !key.startsWith("proofs/")) return badRequest("Key bukti tidak valid.");
  await env.PROOFS.delete(key);
  return json({ ok: true });
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health" && request.method === "GET") {
        const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM members").first();
        return json({ ok: true, database: true, members: Number(row?.total || 0), r2: Boolean(env.PROOFS) });
      }

      if (path === "/api/bootstrap" && request.method === "GET") {
        return json({ ok: true, state: await bootstrap(env) });
      }

      if (path === "/api/mutate" && request.method === "POST") {
        return mutate(request, env);
      }

      if (path === "/api/settings" && request.method === "PUT") {
        return updateSettings(request, env);
      }

      const uploadMatch = path.match(/^\/api\/proofs\/upload\/([A-Za-z0-9._-]+)$/);
      if (uploadMatch && request.method === "POST") {
        return uploadProof(request, env, uploadMatch[1]);
      }

      const objectMatch = path.match(/^\/api\/proofs\/object\/(.+)$/);
      if (objectMatch) {
        const key = decodeURIComponent(objectMatch[1]);
        if (request.method === "GET") return getProof(env, key);
        if (request.method === "DELETE") return deleteProof(env, key);
      }

      if (path.startsWith("/api/")) return json({ ok: false, error: "Endpoint tidak ditemukan." }, 404);

      return applySecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      console.error("worker_error", error);
      return json({ ok: false, error: "Internal server error." }, 500);
    }
  },
};
