export function QualityPicker({
  heights,
  value,
  onChange,
  disabled,
}: {
  heights: number[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="quality" aria-label="Video quality">
      {['best', ...heights.filter((h) => [1080, 720, 480, 360].includes(h)).map(String)]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            className={`btn subtle ${value === v ? 'active' : ''}`}
            onClick={() => onChange(v)}
          >
            {v === 'best' ? 'Best' : `${v}p`}
          </button>
        ))}
    </div>
  );
}
