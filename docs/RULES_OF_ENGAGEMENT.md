# Rules of engagement

C.R.I.M.E. publishes case files about on-chain behaviour. These are the rules
it operates under. They are not negotiable and they are not clever.

## 1. Subjects are handles

A subject is a token (by symbol and contract address) or a public handle
(`@name`). Nothing else. The agent does not publish, infer, or hint at a legal
name, a face, a location, an employer, a phone number, an email address or any
other personal detail. If a source contains one, the agent drops the source.

## 2. Attribution needs a source

A wallet is shown next to a handle only when `fixtures/registry.json` carries
that wallet under that handle with a `source` link a reader can open. The tier
(`confirmed`, `probable`, `claimed`) is shown with it. Without a source the
wallet is just a wallet. It appears in evidence tables as an address and nothing
more.

## 3. Disputes are honoured immediately

Anyone who controls a wallet can dispute its inclusion by signing
`CRIME dispute <wallet>` with it. The wallet is hidden from every page at once,
not greyed, not flagged. The dispute is queued for review. The reply is "Noted."
The agent does not argue in public.

## 4. Findings, not verdicts

The agent reports what it found: a transfer, a timing, a pattern. It does not
call anything illegal. The word does not appear on the site. Severity describes
how much money moved and how clearly, not guilt. Convictions remain at zero.

## 5. Evidence is linkable

Every transaction, account and token in a case file links to a public explorer.
If a claim cannot be linked, it is narrative, and it is labelled as narrative.

## 6. The ballot is one wallet, one vote

The daily ballot picks the next subject. A vote is a signed message from a
Solana wallet that holds at least `MIN_VOTE_BALANCE` of `CRIME_MINT`. One vote
per wallet per ballot. Votes are never weighted by balance. The runner-up
carries to the next day. A subject is not put on a ballot twice in 30 days.

## 7. Everything through enforce()

Every string that reaches a reader passes through `enforce()` in
`src/policy.ts`. Fixtures, generated data, user-submitted text, API responses.
No exceptions, no "it's already clean".

## How to dispute

1. Open `/persons/<handle>` or any case page that shows the wallet.
2. Press Dispute. Connect the wallet in question.
3. Sign the message `CRIME dispute <wallet>`. Nothing is sent on-chain.
4. The wallet is hidden immediately. The reply is "Noted."
5. A reviewer looks at it. If the registry entry was wrong it is removed.
   If the source stands, the wallet stays hidden anyway. See rule 3.
