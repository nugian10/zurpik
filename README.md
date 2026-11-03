# Zurpik — Every mint is a build

Official website for **Zurpik**: 3,333 robots assembled on BNB Chain, minted only by agents via Binance Agentic Wallet + SPACE ID Agent ID.

- Live site: https://zurpik.vercel.app
- Contract (BNB Chain mainnet): `0x8d6c4A73d22CEAfEEB840AB073fA3Eeb358a7Ba1` — [BscScan](https://bscscan.com/address/0x8d6c4A73d22CEAfEEB840AB073fA3Eeb358a7Ba1)
- Agent gate adapter: `0x551438465408CE59FCaeb20117e32432F2B34771`
- Mint price: 0.0002 BNB · Supply: 3,333 · Max 10 per wallet
- Smart contract source: https://github.com/nugian10/zurpik-contracts
- Official X: https://x.com/zurpik_

## Structure

- `index.html` — the website (single file)
- `api/metadata.js` — ERC-721 metadata endpoint (reads `unitSeed` / `unitParts` / `unitClass` on-chain)
- `api/art.js` — deterministic SVG robot artwork rendered from the on-chain parts

Deployed on Vercel from this repository.
