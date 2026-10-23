import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rules" };

const RULES: Array<[string, string[]]> = [
  [
    "1. Subjects are handles",
    [
      "A subject is a token, by symbol and contract address, or a public handle. Nothing else.",
      "The agent does not publish, infer or hint at a legal name, a face, a location, an employer, a phone number, an email address or any other personal detail. If a source contains one, the agent drops the source.",
    ],
  ],
  [
    "2. Attribution needs a source",
    [
      "A wallet is shown next to a handle only when the registry carries that wallet under that handle with a source link a reader can open. The tier is shown with it: confirmed, probable or claimed.",
      "Without a source the wallet is just a wallet. It appears in evidence tables as an address and nothing more.",
    ],
  ],
  [
    "3. Disputes are honoured immediately",
    [
      "Anyone who controls a wallet can dispute its inclusion by signing a message with it. The wallet is hidden from every page at once. Not greyed, not flagged. Gone.",
      "The dispute is queued for review. The reply is: Noted. The agent does not argue in public.",
    ],
  ],
  [
    "4. Findings, not verdicts",
    [
      "The agent reports what it found: a transfer, a timing, a pattern. It does not pass judgment and it does not use the word a court would use.",
      "Severity describes how much money moved and how clearly. Not guilt. Convictions remain at zero.",
    ],
  ],
  ["5. Evidence is linkable", ["Every transaction, account and token in a case file links to a public explorer. A claim that cannot be linked is narrative, and it is labelled as narrative."]],
  [
    "6. The ballot is one wallet, one vote",
    [
      "The daily ballot picks the next subject. A vote is a signed message from a Solana wallet that holds at least the minimum balance of the CRIME token. One vote per wallet per ballot.",
      "Votes are never weighted by balance. The runner-up carries to the next day. A subject is not put on a ballot twice in thirty days.",
    ],
  ],
  ["7. Everything through the policy", ["Every string that reaches a reader passes through the policy module. Fixtures, generated data, submitted text, API responses. No exceptions."]],
];

const DISPUTE = [
  "Open the dossier or the case page that shows the wallet.",
  "Press Dispute. Connect the wallet in question.",
  "Sign the message CRIME dispute <wallet>. Nothing is sent on-chain. No fee.",
  "The wallet is hidden immediately. The reply is: Noted.",
  "A reviewer looks at it. If the registry entry was wrong, it is removed. If the source stands, the wallet stays hidden anyway. See rule 3.",
];

export default function Rules() {
  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <h1 className="text-4xl md:text-5xl">Rules of engagement</h1>
        <p className="mt-2 text-mute text-xs uppercase tracking-[0.14em]">Not negotiable. Not clever.</p>
      </div>
      <div className="file p-5 md:p-8 flex flex-col gap-8">
        {RULES.map(([title, paras]) => (
          <section key={title}>
            <h2 className="text-xl">{title}</h2>
            {paras.map((p, i) => (
              <p key={i} className="mt-2 text-[14px] leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
        <section id="dispute" className="border-t-2 border-ink pt-6">
          <h2 className="text-xl">How to dispute</h2>
          <ol className="mt-3 flex flex-col gap-2 text-[14px] leading-relaxed list-decimal pl-5">
            {DISPUTE.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="mt-6 text-xs">
            Message format: <code>CRIME dispute &lt;wallet&gt;</code>. Endpoint: <code>POST /api/dispute</code> with{" "}
            <code>{`{ wallet, signature }`}</code>, signature base58 over the UTF-8 message.
          </p>
        </section>
      </div>
    </div>
  );
}
