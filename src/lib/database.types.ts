/* ============================================================
   MedLink — database types (hand-maintained, generated-style)
   Mirrors supabase/migrations/*. Re-generate with the Supabase CLI
   once more migrations land:

     npx supabase gen types typescript --project-id <ref> \
       --schema public > src/lib/database.types.ts
   ============================================================ */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Account role — decided by HOW the account was created. */
export type UserRole = "customer" | "supplier" | "admin";

/** Active accounts can sign in; suspended accounts cannot. */
export type AccountStatus = "active" | "suspended";

export type KycStatus = "pending" | "approved" | "rejected";

export type ProductStatus = "active" | "draft" | "archived";

export type CustomerOrderStatus =
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type SupplierOrderStatus = "new" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export type RefundAccountMethod = "mobile_money" | "bank_account";
export type RefundRequestStatus = "awaiting_account" | "pending" | "processing" | "refunded";

export type PaymentMethod = "Mobile Money" | "Bank Card" | "Bank Transfer";

export type PaymentStatus = "succeeded" | "failed" | "refunded";

export type NotificationType = "order" | "delivery" | "payment" | "system";

// NB: these are type aliases (not interfaces) on purpose — the Supabase client
// generic requires table rows to be assignable to Record<string, unknown>, and
// only object *type literals* get an implicit index signature.

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  organization: string;
  about: string;
  role: UserRole;
  status: AccountStatus;
  /** Marketplace tenant id for an approved supplier account. */
  supplier_id: string | null;
  /** Cloudinary URL of the account profile photo. */
  avatar_url: string | null;
  /** Administrator block flag for customer accounts. */
  blocked: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierApplicationRow = {
  id: string;
  ref: string;
  applicant_id: string | null;
  business_name: string;
  business_type: string;
  category_focus: string;
  website: string | null;
  contact_email: string;
  phone: string;
  city: string;
  area: string;
  registration_number: string;
  director_name: string;
  director_id_type: string;
  director_id_number: string;
  operating_account: Json | null;
  documents: Json;
  status: KycStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

export type ApplicationStatusRow = {
  ref: string;
  business_name: string;
  status: KycStatus;
  submitted_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  gradient: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SupplierRow = {
  id: string;
  application_id: string | null;
  owner_id: string | null;
  name: string;
  slug: string;
  category: string;
  color: string;
  verified: boolean;
  suspended: boolean;
  rating: number;
  review_count: number;
  city: string;
  area: string;
  phone: string;
  email: string;
  description: string;
  banner_gradient: string[];
  /** Cloudinary HTTPS URL of the store cover image. */
  banner_image: string | null;
  /** Cloudinary HTTPS URL of the store logo. */
  logo_image: string | null;
  delivery_fee: number;
  delivery_estimate: string;
  operating_account: Json | null;
  joined: string;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  supplier_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  unit: string;
  stock: number;
  brand: string;
  model: string;
  sku: string;
  specs: Json;
  warranty: string;
  is_new: boolean;
  /** Admin "featured" flag — surfaces in the marketplace. */
  featured: boolean;
  /** Admin "hidden" flag — removed from the marketplace. */
  hidden: boolean;
  tags: string[];
  /** Primary Cloudinary image URL. */
  image: string | null;
  /** Every uploaded Cloudinary image URL, in display order. */
  images: string[];
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  number: string;
  customer_id: string | null;
  customer_email: string;
  customer_name: string;
  address: Json;
  subtotal: number;
  service_fee: number;
  delivery_fee: number;
  total: number;
  status: CustomerOrderStatus;
  payment_method: PaymentMethod;
  payment_reference: string;
  estimated_delivery: string;
  timeline: Json;
  created_at: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  supplier_id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  image: string | null;
};

export type SupplierOrderRow = {
  id: string;
  order_id: string | null;
  supplier_id: string;
  number: string;
  customer_id: string | null;
  customer_email: string;
  customer_name: string;
  customer_org: string;
  customer_phone: string;
  city: string;
  area: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: SupplierOrderStatus;
  items_total: number;
  payment_method: PaymentMethod;
  note: string;
  created_at: string;
  updated_at: string;
};

export type PaymentRow = {
  id: string;
  order_id: string | null;
  order_number: string;
  customer_id: string | null;
  customer_email: string;
  customer_name: string;
  method: PaymentMethod;
  reference: string;
  amount: number;
  goods: number;
  service_fee: number;
  delivery_fee: number;
  status: PaymentStatus;
  failure_reason: string | null;
  paid_at: string;
  refunded_at: string | null;
};

export type PayoutRow = {
  id: string;
  supplier_id: string;
  amount: number;
  service_fee: number;
  order_numbers: string[];
  method: string;
  account_summary: string;
  released_by: string | null;
  released_at: string;
};

export type ReleasedOrderRow = {
  supplier_id: string;
  order_id: string;
  payout_id: string | null;
  released_at: string;
};

export type RefundAccountRow = {
  id: string;
  customer_id: string;
  label: string;
  method: RefundAccountMethod;
  provider: string;
  account_name: string;
  account_number: string;
  created_at: string;
  updated_at: string;
};

export type RefundRequestRow = {
  id: string;
  order_id: string;
  supplier_order_id: string;
  supplier_id: string;
  customer_id: string;
  order_number: string;
  amount: number;
  status: RefundRequestStatus;
  refund_account_id: string | null;
  admin_note: string;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type AddressRow = {
  id: string;
  customer_id: string | null;
  customer_email: string;
  full_name: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  instructions: string;
  label: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  icon: string;
  read: boolean;
  customer_id: string | null;
  customer_email: string | null;
  supplier_id: string | null;
  order_id: string | null;
  order_number: string | null;
  created_at: string;
};

export type SavedProductRow = {
  customer_id: string;
  product_id: string;
  created_at: string;
};

export type PricingConfigRow = {
  id: boolean;
  service_fee_rate: number;
  default_delivery_fee: number;
  delivery_fees: Json;
  updated_at: string;
};

/** Result of place_order(): the server recomputes every money value. */
export type PlaceOrderResult = {
  order_id: string;
  number: string;
  subtotal: number;
  service_fee: number;
  delivery_fee: number;
  total: number;
};

export type ReleaseFundsResult = {
  released: boolean;
  reason?: string;
  payout_id?: string;
  amount?: number;
  service_fee?: number;
  order_numbers?: string[];
};

type ProfileInsert = {
  id: string;
  email: string;
  full_name?: string;
  phone?: string | null;
  organization?: string;
  about?: string;
  role?: UserRole;
  status?: AccountStatus;
  supplier_id?: string | null;
  avatar_url?: string | null;
  blocked?: boolean;
};

type ProfileUpdate = Partial<Omit<ProfileRow, "id" | "created_at" | "updated_at">>;

type SupplierApplicationInsert = {
  id?: string;
  ref?: string;
  applicant_id?: string | null;
  business_name: string;
  business_type: string;
  category_focus: string;
  website?: string | null;
  contact_email: string;
  phone: string;
  city: string;
  area: string;
  registration_number: string;
  director_name: string;
  director_id_type: string;
  director_id_number: string;
  operating_account?: Json | null;
  documents?: Json;
  status?: KycStatus;
};

// `submitted_at` is updatable on purpose: a corrected application has to move
// back to the front of the admin queue, which is ordered by (status, submitted_at desc).
type SupplierApplicationUpdate = Partial<Omit<SupplierApplicationRow, "id" | "ref">>;

type CategoryInsert = {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  gradient?: string[];
  sort_order?: number;
};

type CategoryUpdate = Partial<Omit<CategoryRow, "id" | "created_at" | "updated_at">>;

type SupplierInsert = {
  id?: string;
  application_id?: string | null;
  owner_id?: string | null;
  name: string;
  slug: string;
  category?: string;
  color?: string;
  city?: string;
  area?: string;
  phone?: string;
  email?: string;
  description?: string;
  verified?: boolean;
  suspended?: boolean;
  banner_gradient?: string[];
  banner_image?: string | null;
  logo_image?: string | null;
  delivery_fee?: number;
  delivery_estimate?: string;
  operating_account?: Json | null;
};

/**
 * Owners may change presentation only. The database trigger
 * guard_supplier_privileges() is what actually blocks trust columns, so this
 * type stays permissive for the admin console.
 */
type SupplierUpdate = Partial<Omit<SupplierRow, "id" | "application_id" | "owner_id" | "joined" | "created_at" | "updated_at">>;

type ProductInsert = {
  id?: string;
  supplier_id: string;
  category_id?: string | null;
  name: string;
  slug: string;
  description?: string;
  price?: number;
  unit?: string;
  stock?: number;
  brand?: string;
  model?: string;
  sku?: string;
  specs?: Json;
  warranty?: string;
  is_new?: boolean;
  tags?: string[];
  image?: string | null;
  images?: string[];
  status?: ProductStatus;
};

type ProductUpdate = Partial<Omit<ProductRow, "id" | "supplier_id" | "created_at" | "updated_at">>;

type AddressInsert = {
  customer_id?: string | null;
  customer_email: string;
  full_name: string;
  phone?: string;
  address?: string;
  city?: string;
  area?: string;
  instructions?: string;
  label?: string | null;
  is_default?: boolean;
};

type AddressUpdate = Partial<Omit<AddressRow, "id" | "customer_id" | "customer_email" | "created_at" | "updated_at">>;

type NotificationUpdate = Partial<Pick<NotificationRow, "read" | "title" | "message">>;

type RefundAccountInsert = Omit<RefundAccountRow, "id" | "created_at" | "updated_at">;
type RefundAccountUpdate = Partial<Omit<RefundAccountRow, "id" | "customer_id" | "created_at" | "updated_at">>;
type RefundRequestUpdate = Partial<Pick<RefundRequestRow, "status" | "admin_note" | "processed_at">>;

type PricingConfigUpdate = Partial<Omit<PricingConfigRow, "id" | "updated_at">>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      supplier_applications: {
        Row: SupplierApplicationRow;
        Insert: SupplierApplicationInsert;
        Update: SupplierApplicationUpdate;
        Relationships: [];
      };
      categories: {
        Row: CategoryRow;
        Insert: CategoryInsert;
        Update: CategoryUpdate;
        Relationships: [];
      };
      suppliers: {
        Row: SupplierRow;
        Insert: SupplierInsert;
        Update: SupplierUpdate;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: ProductInsert;
        Update: ProductUpdate;
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: never;
        Update: Partial<OrderRow>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItemRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_orders: {
        Row: SupplierOrderRow;
        Insert: never;
        Update: Partial<SupplierOrderRow>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: never;
        Update: Partial<PaymentRow>;
        Relationships: [];
      };
      payouts: {
        Row: PayoutRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      released_orders: {
        Row: ReleasedOrderRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      refund_accounts: {
        Row: RefundAccountRow;
        Insert: RefundAccountInsert;
        Update: RefundAccountUpdate;
        Relationships: [];
      };
      refund_requests: {
        Row: RefundRequestRow;
        Insert: never;
        Update: RefundRequestUpdate;
        Relationships: [];
      };
      addresses: {
        Row: AddressRow;
        Insert: AddressInsert;
        Update: AddressUpdate;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: never;
        Update: NotificationUpdate;
        Relationships: [];
      };
      saved_products: {
        Row: SavedProductRow;
        Insert: Omit<SavedProductRow, "created_at">;
        Update: never;
        Relationships: [];
      };
      pricing_config: {
        Row: PricingConfigRow;
        Insert: Partial<PricingConfigRow>;
        Update: PricingConfigUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      current_profile: { Args: Record<string, never>; Returns: ProfileRow };
      owns_supplier: { Args: { target: string }; Returns: boolean };
      slugify: { Args: { text: string }; Returns: string };
      application_status_by_ref: {
        Args: { application_ref: string };
        Returns: ApplicationStatusRow[];
      };
      submit_supplier_application: {
        Args: {
          p_business_name: string;
          p_business_type: string;
          p_category_focus: string;
          p_contact_email: string;
          p_phone: string;
          p_city: string;
          p_area: string;
          p_registration_number: string;
          p_director_name: string;
          p_director_id_type: string;
          p_director_id_number: string;
          p_website?: string | null;
          p_operating_account?: Json | null;
          p_documents?: Json;
        };
        Returns: SupplierApplicationRow;
      };
      place_order: {
        Args: {
          p_items: Json;
          p_address: Json;
          p_payment_method: PaymentMethod;
          p_payment_reference: string;
          p_estimated_delivery?: string | null;
        };
        Returns: PlaceOrderResult;
      };
      customer_confirm_delivery: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      supplier_cancel_order: {
        Args: { p_supplier_order_id: string };
        Returns: undefined;
      };
      customer_select_refund_account: {
        Args: { p_refund_id: string; p_refund_account_id: string };
        Returns: undefined;
      };
      admin_release_supplier_funds: {
        Args: { target_supplier: string };
        Returns: ReleaseFundsResult;
      };
      admin_set_customer_blocked: {
        Args: { target: string; blocked: boolean };
        Returns: ProfileRow;
      };
      admin_set_account_role: {
        Args: { target: string; new_role: UserRole };
        Returns: ProfileRow;
      };
      admin_set_account_status: {
        Args: { target: string; new_status: AccountStatus };
        Returns: ProfileRow;
      };
      admin_review_supplier_application: {
        Args: {
          application_id: string;
          decision: KycStatus;
          note?: string | null;
          tenant_id?: string | null;
        };
        Returns: SupplierApplicationRow;
      };
    };
    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      kyc_status: KycStatus;
      product_status: ProductStatus;
      customer_order_status: CustomerOrderStatus;
      supplier_order_status: SupplierOrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      notification_type: NotificationType;
    };
    CompositeTypes: Record<string, never>;
  };
}
