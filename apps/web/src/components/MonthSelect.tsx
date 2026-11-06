const HU_MONTHS = [
  { value: "01", label: "január" },
  { value: "02", label: "február" },
  { value: "03", label: "március" },
  { value: "04", label: "április" },
  { value: "05", label: "május" },
  { value: "06", label: "június" },
  { value: "07", label: "július" },
  { value: "08", label: "augusztus" },
  { value: "09", label: "szeptember" },
  { value: "10", label: "október" },
  { value: "11", label: "november" },
  { value: "12", label: "december" },
] as const;

const SELECT_CLASS =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900";

function parseYearMonth(value: string): { year: string; month: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) {
    return { year: "", month: "" };
  }
  return { year: match[1], month: match[2] };
}

function yearOptionsAround(centerYear: number, span = 5): number[] {
  const years: number[] = [];
  for (let y = centerYear - span; y <= centerYear + 1; y += 1) {
    years.push(y);
  }
  return years;
}

type MonthSelectProps = {
  value: string;
  onChange: (next: string) => void;
  id?: string;
};

/** Cross-browser month control — native type=month often has no picker UI. */
export function MonthSelect({ value, onChange, id }: MonthSelectProps) {
  const { year, month } = parseYearMonth(value);
  const centerYear = Number(year) || new Date().getUTCFullYear();
  const years = yearOptionsAround(centerYear);

  return (
    <div className="flex max-w-xs gap-2">
      <select
        id={id}
        aria-label="Év"
        className={`${SELECT_CLASS} min-w-[6.5rem]`}
        value={year}
        onChange={(e) => {
          const nextYear = e.target.value;
          const nextMonth = month || "01";
          onChange(`${nextYear}-${nextMonth}`);
        }}
      >
        {!year ? (
          <option value="" disabled>
            Év
          </option>
        ) : null}
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label="Hónap"
        className={`${SELECT_CLASS} min-w-0 flex-1`}
        value={month}
        onChange={(e) => {
          const nextMonth = e.target.value;
          const nextYear = year || String(centerYear);
          onChange(`${nextYear}-${nextMonth}`);
        }}
      >
        {!month ? (
          <option value="" disabled>
            Hónap
          </option>
        ) : null}
        {HU_MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
