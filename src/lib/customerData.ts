/* ============================================================
   MedLink — orders, fulfilment and the buyer's address book

   Everything here is a real database record. Checkout calls the
   place_order() RPC, which recomputes prices, stock and fees in
   Postgres, and writes the order, its lines, the per-store
   fulfilment rows, the payment and the notification in one
   transaction. The browser only says "these products, these
   quantities" — it can never invent a price.

   Row-level security decides what the signed-in account can read:
   a buyer sees their own orders, a supplier sees the fulfilment
   rows of its store, an administrator sees everything.
   ============================================================ */

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { fetchAddresses, fetchOrders, maskPaymentReference, toSavedAddress } from "./db";
import type { Database, Json } from "./database.types";
import type {
  CustomerOrderStatus,
  DeliveryAddress,
  Order,
  OrderLine,
  OrderTimelineEntry,
  PaymentInfo,
  PaymentMethod,
  SavedAddress,
  SupplierOrder,
  SupplierOrderStatus,
} from "../data/types";

type Listener = () => void;
type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];
type AddressUpdate = Database["public"]["Tables"]["addresses"]["Update"];
const listeners = new Set<Listener>();

let orders: Order[] = [];
let supplierOrders: SupplierOrder[] = [];
let addresses: SavedAddress[] = [];
let loaded = false;
let loading = false;
let loadError: string | null = null;

/** Loading/error state of the order cache, for page-level guards. */
export interface CustomerDataStatus {
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

/**
 * Rebuilt once per emit, never inside the getter: useSyncExternalStore compares
 * snapshots with Object.is, so a fresh object per call would loop forever.
 */
let dataStatus: CustomerDataStatus = { loading: false, loaded: false, error: null };

function emit(): void {
  dataStatus = { loading, loaded, error: loadError };
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { maskPaymentReference };

/* ------------------------------------------------------------
   Loading
   ------------------------------------------------------------ */

/**
 * Fetch the orders the signed-in account may see plus its address book.
 * Called by the marketplace bootstrap on mount, on sign-in, on sign-out
 * and after every mutation, so the cache is never a guess.
 */
export async function loadCustomerData(email: string, supplierNames: Map<string, string>): Promise<void> {
  loading = true;
  emit();
  try {
    const [orderSnapshot, addressSnapshot] = await Promise.all([
      fetchOrders(supplierNames),
      fetchAddresses(email),
    ]);
    orders = orderSnapshot.orders;
    supplierOrders = orderSnapshot.supplierOrders;
    addresses = addressSnapshot;
    loadError = null;
    loaded = true;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load your orders.";
  } finally {
    loading = false;
    emit();
  }
}

/* ------------------------------------------------------------
   Reads
   ------------------------------------------------------------ */

export function useOrders(): Order[] {
  return useSyncExternalStore(subscribe, () => orders, () => orders);
}

export function useSupplierOrders(): SupplierOrder[] {
  return useSyncExternalStore(subscribe, () => supplierOrders, () => supplierOrders);
}

export function useCustomerOrders(customerEmail: string): Order[] {
  const all = useOrders();
  const email = normalizeEmail(customerEmail);
  return all.filter((order) => normalizeEmail(order.customerEmail) === email);
}

export function useCustomerOrderById(id: string | undefined, customerEmail: string): Order | undefined {
  const owned = useCustomerOrders(customerEmail);
  return id ? owned.find((order) => order.id === id) : undefined;
}

/** One fulfilment row of the store the signed-in account may see. */
export function useSupplierOrderById(id: string | undefined): SupplierOrder | undefined {
  useSyncExternalStore(subscribe, () => supplierOrders, () => supplierOrders);
  return id ? supplierOrders.find((order) => order.id === id) : undefined;
}

export function useCustomerAddresses(customerEmail: string): SavedAddress[] {
  useSyncExternalStore(subscribe, () => addresses, () => addresses);
  const email = normalizeEmail(customerEmail);
  return addresses.filter((address) => normalizeEmail(address.customerEmail) === email);
}

/** Loading/error state of the order cache, for page-level guards. */
export function useCustomerDataStatus(): CustomerDataStatus {
  return useSyncExternalStore(subscribe, () => dataStatus, () => dataStatus);
}

export function getAllOrders(): Order[] {
  return orders;
}

export function getAllSupplierOrders(): SupplierOrder[] {
  return supplierOrders;
}

export function getOrderById(id: string): Order | undefined {
  return orders.find((order) => order.id === id);
}

export function getSupplierOrderById(id: string): SupplierOrder | undefined {
  return supplierOrders.find((order) => order.id === id);
}

export function getCustomerOrderById(id: string, customerEmail: string): Order | undefined {
  const email = normalizeEmail(customerEmail);
  return orders.find((order) => order.id === id && normalizeEmail(order.customerEmail) === email);
}

export function getCustomerAddresses(customerEmail: string): SavedAddress[] {
  const email = normalizeEmail(customerEmail);
  return addresses.filter((address) => normalizeEmail(address.customerEmail) === email);
}

export function getDefaultCustomerAddress(customerEmail: string): SavedAddress | undefined {
  const owned = getCustomerAddresses(customerEmail);
  return owned.find((address) => address.isDefault) ?? owned[0];
}

/** Distinct buyers a store has supplied, derived from its fulfilment rows. */
export function supplierCustomers(supplierId: string): {
  email: string;
  name: string;
  org: string;
  phone: string;
  city: string;
  area: string;
  orders: number;
  spend: number;
  lastOrderAt: string;
}[] {
  const byEmail = new Map<string, ReturnType<typeof supplierCustomers>[number]>();
  for (const order of supplierOrders) {
    if (order.supplierId !== supplierId) continue;
    const key = normalizeEmail(order.customerEmail ?? "") || order.customerName;
    const existing = byEmail.get(key);
    if (existing) {
      existing.orders += 1;
      existing.spend += order.total;
      if (order.placedAt > existing.lastOrderAt) existing.lastOrderAt = order.placedAt;
      continue;
    }
    byEmail.set(key, {
      email: order.customerEmail ?? "",
      name: order.customerName,
      org: order.customerOrg,
      phone: order.customerPhone,
      city: order.city,
      area: order.area,
      orders: 1,
      spend: order.total,
      lastOrderAt: order.placedAt,
    });
  }
  return [...byEmail.values()].sort((a, b) => b.spend - a.spend);
}

/* ------------------------------------------------------------
   Checkout — the only way an order can be created
   ------------------------------------------------------------ */

export interface PlaceOrderInput {
  /** What the buyer is buying: product id + quantity. Prices are server-side. */
  lines: Pick<OrderLine, "productId" | "quantity">[];
  address: DeliveryAddress;
  payment: PaymentInfo;
  /** Optional delivery promise shown on the order. */
  estimatedDelivery?: string;
}

export type PlaceOrderResult =
  | { ok: true; order: Order }
  | { ok: false; error: string };

/**
 * Place a real order. The server validates stock, recomputes the money and
 * creates every downstream record, so the app cannot record a fake sale.
 */
export async function placeCustomerOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!supabase) {
    return { ok: false, error: "Checkout needs the MedLink backend — configure VITE_SUPABASE_URL and the publishable key." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "Your order has no items." };
  }

  const { data, error } = await supabase.rpc("place_order", {
    p_items: input.lines.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
    p_address: { ...input.address },
    p_payment_method: input.payment.method as PaymentMethod,
    p_payment_reference: input.payment.reference.trim(),
    p_estimated_delivery: input.estimatedDelivery ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const result = data as { order_id?: string; number?: string } | null;
  const orderId = result?.order_id ?? "";
  if (!orderId) return { ok: false, error: "The server did not return an order. Please try again." };

  emit(); // the bootstrap re-read happens on the next load; make the UI update now
  return { ok: true, order: buildOptimisticOrder(orderId, result?.number ?? "", input) };
}

/** Minimal shape so the confirmation screen can render before the re-read. */
function buildOptimisticOrder(id: string, number: string, input: PlaceOrderInput): Order {
  const now = new Date().toISOString();
  return {
    id,
    customerEmail: "",
    number,
    placedAt: now,
    customerName: input.address.fullName,
    address: input.address,
    lines: [],
    subtotal: 0,
    serviceFee: 0,
    deliveryFee: 0,
    total: 0,
    status: "confirmed",
    payment: { method: input.payment.method, reference: input.payment.reference },
    estimatedDelivery: input.estimatedDelivery ?? "1–2 days",
    timeline: [{ status: "confirmed", at: now, note: "Order placed" }],
  };
}

/* ------------------------------------------------------------
   Order status (admin / store)
   ------------------------------------------------------------ */

const STATUS_NOTES: Record<CustomerOrderStatus, string> = {
  confirmed: "Order confirmed by MedLink",
  preparing: "Stores are preparing your order",
  ready: "Your order is ready",
  out_for_delivery: "Your order is on the way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
};

/** Set the canonical order status and append an audit entry to the timeline. */
export async function updateCustomerOrderStatus(
  id: string,
  status: CustomerOrderStatus,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const current = orders.find((order) => order.id === id);
  if (!current) return { ok: false, error: "That order was not found." };

  const timeline: OrderTimelineEntry[] = [
    ...current.timeline,
    { status, at: new Date().toISOString(), note: note?.trim() || STATUS_NOTES[status] },
  ];

  const update: OrderUpdate = { status, timeline: timeline as unknown as Json };
  const { error } = await supabase.from("orders").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Optimistic update, then let the caller re-read for the canonical row.
  orders = orders.map((order) => (order.id === id ? { ...order, status, timeline } : order));
  emit();
  return { ok: true };
}

/** Let the customer confirm receipt once the order is out for delivery. */
export async function confirmCustomerDelivery(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const current = orders.find((order) => order.id === id);
  if (!current) return { ok: false, error: "That order was not found." };
  if (current.status !== "out_for_delivery") {
    return { ok: false, error: "Delivery can only be confirmed when the order is out for delivery." };
  }

  const { error } = await supabase.rpc("customer_confirm_delivery", { p_order_id: id });
  if (error) return { ok: false, error: error.message };

  const confirmedAt = new Date().toISOString();
  const timeline: OrderTimelineEntry[] = [
    ...current.timeline,
    { status: "delivered", at: confirmedAt, note: "Delivery confirmed by the customer" },
  ];
  orders = orders.map((order) =>
    order.id === id ? { ...order, status: "delivered", timeline } : order,
  );
  supplierOrders = supplierOrders.map((order) =>
    order.orderId === id ? { ...order, status: "completed" } : order,
  );
  emit();
  return { ok: true };
}

/** A store moving one fulfilment row along its own pipeline. */
export async function updateSupplierOrderStatus(
  id: string,
  status: SupplierOrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("supplier_orders").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  supplierOrders = supplierOrders.map((order) => (order.id === id ? { ...order, status } : order));
  emit();
  return { ok: true };
}

/* ------------------------------------------------------------
   Address book
   ------------------------------------------------------------ */

function addressMatches(left: DeliveryAddress, right: DeliveryAddress): boolean {
  return (
    left.fullName.trim() === right.fullName.trim() &&
    left.phone.trim() === right.phone.trim() &&
    left.address.trim() === right.address.trim() &&
    left.city.trim() === right.city.trim() &&
    left.area.trim() === right.area.trim()
  );
}

/** Save the address used at checkout. Identical addresses are not duplicated. */
export async function saveCustomerAddress(
  customerEmail: string,
  address: DeliveryAddress,
  label = "Delivery address",
  customerId?: string,
): Promise<{ ok: true; address: SavedAddress } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const owned = getCustomerAddresses(customerEmail);
  const existing = owned.find((row) => addressMatches(row, address));
  if (existing) return { ok: true, address: existing };

  const { data, error } = await supabase.from("addresses").insert({
    customer_id: customerId ?? null,
    customer_email: normalizeEmail(customerEmail),
    full_name: address.fullName.trim(),
    phone: address.phone.trim(),
    address: address.address.trim(),
    city: address.city.trim(),
    area: address.area.trim(),
    instructions: address.instructions.trim(),
    label,
    is_default: owned.length === 0,
  }).select("*").single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "The address could not be saved. Please try again." };

  const savedAddress = toSavedAddress(data);
  addresses = [...addresses, savedAddress];
  emit();
  return { ok: true, address: savedAddress };
}

export async function updateCustomerAddress(
  customerEmail: string,
  id: string,
  patch: Partial<DeliveryAddress> & { label?: string; isDefault?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  if (!getCustomerAddresses(customerEmail).some((address) => address.id === id)) {
    return { ok: false, error: "That address is not in your address book." };
  }

  const update: AddressUpdate = {};
  if (patch.fullName !== undefined) update.full_name = patch.fullName.trim();
  if (patch.phone !== undefined) update.phone = patch.phone.trim();
  if (patch.address !== undefined) update.address = patch.address.trim();
  if (patch.city !== undefined) update.city = patch.city.trim();
  if (patch.area !== undefined) update.area = patch.area.trim();
  if (patch.instructions !== undefined) update.instructions = patch.instructions.trim();
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.isDefault !== undefined) update.is_default = patch.isDefault;

  const { error } = await supabase.from("addresses").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  addresses = addresses.map((address) =>
    address.id === id ? { ...address, ...stripInternal(patch) } : address,
  );
  emit();
  return { ok: true };
}

function stripInternal(patch: Partial<DeliveryAddress> & { isDefault?: boolean }): Partial<SavedAddress> {
  const { isDefault, ...rest } = patch;
  const next: Partial<SavedAddress> = { ...rest };
  if (isDefault !== undefined) next.isDefault = isDefault;
  return next;
}

export async function deleteCustomerAddress(customerEmail: string, id: string): Promise<void> {
  if (!supabase) return;
  if (!getCustomerAddresses(customerEmail).some((address) => address.id === id)) return;
  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) return;

  addresses = addresses.filter((address) => address.id !== id);
  // Never leave the book without a default.
  const remaining = getCustomerAddresses(customerEmail);
  if (remaining.length > 0 && !remaining.some((address) => address.isDefault)) {
    const replacement = remaining[0];
    await supabase.from("addresses").update({ is_default: true }).eq("id", replacement.id);
    addresses = addresses.map((address) =>
      address.id === replacement.id ? { ...address, isDefault: true } : address,
    );
  }
  emit();
}

export async function setDefaultCustomerAddress(customerEmail: string, id: string): Promise<void> {
  if (!supabase) return;
  const owned = getCustomerAddresses(customerEmail);
  if (!owned.some((address) => address.id === id)) return;
  await supabase.from("addresses").update({ is_default: false }).ilike("customer_email", customerEmail);
  await supabase.from("addresses").update({ is_default: true }).eq("id", id);
  addresses = owned.map((address) => ({ ...address, isDefault: address.id === id }));
  emit();
}
