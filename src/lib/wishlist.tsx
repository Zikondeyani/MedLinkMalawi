import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { useToast } from "./toast";

interface WishlistContextValue {
  ids: string[];
  loading: boolean;
  has: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggle: (productId: string) => Promise<boolean>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);
const DEFAULT_WISHLIST_IDS = ["p-oxygen-concentrator", "p-ultrasound", "p-microscope", "p-hospital-bed"];
const EMPTY_IDS: string[] = [];

function storageKey(userId: string | undefined): string {
  return `medlink.wishlist.${userId ?? "guest"}`;
}

function readSavedIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) return parsed;
    return key === storageKey(undefined) ? DEFAULT_WISHLIST_IDS : [];
  } catch {
    return key === storageKey(undefined) ? DEFAULT_WISHLIST_IDS : [];
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, backend } = useAuth();
  const { push } = useToast();
  const key = storageKey(user?.id);
  const [ids, setIds] = useState<string[]>(() => readSavedIds(storageKey(undefined)));
  const [ownerKey, setOwnerKey] = useState(storageKey(undefined));
  const [loading, setLoading] = useState(Boolean(user && backend === "supabase"));
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setOwnerKey(key);
    setPendingIds(new Set());
    if (backend !== "supabase" || !user || !supabase) {
      setIds(readSavedIds(key));
      setLoading(false);
      return () => { active = false; };
    }

    setIds([]);
    setLoading(true);
    void supabase
      .from("saved_products")
      .select("product_id")
      .eq("customer_id", user.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoading(false);
          push({ title: "Could not load saved products", message: error.message, icon: "error" });
          return;
        }
        setIds((data ?? []).map((row) => row.product_id));
        setLoading(false);
      });

    return () => { active = false; };
  }, [backend, key, push, user]);

  useEffect(() => {
    if (backend === "supabase" && user) return;
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      push({ title: "Saved products unavailable", message: "Browser storage is unavailable; these changes may not persist.", icon: "error" });
    }
  }, [backend, ids, key, push, user]);

  const toggle = useCallback(async (productId: string): Promise<boolean> => {
    if (pendingIds.has(productId) || loading || ownerKey !== key) return false;
    const wasSaved = ids.includes(productId);
    const next = wasSaved ? ids.filter((id) => id !== productId) : [...ids, productId];
    setIds(next);
    setPendingIds((current) => new Set(current).add(productId));

    try {
      if (backend === "supabase" && user && supabase) {
        if (wasSaved) {
          const { data, error } = await supabase
            .from("saved_products")
            .delete()
            .eq("customer_id", user.id)
            .eq("product_id", productId)
            .select("product_id");
          if (error) throw error;
          if (!data?.length) throw new Error("The saved product was not found.");
        } else {
          const { error } = await supabase.from("saved_products").insert({
            customer_id: user.id,
            product_id: productId,
          });
          if (error) throw error;
        }
      } else {
        localStorage.setItem(key, JSON.stringify(next));
      }
    } catch (error) {
      setIds((current) =>
        wasSaved
          ? current.includes(productId) ? current : [...current, productId]
          : current.filter((id) => id !== productId),
      );
      push({
        title: "Could not update saved products",
        message: error instanceof Error ? error.message : String(error),
        icon: "error",
      });
      return false;
    } finally {
      setPendingIds((current) => {
        const updated = new Set(current);
        updated.delete(productId);
        return updated;
      });
    }
    return true;
  }, [backend, ids, key, loading, ownerKey, pendingIds, push, user]);

  const visibleIds = ownerKey === key ? ids : EMPTY_IDS;
  const value = useMemo<WishlistContextValue>(
    () => ({
      ids: visibleIds,
      loading: loading || ownerKey !== key,
      has: (productId) => visibleIds.includes(productId),
      isPending: (productId) => pendingIds.has(productId),
      toggle,
    }),
    [key, loading, ownerKey, pendingIds, toggle, visibleIds],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
