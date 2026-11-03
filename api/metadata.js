// Zurpik — ERC-721 metadata endpoint (Vercel serverless function)
// GET /api/metadata?id=<tokenId>
// Reads the Unit's seed, parts and rarity class straight from the deployed
// contract on BNB Chain and serves standard NFT metadata. The contract's
// baseURI should be set to: https://zurpik.vercel.app/api/metadata?id=
// (tokenURI = baseURI + tokenId, so each token resolves to its own record.)

const CONTRACT = "0x8d6c4A73d22CEAfEEB840AB073fA3Eeb358a7Ba1";
const SITE = "https://zurpik.vercel.app";
const MAX_SUPPLY = 3333;
const RPCS = [
  process.env.BSC_RPC_URL,
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
].filter(Boolean);
const SEL = {
  totalMinted: "0xa2309ff8",
  unitSeed: "0x84be7978",
  unitParts: "0x49e8746e",
  unitClassName: "0x3fbc6055",
};

// Robot part vocabularies — mirrored from the website generator
// (PART_NAMES in the site source). Indices come from unitParts() on-chain.
// Note the on-chain core dimension has 6 variants while the site names 5;
// an unnamed index falls back to the raw index value rather than an
// invented name.
const PART_NAMES = {
  head: ["Round", "Boxy", "Dome Glass", "Angular Mecha", "Helmet Crest"],
  accessory: [
    "No Antenna",
    "Ball Antenna",
    "Twin Antennae",
    "Satellite Dish",
    "Mohawk Fin",
    "Halo Ring",
    "Cat-Ear Sensors",
    "Drill Horn",
  ],
  visor: [
    "Happy Arc",
    "Duo Glow",
    "Determined Visor",
    "Cyclops Scanner",
    "Sleepy",
    "Star Eyes",
    "Visor Band",
  ],
  core: ["Orb Core", "Triangle Core", "Diamond Core", "Reactor Rings", "Starforge Core"],
  arms: ["Claw Hands", "Pincer Arms", "Cannon Arm", "Wrench Hand", "Shield Arms", "Dual Blasters"],
  base: ["Boots", "Single Wheel", "Hover Base", "Tank Treads", "Rocket Thrusters"],
  backgear: ["No Back Gear", "Jetpack", "Solar Panels", "Battery Pack", "Wings"],
};

// The 8 palette definitions for the on-chain palette index (0-7). Names and
// colours are taken verbatim from the website's palette vocabulary (the
// per-class palette sets in the site source).
const PALETTES = [
  { n: "Steel Sky", b1: "#8fa3bd", b2: "#54657f", dark: "#334155", metal: "#cbd5e1", accent: "#38bdf8", eye: "#7dd3fc" },
  { n: "Cyber Teal", b1: "#2aa79b", b2: "#0f4f49", dark: "#08332f", metal: "#a7f3ea", accent: "#2dd4bf", eye: "#5eead4" },
  { n: "Violet Aegis", b1: "#7c5cc9", b2: "#3d2470", dark: "#27164d", metal: "#ddd0ff", accent: "#a78bfa", eye: "#c4b5fd" },
  { n: "Magma Siege", b1: "#c96a1e", b2: "#6e3410", dark: "#42200a", metal: "#fed7aa", accent: "#fb923c", eye: "#fdba74" },
  { n: "Royal Gold", b1: "#f7d774", b2: "#b8860b", dark: "#6e4f06", metal: "#fff7d6", accent: "#f472b6", eye: "#fde68a" },
  { n: "Mint Factory", b1: "#9db8ad", b2: "#567064", dark: "#2f4f43", metal: "#d7e8df", accent: "#34d399", eye: "#6ee7b7" },
  { n: "Royal Cobalt", b1: "#5b7fd6", b2: "#2a3f7d", dark: "#1b2a55", metal: "#dbeafe", accent: "#60a5fa", eye: "#93c5fd" },
  { n: "Crimson War", b1: "#c24545", b2: "#6e1d1d", dark: "#421010", metal: "#fecaca", accent: "#f87171", eye: "#fca5a5" },
];

function partName(list, idx) {
  return idx >= 0 && idx < list.length ? list[idx] : idx;
}

function encUint(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}

async function ethCall(data) {
  let lastErr;
  for (const rpc of RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: CONTRACT, data }, "latest"],
        }),
      });
      const j = await r.json();
      if (j && j.result) return j.result;
      lastErr = new Error((j && j.error && j.error.message) || "empty result");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all RPC endpoints failed");
}

function decUint(hex) {
  return BigInt(hex);
}

function decString(hex) {
  const h = hex.slice(2);
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(parseInt(h.slice(128 + i * 2, 130 + i * 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// unitParts() returns 8 uint8 values, ABI-encoded as 8 consecutive words.
function decParts(hex) {
  const h = hex.slice(2);
  const out = [];
  for (let i = 0; i < 8; i++) {
    out.push(Number(BigInt("0x" + h.slice(i * 64, (i + 1) * 64))));
  }
  return out;
}

// Base URL of this deployment, from the request host (falls back to the
// production site), so preview deployments link their own art endpoint.
function baseUrl(req) {
  const headers = (req && req.headers) || {};
  const host = headers["x-forwarded-host"] || headers.host;
  if (!host) return SITE;
  const proto = String(headers["x-forwarded-proto"] || "https").split(",")[0];
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const id = Number(req.query && req.query.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SUPPLY) {
    res.status(400).json({ error: "id must be an integer between 1 and 3333" });
    return;
  }
  try {
    const minted = Number(decUint(await ethCall(SEL.totalMinted)));
    if (id > minted) {
      res.status(404).json({ error: `Zurpik #${id} has not been minted yet` });
      return;
    }
    const arg = encUint(id);
    const [seedHex, partsHex, classHex] = await Promise.all([
      ethCall(SEL.unitSeed + arg),
      ethCall(SEL.unitParts + arg),
      ethCall(SEL.unitClassName + arg),
    ]);
    const [head, accessory, visor, core, arms, base, backgear, palette] = decParts(partsHex);
    const cls = decString(classHex);
    const pal = PALETTES[palette] || PALETTES[0];
    const seedShort = seedHex.slice(0, 10) + "…" + seedHex.slice(-4);
    const siteBase = baseUrl(req);
    const classTitle = cls.charAt(0) + cls.slice(1).toLowerCase();

    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.status(200).json({
      name: `Zurpik #${id}`,
      description:
        `A ${classTitle}-class robot Unit assembled on BNB Chain — ${pal.n} palette, ` +
        `${partName(PART_NAMES.head, head)} head, ${partName(PART_NAMES.visor, visor)} visor, ` +
        `${partName(PART_NAMES.core, core)} in its chest. Its build seed was locked on-chain at ` +
        `mint time and every part is derived deterministically from that seed, forever. ` +
        `One of 3,333 Units, built only by an agent holding an Agent ID. Every mint is a build.`,
      image: `${siteBase}/api/art?id=${id}`,
      external_url: siteBase,
      attributes: [
        { trait_type: "Class", value: cls },
        { trait_type: "Head", value: partName(PART_NAMES.head, head) },
        { trait_type: "Accessory", value: partName(PART_NAMES.accessory, accessory) },
        { trait_type: "Visor", value: partName(PART_NAMES.visor, visor) },
        { trait_type: "Core", value: partName(PART_NAMES.core, core) },
        { trait_type: "Arms", value: partName(PART_NAMES.arms, arms) },
        { trait_type: "Base", value: partName(PART_NAMES.base, base) },
        { trait_type: "Back Gear", value: partName(PART_NAMES.backgear, backgear) },
        { trait_type: "Palette", value: pal.n },
        { trait_type: "Seed", value: seedShort },
      ],
    });
  } catch (e) {
    res.status(502).json({ error: "chain read failed" });
  }
}
