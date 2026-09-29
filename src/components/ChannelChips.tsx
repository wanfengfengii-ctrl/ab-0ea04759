interface ChannelChipsProps {
  channels: number[];
  highlight?: Set<number>;
  tone?: 'fault' | 'witness' | 'plain';
  emptyText?: string;
}

export default function ChannelChips({ channels, highlight, tone = 'plain', emptyText }: ChannelChipsProps) {
  if (channels.length === 0 && emptyText) {
    return <span className="chips-empty">{emptyText}</span>;
  }
  return (
    <span className={`chips chips-${tone}`}>
      {channels.map((c) => (
        <span key={c} className={`chip ${highlight && !highlight.has(c) ? 'chip-dim' : ''}`}>
          {c}
        </span>
      ))}
    </span>
  );
}
