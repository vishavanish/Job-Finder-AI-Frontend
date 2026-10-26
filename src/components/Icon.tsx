/**
 * Small inline icon set (24px grid, 1.75 stroke). Decorative by default:
 * every icon sits next to a text label, so it is hidden from screen readers.
 */
const PATHS = {
  play: "M7 5.5v13l11-6.5-11-6.5z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm-6-4a6 6 0 0 0 12 0M12 17v3m-3 0h6",
  inbox: "M4 13h4l1.5 3h5L16 13h4M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4-4",
  layers: "M12 4 3 9l9 5 9-5-9-5zM3 14l9 5 9-5",
  building:
    "M5 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15m0-9h3a1 1 0 0 1 1 1v8M3 20h18M9 8h2M9 12h2M9 16h2",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3 5.5",
  sliders: "M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  key: "M14.5 9.5a4 4 0 1 0-3.9 3.1L4 19.2V21h2.5v-1.5H8V18h1.5l2.6-2.6a4 4 0 0 0 2.4-5.9zM16 8h.01",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  monitor: "M4 5h16v11H4zM9 20h6M12 16v4",
  activity: "M3 12h4l2.5-6 5 12 2.5-6h4",
  signOut: "M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
  eyeOff:
    "M4 4l16 16M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.9-1.4 2.6-3.2 4M6.2 7.7C4.4 9 3.3 10.9 3 12c.5 1.5 4 6 9 6 1.4 0 2.7-.4 3.8-.9M9.9 10a3 3 0 0 0 4.1 4.1",
  mapPin:
    "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2",
  message: "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  code: "M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14",
  network:
    "M12 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 9v3m0 0-5 3.5M12 12l5 3.5",
  briefcase: "M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16",
  zap: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z",
  fileText: "M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v4h4M9 12h6M9 16h6",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  pause: "M8 5.5v13M16 5.5v13",
  repeat: "M4 11V9a3 3 0 0 1 3-3h12m-3-3 3 3-3 3M20 13v2a3 3 0 0 1-3 3H5m3 3-3-3 3-3",
  skip: "M6 5.5v13l9-6.5-9-6.5zM18 5.5v13",
  stop: "M7 7h10v10H7z",
  send: "M4 12 20 4l-6 16-3-7-7-1z",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10 11v5M14 11v5",
  pencil: "M15 5l4 4L8 20H4v-4L15 5z",
  book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15zM5 19.5A1.5 1.5 0 0 0 6.5 21H19",
  chart: "M4 20h16M7 16v-4M12 16V8M17 16v-7",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z",
  history: "M4 12a8 8 0 1 0 2.3-5.6M4 4v3.5h3.5M12 8v4l3 2",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h.01",
  // status glyphs
  circle: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  spinner: "M12 4a8 8 0 1 1-8 8",
  alert: "M12 8v5m0 3.5v.01M12 3l9.5 17h-19L12 3z",
  arrowRight: "M5 12h13m-5-5 5 5-5 5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M7 7l10 10M17 7 7 17",
  minus: "M6 12h12",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Only when the icon stands alone without visible text. */
  label?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
