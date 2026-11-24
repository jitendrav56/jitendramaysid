import type { OrderStatus, Product, ProductCategory } from '../types';

export const HERO_IMAGE_URL = '/src/assets/images/hero_atelier_carry_1795485543108.jpg';

export const STUDIO_IMAGE_PRESETS: { label: string; url: string; category: ProductCategory }[] = [
  {
    label: 'Ladies Espresso Leather Tote',
    url: '/src/assets/images/product_ladies_tote_1795485548113.jpg',
    category: 'ladies-bags',
  },
  {
    label: 'Ladies Ivory Crossbody Bag',
    url: '/src/assets/images/product_ladies_crossbody_1795485560851.jpg',
    category: 'ladies-bags',
  },
  {
    label: 'Mens Full-Grain Weekender Duffel',
    url: '/src/assets/images/product_mens_weekender_1795485549164.jpg',
    category: 'mens-bags',
  },
  {
    label: 'Mens Waxed Canvas Messenger',
    url: '/src/assets/images/product_mens_messenger_1795485550718.jpg',
    category: 'mens-bags',
  },
  {
    label: 'Commuter 16" Laptop Backpack',
    url: '/src/assets/images/product_laptop_backpack_1795485548320.jpg',
    category: 'laptop-bags',
  },
  {
    label: 'Organic Twill Overshirt & Knit',
    url: '/src/assets/images/product_apparel_overshirt_1795485550174.jpg',
    category: 'clothes',
  },
  {
    label: 'Kids Explorer Canvas Backpack',
    url: '/src/assets/images/product_kids_backpack_1795485548560.jpg',
    category: 'kids-bags',
  },
  {
    label: 'Heirloom Wooden Blocks & Train',
    url: '/src/assets/images/product_wooden_toys_1795485561320.jpg',
    category: 'toys',
  },
];

export const CATEGORIES: { id: ProductCategory | 'all'; label: string; shortDesc: string }[] = [
  { id: 'all', label: 'All Goods', shortDesc: 'Complete curated catalog' },
  { id: 'ladies-bags', label: 'Ladies Bags', shortDesc: 'Structured totes & crossbodies' },
  { id: 'mens-bags', label: 'Mens Bags', shortDesc: 'Full-grain weekenders & satchels' },
  { id: 'laptop-bags', label: 'Laptop Bags', shortDesc: 'Weatherproof daily tech carry' },
  { id: 'clothes', label: 'Clothes', shortDesc: 'Heavyweight organic staples' },
  { id: 'kids-bags', label: 'Kids Bags', shortDesc: 'Ergonomic school backpacks' },
  { id: 'toys', label: 'Toys', shortDesc: 'Heirloom natural wooden play' },
];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  'ladies-bags': 'Ladies Bags',
  'mens-bags': 'Mens Bags',
  'laptop-bags': 'Laptop Bags',
  clothes: 'Clothes',
  'kids-bags': 'Kids Bags',
  toys: 'Toys',
};

export const ORDER_STATUS_PIPELINE: {
  key: OrderStatus;
  label: string;
  description: string;
}[] = [
  { key: 'placed', label: 'Order Placed', description: 'Payment verified and order received.' },
  { key: 'confirmed', label: 'Confirmed', description: 'Inventory allocated at our studio.' },
  { key: 'packed', label: 'Packed', description: 'Quality checked and sealed for dispatch.' },
  { key: 'shipped', label: 'Shipped', description: 'Handed over to courier transit network.' },
  { key: 'out_for_delivery', label: 'Out for Delivery', description: 'Courier is en route to your address.' },
  { key: 'delivered', label: 'Delivered', description: 'Package delivered and signed.' },
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const FREE_SHIPPING_THRESHOLD = 150;
export const STANDARD_SHIPPING_FEE = 12;
export const TAX_RATE = 0.08;

export const INITIAL_STARTER_PRODUCTS: Omit<Product, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'prod-espresso-leather-tote',
    name: 'Aethel Pebble Leather Tote',
    slug: 'aethel-pebble-leather-tote',
    sku: 'KG-LB-101',
    category: 'ladies-bags',
    price: 198,
    compareAtPrice: 235,
    stock: 18,
    description:
      'Architectural daily tote handcrafted from full-grain Italian pebble calfskin with a recessed zip top, detachable shoulder strap, and padded 14-inch tablet sleeve.',
    material: 'Full-grain Italian pebble leather, brushed brass fittings',
    dimensions: '38 cm × 28 cm × 14 cm · 820 g',
    colors: ['Espresso', 'Warm Stone', 'Onyx'],
    imageUrl: '/src/assets/images/product_ladies_tote_1795485548113.jpg',
    featured: true,
    active: true,
  },
  {
    id: 'prod-cognac-mens-weekender',
    name: 'Nordic Full-Grain Leather Weekender',
    slug: 'nordic-full-grain-leather-weekender',
    sku: 'KG-MB-204',
    category: 'mens-bags',
    price: 265,
    compareAtPrice: 310,
    stock: 12,
    description:
      'Cabin-compliant 42L mens travel duffel cut from vegetable-tanned saddle hide that develops a rich patina over years of flights and weekend drives.',
    material: 'Vegetable-tanned cowhide, matte black YKK Excella zips',
    dimensions: '52 cm × 28 cm × 25 cm · 1.6 kg',
    colors: ['Saddle Tan', 'Dark Walnut'],
    imageUrl: '/src/assets/images/product_mens_weekender_1795485549164.jpg',
    featured: true,
    active: true,
  },
  {
    id: 'prod-commuter-laptop-backpack',
    name: 'Apex 16" Weatherproof Laptop Pack',
    slug: 'apex-16-weatherproof-laptop-pack',
    sku: 'KG-LP-309',
    category: 'laptop-bags',
    price: 148,
    compareAtPrice: 175,
    stock: 24,
    description:
      'Engineered for daily commuters in 1680D water-repellent ballistic nylon with a suspended 16-inch laptop vault, magnetic aluminum buckle, and luggage pass-through.',
    material: '1680D recycled ballistic nylon, anodized aluminum hardware',
    dimensions: '46 cm × 31 cm × 16 cm · 22 L',
    colors: ['Charcoal', 'Slate Navy'],
    imageUrl: '/src/assets/images/product_laptop_backpack_1795485548320.jpg',
    featured: true,
    active: true,
  },
  {
    id: 'prod-ivory-sculpted-crossbody',
    name: 'Clara Structured Calfskin Crossbody',
    slug: 'clara-structured-calfskin-crossbody',
    sku: 'KG-LB-112',
    category: 'ladies-bags',
    price: 156,
    stock: 15,
    description:
      'Minimalist curved-flap crossbody bag in smooth matte ivory leather with a custom brass turn-lock closure, accordion gussets, and convertible shoulder strap.',
    material: 'Smooth matte calfskin, microfiber suede lining',
    dimensions: '23 cm × 17 cm × 8 cm · 440 g',
    colors: ['Ivory', 'Obsidian', 'Taupe'],
    imageUrl: '/src/assets/images/product_ladies_crossbody_1795485560851.jpg',
    featured: false,
    active: true,
  },
  {
    id: 'prod-waxed-canvas-messenger',
    name: 'Field Waxed Canvas Laptop Messenger',
    slug: 'field-waxed-canvas-laptop-messenger',
    sku: 'KG-MB-218',
    category: 'mens-bags',
    price: 178,
    stock: 14,
    description:
      'Rugged mens work satchel crafted from Scottish 18 oz dry-waxed cotton canvas reinforced with harness leather base panels and a cushioned 15-inch laptop compartment.',
    material: '18 oz dry-waxed cotton canvas, harness leather trim',
    dimensions: '40 cm × 30 cm × 12 cm · 1.25 kg',
    colors: ['Field Olive', 'Charcoal'],
    imageUrl: '/src/assets/images/product_mens_messenger_1795485550718.jpg',
    featured: false,
    active: true,
  },
  {
    id: 'prod-organic-twill-overshirt',
    name: 'Heavyweight Twill Overshirt & Merino Knit',
    slug: 'heavyweight-twill-overshirt-merino-knit',
    sku: 'KG-CL-405',
    category: 'clothes',
    price: 134,
    compareAtPrice: 160,
    stock: 28,
    description:
      'Structured 340 gsm organic cotton utility overshirt in slate navy paired with our breathable 100% Australian extra-fine merino crewneck for effortless all-season layering.',
    material: '100% GOTS organic cotton twill & extra-fine merino wool',
    dimensions: 'Relaxed tailored fit · Sizes S, M, L, XL',
    colors: ['Slate Navy / Heather', 'Olive / Oatmeal'],
    imageUrl: '/src/assets/images/product_apparel_overshirt_1795485550174.jpg',
    featured: true,
    active: true,
  },
  {
    id: 'prod-kids-explorer-pack',
    name: 'Oak & Pine Kids School Backpack',
    slug: 'oak-and-pine-kids-school-backpack',
    sku: 'KG-KB-502',
    category: 'kids-bags',
    price: 64,
    stock: 32,
    description:
      'Lightweight, water-resistant organic canvas school pack with ergonomic air-mesh straps, chest sternum clip, dual bottle sleeves, and an easy-grip front snack pocket.',
    material: 'Organic water-repellent cotton canvas, breathable air-mesh',
    dimensions: '35 cm × 26 cm × 13 cm · 14 L (Ages 4–10)',
    colors: ['Sage & Ochre', 'Sky & Sand'],
    imageUrl: '/src/assets/images/product_kids_backpack_1795485548560.jpg',
    featured: false,
    active: true,
  },
  {
    id: 'prod-beechwood-block-train',
    name: 'Heirloom Beechwood Blocks & Train Set',
    slug: 'heirloom-beechwood-blocks-train-set',
    sku: 'KG-TY-601',
    category: 'toys',
    price: 58,
    stock: 22,
    description:
      'Hand-sanded 28-piece architectural wooden building block set paired with a smooth rolling three-car wooden pull train finished in child-safe water-based mineral pigments.',
    material: 'FSC-certified European beechwood, non-toxic EN71 pigments',
    dimensions: '28 blocks + 3-car train · Ages 2+ · Cotton storage bag',
    colors: ['Natural & Nordic Muted'],
    imageUrl: '/src/assets/images/product_wooden_toys_1795485561320.jpg',
    featured: false,
    active: true,
  },
];

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatShortDate(timestamp?: { toDate?: () => Date } | null): string {
  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return 'Just now';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp.toDate());
}

export function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned.length >= 2 ? cleaned : `item-${Date.now()}`;
}

export function sanitizeSku(input: string): string {
  const cleaned = input
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned.length >= 2 ? cleaned : `KG-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generateOrderNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `KG-${suffix}`;
}

export function generateEstimatedDeliveryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 4);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
