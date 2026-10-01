/* HAND-ROLLED SVG BAR CHART */

import { useId, useState } from 'react';
import './charts.css';

export interface BarGroup {
  label: string;
  value: number;
  valueSecondary?: number;
}

export function BarChart({
  data,
  height = 220,
  valueLabel = 'kg',
  secondaryLabel,
  formatValue = (v) => Math.round(v).toLocaleString('en-ZA'),
}: {
  data: BarGroup[];
  height?: number;
  valueLabel?: string;
  secondaryLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const uid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const hasSecondary = data.some((d) => d.valueSecondary !== undefined);

  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.valueSecondary ?? 0)));
  const width = 640;
  const padTop = 16;
  const padBottom = 32;
  const padLeft = 8;
  const padRight = 8;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - padRight;
  const groupW = plotW / data.length;
  const barGap = hasSecondary ? 4 : 0;
  const barW = hasSecondary ? (groupW - 16 - barGap) / 2 : groupW - 16;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart">
      {hasSecondary && secondaryLabel && (
        <div className="chart__legend">
          <span className="chart__legend-item">
            <span className="chart__swatch" data-tone="good" />
            {valueLabel}
          </span>
          <span className="chart__legend-item">
            <span className="chart__swatch" data-tone="bad" />
            {secondaryLabel}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart__svg"
        role="img"
        aria-label={`Bar chart of ${valueLabel}${secondaryLabel ? ` and ${secondaryLabel}` : ''} by ${data.map((d) => d.label).join(', ')}`}
      >
        {gridLines.map((g) => {
          const y = padTop + plotH * (1 - g);
          return (
            <line
              key={g}
              x1={padLeft}
              x2={width - padRight}
              y1={y}
              y2={y}
              className="chart__grid"
            />
          );
        })}

        {data.map((d, i) => {
          const x0 = padLeft + i * groupW + 8;
          const h1 = (d.value / max) * plotH;
          const y1 = padTop + plotH - h1;
          const isHover = hover === i;

          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="graphics-symbol"
              aria-label={`${d.label}: ${formatValue(d.value)} ${valueLabel}${d.valueSecondary !== undefined ? `, ${formatValue(d.valueSecondary)} ${secondaryLabel}` : ''}`}
              className="chart__group"
            >
              <rect
                x={x0}
                y={y1}
                width={barW}
                height={Math.max(h1, 2)}
                rx={4}
                className="chart__bar"
                data-tone="good"
                opacity={isHover ? 1 : 0.92}
              />
              {d.valueSecondary !== undefined && (
                <rect
                  x={x0 + barW + barGap}
                  y={padTop + plotH - (d.valueSecondary / max) * plotH}
                  width={barW}
                  height={Math.max((d.valueSecondary / max) * plotH, 2)}
                  rx={4}
                  className="chart__bar"
                  data-tone="bad"
                  opacity={isHover ? 1 : 0.92}
                />
              )}

              <text
                x={x0 + (hasSecondary ? barW + barGap / 2 : barW / 2)}
                y={height - padBottom + 18}
                className="chart__x-label"
                textAnchor="middle"
              >
                {d.label}
              </text>

              {isHover && (
                <g className="chart__tooltip" transform={`translate(${x0 + barW / 2}, ${y1 - 8})`}>
                  <rect x={-38} y={-46} width={76} height={hasSecondary ? 40 : 24} rx={6} />
                  <text x={0} y={-30} textAnchor="middle" className="chart__tooltip-text">
                    {formatValue(d.value)} {valueLabel}
                  </text>
                  {d.valueSecondary !== undefined && (
                    <text x={0} y={-14} textAnchor="middle" className="chart__tooltip-text">
                      {formatValue(d.valueSecondary)} {secondaryLabel}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <span className="sr-only" id={`${uid}-desc`}>
        Chart data is also available in the table below.
      </span>
    </div>
  );
}
