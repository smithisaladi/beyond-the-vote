import { useRef, useLayoutEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useMoneyFlow } from "@/hooks/queries/useDonors";
import { formatTotal, toTitleCase } from "@/lib/format";
import { toParty, partyAbbrev } from "@/lib/party";
import { PARTY_STYLES, STATUS_STYLES } from "@/lib/ui";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

function spendingLabel(r: FlowRecipient): string {
  const parts: string[] = [];
  // Role first (e.g. "Senate" or "House candidate")
  const role = recipientRole(r);
  if (role) parts.push(role);
  // Spending breakdown
  if (r.direct && r.direct > 0) parts.push(`Direct ${formatTotal(r.direct)}`);
  if (r.ieFor && r.ieFor > 0) parts.push(`IE for ${formatTotal(r.ieFor)}`);
  if (r.ieAgainst && r.ieAgainst > 0) parts.push(`IE against ${formatTotal(r.ieAgainst)}`);
  return parts.join(" · ");
}

interface MoneyFlowSectionProps {
  cmteId: string;
  cmteName: string;
}

interface FlowFunder {
  canonicalDonorId?: string;
  entityId?: string;
  name: string;
  employer?: string;
  state?: string;
  totalAmount: number;
  type: "individual" | "pac";
}

interface FlowRecipient {
  entityId: string;
  name: string;
  party?: string;
  state?: string;
  chamber?: string;
  bioguideId?: string;
  candOffice?: string; // H, S, P from FEC — present when not a current legislator
  amount: number;
  direct?: number;
  ieFor?: number;
  ieAgainst?: number;
}

const OFFICE_LABELS: Record<string, string> = { H: "House candidate", S: "Senate candidate", P: "Presidential" };

function recipientRole(r: FlowRecipient): string {
  // Current legislator — use chamber
  if (r.bioguideId && r.chamber) {
    return r.chamber.charAt(0).toUpperCase() + r.chamber.slice(1);
  }
  // Non-legislator — use FEC office label
  if (r.candOffice) return OFFICE_LABELS[r.candOffice] || "Candidate";
  return "Candidate";
}

export function MoneyFlowSection({ cmteId, cmteName }: MoneyFlowSectionProps) {
  const { data, isLoading } = useMoneyFlow(cmteId);

  if (isLoading) return <MoneyFlowSkeleton />;
  if (
    !data ||
    (data.topFunders.length === 0 && data.topRecipients.length === 0)
  )
    return null;

  return (
    <Card padding="lg">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-fg tracking-tight">
          Follow the Money
        </h2>
        <p className="text-sm text-fg/50">
          {data.funderType === "individual"
            ? "Top individual funders and where the money goes"
            : "Top PAC sources and where the money goes"}
        </p>
      </div>

      {/* Desktop: horizontal three-column flow */}
      <div className="hidden md:block">
        <HorizontalFlow
          funders={data.topFunders}
          recipients={data.topRecipients}
          cmteName={cmteName}
          totalOutbound={data.flowStats.totalOutbound}
          funderType={data.funderType}
          funderCount={data.flowStats.funderCount}
          recipientCount={data.flowStats.recipientCount}
        />
      </div>

      {/* Mobile: vertical stack */}
      <div className="md:hidden">
        <VerticalFlow
          funders={data.topFunders}
          recipients={data.topRecipients}
          cmteName={cmteName}
          totalOutbound={data.flowStats.totalOutbound}
          funderType={data.funderType}
        />
      </div>
    </Card>
  );
}

/* ─── Horizontal (desktop) ─────────────────────────────────────── */

function HorizontalFlow({
  funders,
  recipients,
  cmteName,
  totalOutbound,
  funderType,
  funderCount,
  recipientCount,
}: {
  funders: FlowFunder[];
  recipients: FlowRecipient[];
  cmteName: string;
  totalOutbound: number;
  funderType: string;
  funderCount: number;
  recipientCount: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rightRefs = useRef<(HTMLDivElement | null)[]>([]);
  const centerRef = useRef<HTMLDivElement>(null);
  const [curves, setCurves] = useState<{
    left: CurveData[];
    right: CurveData[];
  }>({ left: [], right: [] });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const maxFunderAmt = Math.max(...funders.map((f) => f.totalAmount), 1);
  const maxRecipientAmt = Math.max(...recipients.map((r) => r.amount), 1);

  const computeCurves = useCallback(() => {
    const container = containerRef.current;
    const center = centerRef.current;
    if (!container || !center) return;

    const cRect = container.getBoundingClientRect();
    const centerRect = center.getBoundingClientRect();
    const centerY = centerRect.top + centerRect.height / 2 - cRect.top;
    const centerLeftX = centerRect.left - cRect.left;
    const centerRightX = centerRect.right - cRect.left;

    const leftCurves: CurveData[] = [];
    leftRefs.current.forEach((el, i) => {
      if (!el || i >= funders.length) return;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2 - cRect.top;
      const x = r.right - cRect.left;
      const weight = funders[i].totalAmount / maxFunderAmt;
      const id = funders[i].canonicalDonorId || funders[i].entityId || `l-${i}`;
      leftCurves.push({ x1: x, y1: y, x2: centerLeftX, y2: centerY, weight, id });
    });

    const rightCurves: CurveData[] = [];
    rightRefs.current.forEach((el, i) => {
      if (!el || i >= recipients.length) return;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2 - cRect.top;
      const x = r.left - cRect.left;
      const weight = recipients[i].amount / maxRecipientAmt;
      rightCurves.push({
        x1: centerRightX,
        y1: centerY,
        x2: x,
        y2: y,
        weight,
        id: recipients[i].entityId,
      });
    });

    setCurves({ left: leftCurves, right: rightCurves });
  }, [funders, recipients, maxFunderAmt, maxRecipientAmt]);

  useLayoutEffect(() => {
    computeCurves();
    window.addEventListener("resize", computeCurves);
    return () => window.removeEventListener("resize", computeCurves);
  }, [computeCurves]);

  const allCurves = [...curves.left, ...curves.right];

  return (
    <div ref={containerRef} className="relative flex items-center gap-0">
      {/* SVG overlay for curves */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" aria-hidden="true">
        {allCurves.map((c) => (
          <FlowCurve
            key={c.id}
            {...c}
            isHovered={hoveredId === c.id}
            anyHovered={hoveredId !== null}
          />
        ))}
      </svg>

      {/* Left: Funders */}
      <div className="flex-1 min-w-0 z-10 space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg/38 mb-2">
          {funderType === "individual" ? "Top Funders" : "Top PAC Sources"}
        </div>
        {funders.slice(0, 5).map((f, i) => {
          const id = f.canonicalDonorId || f.entityId || `l-${i}`;
          return (
            <div
              key={id}
              ref={(el) => {
                leftRefs.current[i] = el;
              }}
              className="bg-surface rounded-lg border border-edge px-3 py-2 transition-opacity duration-200"
              style={{ opacity: hoveredId !== null && hoveredId !== id ? 0.35 : 1 }}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="font-semibold text-[13px] text-fg/80 truncate">
                {toTitleCase(f.name)}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-fg/45 truncate">
                  {f.type === "individual"
                    ? [f.employer && toTitleCase(f.employer), f.state]
                        .filter(Boolean)
                        .join(" · ")
                    : "PAC"}
                </span>
                <span className="text-[13px] font-semibold font-mono text-fg/70 tabular-nums shrink-0">
                  {formatTotal(f.totalAmount)}
                </span>
              </div>
            </div>
          );
        })}
        {funderCount > 5 && (
          <div className="text-[11px] text-fg/38 text-center pt-1">
            +{funderCount - 5} more
          </div>
        )}
      </div>

      {/* Spacer for curves */}
      <div className="w-12 shrink-0" />

      {/* Center: PAC node */}
      <div
        ref={centerRef}
        className="bg-accent-deep text-fg rounded-2xl px-5 py-4 text-center shrink-0 z-10"
      >
        <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
          PAC
        </div>
        <div className="font-semibold text-sm leading-tight max-w-[140px] tracking-tight">
          {toTitleCase(cmteName)}
        </div>
        <div className="text-[13px] opacity-80 mt-1 font-mono tabular-nums">
          {formatTotal(totalOutbound)} out
        </div>
      </div>

      {/* Spacer for curves */}
      <div className="w-12 shrink-0" />

      {/* Right: Recipients */}
      <div className="flex-1 min-w-0 z-10 space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg/38 mb-2">
          Top Recipients
        </div>
        {recipients.slice(0, 5).map((r, i) => {
          const party = r.party ? toParty(r.party) : undefined;
          const style = party ? PARTY_STYLES[party] : undefined;
          const isOppose = (r.ieAgainst ?? 0) > (r.ieFor ?? 0) && (r.ieAgainst ?? 0) > (r.direct ?? 0);
          const stalledHex = STATUS_STYLES.Stalled.hex;
          const content = (
            <div
              className={`bg-surface rounded-lg border px-3 py-2 ${isOppose ? "border-edge" : "border-edge"}`}
              style={isOppose ? { borderColor: `${stalledHex}40` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[13px] text-fg/80 truncate">
                  {r.name ? toTitleCase(r.name) : r.entityId}
                </span>
                {party && style && (
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${style.bg} ${style.text}`}
                  >
                    {partyAbbrev(party)}
                    {r.state ? `-${r.state}` : ""}
                  </span>
                )}
                {isOppose && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: `${stalledHex}1F`, color: stalledHex }}
                  >
                    Oppose
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] text-fg/45 truncate">
                  {spendingLabel(r)}
                </span>
                <span className="text-[13px] font-semibold font-mono text-fg/70 tabular-nums shrink-0">
                  {formatTotal(r.amount)}
                </span>
              </div>
            </div>
          );

          return (
            <div
              key={r.entityId}
              ref={(el) => {
                rightRefs.current[i] = el;
              }}
              className="transition-opacity duration-200"
              style={{ opacity: hoveredId !== null && hoveredId !== r.entityId ? 0.35 : 1 }}
              onMouseEnter={() => setHoveredId(r.entityId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {r.bioguideId ? (
                <Link
                  to="/representatives/$id"
                  params={{ id: r.bioguideId }}
                  className="block hover:opacity-80 transition-opacity"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          );
        })}
        {recipientCount > 5 && (
          <div className="text-[11px] text-fg/38 text-center pt-1">
            +{recipientCount - 5} more
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SVG Curve ────────────────────────────────────────────────── */

interface CurveData {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number; // 0-1
}

function FlowCurve({
  x1,
  y1,
  x2,
  y2,
  weight,
  isHovered,
  anyHovered,
}: CurveData & { isHovered: boolean; anyHovered: boolean }) {
  const midX = (x1 + x2) / 2;
  const strokeWidth = 1 + weight * 2; // 1px to 3px
  const baseOpacity = 0.15 + weight * 0.45; // 0.15 to 0.6

  // Hover focus: hovered stream brightens, siblings dim
  const opacity = anyHovered ? (isHovered ? 0.9 : 0.12) : baseOpacity;
  const d = `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;

  return (
    // color: var(--color-accent-deep) lets child SVG paths use currentColor for stroke
    <g style={{ transition: "opacity 0.2s", color: "var(--color-accent-deep)" }} opacity={opacity}>
      {/* Base ribbon stroke */}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {/* Animated flow shimmer overlay */}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.8}
        className="animate-flow"
      />
    </g>
  );
}

/* ─── Vertical (mobile) ────────────────────────────────────────── */

function VerticalFlow({
  funders,
  recipients,
  cmteName,
  totalOutbound,
  funderType,
}: {
  funders: FlowFunder[];
  recipients: FlowRecipient[];
  cmteName: string;
  totalOutbound: number;
  funderType: string;
}) {
  return (
    <div className="space-y-4">
      {/* Funders */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg/38 mb-2">
          {funderType === "individual" ? "Top Funders" : "Top PAC Sources"}
        </div>
        <div className="space-y-1.5">
          {funders.slice(0, 5).map((f, i) => (
            <div
              key={f.canonicalDonorId || f.entityId || i}
              className="bg-surface rounded-lg border border-edge px-3 py-2 flex justify-between items-center"
            >
              <div className="min-w-0">
                <div className="font-semibold text-[13px] text-fg/80 truncate">
                  {toTitleCase(f.name)}
                </div>
                <div className="text-[11px] text-fg/45 truncate">
                  {f.type === "individual"
                    ? [f.employer && toTitleCase(f.employer), f.state]
                        .filter(Boolean)
                        .join(" · ")
                    : "PAC"}
                </div>
              </div>
              <span className="text-[13px] font-semibold font-mono text-fg/70 tabular-nums shrink-0 ml-3">
                {formatTotal(f.totalAmount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex justify-center">
        <div className="bg-accent-deep text-fg rounded-xl px-5 py-3 text-center">
          <div className="text-[10px] uppercase tracking-wider opacity-60">
            PAC
          </div>
          <div className="font-semibold text-sm tracking-tight">
            {toTitleCase(cmteName)}
          </div>
          <div className="text-[13px] opacity-80 mt-0.5 font-mono tabular-nums">
            {formatTotal(totalOutbound)} distributed
          </div>
        </div>
      </div>

      {/* Recipients */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-fg/38 mb-2">
          Top Recipients
        </div>
        <div className="space-y-1.5">
          {recipients.slice(0, 5).map((r) => {
            const party = r.party ? toParty(r.party) : undefined;
            const style = party ? PARTY_STYLES[party] : undefined;
            const isOppose = (r.ieAgainst ?? 0) > (r.ieFor ?? 0) && (r.ieAgainst ?? 0) > (r.direct ?? 0);
            const stalledHex = STATUS_STYLES.Stalled.hex;
            return (
              <div
                key={r.entityId}
                className="bg-surface rounded-lg border border-edge px-3 py-2"
                style={isOppose ? { borderColor: `${stalledHex}40` } : undefined}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-[13px] text-fg/80 truncate">
                      {r.name ? toTitleCase(r.name) : r.entityId}
                    </span>
                    {party && style && (
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${style.bg} ${style.text}`}
                      >
                        {partyAbbrev(party)}
                      </span>
                    )}
                    {isOppose && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: `${stalledHex}1F`, color: stalledHex }}
                      >
                        Oppose
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-semibold font-mono text-fg/70 tabular-nums shrink-0 ml-3">
                    {formatTotal(r.amount)}
                  </span>
                </div>
                {(() => { const label = spendingLabel(r); return label ? (
                  <div className="text-[11px] text-fg/45 mt-0.5">{label}</div>
                ) : null; })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Loading skeleton ─────────────────────────────────────────── */

function MoneyFlowSkeleton() {
  return (
    <Card padding="lg">
      <div className="animate-pulse">
        <Skeleton className="h-5 w-40 rounded-full mb-1" />
        <Skeleton className="h-3.5 w-64 rounded-full mb-5" />
        <div className="flex items-center gap-8">
          <div className="flex-1 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-20 w-32 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
