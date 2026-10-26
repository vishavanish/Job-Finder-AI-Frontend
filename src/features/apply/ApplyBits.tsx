/**
 * Small pieces shared by the Apply Center screens (F4.1): the site chip
 * (Greenhouse / Lever / LinkedIn, or ✨ AI form reader) and the company
 * avatar.
 */
import { SparkleChip } from "../../components/KitExtras";
import { isGeneric } from "./applyApi";

const SITE_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  linkedin: "LinkedIn",
};

export function SiteChip({ adapter, mode }: { adapter: string | null | undefined; mode?: string }) {
  if (isGeneric(adapter)) return <SparkleChip />;
  const name = mode === "fast" ? "LinkedIn · Fast apply" : SITE_NAMES[adapter ?? ""];
  return name ? <span className="site-chip">{name}</span> : null;
}

export function CompanyAvatar({ company, size = "md" }: { company: string; size?: "md" | "lg" }) {
  const letter = (company.trim()[0] ?? "?").toUpperCase();
  // A stable hue per company keeps the avatars apart without a logo.
  const hue = [...company].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className={`company-avatar company-avatar--${size}`}
      style={{ ["--avatar-hue" as string]: String(hue) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
