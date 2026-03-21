# Ponder Claim

A Ponder indexer for CoinSwap and ERC20Swap contracts across Citrea, Polygon, and Ethereum. Tracks lockups, claims, and refunds onchain, and exposes a REST/GraphQL API.

## Requirements

- Node.js >= 18.14
- Docker (for PostgreSQL)

## Setup

```bash
npm install
cp .env.local .env   # fill in the required values
docker compose up -d postgres
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Ponder in dev mode |
| `npm run start` | Start Ponder in production mode |
| `npm run offchain:generate -- --name <desc>` | Generate a new offchain migration |
| `npm run offchain:migrate` | Apply pending offchain migrations |
| `npm run codegen` | Regenerate ABI types |
| `npm run typecheck` | Run TypeScript checks |

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TARGET_CHAIN` | `mainnet` or `testnet` (default: `mainnet`) |
| `PONDER_PORT` | Port to run the API on (default: `42069`) |

## Database

Ponder manages the **onchain tables** automatically (`lockups`, `rawLockups`, `rawClaims`, `rawRefunds`, `volumeStat`, `knownPreimageHashes`).

**Offchain tables** (in the `offchain` PostgreSQL schema) are managed via Drizzle migrations. When setting up a new environment, run:

```bash
npm run offchain:migrate
```

Migration files live in `drizzle/`.

## API

- REST endpoints: `http://localhost:42069/`
- GraphQL: `http://localhost:42069/graphql`
- Swagger UI: `http://localhost:42069/swagger`
