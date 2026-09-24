"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bandOf, bands, bandLabel, placeName, type StateCount } from "@/lib/map";
import { CALLOUT_STATES, MAP_HEIGHT, MAP_WIDTH, STATE_SHAPES } from "@/lib/us-map-shapes";

type Box = { x: number; y: number; w: number; h: number };
/** Whole map; phones drop the callout column (975 = the map itself). */
const fullBox = (narrow: boolean): Box => ({ x: 0, y: 0, w: narrow ? 975 : MAP_WIDTH, h: MAP_HEIGHT });
const MAX_ZOOM = 12;
const CALLOUT_X = 996;
const CALLOUT_TOP = 120;

/** Keep the view inside the map and no smaller than 1/MAX_ZOOM of it. */
function clamp(b: Box, full: Box): Box {
  const w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, b.w));
  const h = (w / full.w) * full.h;
  return { w, h, x: Math.min(full.w - w, Math.max(0, b.x)), y: Math.min(full.h - h, Math.max(0, b.y)) };
}

/** A view that fits one state's box with some room around it. */
function fit(box: [number, number, number, number], full: Box): Box {
  const [x0, y0, x1, y1] = box;
  const pad = 0.2;
  let w = (x1 - x0) * (1 + pad * 2);
  let h = (y1 - y0) * (1 + pad * 2);
  if (w / h < full.w / full.h) w = (h * full.w) / full.h;
  else h = (w * full.h) / full.w;
  return clamp({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h }, full);
}

export function UsMap({
  counts,
  selected,
  baseHref,
}: {
  counts: StateCount[];
  /** Picked state code, if any. */
  selected: string | null;
  /** The current /jobs URL without state/city; "&state=XX" is added. */
  baseHref: string;
}) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const byCode = useMemo(() => new Map(counts.map((c) => [c.code, c])), [counts]);
  const lows = useMemo(() => bands(STATE_SHAPES.map((s) => byCode.get(s.code)?.roles ?? 0)), [byCode]);

  // Touch screens get pinch / drag / tap-to-zoom; mouse screens keep a still map.
  const [touch, setTouch] = useState(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const nq = window.matchMedia("(max-width: 639px)");
    const on = () => {
      setTouch(mq.matches);
      setNarrow(nq.matches);
    };
    on();
    mq.addEventListener("change", on);
    nq.addEventListener("change", on);
    return () => {
      mq.removeEventListener("change", on);
      nq.removeEventListener("change", on);
    };
  }, []);
  const FULL = useMemo(() => fullBox(narrow), [narrow]);

  // Screen pixels per map unit, so labels stay a readable size at any zoom.
  const [view, setView] = useState<Box>(() => fullBox(false));
  const [px, setPx] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx(el.clientWidth));
    ro.observe(el);
    setPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = px ? px / view.w : 0;

  // Smoothly move the view.
  const anim = useRef<number | null>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const animateTo = useCallback((to: Box) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      anim.current = requestAnimationFrame(() => setView(to));
      return;
    }
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 350);
      const e = 1 - (1 - k) ** 3;
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      anim.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  // On touch screens, picking a state zooms to it.
  useEffect(() => {
    const shape = touch && selected ? STATE_SHAPES.find((s) => s.code === selected) : null;
    animateTo(shape ? fit(shape.box, FULL) : FULL);
  }, [selected, touch, animateTo, FULL]);

  const go = useCallback(
    (code: string | null) => router.push(code && code !== selected ? `${baseHref}&state=${code}` : baseHref, { scroll: false }),
    [router, baseHref, selected],
  );

  // ---- Gestures (touch only): one finger drags when zoomed in, two fingers pinch. ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startView: Box; startDist: number; startMid: { x: number; y: number } } | null>(null);
  const toMap = (clientX: number, clientY: number, v: Box) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  };
  const snapshot = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 } : pts[0]!;
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    return { mid, dist };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!touch || e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { mid, dist } = snapshot();
    gesture.current = { moved: gesture.current?.moved ?? false, startView: view, startDist: dist, startMid: mid };
    if (pointers.current.size > 1) gesture.current.moved = true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!gesture.current || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const { mid, dist } = snapshot();
    const zoomedIn = g.startView.w < FULL.w - 1;
    if (pointers.current.size === 1 && !zoomedIn) return; // at full size one finger scrolls the page
    if (Math.hypot(mid.x - g.startMid.x, mid.y - g.startMid.y) > 6 || pointers.current.size > 1) g.moved = true;
    if (!g.moved) return;
    const r = svg.current!.getBoundingClientRect();
    const k = pointers.current.size > 1 && g.startDist > 0 ? g.startDist / dist : 1;
    const w = g.startView.w * k;
    const h = g.startView.h * k;
    // Keep the map point under the fingers' midpoint where it started.
    const anchor = toMap(g.startMid.x, g.startMid.y, g.startView);
    const fx = (mid.x - r.left) / r.width;
    const fy = (mid.y - r.top) / r.height;
    if (anim.current) cancelAnimationFrame(anim.current);
    setView(clamp({ x: anchor.x - fx * w, y: anchor.y - fy * h, w, h }, FULL));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      // Let the click handler see whether this was a drag; clear afterwards.
      setTimeout(() => (gesture.current = null), 0);
    } else if (gesture.current) {
      const { mid, dist } = snapshot();
      gesture.current = { ...gesture.current, startView: view, startDist: dist, startMid: mid };
    }
  };
  const tapped = () => !gesture.current?.moved;

  // ---- Hover tooltip (mouse) ----
  const [tip, setTip] = useState<{ code: string; x: number; y: number } | null>(null);
  const onHover = (code: string | null, e?: React.PointerEvent) => {
    if (!code || !e || e.pointerType !== "mouse") return setTip(null);
    const r = wrap.current!.getBoundingClientRect();
    setTip({ code, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const zoomed = view.w < FULL.w - 1;
  const fontPx = 11; // label size on screen
  const u = scale ? 1 / scale : 1; // one screen pixel in map units
  const labelFits = (b: [number, number, number, number], n: number) => (b[2] - b[0]) * scale >= (String(n).length + 1) * 8 + 6 && (b[3] - b[1]) * scale >= 30;
  const showCallouts = !zoomed && scale >= 0.55 && 52 / scale <= MAP_WIDTH - CALLOUT_X;

  const tipCount = tip ? byCode.get(tip.code) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrap}
        className="relative w-full select-none"
        style={{ aspectRatio: `${FULL.w} / ${MAP_HEIGHT}` }}
        onPointerLeave={() => setTip(null)}
      >
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="absolute inset-0 size-full"
          style={{ touchAction: touch && zoomed ? "none" : "pan-y" }}
          role="group"
          aria-label="Map of US states by number of matching roles. Pick a state to list its roles."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g>
            {STATE_SHAPES.map((s) => {
              const c = byCode.get(s.code);
              const n = c?.roles ?? 0;
              const band = bandOf(n, lows);
              const isSel = s.code === selected;
              return (
                <path
                  key={s.code}
                  d={s.d}
                  role="link"
                  tabIndex={n > 0 || isSel ? 0 : -1}
                  aria-label={`${s.name}: ${n} role${n === 1 ? "" : "s"}${c?.fresh ? `, ${c.fresh} new` : ""}${isSel ? " (selected)" : ""}`}
                  aria-current={isSel ? "true" : undefined}
                  fill={`var(--map-${band})`}
                  stroke="var(--bg)"
                  strokeWidth={0.8 * u}
                  className="cursor-pointer transition-[fill] duration-150 outline-none hover:brightness-95 focus-visible:brightness-90 dark:hover:brightness-125"
                  onClick={() => tapped() && go(s.code)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      go(s.code);
                    }
                  }}
                  onPointerMove={(e) => onHover(s.code, e)}
                  onPointerLeave={() => onHover(null)}
                />
              );
            })}
          </g>
          {/* Selected state outline on top of its neighbours. */}
          {selected && STATE_SHAPES.some((s) => s.code === selected) && (
            <path d={STATE_SHAPES.find((s) => s.code === selected)!.d} fill="none" stroke="var(--heading)" strokeWidth={2.5 * u} pointerEvents="none" />
          )}
          {/* Labels: code + count where they fit at this zoom. */}
          <g pointerEvents="none" fontFamily="var(--font-mono)" textAnchor="middle">
            {STATE_SHAPES.map((s) => {
              const c = byCode.get(s.code);
              const n = c?.roles ?? 0;
              if (!scale || (showCallouts && (CALLOUT_STATES as readonly string[]).includes(s.code))) return null;
              if (!labelFits(s.box, n)) return null;
              const band = bandOf(n, lows);
              const ink = band ? `var(--map-ink-${band})` : "var(--body)";
              return (
                <g key={s.code} fill={ink}>
                  <text x={s.x} y={s.y - 2 * u} fontSize={(fontPx - 2) * u} opacity={0.85}>
                    {s.code}
                  </text>
                  {n > 0 && (
                    <text x={s.x} y={s.y + (fontPx + 1) * u} fontSize={(fontPx + 1) * u} fontWeight={700}>
                      {n}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {/* Small Northeast states: a labelled column on the right, with leader lines. */}
          {showCallouts && (
            <g fontFamily="var(--font-mono)">
              {CALLOUT_STATES.map((code, i) => {
                const s = STATE_SHAPES.find((x) => x.code === code)!;
                const n = byCode.get(code)?.roles ?? 0;
                const band = bandOf(n, lows);
                // Sized in screen pixels: 52 x 18 boxes, 22px apart.
                const w = Math.min(MAP_WIDTH - CALLOUT_X - 2, 52 * u);
                const h = 18 * u;
                const y = CALLOUT_TOP + i * 22 * u;
                const isSel = code === selected;
                const ink = band ? `var(--map-ink-${band})` : "var(--body)";
                return (
                  <g
                    key={code}
                    role="link"
                    tabIndex={n > 0 || isSel ? 0 : -1}
                    aria-label={`${s.name}: ${n} role${n === 1 ? "" : "s"}`}
                    className="cursor-pointer outline-none focus-visible:brightness-90"
                    onClick={() => go(code)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        go(code);
                      }
                    }}
                    onPointerMove={(e) => onHover(code, e)}
                    onPointerLeave={() => onHover(null)}
                  >
                    <line x1={s.x} y1={s.y} x2={CALLOUT_X} y2={y + h / 2} stroke="var(--border-strong)" strokeWidth={0.75 * u} />
                    <circle cx={s.x} cy={s.y} r={1.5 * u} fill="var(--border-strong)" />
                    <rect x={CALLOUT_X} y={y} width={w} height={h} fill={`var(--map-${band})`} stroke={isSel ? "var(--heading)" : "var(--border-strong)"} strokeWidth={(isSel ? 2 : 0.75) * u} />
                    <text x={CALLOUT_X + 5 * u} y={y + 12.5 * u} fontSize={10 * u} fill={ink}>
                      {code}
                    </text>
                    <text x={CALLOUT_X + w - 5 * u} y={y + 12.5 * u} fontSize={11 * u} fontWeight={700} textAnchor="end" fill={ink}>
                      {n}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>

        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 border border-line-strong bg-surface px-3 py-2 font-mono text-xs shadow-sm"
            style={{ left: tip.x, top: tip.y + 18 }}
          >
            <p className="font-semibold text-heading">{placeName(tip.code)}</p>
            <p className="text-body">
              {tipCount?.roles ?? 0} role{tipCount?.roles === 1 ? "" : "s"}
              {tipCount?.fresh ? <span className="text-link"> · {tipCount.fresh} new</span> : null}
            </p>
            {tipCount?.top.length ? <p className="mt-0.5 text-subtle">{tipCount.top.join(", ")}</p> : null}
          </div>
        )}

        {touch && (
          <div className="absolute right-2 bottom-2 flex flex-col border border-line-strong bg-surface font-mono text-sm">
            <button type="button" aria-label="Zoom in" className="grid size-9 place-items-center text-heading" onClick={() => animateTo(clamp({ x: view.x + view.w / 4, y: view.y + view.h / 4, w: view.w / 2, h: view.h / 2 }, FULL))}>
              +
            </button>
            <button type="button" aria-label="Zoom out" className="grid size-9 place-items-center border-t border-line text-heading" onClick={() => animateTo(clamp({ x: view.x - view.w / 2, y: view.y - view.h / 2, w: view.w * 2, h: view.h * 2 }, FULL))}>
              −
            </button>
            {zoomed && (
              <button type="button" aria-label="Show the whole map" className="grid size-9 place-items-center border-t border-line text-xs text-heading" onClick={() => animateTo(FULL)}>
                ⤢
              </button>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {lows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-subtle" aria-label="Legend: roles per state">
          <span>Roles</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-3 border border-line" style={{ background: "var(--map-0)" }} />0
          </span>
          {lows.map((_, i) => {
            const band = bandOf(lows[i]!, lows);
            return (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="size-3" style={{ background: `var(--map-${band})` }} />
                {bandLabel(lows, i)}
              </span>
            );
          })}
          {touch && <span className="basis-full sm:basis-auto">Pinch to zoom · tap a state</span>}
        </div>
      )}
    </div>
  );
}
