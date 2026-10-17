import { useCallback, useEffect, useState } from "react";
import type { RefundAccount, RefundRequest } from "../data/types";
import type { RefundAccountRow, RefundRequestRow, RefundRequestStatus } from "./database.types";
import { supabase } from "./supabase";

function toRefundAccount(row: RefundAccountRow): RefundAccount {
  return {
    id: row.id,
    label: row.label,
    method: row.method,
    provider: row.provider,
    accountName: row.account_name,
    accountNumber: row.account_number,
  };
}

function toRefundRequest(row: RefundRequestRow): RefundRequest {
  return {
    id: row.id,
    orderId: row.order_id,
    supplierOrderId: row.supplier_order_id,
    supplierId: row.supplier_id,
    customerId: row.customer_id,
    orderNumber: row.order_number,
    amount: Number(row.amount),
    status: row.status,
    refundAccountId: row.refund_account_id,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    processedAt: row.processed_at,
  };
}

export function useRefundAccounts(customerId: string | undefined) {
  const [accounts, setAccounts] = useState<RefundAccount[]>([]);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !customerId) return;
    const { data, error: queryError } = await supabase
      .from("refund_accounts")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setAccounts((data ?? []).map(toRefundAccount));
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client || !customerId) return;
    const channel = client
      .channel(`refund-accounts:${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "refund_accounts", filter: `customer_id=eq.${customerId}` }, () => void load())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [customerId, load]);

  return {
    accounts: customerId ? accounts : [],
    loading: Boolean(supabase && customerId && loading),
    error: customerId ? error ?? (!supabase ? "No backend configured." : null) : null,
    reload: load,
  };
}

export function useOrderRefundRequests(orderId: string | undefined) {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !orderId) return;
    const { data, error: queryError } = await supabase
      .from("refund_requests")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setRequests((data ?? []).map(toRefundRequest));
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client || !orderId) return;
    const channel = client
      .channel(`refund-requests:${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "refund_requests", filter: `order_id=eq.${orderId}` }, () => void load())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [orderId, load]);

  return {
    requests: orderId ? requests : [],
    loading: Boolean(supabase && orderId && loading),
    error: orderId ? error ?? (!supabase ? "No backend configured." : null) : null,
    reload: load,
  };
}

export function useAdminRefundRequests() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase
      .from("refund_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setRequests((data ?? []).map(toRefundRequest));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel("admin-refund-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "refund_requests" }, () => void load())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  return {
    requests,
    loading: Boolean(supabase && loading),
    error: error ?? (!supabase ? "No backend configured." : null),
    reload: load,
  };
}

export function useAdminRefundAccounts(accountIds: string[]) {
  const [accounts, setAccounts] = useState<Record<string, RefundAccount>>({});
  const [error, setError] = useState<string | null>(null);
  const accountIdsKey = accountIds.join(",");

  const load = useCallback(async () => {
    const ids = accountIdsKey ? accountIdsKey.split(",") : [];
    if (!supabase || ids.length === 0) return;
    const { data, error: queryError } = await supabase
      .from("refund_accounts")
      .select("*")
      .in("id", ids);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setAccounts(Object.fromEntries((data ?? []).map((row) => [row.id, toRefundAccount(row)])));
  }, [accountIdsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    accounts: accountIdsKey ? accounts : {},
    error: accountIdsKey && !supabase ? "No backend configured." : error,
    reload: load,
  };
}

export async function saveRefundAccount(
  customerId: string,
  account: Omit<RefundAccount, "id">,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("refund_accounts").insert({
    customer_id: customerId,
    label: account.label.trim(),
    method: account.method,
    provider: account.provider.trim(),
    account_name: account.accountName.trim(),
    account_number: account.accountNumber.trim(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteRefundAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("refund_accounts").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function selectRefundAccount(
  refundId: string,
  refundAccountId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.rpc("customer_select_refund_account", {
    p_refund_id: refundId,
    p_refund_account_id: refundAccountId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateRefundRequestStatus(
  id: string,
  status: RefundRequestStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { data, error } = await supabase
    .from("refund_requests")
    .update({ status, processed_at: status === "refunded" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Refund request not found or you do not have permission to update it." };
  return { ok: true };
}
