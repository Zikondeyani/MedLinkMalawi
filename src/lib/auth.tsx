/* ============================================================
   MedLink — authentication & role-based access
   Backend: Supabase Auth (email + password). public.profiles is the
   server-side source of truth for the account role, status and the
   supplier tenant, and only the sign-up trigger / admin RPCs may
   change those columns (see supabase/migrations).

   The role is decided by HOW the account was created:
     • customer — self sign-up                (SignUpPage)
     • supplier — supplier KYC application    (BecomeASupplierPage)
     • admin    — provisioned by an admin     (AdminUsersPage)

   When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing the app
   runs on a localStorage demo backend (`backend === "local"`) so the
   whole UI stays explorable without a Supabase project.
   ============================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AccountStatus, ProfileRow } from "./database.types";
import { isSupabaseConfigured, supabase } from "./supabase";
import { loadMarketplace, setActiveAccount } from "./registry";

export type UserRole = "customer" | "supplier" | "admin";
export type { AccountStatus };

export interface AuthUser {
  /** auth.users uuid (Supabase) or a deterministic local demo id. */
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Suspended accounts are refused a session by signIn(). */
  status: AccountStatus;
  /** Cloudinary URL of the account's profile photo. */
  avatarUrl?: string;
  phone?: string;
  organization?: string;
  about?: string;
  /** Server-derived supplier tenant for an approved supplier account. */
  supplierId?: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  /** The role the account is created with — never chosen at sign-in. */
  role: UserRole;
}

export type SignInResult = { ok: true; user: AuthUser } | { ok: false; error: string };

export type SignUpResult =
  | { ok: true; user: AuthUser; signedIn: true }
  | { ok: true; user: AuthUser; signedIn: false; notice: string }
  | { ok: false; error: string };

export type AuthBackend = "supabase" | "local";

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the stored session is being resolved on boot. */
  loading: boolean;
  /** Which backend is live — drives the admin console notices. */
  backend: AuthBackend;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /** Re-read the current session + profile (e.g. after an admin change). */
  refresh: () => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  supplier: "Supplier",
  admin: "Admin",
};

/** Human label for a role, e.g. "customer" → "Customer". */
export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

/** The authenticated user's role-appropriate landing page. */
export function roleHomePath(role: UserRole): string {
  if (role === "supplier") return "/supplier";
  if (role === "admin") return "/admin";
  return "/";
}

/** Notifications always live under the account area for their current role. */
export function roleNotificationsPath(role: UserRole): string {
  if (role === "supplier") return "/supplier/notifications";
  if (role === "admin") return "/admin/notifications";
  return "/account/notifications";
}

/** Resolve only the tenant id carried by the authenticated account. */
export function supplierIdForUser(user: AuthUser | null | undefined): string | undefined {
  return user?.role === "supplier" ? user.supplierId : undefined;
}

/** Derive a display name from an email address, e.g. jane@clinic.mw → Jane. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const words = parts.length > 0 ? parts : [local];
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ============================================================
   Supabase profile mapping
   ============================================================ */

const PROFILE_SELECT = "id, email, full_name, phone, organization, about, role, status, supplier_id, avatar_url";

/** Shape of the columns the app selects for its own session (see PROFILE_SELECT). */
type SessionProfileRow = Omit<ProfileRow, "updated_at" | "created_at" | "blocked">;

function mapProfile(row: SessionProfileRow): AuthUser {
  const user: AuthUser = {
    id: row.id,
    name: row.full_name.trim() || nameFromEmail(row.email),
    email: row.email.trim().toLowerCase(),
    role: row.role,
    status: row.status,
  };
  if (row.supplier_id) user.supplierId = row.supplier_id;
  if (row.avatar_url) user.avatarUrl = row.avatar_url;
  if (row.phone) user.phone = row.phone;
  user.organization = row.organization;
  user.about = row.about;
  return user;
}

/**
 * Only "supplier" is honoured from sign-up metadata — an admin can never be
 * self-provisioned, and anything else safely degrades to "customer".
 */
function roleFromMetadata(metadata: Record<string, unknown> | undefined): UserRole {
  return metadata?.["role"] === "supplier" ? "supplier" : "customer";
}

function nameFromMetadata(user: User, email: string): string {
  const fullName = user.user_metadata?.["full_name"];
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  return nameFromEmail(email);
}

function provisionalUser(id: string, email: string, name: string, role: UserRole): AuthUser {
  return {
    id,
    name: name.trim() || nameFromEmail(email),
    email: email.trim().toLowerCase(),
    role,
    status: "active",
  };
}

/** Read the signed-in user's profile row (RLS: own row only). */
async function fetchProfile(authUser: User): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) {
    console.warn("[medlink] Could not load the account profile:", error.message);
    return null;
  }
  return data ? mapProfile(data) : null;
}

/** Turn Supabase Auth error text into something a buyer can act on. */
function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Incorrect email or password.";
  if (text.includes("email not confirmed")) {
    return "Confirm your email address first — we sent you a link to finish setting up your account.";
  }
  if (text.includes("already registered") || text.includes("already exists")) {
    return "An account with that email already exists — try signing in instead.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts just now. Wait a moment and try again.";
  }
  return message;
}

/* ============================================================
   Local demo backend (no Supabase env vars configured)
   A localStorage "user table" so every screen — including the admin
   console — stays usable before a project is wired up.
   ============================================================ */

export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: AccountStatus;
  supplierId?: string;
  phone?: string;
  organization?: string;
  about?: string;
  avatarUrl?: string;
}

const SESSION_KEY = "medlink.auth.user";
const ACCOUNTS_KEY = "medlink.accounts";

export const SEED_ACCOUNTS: LocalAccount[] = [
  // Admin accounts are provisioned, never self-registered: add your admin here
  // for demo mode, or promote a real account at /admin/users on Supabase.
  { id: "local-admin", name: "Platform Administrator", email: "admin@medlink.mw", password: "admin123", role: "admin", status: "active" },
  // Demo supplier — matches the demo store in the supplier dashboard.
  { id: "local-supplier", name: "Demo Supplier", email: "supplier@medlink.mw", password: "supplier123", role: "supplier", status: "active", supplierId: "sup-medequip" },
  // Demo buyer.
  { id: "local-buyer", name: "Demo Buyer", email: "buyer@medlink.mw", password: "buyer123", role: "customer", status: "active" },
];

function isLocalAccount(value: unknown): value is LocalAccount {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalAccount>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.password === "string" &&
    (candidate.role === "customer" || candidate.role === "supplier" || candidate.role === "admin") &&
    (candidate.status === undefined || candidate.status === "active" || candidate.status === "suspended") &&
    (candidate.supplierId === undefined || typeof candidate.supplierId === "string") &&
    (candidate.avatarUrl === undefined || typeof candidate.avatarUrl === "string")
  );
}

function readAccounts(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const stored = Array.isArray(parsed) ? parsed.filter(isLocalAccount) : [];

    // Always keep the demo accounts available, even when an older version of
    // the app left a partial account list in localStorage. Accounts created in
    // the app may replace a seed that shares their email.
    const byEmail = new Map<string, LocalAccount>();
    for (const account of [...SEED_ACCOUNTS, ...stored]) {
      const key = account.email.trim().toLowerCase();
      const previous = byEmail.get(key);
      byEmail.set(key, {
        ...account,
        email: key,
        status: account.status ?? "active",
        supplierId: account.supplierId ?? previous?.supplierId,
      });
    }
    const accounts = [...byEmail.values()];
    if (!raw) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    return accounts;
  } catch {
    return [...SEED_ACCOUNTS];
  }
}

function persistAccounts(accounts: LocalAccount[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

/** Every account in the demo backend (used by the local admin console). */
export function listLocalAccounts(): LocalAccount[] {
  return readAccounts();
}

/** Update an account's role/status in the demo backend (admin console). */
export function updateLocalAccount(
  id: string,
  patch: Partial<Pick<LocalAccount, "name" | "role" | "status" | "supplierId" | "phone" | "organization" | "about" | "avatarUrl">>,
): LocalAccount | undefined {
  const accounts = readAccounts();
  const index = accounts.findIndex((account) => account.id === id);
  if (index < 0) return undefined;
  const updated: LocalAccount = { ...accounts[index], ...patch };
  accounts[index] = updated;
  persistAccounts(accounts);
  return updated;
}

function toAuthUser(account: LocalAccount): AuthUser {
  const user: AuthUser = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    status: account.status,
  };
  if (account.supplierId) user.supplierId = account.supplierId;
  if (account.phone) user.phone = account.phone;
  user.organization = account.organization ?? "";
  user.about = account.about ?? "";
  if (account.avatarUrl) user.avatarUrl = account.avatarUrl;
  return user;
}

function readLocalSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (typeof parsed.email !== "string") return null;

    // Never restore a session that no longer matches a usable account — for
    // example one that an administrator suspended in the console.
    const email = parsed.email.trim().toLowerCase();
    const account = readAccounts().find((a) => a.email.toLowerCase() === email);
    if (!account || account.status === "suspended") return null;
    return toAuthUser(account);
  } catch {
    return null;
  }
}

function writeLocalSession(user: AuthUser): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — session-only sign in */
  }
}

function clearLocalSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function localSignIn(email: string, password: string): SignInResult {
  const account = readAccounts().find((a) => a.email.toLowerCase() === email);
  if (!account) {
    return {
      ok: false,
      error: "No registered account was found for that email. Create an account or apply as a supplier first.",
    };
  }
  if (account.password !== password) return { ok: false, error: "Incorrect password for that account." };
  if (account.status === "suspended") {
    return { ok: false, error: "This account has been suspended. Contact MedLink support." };
  }
  const user = toAuthUser(account);
  writeLocalSession(user);
  return { ok: true, user };
}

function localSignUp(input: SignUpInput): SignUpResult {
  const email = input.email.trim().toLowerCase();
  const accounts = readAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === email)) {
    return { ok: false, error: "An account with that email already exists — try signing in instead." };
  }
  const account: LocalAccount = {
    id: `local-${email}`,
    name: input.name.trim() || nameFromEmail(email),
    email,
    password: input.password,
    role: input.role,
    status: "active",
  };
  persistAccounts([...accounts, account]);
  const user = toAuthUser(account);
  writeLocalSession(user);
  return { ok: true, user, signedIn: true };
}

/* ============================================================
   Auth context
   ============================================================ */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend: AuthBackend = isSupabaseConfigured ? "supabase" : "local";
  const [user, setUser] = useState<AuthUser | null>(() =>
    isSupabaseConfigured ? null : readLocalSession(),
  );
  // A stored Supabase session must be resolved before we know who is signed
  // in, so route guards show a "checking" state instead of bouncing a
  // signed-in user back to the sign-in page.
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  const applySession = useCallback(async (session: Session | null): Promise<void> => {
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
    const sessionUser = session.user;
    const email = sessionUser.email ?? "";
    const profile = await fetchProfile(sessionUser);
    setUser(
      profile ??
        provisionalUser(
          sessionUser.id,
          email,
          nameFromMetadata(sessionUser, email),
          roleFromMetadata(sessionUser.user_metadata),
        ),
    );
    setLoading(false);
  }, []);

  // The marketplace cache is filled for whoever is signed in: on first paint,
  // on sign-in and on sign-out, so every page reads real rows for the right
  // role and RLS scopes each of them.
  useEffect(() => {
    setActiveAccount(
      user
        ? {
            id: user.id,
            email: user.email,
            role: user.role,
            ...(user.supplierId ? { supplierId: user.supplierId } : {}),
          }
        : null,
    );
    void loadMarketplace();
  }, [user]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    const bootstrap = async (): Promise<void> => {
      const { data } = await client.auth.getSession();
      if (!cancelled) await applySession(data.session);
    };
    void bootstrap();

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      // Supabase warns against awaiting other client calls inside this
      // callback, so the profile fetch is deferred to the next tick.
      setTimeout(() => {
        if (!cancelled) void applySession(session);
      }, 0);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const normalized = email.trim().toLowerCase();
    if (!supabase) return localSignIn(normalized, password);

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) {
      return { ok: false, error: friendlyAuthError(error?.message ?? "Sign in failed. Please try again.") };
    }

    const profile =
      (await fetchProfile(data.user)) ??
      provisionalUser(
        data.user.id,
        normalized,
        nameFromMetadata(data.user, normalized),
        roleFromMetadata(data.user.user_metadata),
      );

    if (profile.status === "suspended") {
      // An administrator froze this account — do not keep a session around.
      await supabase.auth.signOut();
      setUser(null);
      setLoading(false);
      return { ok: false, error: "This account has been suspended. Contact MedLink support." };
    }

    setUser(profile);
    setLoading(false);
    return { ok: true, user: profile };
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<SignUpResult> => {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim() || nameFromEmail(email);
    if (!supabase) return localSignUp({ name, email, password: input.password, role: input.role });

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: { data: { role: input.role, full_name: name } },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    if (!data.user) return { ok: false, error: "Sign up failed. Please try again." };

    // Supabase obfuscates an existing email by returning an empty identity list.
    if (data.user.identities && data.user.identities.length === 0) {
      return { ok: false, error: "An account with that email already exists — try signing in instead." };
    }

    const profile = provisionalUser(data.user.id, email, name, input.role);

    if (!data.session) {
      // "Confirm email" is enabled on the project: the auth user and its
      // profile row exist, and the session arrives once the link is clicked.
      setLoading(false);
      return {
        ok: true,
        user: profile,
        signedIn: false,
        notice: `Confirm your email address to activate the account — we sent a link to ${email}.`,
      };
    }

    const confirmed = (await fetchProfile(data.user)) ?? profile;
    setUser(confirmed);
    setLoading(false);
    return { ok: true, user: confirmed, signedIn: true };
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (supabase) await supabase.auth.signOut();
    else clearLocalSession();
    setUser(null);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!supabase) {
      setUser(readLocalSession());
      return;
    }
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, backend, signIn, signUp, signOut, refresh }),
    [user, loading, backend, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
