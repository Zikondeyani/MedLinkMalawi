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
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
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
      return;
    }
    // Administrators read every notification; everyone else only their own.
    const query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);
    const { data, error } =
      user?.role === "admin" ? await query : await query.eq(scope.column, scope.value);
    if (error) {
      setItems([]);
    } else {
      const rows = (data ?? []).map(toNotification);
      setItems(rows.sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1)));
    }
  }, [scope?.column, scope?.value, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const scopeValue = scope?.value;

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: items.filter((item) => !item.read).length,
      markRead: async (id) => {
        const item = items.find((notification) => notification.id === id);
        if (!item || item.read) return;

        if (supabase) {
          let query = supabase.from("notifications").update({ read: true }).eq("id", id);
          if (userRole === "supplier") {
            if (!scopeValue) return;
            query = query.eq("supplier_id", scopeValue);
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
            return;
          }
        }

        setItems((current) => current.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        ));
      },
      markAllRead: async () => {
        const unreadIds = items.filter((item) => !item.read).map((item) => item.id);
        if (unreadIds.length === 0) return;

        if (supabase) {
          if (!userRole || (userRole === "supplier" && !scopeValue)) return;

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
            return;
          }
        }

        setItems((current) => current.map((item) => ({ ...item, read: true })));
      },
    }),
    [items, scopeValue, userId, userRole, push],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>.");
  return context;
}
