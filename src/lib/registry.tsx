/* ============================================================
   MedLink — the marketplace store

   One module-level cache of the real database, shared by every page
   through useSyncExternalStore. The cache is filled by
   loadMarketplace() (called from the auth provider on mount, on
   sign-in and on sign-out) and refreshed after every mutation, so
   several pages can never disagree about what the database says.

   Nothing in here is seeded or simulated: if a table is empty the
   array is empty and the page shows its empty state.

   Writes are real too. Money is never computed in the browser for
   anything that matters — checkout and escrow release go through
   SECURITY DEFINER RPCs in Postgres (see place_order() and
   admin_release_supplier_funds() in the marketplace migration).
   ============================================================ */

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { Database, Json } from "./database.types";
import {
  callReleaseFunds,
  fetchApplications,
  fetchBlockedAccounts,
  fetchMoney,
  fetchOwnApplication,
  fetchPublicSnapshot,
  slugify,
  toCategory,
  type MoneySnapshot,
} from "./db";
import {
  getAllOrders,
  getAllSupplierOrders,
  loadCustomerData,
  updateCustomerOrderStatus,
} from "./customerData";
import { reviewSupplierApplicationOnBackend } from "./onboarding";
import type {
  Category,
  CustomerOrderStatus,
  DeliveryQuote,
  KycStatus,
  Order,
  PayoutRecord,
  PaymentTransaction,
  PricingConfig,
  Product,
  ProductSpec,
  ProductStatus,
  Supplier,
  SupplierApplication,
  SupplierOperatingAccount,
} from "../data/types";

export { slugify };

/** Row-shaped update payloads, so a mistyped column fails the build. */
type CategoryUpdate = Database["public"]["Tables"]["categories"]["Update"];
type SupplierUpdate = Database["public"]["Tables"]["suppliers"]["Update"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
type PricingUpdate = Database["public"]["Tables"]["pricing_config"]["Update"];

/* ------------------------------------------------------------
   Cache + subscription
   ------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

let categories: Category[] = [];
let suppliers: Supplier[] = [];
let products: Product[] = [];
let activeProducts: Product[] = [];
let applications: SupplierApplication[] = [];
/** The signed-in supplier's own KYC row (RLS: their application only). */
let ownApplication: SupplierApplication | undefined;
let pricing: PricingConfig = { serviceFeeRate: 0, deliveryFees: {}, defaultDeliveryFee: 0 };
let payouts: PayoutRecord[] = [];
let payments: PaymentTransaction[] = [];
let releasedOrders: Record<string, string[]> = {};
let blockedAccounts: Record<string, boolean> = {};

let loading = false;
let loaded = false;
let loadError: string | null = null;
let lastSynced: string | null = null;

/** The signed-in account, as reported by the auth provider. */
export interface ActiveAccount {
  id: string;
  email: string;
  role: "customer" | "supplier" | "admin";
  supplierId?: string;
}
let account: ActiveAccount | null = null;

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Snapshots that are maps or objects are built here, once per emit, instead of
 * inside the getter. useSyncExternalStore compares snapshots with Object.is,
 * so a getter that allocated a fresh object would report "changed" on every
 * render and spin forever. Between emits these references stay identical.
 */
let orderStatuses: OrderStatusMap = {};
let productFlags: ProductFlags = {};
let customerFlags: CustomerFlags = {};
let dataStatus: DataStatus = { loading: false, loaded: false, error: null, lastSynced: null };

function buildSnapshots(): void {
  const statuses: OrderStatusMap = {};
  for (const order of getAllOrders()) statuses[order.id] = order.status;

  const flags: ProductFlags = {};
  for (const product of products) {
    flags[product.id] = { featured: product.popular, hidden: product.hidden };
  }

  const blocked: CustomerFlags = {};
  for (const [id, isBlocked] of Object.entries(blockedAccounts)) blocked[id] = { blocked: isBlocked };

  orderStatuses = statuses;
  productFlags = flags;
  customerFlags = blocked;
  dataStatus = { loading, loaded, error: loadError, lastSynced };
}

function emit(): void {
  buildSnapshots();
  for (const listener of listeners) listener();
}

function useStore<T>(getSnapshot: () => T): T {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function supplierNameMap(): Map<string, string> {
  return new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
}

/* ------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------ */

/** The auth provider reports the active account here. */
export function setActiveAccount(next: ActiveAccount | null): void {
  account = next;
  // useCurrentSupplierId() reads `account` but subscribes to `loading`, so
  // subscribers have to be told when the account itself changes.
  emit();
}

/** Loading / error state, for pages that must wait for real data. */
export interface DataStatus {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  lastSynced: string | null;
}

export function useDataStatus(): DataStatus {
  return useStore(() => dataStatus);
}

/**
 * Re-read everything the signed-in account may see. Called on mount, on
 * sign-in, on sign-out and after mutations that other pages may show.
 */
export async function loadMarketplace(): Promise<void> {
  loading = true;
  emit();
  try {
    const snapshot = await fetchPublicSnapshot();
    categories = snapshot.categories;
    suppliers = snapshot.suppliers;
    products = snapshot.products;
    pricing = snapshot.pricing;
    recomputeDerived();

    if (account?.role === "admin") {
      // Administrators also moderate the KYC queue, payouts and block flags.
      const [applicationRows, money, blocked] = await Promise.all([
        fetchApplications(),
        fetchMoney(),
        fetchBlockedAccounts(),
      ]);
      applications = applicationRows;
      const moneySnapshot: MoneySnapshot = money;
      payouts = moneySnapshot.payouts;
      payments = moneySnapshot.payments;
      releasedOrders = moneySnapshot.releasedOrders;
      blockedAccounts = blocked;
      ownApplication = undefined;
    } else {
      applications = [];
      // A store owner may read the KYC row their own store was approved from.
      ownApplication = account?.role === "supplier" ? await fetchOwnApplication() : undefined;
    }

    await loadCustomerData(account?.email ?? "", supplierNameMap());

    loadError = null;
    loaded = true;
    lastSynced = new Date().toISOString();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the marketplace.";
  } finally {
    loading = false;
    emit();
  }
}

/** Alias used by pages that offer a manual "refresh" affordance. */
export const refreshMarketplace = loadMarketplace;

function recomputeDerived(): void {
  activeProducts = products.filter((product) => product.status === "active" && !product.hidden);
  for (const supplier of suppliers) {
    supplier.productCount = products.filter((product) => product.supplierId === supplier.id).length;
  }
  for (const category of categories) {
    category.productCount = products.filter((product) => product.categoryId === category.id).length;
  }
}

/* ------------------------------------------------------------
   Pricing (admin-editable, stored in Postgres)
   ------------------------------------------------------------ */

export function getPricing(): PricingConfig {
  return pricing;
}

export function usePricing(): PricingConfig {
  return useStore(() => pricing);
}

/** Delivery fee quote for a buyer address city (live admin pricing). */
export function quoteDelivery(city: string, supplierIds: string[] = []): DeliveryQuote {
  const fee = pricing.deliveryFees?.[city] ?? pricing.defaultDeliveryFee ?? 0;
  // The slowest store in the order sets the estimate — the buyer waits for the
  // whole order, so one supplier's promise must not understate it.
  const estimates = supplierIds
    .map((id) => suppliers.find((s) => s.id === id)?.delivery.estimate)
    .filter((value): value is string => Boolean(value));
  return { baseFee: fee, estimated: estimates.length ? estimates.join(" / ") : "" };
}

/** MedLink's share of the goods value (used for display only — the server decides). */
export function serviceFee(subtotal: number): number {
  return Math.round(subtotal * pricing.serviceFeeRate);
}

/** Persist an admin pricing change. */
export async function updatePricingConfig(patch: Partial<PricingConfig>): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const update: PricingUpdate = {};
  if (patch.serviceFeeRate !== undefined) update.service_fee_rate = patch.serviceFeeRate;
  if (patch.defaultDeliveryFee !== undefined) update.default_delivery_fee = patch.defaultDeliveryFee;
  if (patch.deliveryFees !== undefined) update.delivery_fees = patch.deliveryFees;

  const { error } = await supabase.from("pricing_config").update(update).eq("id", true);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/* ------------------------------------------------------------
   Categories
   ------------------------------------------------------------ */

/* ------------------------------------------------------------
   Non-hook reads (for plain functions outside components)
   ------------------------------------------------------------ */

export function getCategories(): Category[] {
  return categories;
}

export function getSuppliers(): Supplier[] {
  return suppliers;
}

export function getProducts(): Product[] {
  return products;
}

export function getActiveProducts(): Product[] {
  return activeProducts;
}

export function useCategories(): Category[] {
  return useStore(() => categories);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((category) => category.id === id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

/** Human label for a category id, tolerant of an unknown/deleted category. */
export function categoryName(id: string): string {
  return getCategoryById(id)?.name ?? "Uncategorised";
}

export async function addCategory(input: {
  name: string;
  description: string;
  icon: string;
}): Promise<{ ok: boolean; category?: Category; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const base = slugify(input.name) || "category";
  const id = `cat-${base}-${Date.now().toString(36)}`;
  const slug = `${base}-${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await supabase
    .from("categories")
    .insert({ id, name: input.name.trim(), slug, description: input.description.trim(), icon: input.icon })
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  await loadMarketplace();
  return { ok: true, category: data ? toCategory(data, 0) : undefined };
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, "name" | "description" | "icon">>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const update: CategoryUpdate = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.icon !== undefined) update.icon = patch.icon;

  const { error } = await supabase.from("categories").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

export async function removeCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/* ------------------------------------------------------------
   Suppliers
   ------------------------------------------------------------ */

export function useSuppliers(): Supplier[] {
  return useStore(() => suppliers);
}

export function getSupplierById(id: string): Supplier | undefined {
  return suppliers.find((supplier) => supplier.id === id);
}

export function getSupplierBySlug(slug: string): Supplier | undefined {
  return suppliers.find((supplier) => supplier.slug === slug);
}

/** The store the signed-in supplier account owns. */
export function useCurrentSupplierId(): string | null {
  useStore(() => loading); // re-render when the cache changes
  return account?.role === "supplier" ? (account.supplierId ?? null) : null;
}

export function useMySupplier(): Supplier | undefined {
  const id = useCurrentSupplierId();
  return id ? getSupplierById(id) : undefined;
}

/** Presentation fields a store owner may change (the trigger protects trust columns). */
export async function updateMySupplier(
  patch: Partial<{
    name: string;
    description: string;
    phone: string;
    email: string;
    city: string;
    area: string;
    bannerImage: string;
    logoImage: string;
    deliveryFee: number;
    deliveryEstimate: string;
  }>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const supplierId = account?.supplierId;
  if (!supplierId) return { ok: false, error: "Your account is not linked to a store yet." };

  const update: SupplierUpdate = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.phone !== undefined) update.phone = patch.phone.trim();
  if (patch.email !== undefined) update.email = patch.email.trim();
  if (patch.city !== undefined) update.city = patch.city.trim();
  if (patch.area !== undefined) update.area = patch.area.trim();
  if (patch.bannerImage !== undefined) update.banner_image = patch.bannerImage;
  if (patch.logoImage !== undefined) update.logo_image = patch.logoImage;
  if (patch.deliveryFee !== undefined) update.delivery_fee = patch.deliveryFee;
  if (patch.deliveryEstimate !== undefined) update.delivery_estimate = patch.deliveryEstimate;

  const { error } = await supabase.from("suppliers").update(update).eq("id", supplierId);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/** Administrator: hide or restore a store from the public marketplace. */
export async function setSupplierSuspended(
  id: string,
  suspended: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("suppliers").update({ suspended }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

export async function toggleSupplierVerified(id: string): Promise<{ ok: boolean; error?: string }> {
  const supplier = getSupplierById(id);
  if (!supplier) return { ok: false, error: "That store was not found." };
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("suppliers").update({ verified: !supplier.verified }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

export async function removeSupplier(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/* ------------------------------------------------------------
   Products
   ------------------------------------------------------------ */

export function useProducts(): Product[] {
  return useStore(() => products);
}

/** The published catalogue — what a buyer may see. */
export function useActiveProducts(): Product[] {
  return useStore(() => activeProducts);
}

export function productById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export function productBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

export function productsBySupplier(supplierId: string): Product[] {
  return products.filter((product) => product.supplierId === supplierId);
}

export function productsByCategory(categoryId: string): Product[] {
  return products.filter((product) => product.categoryId === categoryId);
}

export interface ProductInput {
  name: string;
  categoryId: string;
  description: string;
  price: number;
  unit: string;
  stock: number;
  brand: string;
  model: string;
  sku: string;
  specs: ProductSpec[];
  warranty: string;
  status: ProductStatus;
  image?: string;
  images: string[];
  tags?: string[];
}

/** Create a product for the signed-in supplier's store. */
export async function addProduct(input: ProductInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const supplierId = account?.supplierId;
  if (!supplierId) return { ok: false, error: "Your account is not linked to a store yet." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "A product needs a name." };

  const row: Database["public"]["Tables"]["products"]["Insert"] = {
    supplier_id: supplierId,
    category_id: input.categoryId || null,
    name,
    slug: uniqueProductSlug(name),
    description: input.description.trim(),
    price: Math.max(0, input.price),
    unit: input.unit.trim() || "unit",
    stock: Math.max(0, Math.trunc(input.stock)),
    brand: input.brand.trim(),
    model: input.model.trim(),
    sku: input.sku.trim(),
    // jsonb columns carry domain objects, so the cast is the boundary.
    specs: input.specs as unknown as Json,
    warranty: input.warranty.trim(),
    status: input.status,
    image: input.image ?? null,
    images: input.images,
    tags: input.tags ?? [],
  };

  const { data, error } = await supabase.from("products").insert(row).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };

  await loadMarketplace();
  return { ok: true, id: data?.id };
}

export async function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const update: ProductUpdate = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.categoryId !== undefined) update.category_id = input.categoryId || null;
  if (input.description !== undefined) update.description = input.description.trim();
  if (input.price !== undefined) update.price = Math.max(0, input.price);
  if (input.unit !== undefined) update.unit = input.unit.trim() || "unit";
  if (input.stock !== undefined) update.stock = Math.max(0, Math.trunc(input.stock));
  if (input.brand !== undefined) update.brand = input.brand.trim();
  if (input.model !== undefined) update.model = input.model.trim();
  if (input.sku !== undefined) update.sku = input.sku.trim();
  if (input.specs !== undefined) update.specs = input.specs as unknown as Json;
  if (input.warranty !== undefined) update.warranty = input.warranty.trim();
  if (input.status !== undefined) update.status = input.status;
  if (input.image !== undefined) update.image = input.image || null;
  if (input.images !== undefined) update.images = input.images;
  if (input.tags !== undefined) update.tags = input.tags;

  const { error } = await supabase.from("products").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/** Slugs must be unique across the marketplace. */
function uniqueProductSlug(name: string): string {
  const base = slugify(name) || "product";
  if (!products.some((product) => product.slug === base)) return base;
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------------------------------------
   Admin flags (products, orders, customers)
   ------------------------------------------------------------ */

export type ProductFlags = Record<string, { featured?: boolean; hidden?: boolean }>;
export type OrderStatusMap = Record<string, CustomerOrderStatus>;
export type CustomerFlags = Record<string, { blocked?: boolean }>;

/** Featured / hidden are real columns on the products table. */
export function useProductFlags(): ProductFlags {
  return useStore(() => productFlags);
}

/** Administrator: put a product in or take it out of the featured shelf. */
export async function toggleProductFeatured(id: string): Promise<{ ok: boolean; error?: string }> {
  const product = productById(id);
  if (!product) return { ok: false, error: "That product was not found." };
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase
    .from("products")
    .update({ featured: !product.popular })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

export async function setProductHidden(id: string, hidden: boolean): Promise<{ ok: boolean; error?: string }> {
  const product = productById(id);
  if (!product) return { ok: false, error: "That product was not found." };
  if (!supabase) return { ok: false, error: "No backend configured." };
  const nextStatus: ProductStatus = hidden ? "archived" : "active";
  const { error } = await supabase
    .from("products")
    .update({ hidden, status: nextStatus })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await loadMarketplace();
  return { ok: true };
}

/** The order status is the canonical column — no overrides any more. */
export function useOrderStatuses(): OrderStatusMap {
  return useStore(() => orderStatuses);
}

export async function setOrderStatus(
  id: string,
  status: CustomerOrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  const result = await updateCustomerOrderStatus(id, status, "Status updated by MedLink admin");
  if (result.ok) emit();
  return result;
}

export function effectiveOrderStatus(order: Order): CustomerOrderStatus {
  return order.status;
}

export function useCustomerFlags(): CustomerFlags {
  return useStore(() => customerFlags);
}

/** Administrator block flag — the server refuses blocked accounts at checkout. */
export async function setCustomerBlocked(id: string, blocked: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "No backend configured." };
  const { error } = await supabase.rpc("admin_set_customer_blocked", { target: id, blocked });
  if (error) return { ok: false, error: error.message };
  blockedAccounts = { ...blockedAccounts, [id]: blocked };
  emit();
  return { ok: true };
}

/* ------------------------------------------------------------
   Applications / KYC (admin queue)
   ------------------------------------------------------------ */

export function useApplications(): SupplierApplication[] {
  return useStore(() => applications);
}

/** The signed-in store owner's own KYC submission, when one exists. */
export function useOwnApplication(): SupplierApplication | undefined {
  return useStore(() => ownApplication);
}

export function getApplicationById(id: string): SupplierApplication | undefined {
  return applications.find((application) => application.id === id);
}

export function getApplicationByRef(ref: string): SupplierApplication | undefined {
  const term = ref.trim().toUpperCase();
  return applications.find((application) => application.ref.toUpperCase() === term);
}

/**
 * Approve or reject an application. The store already exists — the sign-up
 * trigger created it — so approval only publishes it and attaches it to the
 * applicant's account; rejection takes it back off the marketplace.
 */
export async function reviewApplication(
  id: string,
  status: KycStatus,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const application = getApplicationById(id);
  if (!application) return { ok: false, error: "That application was not found." };

  const result = await reviewSupplierApplicationOnBackend({ ref: application.ref }, status, note);
  if (result.status === "error") return { ok: false, error: result.error };
  if (result.status === "skipped") {
    return { ok: false, error: "That application is not on the server yet — it cannot be reviewed." };
  }
  await loadMarketplace();
  return { ok: true };
}

/* ------------------------------------------------------------
   Escrow & payouts (admin)
   ------------------------------------------------------------ */

export interface SupplierEscrow {
  heldAmount: number;
  orderCount: number;
  orderIds: string[];
  orderNumbers: string[];
  /** MedLink service fee retained on the held value */
  serviceFee: number;
}

/** Buyer funds MedLink still holds for a store (unreleased, non-cancelled rows). */
export function supplierEscrow(supplierId: string, released?: Record<string, string[]>): SupplierEscrow {
  const releasedMap = released ?? releasedOrders;
  const rows = getAllSupplierOrders().filter((order) => order.supplierId === supplierId);
  const cancelledOrderIds = new Set(
    getAllOrders().filter((order) => order.status === "cancelled").map((order) => order.id),
  );
  const releasedSet = new Set(releasedMap[supplierId] ?? []);

  const held = rows.filter((order) => {
    if (!order.orderId) return false;
    if (order.status === "cancelled") return false;
    if (cancelledOrderIds.has(order.orderId)) return false;
    return !releasedSet.has(order.orderId);
  });

  const heldAmount = held.reduce((sum, order) => sum + order.subtotal, 0);
  return {
    heldAmount,
    orderCount: held.length,
    orderIds: held.map((order) => order.orderId ?? ""),
    orderNumbers: held.map((order) => order.number),
    serviceFee: Math.round(heldAmount * pricing.serviceFeeRate),
  };
}

export function useReleasedOrders(): Record<string, string[]> {
  return useStore(() => releasedOrders);
}

/** Masked payout destination, e.g. "National Bank of Malawi · **4451". */
export function payoutAccountSummary(account?: SupplierOperatingAccount): string {
  if (!account) return "No payout account on file";
  return `${account.bankName} · **${account.accountNumber.trim().slice(-4)}`;
}

/**
 * Release every held order of a store to its payout account. The server
 * writes the payout row and the release ledger, so funds can never be
 * released twice.
 */
export async function releaseSupplierFunds(
  supplierId: string,
): Promise<{ ok: boolean; record?: PayoutRecord; error?: string }> {
  const escrow = supplierEscrow(supplierId);
  if (escrow.orderCount === 0 || escrow.heldAmount <= 0) {
    return { ok: false, error: "There are no held funds to release." };
  }

  const result = await callReleaseFunds(supplierId);
  if (!result.released) {
    return { ok: false, error: result.reason ?? "Nothing was released." };
  }
  await loadMarketplace();

  const record: PayoutRecord = {
    id: result.payout_id ?? "",
    supplierId,
    amount: result.amount ?? escrow.heldAmount,
    serviceFee: result.service_fee ?? escrow.serviceFee,
    orderNumbers: result.order_numbers ?? escrow.orderNumbers,
    releasedAt: new Date().toISOString(),
    method: "Bank transfer",
    accountSummary: payoutAccountSummary(getSupplierById(supplierId)?.operatingAccount),
  };
  return { ok: true, record };
}

export function usePayouts(): PayoutRecord[] {
  return useStore(() => payouts);
}

export function usePaymentTransactions(): PaymentTransaction[] {
  return useStore(() => payments);
}

export function getPaymentTransaction(id: string): PaymentTransaction | undefined {
  return payments.find((payment) => payment.id === id);
}
