import type { Bit } from '../lib/diagnosis';

interface BitSelectProps {
  value: Bit;
  onChange: (v: Bit) => void;
  ariaLabel: string;
}

export default function BitSelect({ value, onChange, ariaLabel }: BitSelectProps) {
  return (
    <span className="bit-select" role="group" aria-label={ariaLabel}>
      {([0, 1] as Bit[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          className={`bit-btn ${value === v ? 'bit-btn-on' : ''}`}
          onClick={() => onChange(v)}
        >
          {v}
        </button>
      ))}
    </span>
  );
}
