/* ============================================================
   MedLink — marketplace data gate

   Every page reads the same database-backed store. This gate is
   mounted once around the router: while that store is loading it
   shows a spinner instead of a page full of zeroes, and if the
   load failed it says so and offers a retry rather than letting a
   page render an empty catalogue as if the marketplace were empty.
   ============================================================ */
import { useEffect, type ReactNode } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { loadMarketplace, useDataStatus } from "../../lib/registry";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

export default function DataGate({ children }: { children: ReactNode }) {
  const { loading, loaded, error } = useDataStatus();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshOrders = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadMarketplace(), 200);
    };
    const channel = client
      .channel(`order-status:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refreshOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "supplier_orders" }, refreshOrders)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    };
  }, [userId]);

  // Spinner first: it also covers the one render before the auth provider has
  // kicked off its first load, so pages never flash an empty catalogue first.
  // A retry is a `loading` run with a stale `error`, so that case shows the
  // spinner too rather than bouncing back to the error card.
  if (!loaded && (loading || !error)) {
    return <Loading />;
  }

  // Reached on the very first load too, where `loaded` is still false: an
  // unreachable database must not look like an empty marketplace.
  if (error) {
    return (
      <div className="page container">
        <div className="card card-pad" style={{ textAlign: "center", padding: "48px 24px" }}>
          <WifiOff size={30} className="muted" />
          <h1 className="h-card" style={{ marginTop: 12 }}>Could not reach the MedLink database</h1>
          <p className="small muted" style={{ maxWidth: 460, margin: "8px auto 0" }}>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => void loadMarketplace()}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!loaded) return <Loading />;

  return <>{children}</>;
}

function Loading() {
  return (
    <div className="page container" style={{ display: "grid", placeItems: "center", minHeight: "55vh" }}>
      <div className="stack" style={{ alignItems: "center", gap: 10 }}>
        <Loader2 size={26} className="spin muted" />
        <p className="small muted">Loading the marketplace…</p>
      </div>
    </div>
  );
}
