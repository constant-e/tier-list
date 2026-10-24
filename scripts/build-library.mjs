/**
 * Builds the bundled avatar library.
 *
 * Sources (fan-maintained mirrors of official game data):
 *   - Genshin Impact: Project Amber (gi.yatta.moe)
 *   - Honkai: Star Rail: Project Amber (sr.yatta.moe) + StarRailRes (Mar-7th)
 *   - Zenless Zone Zero: Enka.Network data + Nanoka asset mirror
 *
 * Usage: node scripts/build-library.mjs [--force]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const DATA_DIR = path.join(ROOT, "data");
const FORCE = process.argv.includes("--force");
const NOW = Date.now();
const SNAPSHOT = new Date(NOW).toISOString().slice(0, 10);
const UA = "tier-list-maker/1.0 (fan project; asset snapshot)";

const GI_ELEMENT = { Fire: "火", Water: "水", Wind: "风", Ice: "冰", Rock: "岩", Electric: "雷", Grass: "草" };
const HSR_ELEMENT = { Physical: "物理", Fire: "火", Ice: "冰", Thunder: "雷", Wind: "风", Quantum: "量子", Imaginary: "虚数" };
const HSR_PATH = {
  Warrior: "毁灭",
  Rogue: "巡猎",
  Mage: "智识",
  Shaman: "同谐",
  Warlock: "虚无",
  Knight: "存护",
  Abundance: "丰饶",
  Memory: "记忆",
  Elation: "欢愉",
};
const ZZZ_PROFESSION = {
  Attack: "强攻",
  Stun: "击破",
  Anomaly: "异常",
  Support: "支援",
  Defense: "防护",
  Rupture: "命破",
};

const cleanName = (value) => String(value ?? "").replace(/<[^>]+>/g, "").trim();
const baseId = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "");

async function fetchWithRetry(url, { as = "text", attempts = 4, timeout = 90_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA, accept: as === "json" ? "application/json" : "*/*" },
        signal: AbortSignal.timeout(timeout),
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      if (as === "json") return await response.json();
      if (as === "buffer") {
        const type = response.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) throw new Error(`unexpected content-type: ${type}`);
        return { buffer: Buffer.from(await response.arrayBuffer()), type };
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt * attempt));
      }
    }
  }
  throw new Error(`${url} -> ${lastError?.message ?? "unknown error"}`);
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function dedupeByIcon(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!seen.has(entry.icon)) seen.set(entry.icon, entry);
  }
  return [...seen.values()];
}

function describeDuplicates(entries, game) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);

  for (const entry of entries) {
    if ((counts.get(entry.name) ?? 0) === 1) continue;

    if (game === "gi" && entry.name === "旅行者") {
      const isMale = /PlayerBoy/i.test(entry.icon);
      entry.name = isMale ? "旅行者（空）" : "旅行者（荧）";
      entry.en = isMale ? "Traveler (Aether)" : "Traveler (Lumine)";
      entry.detail = "旅行者";
    } else if (game === "hsr" && entry.name === "三月七") {
      const pathName = HSR_PATH[entry.path] ?? entry.path;
      entry.name = `三月七·${pathName}`;
      entry.en = `March 7th (${entry.path ?? "Unknown"})`;
      entry.detail = `${pathName} · ${entry.elementName ?? ""}`.replace(/ · $/, "");
    } else if (game === "hsr" && entry.name === "开拓者") {
      const pathName = HSR_PATH[entry.path] ?? entry.path;
      const gender = Number(entry.icon) % 2 === 1 ? "男" : "女";
      entry.name = `开拓者·${pathName}（${gender}）`;
      entry.en = `Trailblazer (${entry.path ?? "Unknown"}, ${gender === "男" ? "Male" : "Female"})`;
      entry.detail = `${pathName} · ${entry.elementName ?? ""} · ${gender}`;
    } else {
      entry.name = `${entry.name}（${entry.detail || "变体"}）`;
    }
  }
}

function downloadTarget(game, id, type) {
  const ext = type.includes("webp") ? "webp" : type.includes("jpeg") ? "jpg" : "png";
  return { rel: `assets/${game}/${id}.${ext}`, ext };
}

async function saveImage(game, id, remoteCandidates) {
  const dir = path.join(ASSETS, game);
  await fs.mkdir(dir, { recursive: true });

  for (const candidate of remoteCandidates) {
    for (const rel of await existingFiles(game, id)) {
      const full = path.join(ROOT, rel);
      const stat = await fs.stat(full).catch(() => null);
      if (!FORCE && stat && stat.size > 1024) return rel;
    }
    try {
      const { buffer, type } = await fetchWithRetry(candidate, { as: "buffer", attempts: 3, timeout: 60_000 });
      const { rel } = downloadTarget(game, id, type);
      await fs.writeFile(path.join(ROOT, rel), buffer);
      return rel;
    } catch (error) {
      console.warn(`  ! ${candidate} -> ${error.message}`);
    }
  }
  return null;
}

async function existingFiles(game, id) {
  const dir = path.join(ASSETS, game);
  const names = await fs.readdir(dir).catch(() => []);
  return names.filter((name) => name.startsWith(`${id}.`)).map((name) => `assets/${game}/${name}`);
}

async function buildGenshin() {
  const [zh, en] = await Promise.all([
    fetchWithRetry("https://gi.yatta.moe/api/v2/CHS/avatar", { as: "json" }),
    fetchWithRetry("https://gi.yatta.moe/api/v2/EN/avatar", { as: "json" }),
  ]);
  const enById = en.data.items;
  let raw = Object.values(zh.data.items)
    .filter((item) => !item.release || item.release * 1000 <= NOW)
    .map((item) => ({
      id: String(item.id).split("-")[0],
      name: cleanName(item.name),
      en: cleanName(enById[item.id]?.name ?? item.name),
      icon: item.icon,
      release: item.release ?? 0,
      detail: GI_ELEMENT[item.element] ?? item.element ?? "",
    }))
    .sort((a, b) => a.release - b.release || a.id.localeCompare(b.id));

  raw = dedupeByIcon(raw);
  describeDuplicates(raw, "gi");

  const characters = [];
  const failures = [];
  await pool(raw, 8, async (entry) => {
    const id = baseId(entry.id);
    const src = await saveImage("gi", id, [
      `https://gi.yatta.moe/assets/UI/${encodeURIComponent(entry.icon)}.png`,
    ]);
    if (!src) {
      failures.push(entry.name);
      return;
    }
    characters.push({ id, name: entry.name, en: entry.en, detail: entry.detail, src });
  });
  characters.sort((a, b) => raw.findIndex((x) => baseId(x.id) === a.id) - raw.findIndex((x) => baseId(x.id) === b.id));
  return { characters, failures };
}

async function buildStarRail() {
  const [zh, en] = await Promise.all([
    fetchWithRetry("https://sr.yatta.moe/api/v2/CN/avatar", { as: "json" }),
    fetchWithRetry("https://sr.yatta.moe/api/v2/en/avatar", { as: "json" }),
  ]);
  const enById = en.data.items;
  let raw = Object.values(zh.data.items)
    .filter((item) => !item.release || item.release * 1000 <= NOW)
    .map((item) => ({
      id: String(item.id),
      name: cleanName(item.name),
      en: cleanName(enById[item.id]?.name ?? item.name),
      icon: String(item.icon ?? item.id),
      release: item.release ?? 0,
      path: item.types?.pathType,
      elementName: HSR_ELEMENT[item.types?.combatType] ?? item.types?.combatType ?? "",
      detail: [HSR_PATH[item.types?.pathType], HSR_ELEMENT[item.types?.combatType]].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => a.release - b.release || Number(a.id) - Number(b.id));

  raw = dedupeByIcon(raw);
  describeDuplicates(raw, "hsr");

  const characters = [];
  const failures = [];
  await pool(raw, 8, async (entry) => {
    const id = baseId(entry.id);
    const src = await saveImage("hsr", id, [
      `https://gcore.jsdelivr.net/gh/Mar-7th/StarRailRes@master/icon/character/${encodeURIComponent(entry.icon)}.png`,
      `https://fastly.jsdelivr.net/gh/Mar-7th/StarRailRes@master/icon/character/${encodeURIComponent(entry.icon)}.png`,
      `https://cdn.jsdelivr.net/gh/Mar-7th/StarRailRes@master/icon/character/${encodeURIComponent(entry.icon)}.png`,
      `https://sr.yatta.moe/hsr/assets/UI/avatar/${encodeURIComponent(entry.icon)}.png`,
    ]);
    if (!src) {
      failures.push(entry.name);
      return;
    }
    characters.push({ id, name: entry.name, en: entry.en, detail: entry.detail, src });
  });
  characters.sort((a, b) => raw.findIndex((x) => baseId(x.id) === a.id) - raw.findIndex((x) => baseId(x.id) === b.id));
  return { characters, failures };
}

async function buildZenless() {
  const [avatars, locs] = await Promise.all([
    fetchWithRetry("https://cdn.jsdelivr.net/gh/EnkaNetwork/API-docs@master/store/zzz/avatars.json", { as: "json" }),
    fetchWithRetry("https://cdn.jsdelivr.net/gh/EnkaNetwork/API-docs@master/store/zzz/locs.json", { as: "json" }),
  ]);
  const zh = locs["zh-cn"];
  const en = locs.en;

  let raw = Object.entries(avatars)
    .map(([id, item]) => {
      const internal = item.Name;
      const circle = item.CircleIcon;
      const selectMatch = /IconRoleCircle([^./]+)\./i.exec(circle);
      const detail = ZZZ_PROFESSION[item.ProfessionType] ?? "代理人";
      return {
        id: String(id),
        name: cleanName(zh[internal] ?? internal),
        en: cleanName(en[internal] ?? internal),
        icon: selectMatch?.[1] ?? String(id),
        circle,
        release: Number(id),
        detail,
      };
    })
    .filter((item) => item.name && item.circle)
    .sort((a, b) => a.release - b.release);

  raw = dedupeByIcon(raw);
  describeDuplicates(raw, "zzz");

  const characters = [];
  const failures = [];
  await pool(raw, 6, async (entry) => {
    const id = baseId(entry.id);
    const src = await saveImage("zzz", id, [
      `https://static.nanoka.cc/assets/zzz/IconRoleSelect${encodeURIComponent(entry.icon)}.webp`,
      `https://static.nanoka.cc/assets/zzz/IconRoleCircle${encodeURIComponent(entry.icon)}.webp`,
      `https://enka.network${entry.circle}`,
    ]);
    if (!src) {
      failures.push(entry.name);
      return;
    }
    characters.push({ id, name: entry.name, en: entry.en, detail: entry.detail, src });
  });
  characters.sort((a, b) => Number(a.id) - Number(b.id));
  return { characters, failures };
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  console.log(`Building avatar library, snapshot ${SNAPSHOT}`);
  console.log("Genshin Impact...");
  const gi = await buildGenshin();
  console.log(`  ${gi.characters.length} characters, ${gi.failures.length} failures`);
  console.log("Honkai: Star Rail...");
  const hsr = await buildStarRail();
  console.log(`  ${hsr.characters.length} characters, ${hsr.failures.length} failures`);
  console.log("Zenless Zone Zero...");
  const zzz = await buildZenless();
  console.log(`  ${zzz.characters.length} characters, ${zzz.failures.length} failures`);

  const failures = [...gi.failures, ...hsr.failures, ...zzz.failures];
  if (failures.length) {
    console.error("Missing avatars:", failures);
    console.error("Refusing to write a partial manifest; existing data was left untouched.");
    process.exitCode = 1;
    return;
  }

  const manifestPath = path.join(DATA_DIR, "characters.js");
  const currentText = await fs.readFile(manifestPath, "utf8").catch(() => null);
  let current = null;
  if (currentText) {
    const match = currentText.match(/window\.TIER_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
    if (match) {
      try {
        current = JSON.parse(match[1]);
      } catch {
        current = null;
      }
    }
  }

  const payload = {
    generatedAt: SNAPSHOT,
    attribution: "Character assets © HoYoverse. Data mirrors: Project Amber, Enka.Network, Nanoka, StarRailRes.",
    games: {
      gi: { label: "原神", characters: gi.characters },
      hsr: { label: "崩坏：星穹铁道", characters: hsr.characters },
      zzz: { label: "绝区零", characters: zzz.characters },
    },
  };

  const gamesChanged = !current || JSON.stringify(current.games) !== JSON.stringify(payload.games);
  if (!gamesChanged && current?.generatedAt) {
    // Keep the last real data-refresh date so scheduled checks do not create
    // timestamp-only commits.
    payload.generatedAt = current.generatedAt;
  }

  const output = `/* Generated by scripts/build-library.mjs on ${payload.generatedAt}. */
window.TIER_DATA = ${JSON.stringify(payload, null, 2)};
`;
  const total = gi.characters.length + hsr.characters.length + zzz.characters.length;

  if (currentText === output) {
    console.log(`No character changes; data/characters.js kept (${total} characters, snapshot ${payload.generatedAt}).`);
    return;
  }

  await fs.writeFile(manifestPath, output, "utf8");
  console.log(
    `Wrote data/characters.js (${total} characters, snapshot ${payload.generatedAt}${gamesChanged ? "" : ", manifest text refreshed"}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
