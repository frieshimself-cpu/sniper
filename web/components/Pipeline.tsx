/**
 * The method, drawn: five stations and the money moving between them. Pure SVG, the same flow
 * animation as the wallet graph. Reads left to right on a desk, top to bottom on a phone.
 */
const STEPS: Array<[string, string, string]> = [
  ["01", "The record", "Every post, back to the first. Grok types each one: shill, holding, LP locked, sold, launch, wallet."],
  ["02", "The wallets", "Posted by the handle. Tied by Arkham. Then the ones never admitted: SOL between wallets, two hops."],
  ["03", "The replay", "Every transfer of every wallet from Helius. Posts set next to transactions, by the minute."],
  ["04", "The findings", "Promoted then sold. Said holding while selling. Bundles funded. Profit per token in SOL. Weighed."],
  ["05", "The file", "A headline, the worst first, every claim a link. Convictions: 0."],
];

export function Pipeline() {
  return (
    <div className="pipeline">
      <svg className="pipeline-line hidden md:block" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="12" x2="1000" y2="12" stroke="#2a2a2f" strokeWidth="1" />
        <line x1="0" y1="12" x2="1000" y2="12" stroke="#5f8fd8" strokeOpacity="0.5" strokeWidth="1" transform="translate(0 -1)" />
        <line x1="0" y1="12" x2="1000" y2="12" stroke="#c4344a" strokeOpacity="0.5" strokeWidth="1" transform="translate(0 1)" />
        <line x1="0" y1="12" x2="1000" y2="12" stroke="#e8e4da" strokeWidth="1.4" strokeDasharray="3 21" className="flow" />
      </svg>
      <ol className="grid gap-4 md:grid-cols-5">
        {STEPS.map(([n, title, body], i) => (
          <li key={n} className="file p-5 relative" style={{ transitionDelay: `${i * 90}ms` }}>
            <span className="pipeline-node" aria-hidden />
            <span className="text-stamp font-semibold text-[11px] tracking-[0.14em]">{n}</span>
            <h3 className="mt-2 text-lg">{title}</h3>
            <p className="mt-2 text-[12px] opacity-80 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
