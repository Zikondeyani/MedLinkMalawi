/* ============================================================
   MedLink — Domain types
   Kept independent from any backend so a future API can
   map onto these shapes.
   ============================================================ */

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  productCount: number;
  /** two hex colors used for category artwork */
  gradient: [string, string];
}

export interface SupplierDelivery {
  fee: number;
  estimate: string; // e.g. "1–2 days"
}

export interface SupplierOperatingAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch?: string;
  /** optional mobile money / airtime operating line (e.g. for payout via Mpamba) */
  mobileMoney?: string;
}

export interface Supplier {
  id: string;
  /** KYC application that created this supplier tenant, when applicable. */
  applicationId?: string;
  name: string;
  slug: string;
  color: string;
  verified: boolean;
  /** admin-controlled: hidden from the public marketplace while suspended */
  suspended?: boolean;
  category: string;
  rating: number;
  reviewCount: number;
  productCount: number;
  location: { city: string; area: string };
  phone: string;
  email: string;
  description: string;
  bannerGradient: [string, string];
  delivery: SupplierDelivery;
  joined: string;
  /** number of artwork tiles for the store banner */
  art: number;
  /** required at registration — where MedLink sends supplier payouts (escrow release) */
  operatingAccount?: SupplierOperatingAccount;
  /** Cloudinary URL of the store cover image (falls back to the gradient). */
  bannerImage?: string;
  /** Cloudinary URL of the store logo (falls back to the initials avatar). */
  logoImage?: string;
}

/** A settled escrow release — MedLink released held buyer funds to a supplier's payout account. */
export interface PayoutRecord {
  id: string;
  supplierId: string;
  /** product value paid out to the supplier */
  amount: number;
  /** MedLink 10% service fee retained on those orders */
  serviceFee: number;
  /** order numbers settled by this release */
  orderNumbers: string[];
  releasedAt: string; // ISO
  method: string; // e.g. "Bank transfer"
  /** masked destination, e.g. "National Bank of Malawi · **4451" */
  accountSummary: string;
}

/** A buyer payment attempt into MedLink (succeeds → funds enter escrow). */
export type PaymentTransactionStatus = "succeeded" | "failed" | "refunded";

export interface PaymentTransaction {
  id: string;
  /** buyer-facing order, absent when the payment failed before an order was created */
  orderId?: string;
  /** Authenticated buyer who owns the order, when known. */
  customerEmail?: string;
  orderNumber: string;
  customerName: string;
  method: PaymentMethod;
  reference: string; // e.g. "Airtel · xx3451"
  /** total the buyer paid / attempted: goods + service fee + delivery */
  amount: number;
  goods: number;
  serviceFee: number;
  deliveryFee: number;
  status: PaymentTransactionStatus;
  paidAt: string; // ISO
  failureReason?: string;
  refundedAt?: string;
}

/** Platform-wide pricing the admin controls (no longer hard-coded). */
export interface PricingConfig {
  /** MedLink service fee as a fraction of product value, e.g. 0.1 = 10%. */
  serviceFeeRate: number;
  /** Delivery fee by city name (MWK), e.g. "Lilongwe": 5000. */
  deliveryFees: Record<string, number>;
  /** Delivery fee for cities not listed (MWK). */
  defaultDeliveryFee: number;
}

/** Delivery fee quote shown to a buyer for a city. */
export interface DeliveryQuote {
  baseFee: number;
  estimated: string; // e.g. "1–2 days"
}

export interface ProductSpec {
  label: string;
  value: string;
}

export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  supplierId: string;
  description: string;
  price: number;
  unit: string;
  stock: number;
  brand: string;
  model: string;
  sku: string;
  specs: ProductSpec[];
  warranty: string;
  rating: number;
  reviewCount: number;
  isNew: boolean;
  popular: boolean;
  /** Administrator "hidden" flag — pulled from the marketplace without being deleted. */
  hidden: boolean;
  createdAt: string;
  status: ProductStatus;
  tags: string[];
  /** Cloudinary URL of the main photo — the product's own folder. */
  image?: string;
  /** Every uploaded photo, in the order the supplier added them. */
  images: string[];
}

export interface DeliveryAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  instructions: string;
  label?: string;
}

export interface SavedAddress extends DeliveryAddress {
  id: string;
  customerEmail: string;
  isDefault: boolean;
}

export type PaymentMethod = "Mobile Money" | "Bank Card" | "Bank Transfer";

export interface PaymentInfo {
  method: PaymentMethod;
  reference: string;
}

export interface OrderLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  supplierId: string;
  supplierName: string;
  image: string;
}

export type CustomerOrderStatus =
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export interface OrderTimelineEntry {
  status: CustomerOrderStatus;
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  /** Authenticated account that owns this order. */
  customerEmail: string;
  number: string;
  placedAt: string;
  customerName: string;
  address: DeliveryAddress;
  lines: OrderLine[];
  subtotal: number;
  /** MedLink service fee captured for this order, when available. */
  serviceFee?: number;
  deliveryFee: number;
  total: number;
  status: CustomerOrderStatus;
  payment: PaymentInfo;
  estimatedDelivery: string;
  timeline: OrderTimelineEntry[];
}

/* ---- Supplier side ---- */

export type SupplierOrderStatus = "new" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export interface RefundAccount {
  id: string;
  label: string;
  method: "mobile_money" | "bank_account";
  provider: string;
  accountName: string;
  accountNumber: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  supplierOrderId: string;
  supplierId: string;
  customerId: string;
  orderNumber: string;
  amount: number;
  status: "awaiting_account" | "pending" | "processing" | "refunded";
  refundAccountId: string | null;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface SupplierOrderLine {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  unit: string;
}

export interface SupplierOrder {
  id: string;
  /** Canonical customer order this projection was derived from, when applicable. */
  orderId?: string;
  /** Authenticated buyer, when this is a checkout-created projection. */
  customerEmail?: string;
  /** Supplier tenant allowed to view and fulfil this order. */
  supplierId: string;
  number: string;
  placedAt: string;
  customerName: string;
  customerOrg: string;
  customerPhone: string;
  city: string;
  area: string;
  lines: SupplierOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: SupplierOrderStatus;
  itemsTotal: number;
  paymentMethod: PaymentMethod;
  note: string;
}

export interface NotificationItem {
  id: string;
  type: "order" | "delivery" | "payment" | "system";
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: "package" | "truck" | "wallet" | "info";
  /** Optional ownership/tenant scope used by the notification provider. */
  customerEmail?: string;
  supplierId?: string;
  orderId?: string;
  orderNumber?: string;
}

/* ---- Supplier onboarding / KYC ---- */

export type KycStatus = "pending" | "approved" | "rejected";

export interface ApplicationDocument {
  label: string;
  name: string;
  size: string;
  uploadedAt: string;
  /** Cloudinary HTTPS URL — the file path stored in the database. */
  url?: string;
  /** Cloudinary public id — stable handle for transforms or deletes. */
  publicId?: string;
}

export interface SupplierApplication {
  id: string;
  ref: string; // e.g. "APL-2026-048"
  businessName: string;
  businessType: string;
  categoryFocus: string;
  website?: string;
  email: string;
  phone: string;
  city: string;
  area: string;
  registrationNumber: string;
  directorName: string;
  directorIdType: string;
  directorIdNumber: string;
  documents: ApplicationDocument[];
  status: KycStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** where MedLink sends supplier payouts once the escrowed sale is released */
  operatingAccount?: SupplierOperatingAccount;
}