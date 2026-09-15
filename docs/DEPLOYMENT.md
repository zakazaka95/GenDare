# Deployment and verification

This guide records the network, contract, and frontend configuration for the current GenDare deployment.

## Canonical deployment

| Field                  | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Application            | [https://gendare.online](https://gendare.online)                     |
| Network                | GenLayer Studio Next                                                 |
| Chain ID               | `61997`                                                              |
| Chain ID (hex)         | `0xf22d`                                                             |
| Currency               | `GEN`                                                                |
| RPC                    | `https://studio-next.genlayer.com/api`                               |
| Explorer               | `https://explorer-studio-dev.genlayer.com`                           |
| Contract               | `0x86aC73EaDe7563B2c67a9bfD06E6D59AE0CA3980`                         |
| Contract version       | `2.2.0`                                                              |
| Receipt schema         | `gendare-receipt-v2`                                                 |
| Deployment transaction | `0x094c31fa424ddb87d5d964e8690226bdbef25c7a2af45060d02629b258f9bed1` |

Explorer links:

- [Contract](https://explorer-studio-dev.genlayer.com/address/0x86aC73EaDe7563B2c67a9bfD06E6D59AE0CA3980)
- [Deployment transaction](https://explorer-studio-dev.genlayer.com/tx/0x094c31fa424ddb87d5d964e8690226bdbef25c7a2af45060d02629b258f9bed1)
- [Tracked contract source](../contracts/GenDareV2.py)

## Add Studio Next to a wallet

The application requests this network automatically. It can also be added manually:

```text
Network name:     GenLayer Studio Next
RPC URL:          https://studio-next.genlayer.com/api
Chain ID:         61997
Currency symbol:  GEN
Block explorer:   https://explorer-studio-dev.genlayer.com
```

Development GEN is available from the faucet built into the Studio account selector.

## Verify the deployed contract

Open the contract in the Studio Next Explorer or import its address in Studio Next, then call `get_stats`.

The following identity and limits must match:

```json
{
  "contract_version": "2.2.0",
  "receipt_schema": "gendare-receipt-v2",
  "minimum_stake_wei": "5000000000000000000",
  "minimum_price_duration_seconds": 600,
  "max_participants_per_side": 32,
  "stalled_refund_delay_seconds": 86400
}
```

The response also includes live counters for total dares, complete, incomplete, and refundable outcomes, plus currently available protocol fees. Those values change with use and should not be compared to deployment-time zeros.

The tracked `contracts/GenDareV2.py` source has canonical LF SHA-256 `B30BDE8C571BFB67C63E8F44E7E956AD619CD8D34EA94C93299B7B2232E6DE91`. Studio stored the same source with CRLF line endings, producing raw SHA-256 `24DE92DA6922002EA989FD13D8F23E0D074DECB99372C25C9AF4AAE0EDC7B4E7`; normalizing line endings makes the files byte-identical.

To verify source correspondence:

1. inspect [`contracts/GenDareV2.py`](../contracts/GenDareV2.py);
2. confirm `CONTRACT_VERSION = "2.2.0"` and `RECEIPT_SCHEMA = "gendare-receipt-v2"`;
3. confirm the constructor has no parameters;
4. compare the deployed public methods with the tracked source;
5. confirm `get_stats` returns the identifiers and limits above.

## Deploy a fresh instance

Use this only when a new contract address is intentionally required.

1. Open [GenLayer Studio Next](https://studio-next.genlayer.com/).
2. Load the complete contents of `contracts/GenDareV2.py`.
3. Select Studio Next and connect the deployment wallet.
4. Deploy a new instance. The constructor takes no arguments.
5. Wait for the deployment transaction to be accepted and successfully executed.
6. Record both the new contract address and deployment transaction.
7. Call `get_stats` and compare the immutable identity fields above.
8. Complete both smoke tests below before changing the frontend address.

Do not point the application at a new address merely because a transaction is accepted. Verify successful contract execution and a readable `get_stats` response first.

## Contract smoke tests

### Goal dare

1. Call `create_dare` with a goal of 10–400 characters, claimant identity of 3–160 characters, criteria of 10–800 characters, a future deadline, an optional evidence hint, a category, visibility, and at least 5 GEN.
2. Before the deadline, call `submit_evidence` from the creator wallet with a public HTTPS URL that returns HTTP 200 and no more than 24 KB.
3. Confirm the dare is `submitted` and the stored source digest and byte length are non-empty.
4. After the deadline, call `resolve_dare`.
5. Confirm the returned receipt uses `gendare-receipt-v2` and is persisted by `get_receipt`.

### Price dare

1. Call `create_price_dare` with a valid CoinGecko coin ID, positive integer micro-USD target, one supported condition, a deadline at least ten minutes away, visibility, and at least 5 GEN.
2. Wait until ten minutes after the deadline.
3. Call `resolve_price_dare`.
4. Confirm the receipt binds the source snapshot, time window, sample count, selected and maximum samples, decision, and reason code.

For payout testing, use a second wallet to call `challenge_dare` before the deadline. Without a challenger, a resolved dare follows the refund path by design.

## Frontend configuration

Two files bind the app to the deployment:

- `src/lib/network.ts` defines Studio Next and `src/lib/injected.ts` handles wallet switching;
- `src/lib/contract.ts` defines `CONTRACT_ADDRESS` and all read/write calls.

For a deliberate redeployment, update the address in `src/lib/contract.ts`. Change the network definition only if the contract itself moves to a different chain. Do not change argument order or units:

- GEN values are 18-decimal wei;
- timestamps are Unix seconds;
- price targets are integer micro-USD;
- `get_dare` returns canonical JSON text that the frontend parses.

## Build and check

```bash
npm ci
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s tests -v
```

Run the built application locally if needed:

```bash
npm run preview
```

## Release checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes without errors.
- [ ] `npm run build` completes.
- [ ] All 30 contract unit tests pass.
- [ ] Wallet connection works in Rabby or MetaMask.
- [ ] The app switches or adds chain `61997`.
- [ ] `get_stats` reports contract `2.2.0` and receipt schema `gendare-receipt-v2`.
- [ ] A read-only visitor can load accepted dare records without connecting a wallet.
- [ ] Goal creation, evidence locking, and post-deadline resolution work.
- [ ] Price creation and post-deadline-plus-ten-minutes resolution work.
- [ ] Transaction links open on the Studio Next Explorer.
- [ ] The live domain serves the same checked build.
