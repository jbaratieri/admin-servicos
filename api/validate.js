// Igual ao Método Baratieri: deviceId, MaxDevices, auditoria — tabela via AIRTABLE_TABLE (licences_os).
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Método não permitido." });
  }

  try {
    const { code, deviceId } = req.body || {};
    if (!code) {
      return res.status(400).json({
        ok: false,
        msg: "Código ausente.",
        server_time: new Date().toISOString()
      });
    }

    const AIRTABLE_BASE = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID;
    const AIRTABLE_KEY = process.env.AIRTABLE_KEY || process.env.AIRTABLE_API_KEY;
    const TABLE = process.env.AIRTABLE_TABLE || "licences_os";

    if (!AIRTABLE_BASE || !AIRTABLE_KEY) {
      return res.status(503).json({
        ok: false,
        msg: "Serviço de licenças indisponível.",
        server_time: new Date().toISOString()
      });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const ua = req.headers["user-agent"] || "unknown";
    const now = new Date();
    const nowISO = now.toISOString();

    const daysBetween = (a, b) => {
      const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
      return Math.floor(ms / (1000 * 60 * 60 * 24));
    };

    const STALE_DAYS = 90;
    const DEFAULT_MAX_DEVICES = 5;

    const formula = `({code}='${String(code).replace(/'/g, "\\'")}')`;
    const pathTable = encodeURIComponent(TABLE);
    const url =
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${pathTable}` +
      `?filterByFormula=${encodeURIComponent(formula)}` +
      `&maxRecords=1&ts=${Date.now()}`;

    const resAirtable = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}` },
      cache: "no-store"
    });

    if (!resAirtable.ok) {
      const text = await resAirtable.text();
      return res.status(502).json({
        ok: false,
        msg: "Falha ao consultar a base de licenças.",
        error: text,
        server_time: nowISO
      });
    }

    const data = await resAirtable.json();
    if (!data.records || data.records.length === 0) {
      return res.status(404).json({ ok: false, msg: "Código inválido.", server_time: nowISO });
    }

    const rec = data.records[0];
    const f = rec.fields || {};

    const planNorm = (f.plan_type || "mensal")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    const isVitalicio = planNorm === "vitalicio";

    const expDate = f.expires_at ? new Date(f.expires_at) : null;
    const expired = !isVitalicio && expDate && now > expDate;

    if (f.blocked === true) {
      return res.status(403).json({
        ok: false,
        msg: "Acesso bloqueado. Contate o suporte.",
        server_time: nowISO
      });
    }

    if (expired) {
      return res.status(403).json({
        ok: false,
        msg: "Código expirado. Renove sua assinatura.",
        server_time: nowISO
      });
    }

    const oldHistory = (f.ip_history || "").split(",").map(s => s.trim()).filter(Boolean);
    const ipSet = new Set(oldHistory);
    ipSet.add(ip);
    const ipList = Array.from(ipSet).slice(-20);
    const distinctCount = ipList.length;
    const manyDistinctIps = distinctCount >= 7;

    if (planNorm === "trial7") {
      const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${pathTable}/${rec.id}`;
      await fetch(patchUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          fields: {
            last_ip: ip,
            last_used: nowISO,
            ip_history: ipList.join(","),
            last_ua: ua,
            flagged: !!f.flagged
          }
        })
      });

      return res.status(200).json({
        ok: true,
        msg: "✅ Teste ativo.",
        plan: "trial7",
        expires: expDate || null,
        ip,
        distinct_ips: distinctCount,
        flagged: !!f.flagged,
        many_distinct_ips: manyDistinctIps,
        deviceCount: Number(f.DeviceCount || 0) || 0,
        maxDevices: Number(f.MaxDevices || 0) || DEFAULT_MAX_DEVICES,
        server_time: nowISO,
        note: "trial_does_not_count_devices"
      });
    }

    function parseDevicesField(devField) {
      if (!devField) return [];
      if (Array.isArray(devField)) return devField;
      if (typeof devField === "string") {
        try {
          return JSON.parse(devField);
        } catch {
          return [];
        }
      }
      return [];
    }

    const devices = parseDevicesField(f.Devices);
    let maxDevices = Number(f.MaxDevices || DEFAULT_MAX_DEVICES);
    if (!Number.isFinite(maxDevices) || maxDevices < 1) maxDevices = DEFAULT_MAX_DEVICES;

    let updatedDevices = devices.slice();
    let deviceIDs = updatedDevices.map(d => d.deviceId).filter(Boolean);
    let deviceCountStored = Number(f.DeviceCount || updatedDevices.length || 0);
    let flagged = !!f.flagged;

    let isNewActivation = false;
    let replacedDeviceId = null;

    if (deviceId && typeof deviceId === "string" && deviceId.trim()) {
      const trimmedId = deviceId.trim();
      const idx = updatedDevices.findIndex(d => d.deviceId === trimmedId);

      if (idx >= 0) {
        updatedDevices[idx].lastSeen = nowISO;
        updatedDevices[idx].lastIp = ip;
        updatedDevices[idx].userAgent = ua || updatedDevices[idx].userAgent || "";
      } else {
        if (updatedDevices.length < maxDevices) {
          updatedDevices.push({
            deviceId: trimmedId,
            firstSeen: nowISO,
            lastSeen: nowISO,
            lastIp: ip,
            userAgent: ua || ""
          });
          isNewActivation = true;
        } else {
          const staleIndex = updatedDevices.findIndex(d => {
            const last = d.lastSeen || d.firstSeen || nowISO;
            return daysBetween(last, nowISO) > STALE_DAYS;
          });

          if (staleIndex >= 0) {
            replacedDeviceId = updatedDevices[staleIndex].deviceId || null;
            updatedDevices.splice(staleIndex, 1, {
              deviceId: trimmedId,
              firstSeen: nowISO,
              lastSeen: nowISO,
              lastIp: ip,
              userAgent: ua || ""
            });
            isNewActivation = true;
          } else {
            const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${pathTable}/${rec.id}`;
            await fetch(patchUrl, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                fields: {
                  last_ip: ip,
                  last_used: nowISO,
                  ip_history: ipList.join(","),
                  last_ua: ua,
                  flagged: true
                }
              })
            });

            return res.status(403).json({
              ok: false,
              msg: "Limite de dispositivos atingido para esta licença.",
              plan: isVitalicio ? "vitalicio" : "mensal",
              deviceCount: updatedDevices.length,
              maxDevices,
              server_time: nowISO
            });
          }
        }
      }
    } else {
      isNewActivation = true;
    }

    const previousUseCount = Number(f.use_count || 0);
    const newUseCount = isNewActivation ? previousUseCount + 1 : previousUseCount;

    deviceIDs = updatedDevices.map(d => d.deviceId).filter(Boolean);
    deviceCountStored = updatedDevices.length;

    try {
      const createdLast30 = updatedDevices.filter(
        d => daysBetween(d.firstSeen || nowISO, nowISO) <= 30
      ).length;
      if (createdLast30 >= 3) flagged = true;
    } catch {
      /* ignore */
    }

    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${pathTable}/${rec.id}`;
    await fetch(patchUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${AIRTABLE_KEY}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        fields: {
          last_ip: ip,
          last_used: nowISO,
          use_count: newUseCount,
          ip_history: ipList.join(","),
          last_ua: ua,
          flagged,
          DeviceCount: deviceCountStored,
          Devices: JSON.stringify(updatedDevices),
          DeviceIDs: deviceIDs.join(",")
        }
      })
    });

    const msg = isVitalicio
      ? "✅ Acesso vitalício confirmado."
      : `🪶 Acesso válido até ${expDate ? expDate.toLocaleDateString("pt-BR") : "—"}.`;

    return res.status(200).json({
      ok: true,
      msg,
      plan: isVitalicio ? "vitalicio" : "mensal",
      expires: expDate || null,
      ip,
      distinct_ips: distinctCount,
      flagged,
      many_distinct_ips: manyDistinctIps,
      deviceReplaced: replacedDeviceId || null,
      deviceCount: deviceCountStored,
      maxDevices,
      server_time: nowISO
    });
  } catch (err) {
    console.error("[validate.js]:", err);
    return res.status(500).json({
      ok: false,
      msg: "Erro interno no servidor.",
      server_time: new Date().toISOString()
    });
  }
}
