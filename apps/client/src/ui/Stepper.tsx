interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}

/** Selettore numerico compatto: − valore + (con limiti). */
export function Stepper({ value, min = 0, max, onChange, label }: Props) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Meno">
        −
      </button>
      <output className="num">{value}</output>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Più">
        +
      </button>
      <button type="button" className="ghost tiny" onClick={() => onChange(max)} disabled={value >= max}>
        tutti
      </button>
    </div>
  );
}
