# Reviewer guide

GenDare can be reviewed at three levels: inspect the deployed state, reproduce a short goal-dare lifecycle, and reproduce a complete contested settlement.

## Review links

- Live app: [https://gendare.online](https://gendare.online)
- Contract: [`0x5eA37668c8c8F1313d4294C349a7eC8585071135`](https://explorer-studio-dev.genlayer.com/address/0x5eA37668c8c8F1313d4294C349a7eC8585071135)
- Deployment transaction: [`0xb1e0ec256e6be87d416c66d25e6d282fdb5f4ece40c92fc86cc0652850a4164c`](https://explorer-studio-dev.genlayer.com/tx/0xb1e0ec256e6be87d416c66d25e6d282fdb5f4ece40c92fc86cc0652850a4164c)
- Contract source: [`contracts/GenDareV2.py`](../contracts/GenDareV2.py)
- Architecture: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)

## What makes the contract consequential

The validator does not merely return a label for display. Its accepted receipt selects one of three financial outcomes:

- `COMPLETE`: the support side wins a contested dare;
- `INCOMPLETE`: the challenge side wins a contested dare;
- non-final or uncontested outcome: every participant can recover their position.

The contract binds the complete receipt payload, applies the state transition, and makes claims available. The browser cannot replace the receipt or mark a dare complete by editing local state.

## One-minute read-only check

1. Open the [contract](https://explorer-studio-dev.genlayer.com/address/0x5eA37668c8c8F1313d4294C349a7eC8585071135).
2. Call `get_stats` and verify:
   - `contract_version` is `2.1.2`;
   - `receipt_schema` is `gendare-receipt-v2`;
   - `minimum_stake_wei` is `5000000000000000000`;
   - `minimum_price_duration_seconds` is `600`;
   - `max_participants_per_side` is `32`;
   - `stalled_refund_delay_seconds` is `86400`.
3. Open [GenDare](https://gendare.online) without connecting a wallet.
4. Confirm the feed loads accepted contract records and that each card opens its on-chain dare detail.
5. Compare a displayed dare with `get_dare(id)`.

## Reproduce a goal dare

This is the shortest end-to-end consensus path.

### Prepare evidence

Use a stable public HTTPS document no larger than 24 KB. An immutable raw file URL pinned to a commit is preferable. The document should directly establish:

- the claimant identity;
- the objective completion criterion;
- completion inside the dare's time window.

Avoid a private page, a login-gated page, a mutable homepage, or a page assembled entirely in the browser.

### Create and lock

1. Connect Rabby or MetaMask and approve Studio Devnet (`61997`).
2. Obtain development GEN from the faucet in the Studio account selector if required.
3. Open **Create**, choose **Goal Dare**, and enter:
   - an exact goal;
   - the public identity validators must match;
   - objective completion criteria;
   - an evidence hint;
   - a deadline at least two minutes away in the UI;
   - at least `5 GEN`.
4. Create the dare and retain its Explorer transaction link.
5. Before the deadline, open the dare and submit the prepared evidence URL plus an optional explanatory note.
6. Wait for the evidence-lock transaction to finish, then confirm the detail page shows accepted `submitted` state.

The lock transaction independently fetches the source and persists its SHA-256 digest and byte length. A note alone cannot substitute for proof.

For deployment-source verification, the tracked `contracts/GenDareV2.py` file has SHA-256 `4A6EC9B10F95777411F59F31A33A97BF39B1181E587BD7A6FAD507D6433E22A0`.

### Resolve

1. Wait until the locked deadline passes.
2. Choose **Resolve** on the dare detail page.
3. Keep the displayed transaction hash while consensus runs; do not create a duplicate transaction merely because finality is not immediate.
4. After successful execution, refresh the accepted contract state.
5. Inspect `get_receipt(id)` and the resolution transaction in Explorer.

Verify that the persisted receipt includes the dare and evidence hashes, locked and observed source metadata, decision, reason code, and summary. If the source changed after locking, the expected result is `INCONCLUSIVE / SOURCE_CHANGED`, not a guessed completion verdict.

## Reproduce a price dare

1. Open **Create** and choose **Price Dare**.
2. Select a supported asset, target, and either:
   - above the target at the deadline; or
   - reaches the target at any time before the deadline.
3. Choose a deadline at least 12 minutes away in the UI and stake at least `5 GEN`.
4. Create the dare and retain the transaction link.
5. Wait until ten minutes after the deadline, then choose **Check price**.
6. Inspect the accepted receipt in contract state and Explorer.

The receipt should expose the exact source window, sample count, truncation flag, source snapshot hash, selected price, maximum price, target, condition, decision, and reason code. Targets are stored as integer micro-USD, not floating point.

## Verify a contested payout

A second wallet is required because the creator cannot challenge their own dare.

1. Create either dare type from wallet A with at least `5 GEN`.
2. Before the deadline, connect wallet B and challenge with at least `5 GEN`.
3. Complete the appropriate evidence and resolution flow.
4. Confirm the settlement mode:
   - `SUPPORT_WINS` for a `COMPLETE` decision;
   - `CHALLENGE_WINS` for an `INCOMPLETE` decision.
5. Call `get_claimable(id, wallet)` for a winning wallet.
6. Claim once, then verify a second claim is rejected.

A 2% fee is taken only on a contested final outcome. Claims are proportional to each winning position. An uncontested dare refunds positions instead of manufacturing a winner's yield.

## Adversarial checks

| Check                                                                | Expected behavior                                 |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| Creator tries to add another position                                | Rejected                                          |
| One wallet tries to join both sides                                  | Rejected                                          |
| Stake is below 5 GEN                                                 | Rejected                                          |
| Evidence URL is non-HTTPS, private, unreadable, or larger than 24 KB | Evidence lock rejected                            |
| Locked goal source changes before resolution                         | Non-final `SOURCE_CHANGED` receipt                |
| Deadline price sample is more than 90 minutes old                    | Non-final `SAMPLE_TOO_OLD` receipt                |
| Price response is missing, malformed, or over the sample limit       | Non-final receipt; no ordinary win/loss           |
| Three resolution attempts remain non-final                           | All positions become refundable                   |
| Consensus is stalled past the 24-hour recovery window                | `force_refund_stalled` makes positions refundable |
| A wallet claims twice                                                | Second claim rejected                             |

## Important review notes

- Studio Devnet consensus and finality are asynchronous. Preserve the transaction hash and inspect both decision and execution status.
- An accepted consensus transaction is not treated by the frontend as successful unless contract execution also succeeds.
- Unlisted is an on-chain discoverability preference for clients; it does not make data private.
- The goal receipt answers only the locked criteria for the locked claimant and source.
- The price receipt answers only the locked target, condition, data source, and time window.
- `INCONCLUSIVE` and `UNREADABLE` are deliberate safety outcomes, not aliases for failure.

## Source review path

The fastest code-review order is:

1. `contracts/GenDareV2.py`: receipt construction, validator equality, state transitions, settlement, and claims;
2. `src/lib/contract.ts`: typed contract calls and decision-aware transaction handling;
3. `src/lib/injected.ts`: exact Studio Devnet configuration;
4. `src/routes/create.tsx`: argument and unit construction;
5. `src/routes/dare.$id.tsx`: evidence, resolution, and claim actions;
6. `src/lib/dares.ts`: accepted contract-state adaptation for display.
