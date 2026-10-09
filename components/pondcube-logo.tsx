import { cn } from "@/lib/utils";

// The PondCube mark: a tank-cube with water inside. Same artwork as app/icon.svg,
// but the outline follows the app theme (--logo-outline in globals.css) instead of the OS setting.
export function PondCubeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <polygon points="32,22 54.5,35 32,48 9.5,35" fill="#5eead4" />
      <polygon points="9.5,35 32,48 32,58 9.5,45" fill="#14b8a6" />
      <polygon points="32,48 54.5,35 54.5,45 32,58" fill="#0f766e" />
      <path
        d="M32 6L54.5 19V45L32 58L9.5 45V19Z M9.5 19L32 32L54.5 19 M32 32V58"
        fill="none"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-logo-outline"
      />
    </svg>
  );
}
