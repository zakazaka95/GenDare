# GenDare V2 Studio Next test guide

This repository tracks the GenVM v0.3 source deployed at:

- Contract: `0x86aC73EaDe7563B2c67a9bfD06E6D59AE0CA3980`
- Network: GenLayer Studio Next
- Chain ID: `61997` (`0xf22d`)
- RPC: `https://studio-next.genlayer.com/api`
- Explorer: `https://explorer-studio-dev.genlayer.com/address/0x86aC73EaDe7563B2c67a9bfD06E6D59AE0CA3980`

Use the exact tracked file [`contracts/GenDareV2.py`](contracts/GenDareV2.py). In Studio Next, connect a funded test wallet and import the deployed address above. Use the built-in faucet if the wallet needs test GEN.

## 1. Verify the deployed contract

Call `get_stats`. The changing counters depend on live use, but these configuration fields must match:

- `contract_version`: `2.2.0`
- `minimum_stake_wei`: `5000000000000000000`
- `minimum_price_duration_seconds`: `600`
- `stalled_refund_delay_seconds`: `86400`
- `retry_cooldown_seconds`: `1800`
- `max_participants_per_side`: `32`
- `receipt_schema`: `gendare-receipt-v2`

Call `get_dare_count`, then `get_recent_dares` with a small limit such as `5`. Any returned dare must also be readable through `get_dare(<id>)` in accepted state.

## 2. Create a goal dare

Choose a deadline at least five minutes in the future and convert it to a Unix timestamp. Call payable `create_dare` with **5 GEN**:

```text
goal: Publish a reproducible GenDare V2 source snapshot
claimant_identity: https://github.com/zakazaka95
completion_criteria: Before the deadline, the public repository contains GenDareV2.py declaring CONTRACT_VERSION 2.2.0 and an immutable commit URL proves the exact source.
deadline: <FUTURE_UNIX_TIMESTAMP>
evidence_hint: https://github.com/zakazaka95/GenDare
category: Building
is_public: true
```

Record the returned dare ID. Confirm it with `get_dare(<id>)`; its status must be `open`, its creator must be the connected wallet, and its locked creator stake must be 5 GEN.

## 3. Lock immutable evidence

Before the deadline, call `submit_evidence`:

```text
dare_id: <id>
evidence_url: https://raw.githubusercontent.com/zakazaka95/GenDare/71ac8119ae55c06a6ef1ca80bd2d98b8079df0ba/DEMO_EVIDENCE.md
evidence_text: This immutable release record identifies the public GenDare deployment, source digest, live application, and publication date.
```

Read `get_dare(<id>)` again. The accepted record must have status `submitted` and contain non-empty `evidence_hash` and `locked_source_sha256` values, plus positive `locked_source_bytes` and `evidence_locked_at` values.

## 4. Resolve after the deadline

After the deadline, call `resolve_dare(<id>)`. Do not treat the network-level `ACCEPTED` label alone as successful execution. Confirm that execution finished with a return value, then read both:

```text
get_receipt(<id>)
get_dare(<id>)
```

The persisted receipt must be readable from accepted contract state. With no challenger, a conclusive evidence verdict uses settlement mode `REFUND`; the contract deliberately does not manufacture a winner when there was no opposing stake.

## 5. Claim the creator refund

Call `get_claimable(<id>, <CREATOR_WALLET>)`. Then call `claim(<id>)` from the creator wallet. A final `get_claimable` call must return zero.

## Optional contested settlement

Before the deadline, use a second wallet to call `challenge_dare(<id>)` with at least 5 GEN. Resolve after the deadline. For a conclusive receipt, only the winning side is claimable and the contract applies its 2% protocol fee to the losing pool. Creator self-staking and joining both sides from one wallet are rejected.

## Price-dare smoke test

Call payable `create_price_dare` with at least **5 GEN** and a deadline at least ten minutes ahead:

```text
coin_id: bitcoin
target_price_microusd: 85000000000
condition: above_at_deadline
deadline: <FUTURE_UNIX_TIMESTAMP>
is_public: true
```

Confirm the returned ID through `get_dare(<id>)`. Ten minutes after the deadline, use `resolve_price_dare(<id>)` and verify the accepted receipt in contract state.

## Safety checks

- Use immutable evidence URLs pinned to a commit for final proof.
- Track the original transaction hash through timeouts instead of submitting duplicates.
- Verify the accepted return value and resulting contract state after every write.
- Never reuse a dare ID from a different deployment.
