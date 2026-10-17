/* ============================================================
   MedLink — notifications

   The rows are written by the database (checkout creates the first
   one, order status changes and escrow releases can add more) and
   read here through row-level security: a customer sees the
   notifications addressed to their account, a supplier the ones for
   its store, an administrator all of them. Marking as read is a real
   UPDATE, not local state.
   ============================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { toNotification } from "./db";
import type { NotificationItem } from "../data/types";
import { useToast } from "./toast";

interface NotificationsContextValue {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  markingId: string | null;
  markingAll: boolean;
  deletingId: string | null;
  clearing: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const userId = user?.id;
  const userRole = user?.role;

  const scope = user
    ? user.role === "supplier"
      ? { column: "supplier_id", value: user.supplierId ?? "" }
      : { column: "customer_id", value: user.id }
    : null;

  const load = useCallback(async () => {
    if (!supabase || !scope || !scope.value) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Administrators read every notification; everyone else only their own.
    const query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    const { data, error } =
      user?.role === "admin" ? await query : await query.eq(scope.column, scope.value);
    if (error) {
      push({ title: "Could not load notifications", message: error.message, icon: "error" });
    } else {
      const rows = (data ?? []).map(toNotification);
      setItems(rows.sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1)));
    }
    setLoading(false);
  }, [scope?.column, scope?.value, user?.role, push]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    const channel = client
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => void load())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load, userId]);

  const scopeValue = scope?.value;

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: items.filter((item) => !item.read).length,
      loading,
      markingId,
      markingAll,
      deletingId,
      clearing,
      markRead: async (id) => {
        const item = items.find((notification) => notification.id === id);
        if (!item || item.read || markingId || markingAll || clearing) return;
        if (supabase && (
          !userRole
          || (userRole === "supplier" && !scopeValue)
          || (userRole === "customer" && !userId)
        )) return;

        setMarkingId(id);
        if (supabase) {
          let query = supabase.from("notifications").update({ read: true }).eq("id", id);
          if (userRole === "supplier") {
            query = query.eq("supplier_id", scopeValue ?? "");
          } else if (userRole === "customer" && userId) {
            query = query.eq("customer_id", userId);
          } else if (userRole !== "admin") {
            return;
          }

          try {
            const { data, error } = await query.select("id").maybeSingle();
            if (error) throw error;
            if (!data) throw new Error("The notification was not found or could not be updated.");
          } catch (error) {
            push({
              title: "Could not mark notification as read",
              message: error instanceof Error ? error.message : String(error),
              icon: "error",
            });
            setMarkingId(null);
            return;
          }
        }

        setItems((current) => current.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        ));
        setMarkingId(null);
      },
      markAllRead: async () => {
        const unreadIds = items.filter((item) => !item.read).map((item) => item.id);
        if (unreadIds.length === 0 || markingAll || markingId || clearing) return;
        if (supabase && (
          !userRole
          || (userRole === "supplier" && !scopeValue)
          || (userRole === "customer" && !userId)
        )) return;

        setMarkingAll(true);
        if (supabase) {
          let query = supabase.from("notifications").update({ read: true }).eq("read", false);
          if (userRole === "supplier" && scopeValue) {
            query = query.eq("supplier_id", scopeValue);
          } else if (userRole === "customer" && userId) {
            query = query.eq("customer_id", userId);
          } else if (userRole !== "admin") {
            return;
          }

          try {
            const { data, error } = await query.select("id");
            if (error) throw error;
            const updatedIds = new Set((data ?? []).map((notification) => notification.id));
            if (unreadIds.some((id) => !updatedIds.has(id))) {
              throw new Error("Some notifications could not be updated. Refresh and try again.");
            }
          } catch (error) {
            push({
              title: "Could not mark notifications as read",
              message: error instanceof Error ? error.message : String(error),
              icon: "error",
            });
            setMarkingAll(false);
            return;
          }
        }

        setItems((current) => current.map((item) => ({ ...item, read: true })));
        setMarkingAll(false);
      },
      deleteNotification: async (id) => {
        const item = items.find((notification) => notification.id === id);
        if (!item || deletingId || clearing) return;
        if (!supabase) {
          setItems((current) => current.filter((notification) => notification.id !== id));
          return;
        }
        setDeletingId(id);
        try {
          let query = supabase.from("notifications").delete().eq("id", id);
          if (userRole === "supplier") {
            if (!scopeValue) throw new Error("Your supplier account is not available.");
            query = query.eq("supplier_id", scopeValue);
          } else if (userRole === "customer" && userId) {
            query = query.eq("customer_id", userId);
          } else if (userRole !== "admin") {
            throw new Error("Sign in to delete notifications.");
          }
          const { data, error } = await query.select("id").maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("The notification was not found or could not be deleted.");
          setItems((current) => current.filter((notification) => notification.id !== id));
        } catch (error) {
          push({
            title: "Could not delete notification",
            message: error instanceof Error ? error.message : String(error),
            icon: "error",
          });
        } finally {
          setDeletingId(null);
        }
      },
      clearAll: async () => {
        const ids = items.map((item) => item.id);
        if (ids.length === 0 || clearing || deletingId) return;
        if (!supabase) {
          setItems([]);
          return;
        }
        if (!userRole || (userRole === "supplier" && !scopeValue)) return;
        setClearing(true);
        try {
          let query = supabase.from("notifications").delete();
          if (userRole === "supplier" && scopeValue) {
            query = query.eq("supplier_id", scopeValue);
          } else if (userRole === "customer" && userId) {
            query = query.eq("customer_id", userId);
          } else if (userRole !== "admin") {
            throw new Error("Sign in to clear notifications.");
          }
          const { data, error } = await query.select("id");
          if (error) throw error;
          if (!data?.length) throw new Error("No notifications were deleted. Refresh and try again.");
          setItems([]);
          push({ title: "Notifications cleared", message: "All notifications for your account were removed.", icon: "success" });
        } catch (error) {
          push({
            title: "Could not clear notifications",
            message: error instanceof Error ? error.message : String(error),
            icon: "error",
          });
        } finally {
          setClearing(false);
        }
      },
    }),
    [items, scopeValue, userId, userRole, push, loading, markingId, markingAll, deletingId, clearing],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>.");
  return context;
}
