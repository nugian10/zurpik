// Zurpik — artwork endpoint (Vercel serverless function)
// GET /api/art?id=<tokenId>
// Renders the Unit's robot as SVG, derived deterministically from the parts
// the contract derives from the Unit's on-chain seed (unitParts) and the
// seed itself (unitSeed). Same Unit -> same art, byte for byte, forever.
// The renderer mirrors the website's chibi-mecha generator: same part
// geometry, same class silhouettes, and palette names/colours taken
// verbatim from the website's palette vocabulary.

const CONTRACT = "0x8d6c4A73d22CEAfEEB840AB073fA3Eeb358a7Ba1";
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

// Class silhouette data — mirrored from the website (bulk = body width,
// plus the site's per-class render scale).
const CLASS_STYLE = {
  WORKER: { bulk: 78, scale: 1 },
  SCOUT: { bulk: 68, scale: 0.96 },
  GUARDIAN: { bulk: 90, scale: 1 },
  TITAN: { bulk: 100, scale: 1.07 },
  PRIME: { bulk: 86, scale: 1 },
};

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

export async function getUnit(id) {
  const minted = Number(decUint(await ethCall(SEL.totalMinted)));
  if (!Number.isInteger(id) || id < 1 || id > minted) return null;
  const arg = encUint(id);
  const [seedHex, partsHex, classHex] = await Promise.all([
    ethCall(SEL.unitSeed + arg),
    ethCall(SEL.unitParts + arg),
    ethCall(SEL.unitClassName + arg),
  ]);
  return { id, seed: seedHex, parts: decParts(partsHex), cls: decString(classHex) };
}

// The website's own seeded RNG (mulberry32), reused so decorative details
// are derived from the on-chain seed exactly the way the site derives its.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function star(cx, cy, r, fill) {
  var p = "",
    i,
    a,
    rr;
  for (i = 0; i < 8; i++) {
    a = (Math.PI / 4) * i - Math.PI / 2;
    rr = i % 2 === 0 ? r : r * 0.42;
    var px = (cx + Math.cos(a) * rr).toFixed(1),
      py = (cy + Math.sin(a) * rr).toFixed(1);
    p += (i === 0 ? "M" : "L") + px + " " + py + " ";
  }
  return '<path d="' + p + 'Z" fill="' + fill + '"/>';
}

// Pure renderer: (seed, parts, class) -> SVG string. No clocks, no random,
// no environment input, so the same Unit always renders byte-identically.
// Decorative details the contract does not cover (chest-screen icon, mouth)
// are derived deterministically from the seed via the site's own RNG.
export function renderArt(unit) {
  const [head, accessory, visor, core, arms, base, backgear, palette] = unit.parts;
  const P = PALETTES[palette] || PALETTES[0];
  const cs = CLASS_STYLE[unit.cls] || CLASS_STYLE.WORKER;
  const prime = unit.cls === "PRIME",
    titan = unit.cls === "TITAN";
  const bw = cs.bulk,
    bx = 120 - bw / 2,
    scale = cs.scale;
  const seedLow = parseInt(unit.seed.slice(-8), 16) >>> 0;
  const extra = mulberry32((seedLow ^ 0x5bd1e995) | 0);
  const screen = Math.floor(extra() * 4);
  const mouth = Math.floor(extra() * 4);
  const g = "z";

  let s =
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="840" viewBox="0 0 240 280" role="img" aria-label="Zurpik #' +
    unit.id +
    ", class " +
    unit.cls +
    '"><title>Zurpik #' +
    unit.id +
    " — " +
    unit.cls +
    "</title>";
  s +=
    "<defs>" +
    '<linearGradient id="' +
    g +
    'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    P.b1 +
    '"/><stop offset="1" stop-color="' +
    P.b2 +
    '"/></linearGradient>' +
    '<linearGradient id="' +
    g +
    'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' +
    P.metal +
    '"/><stop offset=".55" stop-color="' +
    P.b1 +
    '"/><stop offset="1" stop-color="' +
    P.b2 +
    '"/></linearGradient>' +
    '<radialGradient id="' +
    g +
    'c" cx=".5" cy=".42" r=".65"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="' +
    P.eye +
    '"/><stop offset="1" stop-color="' +
    P.accent +
    '"/></radialGradient>' +
    '<linearGradient id="' +
    g +
    'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    P.dark +
    '"/><stop offset="1" stop-color="#0a0a22"/></linearGradient>' +
    (prime
      ? '<linearGradient id="' +
        g +
        'r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f472b6"/><stop offset=".33" stop-color="#fbbf24"/><stop offset=".66" stop-color="#22d3ee"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>'
      : "") +
    "</defs>";
  /* scenic background: gradient card, hologram rings, stars, grid floor */
  s += '<rect x="5" y="5" width="230" height="270" rx="30" fill="url(#' + g + 'bg)"/>';
  s +=
    '<rect x="5" y="5" width="230" height="270" rx="30" fill="none" stroke="' +
    (prime ? "url(#" + g + "r)" : P.accent) +
    '" stroke-opacity="' +
    (prime ? ".9" : ".35") +
    '" stroke-width="' +
    (prime ? "2.4" : "1.4") +
    '"/>';
  s +=
    '<g opacity=".5"><circle cx="120" cy="152" r="92" fill="none" stroke="' +
    P.accent +
    '" stroke-width="1.4" stroke-dasharray="4 9"/><circle cx="120" cy="152" r="78" fill="none" stroke="' +
    P.accent +
    '" stroke-width="1" stroke-dasharray="26 14" opacity=".6"/></g>';
  var stR = mulberry32(seedLow * 7 + 13);
  for (var si = 0; si < 7; si++) {
    var sx = 22 + stR() * 196,
      sy = 20 + stR() * 90,
      sr = 2.4 + stR() * 2.6;
    s += star(sx, sy, sr, si % 2 ? P.eye : P.metal);
  }
  s += '<path d="M18 236 H222 M30 248 H210 M46 260 H194" stroke="' + P.accent + '" stroke-opacity=".22" stroke-width="1.4"/>';
  s += '<ellipse cx="120" cy="246" rx="76" ry="13" fill="#000" opacity=".45"/>';
  s += '<ellipse cx="120" cy="243" rx="58" ry="9" fill="' + P.accent + '" opacity=".28"/>';
  if (prime) {
    s +=
      star(30, 120, 7, "#fbbf24") +
      star(212, 96, 8, "#f472b6") +
      star(204, 196, 6, "#22d3ee") +
      star(34, 206, 6, "#a78bfa") +
      star(120, 18, 6, "#fff7d6");
  }
  s += '<g transform="translate(120 148) scale(' + scale + ') translate(-120 -148)">';
  /* ---- back gear ---- */
  s += "<g>";
  if (backgear === 1) {
    s +=
      '<rect x="' + (bx - 4) + '" y="152" width="17" height="42" rx="8" fill="' + P.dark + '" stroke="' + P.accent + '" stroke-width="1.6"/><rect x="' + (bx + bw - 13) + '" y="152" width="17" height="42" rx="8" fill="' + P.dark + '" stroke="' + P.accent + '" stroke-width="1.6"/><path d="M' + (bx - 1) + " 196 l5.5 13 l5.5 -13 Z\" fill=\"#fb923c\"/><path d=\"M" + (bx + bw - 10) + ' 196 l5.5 13 l5.5 -13 Z" fill="#fb923c"/>';
  }
  if (backgear === 2) {
    s +=
      '<g opacity=".95"><rect x="' + (bx - 34) + '" y="148" width="38" height="52" rx="7" transform="rotate(10 ' + (bx - 15) + ' 174)" fill="#1e2a5a" stroke="' + P.accent + '" stroke-width="1.8"/><path d="M' + (bx - 26) + " 156 l26 36 M" + (bx - 14) + " 152 l24 38\" stroke=\"" + P.accent + '" stroke-opacity=".5" transform="rotate(10 ' + (bx - 15) + ' 174)"/><rect x="' + (bx + bw - 4) + '" y="148" width="38" height="52" rx="7" transform="rotate(-10 ' + (bx + bw + 15) + ' 174)" fill="#1e2a5a" stroke="' + P.accent + '" stroke-width="1.8"/><path d="M' + (bx + bw + 2) + " 156 l26 36 M" + (bx + bw + 14) + ' 152 l24 38" stroke="' + P.accent + '" stroke-opacity=".5" transform="rotate(-10 ' + (bx + bw + 15) + ' 174)"/></g>';
  }
  if (backgear === 3) {
    s +=
      '<rect x="94" y="140" width="52" height="34" rx="9" fill="' + P.dark + '" stroke="' + P.accent + '" stroke-width="1.6"/><rect x="102" y="148" width="10" height="18" rx="3" fill="' + P.accent + '"/><rect x="115" y="148" width="10" height="18" rx="3" fill="' + P.accent + '" opacity=".75"/><rect x="128" y="148" width="10" height="18" rx="3" fill="' + P.accent + '" opacity=".5"/>';
  }
  if (backgear === 4) {
    var wc = prime ? "url(#" + g + "r)" : P.b1;
    s +=
      '<path d="M66 150 C30 128 16 96 22 66 C40 88 52 96 66 100 C54 118 56 134 66 150 Z" fill="' + wc + '" opacity=".92" stroke="' + P.metal + '" stroke-width="1.6"/><path d="M174 150 C210 128 224 96 218 66 C200 88 188 96 174 100 C186 118 184 134 174 150 Z" fill="' + wc + '" opacity=".92" stroke="' + P.metal + '" stroke-width="1.6"/><path d="M70 158 C44 146 32 124 36 102 C48 118 58 124 70 128 Z" fill="' + P.metal + '" opacity=".55"/>';
  }
  s += "</g>";
  /* ---- base / legs ---- */
  s += "<g>";
  if (base === 0) {
    s +=
      '<rect x="92" y="212" width="15" height="22" rx="6" fill="' + P.dark + '"/><rect x="133" y="212" width="15" height="22" rx="6" fill="' + P.dark + '"/><path d="M84 234 h28 a6 6 0 0 1 6 6 v3 H84 Z" fill="url(#' + g + 'm)"/><path d="M122 234 h28 a6 6 0 0 1 6 6 v3 h-34 Z" fill="url(#' + g + 'm)"/>';
  }
  if (base === 1) {
    s +=
      '<path d="M112 210 L120 224 L128 210" fill="none" stroke="' + P.dark + '" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="232" r="15" fill="' + P.dark + '" stroke="' + P.metal + '" stroke-width="3"/><circle cx="120" cy="232" r="5.5" fill="' + P.accent + '"/>';
  }
  if (base === 2) {
    s +=
      '<path d="M88 212 h64 l-10 16 H98 Z" fill="url(#' + g + 'm)" stroke="' + P.dark + '" stroke-width="1.4"/><ellipse cx="120" cy="238" rx="42" ry="7" fill="' + P.accent + '"/>';
  }
  if (base === 3) {
    s +=
      '<rect x="76" y="216" width="88" height="26" rx="13" fill="' + P.dark + '" stroke="' + P.metal + '" stroke-width="1.6"/><circle cx="94" cy="229" r="7.5" fill="' + P.b2 + '" stroke="' + P.metal + '" stroke-width="2"/><circle cx="120" cy="229" r="7.5" fill="' + P.b2 + '" stroke="' + P.metal + '" stroke-width="2"/><circle cx="146" cy="229" r="7.5" fill="' + P.b2 + '" stroke="' + P.metal + '" stroke-width="2"/>';
  }
  if (base === 4) {
    s +=
      '<path d="M92 210 h18 l-4 16 h-10 Z" fill="' + P.dark + '"/><path d="M130 210 h18 l4 16 h-10 Z" fill="' + P.dark + '"/><path d="M94 226 l7 16 l7 -16 Z" fill="#fbbf24"/><path d="M132 226 l7 16 l7 -16 Z" fill="#fb923c"/>';
  }
  s += "</g>";
  /* ---- arms ---- */
  function arm(side) {
    var shX = side < 0 ? bx - 2 : bx + bw + 2,
      hX = side < 0 ? bx - 26 : bx + bw + 26;
    var a =
      '<circle cx="' + shX + '" cy="162" r="' + (titan || unit.cls === "GUARDIAN" ? 15 : 12) + '" fill="url(#' + g + 'm)" stroke="' + P.dark + '" stroke-width="1.4"/>';
    a += '<path d="M' + shX + " 168 L" + hX + ' 188" stroke="' + P.b1 + '" stroke-width="13" stroke-linecap="round"/>';
    a += '<circle cx="' + hX + '" cy="190" r="7.5" fill="' + P.dark + '"/>';
    var hx = hX,
      hy = 196;
    if (arms === 0) {
      a +=
        '<path d="M' + (hx - 3) + " " + hy + " c-9 2 -11 12 -3 15 M" + (hx + 4) + " " + hy + ' c8 3 9 12 1 15" fill="none" stroke="' + P.metal + '" stroke-width="4.4" stroke-linecap="round"/><circle cx="' + hx + '" cy="' + (hy + 3) + '" r="5" fill="url(#' + g + 'm)"/>';
    }
    if (arms === 1) {
      a +=
        '<ellipse cx="' + (hx + side * 3) + '" cy="' + (hy + 8) + '" rx="7" ry="12" transform="rotate(' + side * 24 + " " + hx + " " + hy + ')" fill="url(#' + g + 'm)" stroke="' + P.dark + '"/><ellipse cx="' + (hx - side * 5) + '" cy="' + (hy + 9) + '" rx="5.5" ry="10" transform="rotate(' + -side * 18 + " " + hx + " " + hy + ')" fill="' + P.b1 + '"/>';
    }
    if (arms === 2) {
      if (side > 0) {
        a +=
          '<rect x="' + (hx - 7) + '" y="' + hy + '" width="17" height="27" rx="7" fill="' + P.dark + '" stroke="' + P.accent + '" stroke-width="1.8"/><circle cx="' + (hx + 1.5) + '" cy="' + (hy + 25) + '" r="5" fill="' + P.accent + '"/><circle cx="' + (hx + 1.5) + '" cy="' + (hy + 8) + '" r="3" fill="' + P.eye + '"/>';
      } else {
        a += '<circle cx="' + hx + '" cy="' + (hy + 6) + '" r="8" fill="url(#' + g + 'm)" stroke="' + P.dark + '"/>';
      }
    }
    if (arms === 3) {
      a += '<circle cx="' + hx + '" cy="' + (hy + 5) + '" r="7.5" fill="url(#' + g + 'm)" stroke="' + P.dark + '"/>';
      if (side > 0) {
        a +=
          '<path d="M' + (hx + 5) + " " + (hy + 8) + " l11 -11 M" + (hx + 13) + " " + (hy - 6) + ' a5 5 0 1 1 6 6" fill="none" stroke="' + P.metal + '" stroke-width="4" stroke-linecap="round"/>';
      }
    }
    if (arms === 4) {
      a +=
        '<path d="M' + hx + " " + (hy - 8) + " l" + side * 13 + " 5 v15 c0 8 -6 13 -13 16 c-7 -3 -13 -8 -13 -16 v-15 Z\" fill=\"" + P.b1 + '" fill-opacity=".92" stroke="' + P.accent + '" stroke-width="2"/><path d="M' + hx + " " + (hy + 1) + " l" + side * 6 + ' 2.4 v8 c0 4 -3 6.4 -6 8 c-3 -1.6 -6 -4 -6 -8 v-8 Z" fill="' + P.accent + '" opacity=".5"/>';
    }
    if (arms === 5) {
      var bxr = side > 0 ? hx + 2 : hx - 15;
      a +=
        '<rect x="' + (hx - 5) + '" y="' + hy + '" width="11" height="20" rx="4" fill="' + P.dark + '" stroke="' + P.metal + '" stroke-width="1.4"/><rect x="' + bxr + '" y="' + (hy + 3) + '" width="13" height="5.5" rx="2.5" fill="' + P.metal + '"/><circle cx="' + (hx + side * 14) + '" cy="' + (hy + 5.5) + '" r="2.6" fill="#fb7185"/>';
    }
    return "<g>" + a + "</g>";
  }
  s += arm(-1) + arm(1);
  if (titan) {
    s +=
      '<rect x="' + (bx - 12) + '" y="128" width="9" height="20" rx="4" fill="' + P.dark + '" stroke="' + P.accent + '"/><rect x="' + (bx + bw + 3) + '" y="128" width="9" height="20" rx="4" fill="' + P.dark + '" stroke="' + P.accent + '"/>';
  }
  /* ---- body ---- */
  s += "<g>";
  s +=
    '<rect x="' + bx + '" y="146" width="' + bw + '" height="72" rx="24" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.6"/>';
  s += '<ellipse cx="' + (120 - bw * 0.18) + '" cy="160" rx="' + bw * 0.26 + '" ry="9" fill="#fff" opacity=".20"/>';
  s += '<path d="M' + (bx + 10) + " 206 h" + (bw - 20) + '" stroke="' + P.dark + '" stroke-opacity=".45" stroke-width="2"/>';
  s +=
    '<path d="M' + (bx + bw - 16) + " 158 v18 M" + (bx + bw - 11) + ' 158 v18" stroke="' + P.dark + '" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>';
  s +=
    '<circle cx="' + (bx + 11) + '" cy="156" r="2.4" fill="' + P.dark + '" opacity=".6"/><circle cx="' + (bx + bw - 11) + '" cy="156" r="2.4" fill="' + P.dark + '" opacity=".6"/>';
  /* chest screen: tiny display with a living icon (icon derived from seed) */
  var scrCx = bx + bw - 25,
    scrCy = 204;
  s +=
    '<rect x="' + (bx + bw - 38) + '" y="196" width="26" height="17" rx="5" fill="#0a0a20" opacity=".88" stroke="' + P.accent + '" stroke-opacity=".55"/>';
  if (screen === 0) {
    s +=
      '<circle cx="' + (scrCx - 3.6) + '" cy="' + (scrCy - 1.5) + '" r="3.4" fill="#fb7185"/><circle cx="' + (scrCx + 3.6) + '" cy="' + (scrCy - 1.5) + '" r="3.4" fill="#fb7185"/><path d="M' + (scrCx - 6.8) + " " + (scrCy - 1) + " L" + scrCx + " " + (scrCy + 7) + " L" + (scrCx + 6.8) + " " + (scrCy - 1) + ' Z" fill="#fb7185"/>';
  }
  if (screen === 1) {
    s +=
      '<path d="M' + (scrCx + 1) + " " + (scrCy - 7) + " L" + (scrCx - 4.5) + " " + (scrCy + 1) + " H" + (scrCx - 0.5) + " L" + (scrCx - 1) + " " + (scrCy + 7) + " L" + (scrCx + 4.5) + " " + (scrCy - 1) + " H" + (scrCx + 0.5) + ' Z" fill="#fbbf24"/>';
  }
  if (screen === 2) {
    s +=
      '<path d="M' + (scrCx - 8) + " " + scrCy + " h4 l2.4 -5 l4 9 l2.2 -4 h4.4\" fill=\"none\" stroke=\"#34d399\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
  }
  if (screen === 3) {
    s += star(scrCx, scrCy, 6.5, "#fde68a");
  }
  /* core */
  s += '<circle cx="104" cy="182" r="19" fill="' + P.dark + '"/><circle cx="104" cy="182" r="19" fill="none" stroke="' + P.accent + '" stroke-opacity=".65" stroke-width="1.6"/>';
  s += "<g>";
  if (core === 0) s += '<circle cx="104" cy="182" r="11.5" fill="url(#' + g + 'c)"/>';
  if (core === 1) s += '<path d="M104 169 L117 190 H91 Z" fill="url(#' + g + 'c)" stroke="' + P.metal + '" stroke-width="1.2"/>';
  if (core === 2) s += '<path d="M104 168 L117 182 L104 196 L91 182 Z" fill="url(#' + g + 'c)"/>';
  if (core === 3) s += '<circle cx="104" cy="182" r="12.5" fill="none" stroke="' + P.eye + '" stroke-width="3.4"/><circle cx="104" cy="182" r="6.5" fill="url(#' + g + 'c)"/>';
  if (core === 4) s += star(104, 182, 14, "url(#" + g + "c)");
  if (core === 5) s += '<path d="M104 168 L116 175 L116 189 L104 196 L92 189 L92 175 Z" fill="url(#' + g + 'c)"/>'; // 6th on-chain core variant (unnamed on the site): hexagon core
  s += "</g>";
  s += '<circle cx="104" cy="182" r="19" fill="' + P.accent + '" opacity=".14"/>';
  s += "</g>";
  /* ---- neck + head (big chibi head) ---- */
  s += '<rect x="108" y="132" width="24" height="16" rx="5" fill="' + P.dark + '"/>';
  s += "<g>";
  if (accessory === 1) {
    s += '<path d="M120 44 V26" stroke="' + P.metal + '" stroke-width="4.4" stroke-linecap="round"/><circle cx="120" cy="21" r="7.5" fill="url(#' + g + 'c)"/>';
  }
  if (accessory === 2) {
    s += '<path d="M96 48 L86 24 M144 48 L154 24" stroke="' + P.metal + '" stroke-width="4.2" stroke-linecap="round"/><circle cx="85" cy="21" r="6.5" fill="url(#' + g + 'c)"/><circle cx="155" cy="21" r="6.5" fill="url(#' + g + 'c)"/>';
  }
  if (accessory === 3) {
    s += '<path d="M120 46 V32" stroke="' + P.metal + '" stroke-width="4.4"/><path d="M98 16 a24 15 0 0 1 44 0 Z" fill="url(#' + g + 'm)" stroke="' + P.accent + '" stroke-width="2"/><circle cx="120" cy="29" r="4" fill="' + P.eye + '"/>';
  }
  if (accessory === 4) {
    s += '<path d="M104 48 C106 30 112 16 120 8 C128 16 134 30 136 48 C128 40 112 40 104 48 Z" fill="' + P.accent + '"/>';
  }
  if (accessory === 5) {
    s += '<ellipse cx="120" cy="18" rx="30" ry="8" fill="none" stroke="' + (prime ? "#fbbf24" : P.accent) + '" stroke-width="4.4"/><ellipse cx="120" cy="18" rx="30" ry="8" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>';
    if (prime) {
      s += '<path d="M96 50 L92 32 L106 42 L120 28 L134 42 L148 32 L144 50 Z" fill="#fbbf24" stroke="#b8860b" stroke-width="1.4"/><circle cx="120" cy="40" r="3.6" fill="#f472b6"/><circle cx="103" cy="43" r="2.6" fill="#22d3ee"/><circle cx="137" cy="43" r="2.6" fill="#22d3ee"/>';
    }
  }
  if (accessory === 6) {
    s += '<path d="M76 52 L66 20 L94 34 Z" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.6"/><path d="M164 52 L174 20 L146 34 Z" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.6"/><path d="M77 44 L73 29 L87 37 Z" fill="#f9a8d4"/><path d="M163 44 L167 29 L153 37 Z" fill="#f9a8d4"/>';
  }
  if (accessory === 7) {
    s += '<path d="M120 6 L133 46 H107 Z" fill="url(#' + g + 'm)" stroke="' + P.dark + '" stroke-width="1.5"/><path d="M113 26 h14 M110 36 h20" stroke="' + P.accent + '" stroke-width="3"/>';
  }
  if (accessory === 0) {
    s += '<circle cx="120" cy="42" r="4.4" fill="' + P.metal + '"/>';
  }
  s += "</g>";
  s += "<g>";
  /* ears */
  s += '<circle cx="63" cy="96" r="10" fill="url(#' + g + 'm)" stroke="' + P.dark + '"/><circle cx="177" cy="96" r="10" fill="url(#' + g + 'm)" stroke="' + P.dark + '"/><circle cx="63" cy="96" r="4.4" fill="' + P.accent + '"/><circle cx="177" cy="96" r="4.4" fill="' + P.accent + '"/>';
  if (head === 0) {
    s += '<circle cx="120" cy="94" r="56" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.8"/><ellipse cx="98" cy="58" rx="26" ry="12" fill="#fff" opacity=".28"/>';
  }
  if (head === 1) {
    s += '<rect x="62" y="42" width="116" height="102" rx="26" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.8"/><rect x="78" y="50" width="64" height="8" rx="4" fill="#fff" opacity=".25"/>';
  }
  if (head === 2) {
    s += '<path d="M62 140 a58 58 0 0 1 116 0 Z" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.8"/><path d="M76 118 a46 46 0 0 1 88 0 Z" fill="' + P.eye + '" opacity=".20"/><ellipse cx="100" cy="102" rx="24" ry="8" fill="#fff" opacity=".30"/>';
  }
  if (head === 3) {
    s += '<path d="M66 52 L174 52 L182 102 L158 142 L82 142 L58 102 Z" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.8"/><path d="M66 52 L120 66 L174 52 L168 76 L72 76 Z" fill="' + P.dark + '" opacity=".28"/>';
  }
  if (head === 4) {
    s += '<rect x="64" y="44" width="112" height="100" rx="28" fill="url(#' + g + 'b)" stroke="' + P.dark + '" stroke-width="1.8"/><path d="M64 78 h112" stroke="' + P.dark + '" stroke-opacity=".35" stroke-width="3"/><path d="M104 44 C108 30 114 24 120 20 C126 24 132 30 136 44 Z" fill="' + P.accent + '"/><rect x="80" y="52" width="80" height="7" rx="3.5" fill="#fff" opacity=".3"/>';
  }
  /* face plate */
  if (head === 2) {
    s += '<rect x="81" y="88" width="78" height="44" rx="14" fill="#0b0b21" stroke="' + P.accent + '" stroke-opacity=".55" stroke-width="1.6"/>';
  } else {
    s += '<rect x="76" y="70" width="88" height="58" rx="17" fill="#0b0b21" stroke="' + P.accent + '" stroke-opacity=".55" stroke-width="1.6"/>';
  }
  if (visor === 0 || visor === 4 || visor === 5 || prime) {
    s += '<ellipse cx="86" cy="112" rx="7" ry="3.6" fill="#fb7185" opacity=".55"/><ellipse cx="154" cy="112" rx="7" ry="3.6" fill="#fb7185" opacity=".55"/>';
  }
  s += "<g>";
  if (visor === 0) {
    s += '<path d="M88 94 a8 7 0 0 1 16 0 M136 94 a8 7 0 0 1 16 0" fill="none" stroke="' + P.eye + '" stroke-width="5" stroke-linecap="round"/>';
  }
  if (visor === 1) {
    s += '<circle cx="97" cy="93" r="8.5" fill="' + P.eye + '"/><circle cx="143" cy="93" r="8.5" fill="' + P.eye + '"/><circle cx="100" cy="90" r="3" fill="#fff"/><circle cx="146" cy="90" r="3" fill="#fff"/>';
  }
  if (visor === 3) {
    s += '<circle cx="120" cy="93" r="13" fill="none" stroke="' + P.eye + '" stroke-width="3.4"/><circle cx="120" cy="93" r="7" fill="' + P.eye + '"/><circle cx="122.5" cy="90.5" r="2.4" fill="#fff"/>';
  }
  if (visor === 4) {
    s += '<path d="M88 92 a9 6 0 0 0 17 0 M135 92 a9 6 0 0 0 17 0" fill="none" stroke="' + P.eye + '" stroke-width="4.6" stroke-linecap="round"/><path d="M158 66 l7 -7 M161 72 l7 -7" stroke="' + P.eye + '" stroke-width="2.2" opacity=".7" stroke-linecap="round"/>';
  }
  if (visor === 5) {
    s += star(97, 93, 10, P.eye) + star(143, 93, 10, P.eye);
  }
  s += "</g>";
  if (visor === 2) {
    s += '<path d="M84 84 L156 88 L156 100 L84 102 Z" fill="' + P.eye + '"/><path d="M84 84 L120 86 L84 102 Z" fill="#fff" opacity=".45"/><path d="M92 106 l10 3 M138 107 l10 -2" stroke="' + P.eye + '" stroke-width="3.4" stroke-linecap="round"/>';
  }
  if (visor === 6) {
    s += '<rect x="84" y="84" width="72" height="16" rx="8" fill="' + P.eye + '"/><rect x="90" y="87.5" width="26" height="4.5" rx="2.2" fill="#fff" opacity=".75"/><circle cx="146" cy="92" r="3" fill="#0b0b21" opacity=".6"/>';
  }
  /* mouth (derived from seed) */
  if (mouth === 0) s += '<path d="M108 116 a12 8 0 0 0 24 0" fill="none" stroke="' + P.eye + '" stroke-width="3.6" stroke-linecap="round"/>';
  if (mouth === 1) s += '<rect x="104" y="110" width="32" height="12" rx="6" fill="none" stroke="' + P.eye + '" stroke-width="2.4"/><path d="M112 111 v10 M120 111 v10 M128 111 v10" stroke="' + P.eye + '" stroke-width="2.2"/>';
  if (mouth === 2) s += '<path d="M106 113 a7 6 0 0 0 14 0 a7 6 0 0 0 14 0" fill="none" stroke="' + P.eye + '" stroke-width="3.2" stroke-linecap="round"/>';
  if (mouth === 3) s += '<path d="M108 117 h24" stroke="' + P.eye + '" stroke-width="3.8" stroke-linecap="round"/>';
  s += "</g>";
  s += "</g>";
  s += "</svg>";
  return s;
}

export default async function handler(req, res) {
  const id = Number(req.query && req.query.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SUPPLY) {
    res.status(400).json({ error: "id must be an integer between 1 and 3333" });
    return;
  }
  try {
    const unit = await getUnit(id);
    if (!unit) {
      res.status(404).json({ error: `Zurpik #${id} has not been minted yet` });
      return;
    }
    res.setHeader("content-type", "image/svg+xml; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.status(200).send(renderArt(unit));
  } catch (e) {
    res.status(502).json({ error: "chain read failed" });
  }
}
