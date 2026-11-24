import type { Timestamp } from 'firebase/firestore';

export type ProductCategory =
  | 'ladies-bags'
  | 'mens-bags'
  | 'laptop-bags'
  | 'clothes'
  | 'kids-bags'
  | 'toys';

export type PaymentMethod = 'card' | 'upi' | 'cod';
export type PaymentStatus = 'paid' | 'pending_cod' | 'refunded';

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: ProductCategory;
  price: number;
  compareAtPrice?: number;
  stock: number;
  description: string;
  material: string;
  dimensions: string;
  colors: string[];
  imageUrl: string;
  featured: boolean;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  isPreviewOnly?: boolean;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CartItem {
  product: Product;
  color: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  sku: string;
  category: ProductCategory;
  color: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentRef: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
  status: OrderStatus;
  trackingCode: string;
  carrier: string;
  estimatedDelivery: string;
  statusNote: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ActiveView = 'storefront' | 'product' | 'checkout' | 'orders' | 'admin';
