"use client";

import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type BodyRegionId =
  | "brain"
  | "thyroid"
  | "heart"
  | "liver"
  | "kidney"
  | "metabolic";

type EllipseShape = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

type PathShape = {
  kind: "path";
  d: string;
};

type Shape = EllipseShape | PathShape;

type RegionDef = {
  id: BodyRegionId;
  label: string;
  shapes: Shape[];
};

const REGIONS: RegionDef[] = [
  {
    id: "brain",
    label: "Brain / Mood",
    shapes: [{ kind: "ellipse", cx: 100, cy: 55, rx: 18, ry: 14 }],
  },
  {
    id: "thyroid",
    label: "Thyroid",
    // Anterior neck region (approximate; decorative/interactive, not medical).
    shapes: [{ kind: "ellipse", cx: 100, cy: 116, rx: 22, ry: 11 }],
  },
  {
    id: "heart",
    label: "Heart & Vascular",
    shapes: [{ kind: "ellipse", cx: 100, cy: 175, rx: 36, ry: 24 }],
  },
  {
    id: "liver",
    label: "Liver",
    shapes: [{ kind: "ellipse", cx: 86, cy: 250, rx: 34, ry: 20 }],
  },
  {
    id: "kidney",
    label: "Kidneys",
    // Two kidneys: keep them as separate shapes but treat as one region.
    shapes: [
      { kind: "ellipse", cx: 70, cy: 285, rx: 22, ry: 16 },
      { kind: "ellipse", cx: 130, cy: 285, rx: 22, ry: 16 },
    ],
  },
  {
    id: "metabolic",
    label: "Metabolic / Abdomen",
    shapes: [{ kind: "ellipse", cx: 100, cy: 325, rx: 62, ry: 55 }],
  },
];

export default function BodySilhouette({
  active,
  onSelect,
}: {
  active: BodyRegionId | null;
  onSelect: (id: BodyRegionId) => void;
}) {
  const [hovered, setHovered] = useState<BodyRegionId | null>(null);

  const getFill = (id: BodyRegionId) => {
    if (active === id) return "rgba(56, 189, 248, 0.38)";
    if (hovered === id) return "rgba(56, 189, 248, 0.18)";
    // Keep a faint hint so users can discover clickable regions.
    return "rgba(56, 189, 248, 0.03)";
  };

  const getStroke = (id: BodyRegionId) => {
    if (active === id) return "rgba(56, 189, 248, 0.95)";
    if (hovered === id) return "rgba(56, 189, 248, 0.70)";
    return "rgba(148, 163, 184, 0.25)";
  };

  const getStrokeOpacity = (id: BodyRegionId) => {
    if (active === id) return 1;
    if (hovered === id) return 0.85;
    return 0.28;
  };

  const handleKeySelect = (
    e: ReactKeyboardEvent<SVGElement>,
    id: BodyRegionId
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 200 420"
        className="h-[420px] w-[220px] max-w-[78vw]"
        role="img"
        aria-label="Interactive human body silhouette"
      >
        <defs>
          <linearGradient id="bodyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(15, 23, 42, 0.10)" />
            <stop offset="1" stopColor="rgba(15, 23, 42, 0.04)" />
          </linearGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base silhouette (decorative). */}
        <g opacity="0.95">
          <circle
            cx="100"
            cy="55"
            r="32"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
          />
          <rect
            x="90"
            y="86"
            width="20"
            height="48"
            rx="10"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
          />
          <path
            d="M56 130 C63 170 72 225 77 255 C82 292 92 318 100 329 C108 318 118 292 123 255 C128 225 137 170 144 130
               C133 110 116 102 100 102 C84 102 67 110 56 130 Z"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
          />
          <path
            d="M58 175 C41 186 34 220 46 244 C60 273 78 263 76 236 C74 210 70 186 58 175 Z"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
            opacity="0.9"
          />
          <path
            d="M142 175 C159 186 166 220 154 244 C140 273 122 263 124 236 C126 210 130 186 142 175 Z"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
            opacity="0.9"
          />
          <path
            d="M80 330 C70 365 70 392 79 410 L121 410 C130 392 130 365 120 330
               C112 338 104 342 100 342 C96 342 88 338 80 330 Z"
            fill="url(#bodyGradient)"
            stroke="rgba(15, 23, 42, 0.18)"
            strokeWidth="2"
          />
        </g>

        {/* Interactive regions. */}
        {REGIONS.map((r) =>
          r.shapes.map((s, idx) => {
            const fill = getFill(r.id);
            const stroke = getStroke(r.id);
            const strokeOpacity = getStrokeOpacity(r.id);
            const commonProps = {
              fill,
              stroke,
              strokeWidth: active === r.id ? 2.5 : 1.5,
              strokeOpacity,
              filter: active === r.id ? "url(#softGlow)" : undefined,
              style: { cursor: "pointer", transition: "fill 160ms ease, stroke 160ms ease" },
              role: "button" as const,
              tabIndex: 0,
              "aria-label": r.label,
              onClick: () => onSelect(r.id),
              onPointerEnter: () => setHovered(r.id),
              onPointerLeave: () => setHovered((prev) => (prev === r.id ? null : prev)),
              onKeyDown: (e: ReactKeyboardEvent<SVGElement>) =>
                handleKeySelect(e, r.id),
            };

            return s.kind === "ellipse" ? (
              <ellipse
                key={`${r.id}-${idx}`}
                cx={s.cx}
                cy={s.cy}
                rx={s.rx}
                ry={s.ry}
                {...commonProps}
              />
            ) : (
              <path
                key={`${r.id}-${idx}`}
                d={s.d}
                {...commonProps}
              />
            );
          })
        )}
      </svg>

    </div>
  );
}

