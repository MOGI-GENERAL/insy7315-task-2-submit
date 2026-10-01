/* STACKED CLAIMED/EXPIRED SPLIT BAR */

import './charts.css';

export function SplitBar({
  claimed,
  expired,
  height = 32,
}: {
  claimed: number;
  expired: number;
  height?: number;
}) {
  const total = Math.max(1, claimed + expired);
  const claimedPct = claimed / total;
  const expiredPct = expired / total;
  const gap = 2;

  return (
    <div className="split-bar">
      <div className="chart__legend">
        <span className="chart__legend-item">
          <span className="chart__swatch" data-tone="good" />
          Claimed and collected ({Math.round(claimedPct * 100)}%)
        </span>
        <span className="chart__legend-item">
          <span className="chart__swatch" data-tone="bad" />
          Expired unclaimed ({Math.round(expiredPct * 100)}%)
        </span>
      </div>
      <svg
        viewBox={`0 0 400 ${height}`}
        className="split-bar__svg"
        role="img"
        aria-label={`${Math.round(claimedPct * 100)}% of offers claimed and collected, ${Math.round(expiredPct * 100)}% expired unclaimed`}
        preserveAspectRatio="none"
      >
        <rect
          x={0}
          y={0}
          width={Math.max(claimedPct * 400 - gap / 2, 0)}
          height={height}
          rx={6}
          className="chart__bar"
          data-tone="good"
        />
        <rect
          x={claimedPct * 400 + gap / 2}
          y={0}
          width={Math.max(expiredPct * 400 - gap / 2, 0)}
          height={height}
          rx={6}
          className="chart__bar"
          data-tone="bad"
        />
      </svg>
    </div>
  );
}
