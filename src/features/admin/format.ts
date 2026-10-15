export const ROLE_LABELS: Record<string, string> = {
  user: "User",
  manager: "Manager",
  admin: "Admin",
};

const PROVIDER_LABELS: Record<string, string> = {
  email_otp: "Email code",
  otp: "Email code",
  google: "Google",
  password: "Password",
  invited: "Not signed in yet",
};

export function providerLabel(p: string | null | undefined): string {
  if (!p) return "Not signed in yet";
  return PROVIDER_LABELS[p] ?? p;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Never" : dateFmt.format(d);
}

export function displayName(u: { name?: string | null; email: string }): string {
  return u.name?.trim() || u.email;
}
