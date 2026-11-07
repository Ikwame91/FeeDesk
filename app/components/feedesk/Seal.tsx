/**
 * The guilloché seal: FeeDesk's one ornament. Fine rotated ellipses, as on the security printing
 * of a banknote, around a word. Used large on the Overview as the sign that money is verified,
 * and small as the stamp a receipt gets when it is settled.
 */
import { cn } from "@/lib/utils";

const ANGLES = Array.from({ length: 18 }, (_, i) => i * 10);

export function Seal({
  label = "verified",
  className,
  strokeWidth = 0.55,
  stamp = false,
}: {
  label?: string;
  className?: string;
  strokeWidth?: number;
  /** Play the stamp-in animation (respects reduced motion). */
  stamp?: boolean;
}) {
  return (
    <svg
      viewBox="-170 -170 340 340"
      role="img"
      aria-label={label}
      className={cn("text-oxblood", stamp && "feedesk-stamp", className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.6}>
        {ANGLES.map((a) => (
          <ellipse key={a} rx={150} ry={58} transform={`rotate(${a})`} />
        ))}
        <g transform="scale(0.62) rotate(5)">
          {ANGLES.map((a) => (
            <ellipse key={a} rx={150} ry={58} transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r={160} />
        <circle r={164} />
        <circle r={42} />
      </g>
      <circle r={41} className="fill-background" />
      <text
        textAnchor="middle"
        y={8}
        className="fill-current font-display"
        style={{ fontSize: 22, fontStyle: "italic" }}
      >
        {label}
      </text>
    </svg>
  );
}

/** Small numbers as words, like a cheque: "Twelve need you". */
const WORDS = [
  "No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
];
export const numberWord = (n: number) => WORDS[n] ?? String(n);
