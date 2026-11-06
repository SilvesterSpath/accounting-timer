import type { ManagementClientWorkloadDto } from "@accounting-timer/shared-types";
import { hourAxisTicks, niceHoursCeiling } from "../lib/chartScale";
import { formatHuHours } from "../lib/huFormat";

type ClientRow = ManagementClientWorkloadDto["byClient"][number];

function clientDisplayName(row: ClientRow): string {
  return row.isSystemInternal ? `${row.name} (belső)` : row.name;
}

type Props = {
  rows: ClientRow[];
};

/**
 * Light-theme vertical bar chart for client hours.
 * Pure SVG — no chart library.
 */
export function ClientWorkloadChart({ rows }: Props) {
  const maxHours = Math.max(...rows.map((r) => r.totalHoursDisplay), 0);
  const ceiling = niceHoursCeiling(maxHours);
  const ticks = hourAxisTicks(maxHours);

  const width = 640;
  const height = 320;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 24;
  const padBottom = 72;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const gap = Math.min(24, plotW / (rows.length * 4));
  const barW = Math.max(18, (plotW - gap * (rows.length + 1)) / rows.length);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto h-auto w-full max-w-3xl"
        role="img"
        aria-label="Ügyfelenkénti időráfordítás oszlopdiagram"
      >
        {/* Grid + Y axis */}
        {ticks.map((tick) => {
          const y = padTop + plotH * (1 - tick / ceiling);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500"
                fontSize={11}
              >
                {tick}
              </text>
            </g>
          );
        })}
        <text
          x={14}
          y={padTop + plotH / 2}
          textAnchor="middle"
          className="fill-slate-500"
          fontSize={11}
          transform={`rotate(-90 14 ${padTop + plotH / 2})`}
        >
          óra
        </text>
        <line
          x1={padLeft}
          x2={padLeft}
          y1={padTop}
          y2={padTop + plotH}
          stroke="#cbd5e1"
          strokeWidth={1}
        />
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + plotH}
          y2={padTop + plotH}
          stroke="#cbd5e1"
          strokeWidth={1}
        />

        {rows.map((row, index) => {
          const hours = row.totalHoursDisplay;
          const barH = ceiling > 0 ? (hours / ceiling) * plotH : 0;
          const x = padLeft + gap + index * (barW + gap);
          const y = padTop + plotH - barH;
          const label = clientDisplayName(row);
          const shortLabel =
            label.length > 14 ? `${label.slice(0, 12)}…` : label;
          return (
            <g key={row.clientId}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, hours > 0 ? 2 : 0)}
                rx={4}
                className={
                  row.isSystemInternal ? "fill-slate-400" : "fill-sky-600"
                }
              >
                <title>
                  {label}: {formatHuHours(hours)} óra
                </title>
              </rect>
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-slate-800"
                fontSize={11}
                fontWeight={600}
              >
                {formatHuHours(hours)}
              </text>
              <text
                x={x + barW / 2}
                y={padTop + plotH + 18}
                textAnchor="middle"
                className="fill-slate-700"
                fontSize={11}
              >
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
