# GenDare architecture

This document describes the deployed GenDare `2.1.2` contract and the frontend that reads and writes it on GenLayer Studio Devnet.

## Design principles

GenDare separates three responsibilities:

- **The user locks intent.** A dare's claim, criteria, deadline, visibility, identities, and funds are fixed by a transaction.
- **Validators interpret bounded evidence.** Nondeterministic web access and, for goal dares, model judgment happen inside GenLayer consensus.
- **The contract settles deterministically.** State transitions, retry limits, fees, proportional payouts, and refunds do not depend on frontend judgment.

The contract is the authoritative state. Browser storage contains only transaction hashes and their last observed UI status so a reload does not lose a pending transaction.

## System boundary

```mermaid
flowchart TB
    subgraph Browser
        UI[React / TanStack Start UI]
        Wallet[Injected wallet\nRabby or MetaMask]
        Tracker[Local transaction tracker]
    end

    subgraph GenLayer[GenLayer Studio Devnet]
        SDK[genlayer-js]
        Contract[GenDareV2\nstate + escrow + settlement]
        Leader[Leader execution]
        Validators[Independent validators]
    end

    GoalSource[Locked public goal evidence]
    PriceSource[CoinGecko market data]
    Explorer[Studio Devnet Explorer]

    UI --> SDK
    Wallet --> SDK
    SDK --> Contract
    SDK --> Tracker
    Contract --> Leader
    GoalSource --> Leader
    PriceSource --> Leader
    Leader --> Validators
    GoalSource --> Validators
    PriceSource --> Validators
    Validators -->|exact canonical receipt agreement| Contract
    Contract --> Explorer
    Contract --> UI
```

There is no application database in the settlement path. Feed and detail views are rebuilt from accepted contract reads. Local transaction tracking is not used as proof that a dare exists or that a verdict succeeded.

## Contract state

`GenDareV2` stores each dare as canonical JSON and keeps participant accounting in keyed maps:

- `dares`: locked dare fields, lifecycle status, receipt, and settlement totals;
- `supporters` and `challengers`: the participant lists for each side;
- `stakes` and `sides`: each wallet's amount and immutable side selection;
- `claimed`: one-time payout protection;
- aggregate counters and withdrawable protocol fees.

The creator's initial stake is registered as `SUPPORT`. A different wallet can add to one side, but cannot cross from support to challenge. The creator cannot add another position. Each non-creator side is capped at 32 wallets.

## Goal-dare lifecycle

```mermaid
stateDiagram-v2
    [*] --> open: create_dare + stake
    open --> canceled: creator cancels before anyone joins
    open --> submitted: creator locks readable evidence before deadline
    open --> incomplete: deadline passes without evidence and challenge exists
    open --> refundable: deadline passes without evidence and no challenge exists
    submitted --> complete: COMPLETE receipt + contested
    submitted --> incomplete: INCOMPLETE receipt + contested
    submitted --> refundable: final receipt + no challengers
    submitted --> retryable: INCONCLUSIVE / UNREADABLE, attempts < 3
    retryable --> complete: later COMPLETE + contested
    retryable --> incomplete: later INCOMPLETE + contested
    retryable --> refundable: third non-final result or no challengers
    submitted --> refundable: consensus stalled for recovery window
    retryable --> refundable: consensus stalled for recovery window
    canceled --> [*]
    complete --> [*]
    incomplete --> [*]
    refundable --> [*]
```

### Evidence lock

Before the deadline, only the creator can call `submit_evidence`. The contract:

1. validates a public HTTPS URL and an optional evidence note;
2. fetches the URL through nondeterministic execution;
3. has validators independently reproduce the evidence-lock payload;
4. requires HTTP 200, a non-empty digest, and content no larger than 24 KB;
5. stores the URL, SHA-256 digest, byte length, evidence hash, and lock time.

The evidence note is context, not proof. Source content is treated as untrusted data rather than instructions.

### Goal resolution

Resolution opens after the deadline. The source is fetched again. If it is unreadable, too large, or no longer matches the locked digest and byte length, the contract returns a bounded non-final result instead of allowing an adverse judgment from incomplete or changed evidence.

Only when the source still matches does the goal evaluator classify it against the locked goal, claimant identity, criteria, and timing. Supported outcomes and reason codes are constrained by contract code. Validators independently rebuild the entire receipt and accept only canonical equality with the leader result.

The goal receipt binds:

- schema, dare ID, dare hash, and evidence hash;
- source URL, locked and observed digest, byte length, status, and truncation flag;
- decision, reason code, and fixed summary.

## Price-dare lifecycle

```mermaid
stateDiagram-v2
    [*] --> open: create_price_dare + stake
    open --> canceled: creator cancels before anyone joins
    open --> complete: target met + contested
    open --> incomplete: target missed + contested
    open --> refundable: final receipt + no challengers
    open --> retryable: source result non-final, attempts < 3
    retryable --> complete: later target met + contested
    retryable --> incomplete: later target missed + contested
    retryable --> refundable: third non-final result or stalled recovery
    canceled --> [*]
    complete --> [*]
    incomplete --> [*]
    refundable --> [*]
```

Price dares use integer micro-USD values, avoiding floating-point settlement. The source window begins at dare creation and ends at the locked deadline. Resolution opens ten minutes after the deadline so the data source can expose the final samples.

For `above_at_deadline`, the last qualifying sample must be no more than 90 minutes before the deadline. For `reached_anytime`, the contract evaluates the maximum sample in the window. At most 3,000 samples are accepted; truncated, missing, stale, malformed, or unreadable data cannot become an ordinary win/loss verdict.

The price receipt binds the complete reduction context, including the source URL and status, snapshot hash, sample count and truncation flag, window, condition, target, selected sample, deadline gap, maximum sample, decision, and reason code.

## Consensus rule

Both resolution paths use `gl.vm.run_nondet_default`:

1. the leader builds a complete receipt from the locked dare and fetched evidence;
2. every validator independently executes the same receipt builder;
3. the validator compares canonical JSON, not only the top-level verdict;
4. contract state changes only when GenLayer accepts that receipt.

This matters because agreeing only on `COMPLETE` or `INCOMPLETE` would leave consequential fields such as source digests, timestamps, selected prices, or reason codes unbound.

## Settlement and claims

Let:

```text
total pot = creator stake + supporter pool + challenger pool
```

When a dare is contested and receives a final `COMPLETE` or `INCOMPLETE` receipt, the contract deducts a 2% protocol fee and assigns the remaining pot to the winning side. Each winner claims in proportion to their stake. The final winning claimant receives any remainder caused by integer division.

- `COMPLETE` selects the support side, including the creator.
- `INCOMPLETE` selects the challenge side.
- no challenger means all positions are refundable, regardless of the final evidence decision;
- a third `INCONCLUSIVE` or `UNREADABLE` result makes all positions refundable;
- a settlement that remains stalled for 24 hours can be moved to the refund path by any caller;
- `claim` is pull-based and protected against duplicate withdrawals.

## Frontend transaction lifecycle

All reads use a read-only `genlayer-js` client. Writes require a connected injected wallet and follow this sequence:

1. discover Rabby or MetaMask;
2. switch or add Studio Devnet (`61997`);
3. bind an explicit JSON-RPC account and the deployed contract address;
4. estimate GenLayer fees;
5. submit the write;
6. persist the transaction hash immediately;
7. wait for a GenLayer decision and classify successful, failed, or uncertain execution;
8. refresh the accepted contract state.

Creation calls use the active fee policy without simulated contract execution because their deadline checks depend on the real transaction timestamp. Other writes use exact-call fee estimation. An accepted consensus decision is not assumed to imply successful contract execution; the SDK result is checked before the UI reports success.

## Failure model

| Failure                                              | Contract or client response                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Wrong wallet network                                 | Client requests Studio Devnet and verifies the resulting chain ID |
| Pending transaction outlives the page                | Hash remains in the local transaction tracker                     |
| Goal source is unreadable while locking              | Evidence transaction is rejected; no submitted state is created   |
| Goal source changes after locking                    | `INCONCLUSIVE / SOURCE_CHANGED`                                   |
| Goal source exceeds 24 KB                            | Rejected at lock, or non-final if observed during resolution      |
| Price data is absent, stale, malformed, or truncated | Non-final receipt; no ordinary win/loss settlement                |
| Repeated non-final evidence                          | Refund after the third attempt                                    |
| Consensus produces no final receipt                  | Permissionless refund after the 24-hour recovery window           |

## Deployment identifiers

- Contract: [`0x5eA37668c8c8F1313d4294C349a7eC8585071135`](https://explorer-studio-dev.genlayer.com/address/0x5eA37668c8c8F1313d4294C349a7eC8585071135)
- Deployment transaction: [`0xb1e0ec256e6be87d416c66d25e6d282fdb5f4ece40c92fc86cc0652850a4164c`](https://explorer-studio-dev.genlayer.com/tx/0xb1e0ec256e6be87d416c66d25e6d282fdb5f4ece40c92fc86cc0652850a4164c)
- Source: [`contracts/GenDareV2.py`](../contracts/GenDareV2.py)
