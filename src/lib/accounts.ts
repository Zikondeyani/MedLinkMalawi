/* ============================================================
   MedLink — admin account management
   The authenticated admin surface for the profiles table.

   Supabase mode  → RLS-protected reads plus SECURITY DEFINER RPCs
                    (admin_set_account_role / admin_set_account_status);
                    both re-check the caller's role inside Postgres.
   Demo mode      → the same operations against the localStorage table
                    in ./auth so the console stays fully clickable.

   These are the "admin parts" wired to the authentication feature:
   role changes, promotion to admin and suspending an account.
   ============================================================ */
import {
  listLocalAccounts,
  updateLocalAccount,
  type AccountStatus,
  type AuthUser,
  type UserRole,
} from "./auth";
import { useSyncExternalStore } from "react";
import type { ProfileRow } from "./database.types";
import { supabase } from "./supabase";

export interface AccountRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  /** Administrator block flag for customer accounts. */
  blocked: boolean;
  /** Cloudinary URL of the account's profile photo. */
  avatarUrl?: string;
  /** Marketplace tenant for an approved supplier account. */
  supplierId?: string;
  /** ISO timestamp, when the backend reports one. */
  createdAt?: string;
}

export type AccountMutationResult =
  | { ok: true; account: AccountRecord }
  | { ok: false; error: string };

const PROFILE_SELECT = "id, email, full_name, role, status, supplier_id, avatar_url, blocked, created_at";

/** Shape of the columns the admin console selects (see PROFILE_SELECT). */
type AdminProfileRow = Omit<ProfileRow, "phone" | "organization" | "about" | "updated_at">;

function mapRow(row: AdminProfileRow): AccountRecord {
  const account: AccountRecord = {
    id: row.id,
    name: row.full_name.trim() || row.email,
    email: row.email.trim().toLowerCase(),
    role: row.role,
    status: row.status,
    blocked: row.blocked,
    createdAt: row.created_at,
  };
  if (row.supplier_id) account.supplierId = row.supplier_id;
  if (row.avatar_url) account.avatarUrl = row.avatar_url;
  return account;
}

/** Every account on the platform. RLS lets administrators see all rows. */
export async function listAccounts(): Promise<AccountRecord[]> {
  if (!supabase) {
    return listLocalAccounts().map((a) => {
      const account: AccountRecord = {
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        status: a.status,
        blocked: false,
      };
      if (a.supplierId) account.supplierId = a.supplierId;
      return account;
    });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/* ------------------------------------------------------------
   Shared cache — several admin screens need the same list
   ------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

let cached: AccountRecord[] = [];
let cacheLoaded = false;
let cacheLoading = false;
let cacheError: string | null = null;

/**
 * Rebuilt once per emit rather than inside the getter: useSyncExternalStore
 * compares snapshots with Object.is, so a getter that allocated a fresh object
 * would report a change on every render and spin forever.
 */
interface AccountCacheStatus {
  loading: boolean;
  loaded: boolean;
  error: string | null;
}
let cacheStatus: AccountCacheStatus = { loading: false, loaded: false, error: null };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  cacheStatus = { loading: cacheLoading, loaded: cacheLoaded, error: cacheError };
  for (const listener of listeners) listener();
}

/** Re-read the account list into the shared cache. */
export async function refreshAccounts(force = false): Promise<void> {
  if (cacheLoading) return;
  if (cacheLoaded && !force) return;
  cacheLoading = true;
  emit();
  try {
    cached = await listAccounts();
    cacheLoaded = true;
    cacheError = null;
  } catch (error) {
    cacheError = error instanceof Error ? error.message : "Could not load accounts.";
  } finally {
    cacheLoading = false;
    emit();
  }
}

export interface AccountsState {
  accounts: AccountRecord[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** The account list as a hook, loaded on first use and shared by all callers. */
export function useAccounts(): AccountsState {
  const status = useSyncExternalStore(subscribe, () => cacheStatus, () => cacheStatus);
  // `refresh` is a new function each render on purpose: it is a command, not
  // store data, and callers put it in effects rather than compare it.
  return { accounts: cached, ...status, refresh: refreshNow };
}

/** Stable identity so a page can use refresh in a dependency array. */
const refreshNow = (): Promise<void> => refreshAccounts(true);

/** Point one cached record at its updated self (after a role or status change). */
function replaceCachedAccount(next: AccountRecord): void {
  cached = cached.map((account) => (account.id === next.id ? next : account));
  emit();
}

/**
 * Guard rails shared by both backends — mirrored in the SQL RPCs so the
 * rules hold even if the UI is bypassed.
 */
function guardRail(
  target: AccountRecord,
  next: { role?: UserRole; status?: AccountStatus },
  admin: AuthUser | null,
  all: AccountRecord[],
): string | null {
  if (!admin || admin.role !== "admin") return "Administrator access is required.";
  if (target.id === admin.id && next.role && next.role !== "admin") {
    return "You cannot remove your own administrator access.";
  }
  if (target.id === admin.id && next.status === "suspended") {
    return "You cannot suspend your own administrator account.";
  }
  const admins = all.filter((a) => a.role === "admin");
  if (next.role && next.role !== "admin" && target.role === "admin" && admins.length <= 1) {
    return "MedLink must keep at least one administrator account.";
  }
  return null;
}

/** Promote / demote an account between customer, supplier and admin. */
export async function setAccountRole(
  target: AccountRecord,
  role: UserRole,
  admin: AuthUser | null,
): Promise<AccountMutationResult> {
  if (!supabase) {
    const blocked = guardRail(target, { role }, admin, await listAccounts());
    if (blocked) return { ok: false, error: blocked };
    const updated = updateLocalAccount(target.id, { role, supplierId: role === "customer" ? undefined : target.supplierId });
    if (!updated) return { ok: false, error: "Account not found." };
    const account = { ...target, role };
    replaceCachedAccount(account);
    return { ok: true, account };
  }

  const { data, error } = await supabase.rpc("admin_set_account_role", { target: target.id, new_role: role });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not change that account's role." };
  }
  const account = mapRow(data);
  replaceCachedAccount(account);
  return { ok: true, account };
}

/** Suspend (block sign-in for) or reactivate an account. */
export async function setAccountStatus(
  target: AccountRecord,
  status: AccountStatus,
  admin: AuthUser | null,
): Promise<AccountMutationResult> {
  if (!supabase) {
    const blocked = guardRail(target, { status }, admin, await listAccounts());
    if (blocked) return { ok: false, error: blocked };
    const updated = updateLocalAccount(target.id, { status });
    if (!updated) return { ok: false, error: "Account not found." };
    const account = { ...target, status };
    replaceCachedAccount(account);
    return { ok: true, account };
  }

  const { data, error } = await supabase.rpc("admin_set_account_status", { target: target.id, new_status: status });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not change that account's status." };
  }
  const account = mapRow(data);
  replaceCachedAccount(account);
  return { ok: true, account };
}
