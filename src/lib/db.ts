/* ============================================================
   MedLink — database reads and row mappers

   Every record the app shows comes from here: the browser asks
   Supabase for rows, and these functions turn database rows into the
   domain shapes in src/data/types.ts. There is no seeded or hardcoded
   data anywhere in this file — an empty table simply produces an
   empty array, and the UI shows its empty state.

   RLS is what scopes the reads, not the UI:
     • public  → categories, live suppliers, published products, pricing
     • customer→ their own orders, payments, addresses, notifications
     • supplier→ their store, products, fulfilment queue, notifications
     • admin   → everything
   ============================================================ */

import { supabase } from "./supabase";
import type {
  AddressRow,
  CategoryRow,
  NotificationRow,
  OrderItemRow,
  OrderRow,
  PaymentRow,
  PayoutRow,
  PricingConfigRow,
  ProductRow,
  ProfileRow,
  ReleaseFundsResult,
  SupplierApplicationRow,
  SupplierOrderRow,
  SupplierRow,
} from "./database.types";
import type {
  ApplicationDocument,
  Category,
  CustomerOrderStatus,
  DeliveryAddress,
  NotificationItem,
  Order,
  OrderLine,
  OrderTimelineEntry,
  PayoutRecord,
  PaymentMethod,
  PaymentTransaction,
  PaymentTransactionStatus,
  PricingConfig,
  Product,
  ProductSpec,
  SavedAddress,
  Supplier,
  SupplierApplication,
  SupplierDelivery,
  SupplierOperatingAccount,
  SupplierOrder,
  SupplierOrderLine,
  SupplierOrderStatus,
} from "../data/types";

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */

/** Lowercase, dash-only slug — mirrors the public.slugify() SQL helper. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Payment references are stored intact (reconciliation needs them) but are
 * only ever shown masked: a mobile-money payment looks like "Mobile Money ·
 * xx3451".
 */
export function maskPaymentReference(method: PaymentMethod, reference: string): string {
  const ref = reference.trim();
  if (!ref) return "";
  return `${method} · xx${ref.slice(-4)}`;
}

/** jsonb → the address shape checkout writes. */
export function toAddress(value: unknown): DeliveryAddress {
  const row = asRecord(value);
  return {
    fullName: text(row["fullName"]) || text(row["full_name"]),
    phone: text(row["phone"]),
    address: text(row["address"]),
    city: text(row["city"]),
    area: text(row["area"]),
    instructions: text(row["instructions"]),
    ...(text(row["label"]) ? { label: text(row["label"]) } : {}),
  };
}

export function emptyAddress(): DeliveryAddress {
  return { fullName: "", phone: "", address: "", city: "", area: "", instructions: "" };
}

/* ------------------------------------------------------------
   Row mappers
   ------------------------------------------------------------ */

export function toCategory(row: CategoryRow, productCount: number): Category {
  const gradient = asArray<string>(row.gradient);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    productCount,
    gradient: [gradient[0] ?? "#0B1120", gradient[1] ?? "#FFB74D"],
  };
}

export function toSupplier(row: SupplierRow, productCount: number): Supplier {
  const gradient = asArray<string>(row.banner_gradient);
  const operating = asRecord(row.operating_account);
  const delivery: SupplierDelivery = {
    fee: Number(row.delivery_fee ?? 0),
    estimate: row.delivery_estimate,
  };
  const supplier: Supplier = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    verified: row.verified,
    suspended: row.suspended,
    category: row.category,
    rating: Number(row.rating ?? 0),
    reviewCount: row.review_count,
    productCount,
    location: { city: row.city, area: row.area },
    phone: row.phone,
    email: row.email,
    description: row.description,
    bannerGradient: [gradient[0] ?? "#0B1120", gradient[1] ?? "#F59E0B"],
    delivery,
    joined: row.joined,
    art: 1,
  };
  if (row.application_id) supplier.applicationId = row.application_id;
  if (row.banner_image) supplier.bannerImage = row.banner_image;
  if (row.logo_image) supplier.logoImage = row.logo_image;
  if (Object.keys(operating).length > 0) {
    supplier.operatingAccount = operating as unknown as SupplierOperatingAccount;
  }
  return supplier;
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    categoryId: row.category_id ?? "",
    supplierId: row.supplier_id,
    description: row.description,
    price: Number(row.price ?? 0),
    unit: row.unit,
    stock: row.stock,
    brand: row.brand,
    model: row.model,
    sku: row.sku,
    specs: asArray<ProductSpec>(row.specs).filter(
      (spec) => spec && typeof spec.label === "string" && typeof spec.value === "string",
    ),
    warranty: row.warranty,
    rating: 0,
    reviewCount: 0,
    isNew: row.is_new,
    popular: row.featured,
    hidden: row.hidden,
    createdAt: row.created_at,
    status: row.status,
    tags: asArray<string>(row.tags),
    ...(row.image ? { image: row.image } : {}),
    images: asArray<string>(row.images),
  };
}

export function toApplication(row: SupplierApplicationRow): SupplierApplication {
  const operating = asRecord(row.operating_account);
  const application: SupplierApplication = {
    id: row.id,
    ref: row.ref,
    businessName: row.business_name,
    businessType: row.business_type,
    categoryFocus: row.category_focus,
    email: row.contact_email,
    phone: row.phone,
    city: row.city,
    area: row.area,
    registrationNumber: row.registration_number,
    directorName: row.director_name,
    directorIdType: row.director_id_type,
    directorIdNumber: row.director_id_number,
    documents: asArray<ApplicationDocument>(row.documents),
    status: row.status,
    submittedAt: row.submitted_at,
  };
  if (row.website) application.website = row.website;
  if (row.reviewed_at) application.reviewedAt = row.reviewed_at;
  if (row.review_note) application.reviewNote = row.review_note;
  if (Object.keys(operating).length > 0) {
    application.operatingAccount = operating as unknown as SupplierOperatingAccount;
  }
  return application;
}

export function toPayout(row: PayoutRow): PayoutRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    amount: Number(row.amount ?? 0),
    serviceFee: Number(row.service_fee ?? 0),
    orderNumbers: asArray<string>(row.order_numbers),
    releasedAt: row.released_at,
    method: row.method,
    accountSummary: row.account_summary,
  };
}

export function toPayment(row: PaymentRow): PaymentTransaction {
  const payment: PaymentTransaction = {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    method: row.method,
    reference: maskPaymentReference(row.method, row.reference),
    amount: Number(row.amount ?? 0),
    goods: Number(row.goods ?? 0),
    serviceFee: Number(row.service_fee ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    status: row.status as PaymentTransactionStatus,
    paidAt: row.paid_at,
  };
  if (row.order_id) payment.orderId = row.order_id;
  if (row.customer_email) payment.customerEmail = row.customer_email;
  if (row.failure_reason) payment.failureReason = row.failure_reason;
  if (row.refunded_at) payment.refundedAt = row.refunded_at;
  return payment;
}

export function toNotification(row: NotificationRow): NotificationItem {
  const item: NotificationItem = {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    time: row.created_at,
    read: row.read,
    icon:
      row.icon === "package" || row.icon === "truck" || row.icon === "wallet"
        ? row.icon
        : "info",
  };
  if (row.customer_email) item.customerEmail = row.customer_email;
  if (row.supplier_id) item.supplierId = row.supplier_id;
  if (row.order_id) item.orderId = row.order_id;
  if (row.order_number) item.orderNumber = row.order_number;
  return item;
}

export function toOrder(
  row: OrderRow,
  items: OrderItemRow[],
  supplierNames: Map<string, string>,
): Order {
  const lines: OrderLine[] = items.map((item) => ({
    productId: item.product_id ?? "",
    name: item.name,
    price: Number(item.price ?? 0),
    quantity: item.quantity,
    unit: item.unit,
    supplierId: item.supplier_id,
    supplierName: supplierNames.get(item.supplier_id) ?? "",
    image: item.image ?? "",
  }));
  return {
    id: row.id,
    customerEmail: row.customer_email,
    number: row.number,
    placedAt: row.created_at,
    customerName: row.customer_name,
    address: toAddress(row.address),
    lines,
    subtotal: Number(row.subtotal ?? 0),
    serviceFee: Number(row.service_fee ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    total: Number(row.total ?? 0),
    status: row.status as CustomerOrderStatus,
    payment: { method: row.payment_method, reference: maskPaymentReference(row.payment_method, row.payment_reference) },
    estimatedDelivery: row.estimated_delivery,
    timeline: asArray<OrderTimelineEntry>(row.timeline),
  };
}

export function toSupplierOrder(row: SupplierOrderRow, items: OrderItemRow[]): SupplierOrder {
  const lines: SupplierOrderLine[] = items.map((item) => ({
    productId: item.product_id ?? "",
    name: item.name,
    quantity: item.quantity,
    price: Number(item.price ?? 0),
    unit: item.unit,
  }));
  const order: SupplierOrder = {
    id: row.id,
    supplierId: row.supplier_id,
    number: row.number,
    placedAt: row.created_at,
    customerName: row.customer_name,
    customerOrg: row.customer_org,
    customerPhone: row.customer_phone,
    city: row.city,
    area: row.area,
    lines,
    subtotal: Number(row.subtotal ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    total: Number(row.total ?? 0),
    status: row.status as SupplierOrderStatus,
    itemsTotal: row.items_total,
    paymentMethod: row.payment_method,
    note: row.note,
  };
  if (row.order_id) order.orderId = row.order_id;
  if (row.customer_email) order.customerEmail = row.customer_email;
  return order;
}

export function toSavedAddress(row: AddressRow): SavedAddress {
  const address: SavedAddress = {
    id: row.id,
    customerEmail: row.customer_email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    area: row.area,
    instructions: row.instructions,
    isDefault: row.is_default,
  };
  if (row.label) address.label = row.label;
  return address;
}

export function toPricing(row: PricingConfigRow | null): PricingConfig {
  if (!row) return { serviceFeeRate: 0, deliveryFees: {}, defaultDeliveryFee: 0 };
  return {
    serviceFeeRate: Number(row.service_fee_rate ?? 0),
    deliveryFees: asRecord(row.delivery_fees) as Record<string, number>,
    defaultDeliveryFee: Number(row.default_delivery_fee ?? 0),
  };
}

export function toProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.full_name.trim() || row.email,
    email: row.email.trim().toLowerCase(),
    role: row.role,
    status: row.status,
    blocked: row.blocked,
    avatarUrl: row.avatar_url ?? "",
    supplierId: row.supplier_id ?? "",
  };
}

/* ------------------------------------------------------------
   Reads
   ------------------------------------------------------------ */

export interface PublicSnapshot {
  categories: Category[];
  suppliers: Supplier[];
  products: Product[];
  pricing: PricingConfig;
}

/** Count published products per supplier / per category in one pass. */
function countBy(rows: Product[], key: (product: Product) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = key(row);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The public marketplace snapshot: taxonomy, live stores, the catalogue and
 * platform pricing. Anonymous visitors get exactly this; signed-in roles get
 * it plus their own data.
 */
export async function fetchPublicSnapshot(): Promise<PublicSnapshot> {
  const empty: PublicSnapshot = { categories: [], suppliers: [], products: [], pricing: toPricing(null) };
  if (!supabase) return empty;

  const [categoryRes, supplierRes, productRes, pricingRes] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order").order("name"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("products").select("*").order("created_at", { ascending: false }),
    supabase.from("pricing_config").select("*").eq("id", true).maybeSingle(),
  ]);

  const firstError = categoryRes.error ?? supplierRes.error ?? productRes.error ?? pricingRes.error;
  if (firstError) throw new Error(firstError.message);

  const products = (productRes.data ?? []).map(toProduct);
  const productsBySupplier = countBy(products, (p) => p.supplierId);
  const productsByCategory = countBy(products, (p) => p.categoryId);
  const suppliers = (supplierRes.data ?? []).map((row) => toSupplier(row, productsBySupplier.get(row.id) ?? 0));
  const categories = (categoryRes.data ?? [])
    .map((row) => toCategory(row, productsByCategory.get(row.id) ?? 0))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { categories, suppliers, products, pricing: toPricing(pricingRes.data) };
}

export interface OrderSnapshot {
  orders: Order[];
  supplierOrders: SupplierOrder[];
}

/**
 * Buyer orders plus the per-store fulfilment projections the signed-in account
 * may see. RLS returns the customer's own orders (or, for an admin, every
 * order) and, for a supplier, the fulfilment rows of its own store.
 */
export async function fetchOrders(supplierNames: Map<string, string>): Promise<OrderSnapshot> {
  if (!supabase) return { orders: [], supplierOrders: [] };

  const [orderRes, supplierOrderRes] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("supplier_orders").select("*").order("created_at", { ascending: false }),
  ]);

  const error = orderRes.error ?? supplierOrderRes.error;
  if (error) throw new Error(error.message);

  const orderRows = orderRes.data ?? [];
  const supplierOrderRows = supplierOrderRes.data ?? [];
  const orderIds = new Set([...orderRows.map((r) => r.id), ...supplierOrderRows.map((r) => r.order_id).filter(Boolean)]);

  let itemRows: OrderItemRow[] = [];
  if (orderIds.size > 0) {
    const itemRes = await supabase.from("order_items").select("*").order("id");
    if (itemRes.error) throw new Error(itemRes.error.message);
    itemRows = (itemRes.data ?? []).filter((item) => orderIds.has(item.order_id));
  }

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.order_id);
    if (list) list.push(item);
    else itemsByOrder.set(item.order_id, [item]);
  }

  return {
    orders: orderRows.map((row) => toOrder(row, itemsByOrder.get(row.id) ?? [], supplierNames)),
    supplierOrders: supplierOrderRows.map((row) => toSupplierOrder(row, itemsByOrder.get(row.id) ?? [])),
  };
}

/** The signed-in buyer's saved delivery addresses. */
export async function fetchAddresses(email: string): Promise<SavedAddress[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .ilike("customer_email", email)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSavedAddress);
}

/** The marketplace's KYC queue. Only administrators can read these rows. */
export async function fetchApplications(): Promise<SupplierApplication[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("supplier_applications")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toApplication);
}

/**
 * The signed-in applicant's own KYC submission. RLS limits this to the row
 * where applicant_id = auth.uid(), so a store owner can see the registration
 * details and documents their store was approved from — and nothing else.
 */
export async function fetchOwnApplication(): Promise<SupplierApplication | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("supplier_applications")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return toApplication(data);
}

export interface MoneySnapshot {
  payouts: PayoutRecord[];
  payments: PaymentTransaction[];
  releasedOrders: Record<string, string[]>;
}

/** Escrow history, buyer payments and the release ledger (admin scope). */
export async function fetchMoney(): Promise<MoneySnapshot> {
  if (!supabase) return { payouts: [], payments: [], releasedOrders: {} };
  const [payoutRes, paymentRes, releasedRes] = await Promise.all([
    supabase.from("payouts").select("*").order("released_at", { ascending: false }),
    supabase.from("payments").select("*").order("paid_at", { ascending: false }),
    supabase.from("released_orders").select("*"),
  ]);
  const error = payoutRes.error ?? paymentRes.error ?? releasedRes.error;
  if (error) throw new Error(error.message);

  const releasedOrders: Record<string, string[]> = {};
  for (const row of releasedRes.data ?? []) {
    const list = releasedOrders[row.supplier_id] ?? [];
    list.push(row.order_id);
    releasedOrders[row.supplier_id] = list;
  }

  return {
    payouts: (payoutRes.data ?? []).map(toPayout),
    payments: (paymentRes.data ?? []).map(toPayment),
    releasedOrders,
  };
}

/** Every profile the signed-in admin may see (used for the block flags). */
export async function fetchBlockedAccounts(): Promise<Record<string, boolean>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from("profiles").select("id, blocked");
  if (error) throw new Error(error.message);
  const flags: Record<string, boolean> = {};
  for (const row of data ?? []) flags[row.id] = row.blocked;
  return flags;
}

/** Release a store's held funds; the server writes the payout + ledger. */
export async function callReleaseFunds(supplierId: string): Promise<ReleaseFundsResult> {
  if (!supabase) return { released: false, reason: "No backend configured." };
  const { data, error } = await supabase.rpc("admin_release_supplier_funds", {
    target_supplier: supplierId,
  });
  if (error) throw new Error(error.message);
  return (data ?? { released: false }) as ReleaseFundsResult;
}
