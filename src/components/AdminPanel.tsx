import { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Database,
  Edit3,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Order, OrderStatus, PaymentStatus, Product, ProductCategory } from '../types';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  INITIAL_STARTER_PRODUCTS,
  ORDER_STATUS_LABELS,
  STUDIO_IMAGE_PRESETS,
  formatPrice,
  formatShortDate,
  sanitizeSku,
  slugify,
} from '../data/catalog';
import { SafeImage } from './SafeImage';

interface AdminPanelProps {
  products: Product[];
  orders: Order[];
  onBackToStore: () => void;
}

interface ProductFormState {
  id: string | null;
  name: string;
  sku: string;
  category: ProductCategory;
  price: string;
  compareAtPrice: string;
  stock: string;
  material: string;
  dimensions: string;
  colorsText: string;
  imageUrl: string;
  description: string;
  featured: boolean;
  active: boolean;
}

const EMPTY_FORM: ProductFormState = {
  id: null,
  name: '',
  sku: '',
  category: 'ladies-bags',
  price: '120',
  compareAtPrice: '',
  stock: '15',
  material: '',
  dimensions: '',
  colorsText: 'Charcoal, Espresso',
  imageUrl: STUDIO_IMAGE_PRESETS[0].url,
  description: '',
  featured: false,
  active: true,
};

const ALL_ORDER_STATUSES: OrderStatus[] = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

export function AdminPanel({ products, orders, onBackToStore }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders'>('inventory');
  const [showProductForm, setShowProductForm] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [savingProduct, setSavingProduct] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Order management filter & inline edit state
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<{
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    carrier: string;
    trackingCode: string;
    estimatedDelivery: string;
    statusNote: string;
  }>({
    status: 'placed',
    paymentStatus: 'paid',
    carrier: '',
    trackingCode: '',
    estimatedDelivery: '',
    statusNote: '',
  });
  const [savingOrder, setSavingOrder] = useState(false);

  const persistedProducts = useMemo(
    () => products.filter((p) => !p.isPreviewOnly),
    [products]
  );

  const metrics = useMemo(() => {
    const grossRevenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0);
    const activeOrders = orders.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    ).length;
    const lowStockCount = persistedProducts.filter((p) => p.stock <= 5).length;
    return {
      grossRevenue,
      activeOrders,
      totalProducts: persistedProducts.length,
      lowStockCount,
    };
  }, [orders, persistedProducts]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'all') return orders;
    return orders.filter((o) => o.status === orderStatusFilter);
  }, [orders, orderStatusFilter]);

  function openCreateForm() {
    setForm({
      ...EMPTY_FORM,
      sku: `KG-${Math.floor(1000 + Math.random() * 8999)}`,
    });
    setShowProductForm(true);
    setFeedback(null);
  }

  function openEditForm(product: Product) {
    setForm({
      id: product.isPreviewOnly ? null : product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
      stock: String(product.stock),
      material: product.material,
      dimensions: product.dimensions,
      colorsText: product.colors.join(', '),
      imageUrl: product.imageUrl,
      description: product.description,
      featured: product.featured,
      active: product.active,
    });
    setShowProductForm(true);
    setFeedback(null);
  }

  async function handleSeedStarterCatalog() {
    setSeeding(true);
    setFeedback(null);
    try {
      const batch = writeBatch(db);
      for (const starter of INITIAL_STARTER_PRODUCTS) {
        const ref = doc(db, 'products', starter.id);
        const payload: Record<string, unknown> = {
          name: starter.name,
          slug: starter.slug,
          sku: starter.sku,
          category: starter.category,
          price: starter.price,
          stock: starter.stock,
          description: starter.description,
          material: starter.material,
          dimensions: starter.dimensions,
          colors: starter.colors,
          imageUrl: starter.imageUrl,
          featured: starter.featured,
          active: starter.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (typeof starter.compareAtPrice === 'number') {
          payload.compareAtPrice = starter.compareAtPrice;
        }
        batch.set(ref, payload);
      }
      await batch.commit();
      setFeedback({
        type: 'success',
        text: 'Starter catalog synced to Cloud Firestore with live inventory.',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    } finally {
      setSeeding(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const name = form.name.trim().slice(0, 120);
    const sku = sanitizeSku(form.sku);
    const slug = slugify(name);
    const price = Number(form.price);
    const compareAtRaw = form.compareAtPrice.trim();
    const compareAtPrice = compareAtRaw ? Number(compareAtRaw) : undefined;
    const stock = Math.max(0, Math.min(100000, Math.floor(Number(form.stock))));
    const description = form.description.trim().slice(0, 1200);
    const material = form.material.trim().slice(0, 120);
    const dimensions = form.dimensions.trim().slice(0, 100);
    const imageUrl = form.imageUrl.trim().slice(0, 500) || STUDIO_IMAGE_PRESETS[0].url;
    const colors = form.colorsText
      .split(',')
      .map((c) => c.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 8);

    if (name.length < 2) {
      setFeedback({ type: 'error', text: 'Product name must be at least 2 characters.' });
      return;
    }
    if (!Number.isFinite(price) || price <= 0 || price > 1000000) {
      setFeedback({ type: 'error', text: 'Enter a valid price greater than 0.' });
      return;
    }
    if (description.length < 10) {
      setFeedback({ type: 'error', text: 'Description must be at least 10 characters for SEO.' });
      return;
    }
    if (colors.length === 0) {
      setFeedback({ type: 'error', text: 'Provide at least one color or finish variant.' });
      return;
    }

    setSavingProduct(true);
    const targetId = form.id || `prod-${slug.slice(0, 40)}-${Date.now().toString(36)}`;
    const path = `products/${targetId}`;

    try {
      const baseFields: Record<string, unknown> = {
        name,
        slug,
        sku,
        category: form.category,
        price: Number(price.toFixed(2)),
        stock,
        description,
        material,
        dimensions,
        colors,
        imageUrl,
        featured: form.featured,
        active: form.active,
        updatedAt: serverTimestamp(),
      };

      if (compareAtPrice !== undefined && Number.isFinite(compareAtPrice) && compareAtPrice > 0) {
        baseFields.compareAtPrice = Number(compareAtPrice.toFixed(2));
      }

      if (form.id) {
        await updateDoc(doc(db, 'products', form.id), baseFields);
        setFeedback({ type: 'success', text: `Updated "${name}" in live catalog.` });
      } else {
        await setDoc(doc(db, 'products', targetId), {
          ...baseFields,
          createdAt: serverTimestamp(),
        });
        setFeedback({ type: 'success', text: `Added "${name}" to live catalog.` });
      }
      setShowProductForm(false);
      setForm(EMPTY_FORM);
    } catch (error) {
      handleFirestoreError(error, form.id ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleQuickStockAdjust(product: Product, delta: number) {
    if (product.isPreviewOnly) return;
    const nextStock = Math.max(0, Math.min(100000, product.stock + delta));
    const path = `products/${product.id}`;
    try {
      await updateDoc(doc(db, 'products', product.id), {
        stock: nextStock,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async function handleToggleActive(product: Product) {
    if (product.isPreviewOnly) return;
    const path = `products/${product.id}`;
    try {
      await updateDoc(doc(db, 'products', product.id), {
        active: !product.active,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async function handleDeleteProduct(productId: string) {
    const path = `products/${productId}`;
    try {
      await deleteDoc(doc(db, 'products', productId));
      setConfirmDeleteId(null);
      setFeedback({ type: 'success', text: 'Product removed from catalog.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }

  function startOrderEdit(order: Order) {
    setEditingOrderId(order.id);
    setOrderDraft({
      status: order.status,
      paymentStatus: order.paymentStatus,
      carrier: order.carrier || 'Kova Express Courier',
      trackingCode: order.trackingCode || '',
      estimatedDelivery: order.estimatedDelivery || '',
      statusNote: order.statusNote || '',
    });
  }

  async function handleSaveOrderUpdate(orderId: string) {
    setSavingOrder(true);
    const path = `orders/${orderId}`;
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: orderDraft.status,
        paymentStatus: orderDraft.paymentStatus,
        carrier: orderDraft.carrier.trim().slice(0, 60),
        trackingCode: orderDraft.trackingCode.trim().slice(0, 40),
        estimatedDelivery: orderDraft.estimatedDelivery.trim().slice(0, 40),
        statusNote: orderDraft.statusNote.trim().slice(0, 200),
        updatedAt: serverTimestamp(),
      });
      setEditingOrderId(null);
      setFeedback({
        type: 'success',
        text: 'Order status and tracking details pushed live to customer.',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <button
            type="button"
            onClick={onBackToStore}
            className="inline-flex items-center gap-2 text-xs text-[#6B7280] hover:text-[#111317] transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Storefront</span>
          </button>
          <h1 className="text-3xl font-semibold text-[#111317]">Store Operations &amp; Admin</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {persistedProducts.length < INITIAL_STARTER_PRODUCTS.length && (
            <button
              type="button"
              onClick={handleSeedStarterCatalog}
              disabled={seeding}
              className="px-4 py-2.5 text-xs font-medium border border-[#D1D5DB] bg-white text-[#111317] hover:border-[#111317] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{seeding ? 'Syncing Catalog...' : 'Sync Starter Catalog'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={openCreateForm}
            className="px-4 py-2.5 text-xs font-medium bg-[#111317] text-white hover:bg-[#272B33] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#E5E7EB] p-5">
          <p className="text-xs text-[#6B7280] mb-1">Gross Revenue</p>
          <p className="text-2xl font-semibold text-[#111317] font-mono tabular-nums">
            {formatPrice(metrics.grossRevenue)}
          </p>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-5">
          <p className="text-xs text-[#6B7280] mb-1">Active Orders</p>
          <p className="text-2xl font-semibold text-[#111317] font-mono tabular-nums">
            {metrics.activeOrders}
          </p>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-5">
          <p className="text-xs text-[#6B7280] mb-1">Published Products</p>
          <p className="text-2xl font-semibold text-[#111317] font-mono tabular-nums">
            {metrics.totalProducts}
          </p>
        </div>
        <div className="bg-white border border-[#E5E7EB] p-5">
          <p className="text-xs text-[#6B7280] mb-1">Low Stock Alerts (&le; 5)</p>
          <p
            className={`text-2xl font-semibold font-mono tabular-nums ${
              metrics.lowStockCount > 0 ? 'text-[#B45309]' : 'text-[#111317]'
            }`}
          >
            {metrics.lowStockCount}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-6 px-4 py-3 text-xs border flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
              : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notice"
            className="p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="flex items-center gap-6 border-b border-[#E5E7EB] mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-[#111317] text-[#111317]'
              : 'border-transparent text-[#6B7280] hover:text-[#111317]'
          }`}
        >
          Products &amp; Inventory ({persistedProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-[#111317] text-[#111317]'
              : 'border-transparent text-[#6B7280] hover:text-[#111317]'
          }`}
        >
          Orders &amp; Live Tracking ({orders.length})
        </button>
      </div>

      {/* Add / Edit Product Form Drawer Panel */}
      {showProductForm && (
        <div className="mb-8 bg-white border border-[#111317] p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[#111317]">
              {form.id ? 'Edit Product' : 'Create New Product'}
            </h2>
            <button
              type="button"
              onClick={() => setShowProductForm(false)}
              aria-label="Close product form"
              className="p-1.5 text-[#6B7280] hover:text-[#111317]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Product Name
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Atelier Structured Leather Satchel"
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as ProductCategory })
                }
                className="w-full px-3 py-2 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
              >
                {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                SKU Code
              </label>
              <input
                type="text"
                required
                maxLength={40}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                placeholder="KG-LB-109"
                className="w-full px-3.5 py-2 text-sm font-mono border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3.5 py-2 text-sm font-mono border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Compare-at Price (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.compareAtPrice}
                onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })}
                placeholder="Optional"
                className="w-full px-3.5 py-2 text-sm font-mono border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Inventory Stock
              </label>
              <input
                type="number"
                min="0"
                max="100000"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="w-full px-3.5 py-2 text-sm font-mono border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Finishes / Colors (comma separated)
              </label>
              <input
                type="text"
                required
                value={form.colorsText}
                onChange={(e) => setForm({ ...form, colorsText: e.target.value })}
                placeholder="Espresso, Onyx, Ivory"
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Materials &amp; Craft
              </label>
              <input
                type="text"
                maxLength={120}
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
                placeholder="Full-grain leather, brushed brass fittings"
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Dimensions / Fit
              </label>
              <input
                type="text"
                maxLength={100}
                value={form.dimensions}
                onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
                placeholder="38 cm × 28 cm × 14 cm"
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Studio Image Preset
              </label>
              <select
                value={
                  STUDIO_IMAGE_PRESETS.some((p) => p.url === form.imageUrl)
                    ? form.imageUrl
                    : ''
                }
                onChange={(e) => {
                  if (e.target.value) setForm({ ...form, imageUrl: e.target.value });
                }}
                className="w-full px-3 py-2 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
              >
                <option value="">Select a studio asset or enter custom URL →</option>
                {STUDIO_IMAGE_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Image URL
              </label>
              <input
                type="text"
                required
                maxLength={500}
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-12">
              <label className="block text-xs font-medium text-[#374151] mb-1.5">
                Product Description (SEO Copy)
              </label>
              <textarea
                rows={3}
                required
                maxLength={1200}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe design details, capacity, materials, and daily use..."
                className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
              />
            </div>

            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E5E7EB]">
              <div className="flex flex-wrap items-center gap-6 text-xs text-[#374151]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="w-4 h-4 accent-[#111317]"
                  />
                  <span>Visible on Storefront</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                    className="w-4 h-4 accent-[#111317]"
                  />
                  <span>Featured Piece</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="px-4 py-2 text-xs font-medium border border-[#D1D5DB] text-[#374151] hover:text-[#111317]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="px-5 py-2 text-xs font-medium bg-[#111317] text-white hover:bg-[#272B33] disabled:opacity-60"
                >
                  {savingProduct ? 'Saving...' : form.id ? 'Save Changes' : 'Publish Product'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* TAB 1: INVENTORY & PRODUCTS */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-[#E5E7EB] overflow-x-auto">
          {persistedProducts.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-base font-medium text-[#111317] mb-1">
                No products saved in Firestore yet
              </p>
              <p className="text-sm text-[#6B7280] mb-6">
                Sync the 8 starter studio products or create your own product right away.
              </p>
              <button
                type="button"
                onClick={handleSeedStarterCatalog}
                disabled={seeding}
                className="px-5 py-2.5 text-sm font-medium bg-[#111317] text-white hover:bg-[#272B33]"
              >
                {seeding ? 'Syncing...' : 'Sync Starter Catalog to Database'}
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA] text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  <th className="py-3.5 px-4">Product</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-right">Price</th>
                  <th className="py-3.5 px-4 text-center">Live Stock</th>
                  <th className="py-3.5 px-4">Visibility</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-sm">
                {persistedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-[#FAFAFB]">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-10 bg-[#ECEEF2] shrink-0 overflow-hidden">
                          <SafeImage
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[#111317] truncate max-w-[260px]">
                            {product.name}
                          </p>
                          <p className="text-xs font-mono text-[#6B7280]">{product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#4B5563]">
                      {CATEGORY_LABELS[product.category]}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#111317]">
                      {formatPrice(product.price)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickStockAdjust(product, -1)}
                          disabled={product.stock <= 0}
                          aria-label={`Decrease stock for ${product.name}`}
                          className="w-7 h-7 border border-[#D1D5DB] flex items-center justify-center text-[#374151] hover:border-[#111317] disabled:opacity-40"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className={`w-10 text-center font-mono text-xs font-semibold tabular-nums ${
                            product.stock === 0
                              ? 'text-[#B91C1C]'
                              : product.stock <= 5
                                ? 'text-[#B45309]'
                                : 'text-[#111317]'
                          }`}
                        >
                          {product.stock}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickStockAdjust(product, 1)}
                          aria-label={`Increase stock for ${product.name}`}
                          className="w-7 h-7 border border-[#D1D5DB] flex items-center justify-center text-[#374151] hover:border-[#111317]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(product)}
                        className={`text-xs font-medium ${
                          product.active ? 'text-[#15803D]' : 'text-[#6B7280]'
                        } hover:underline`}
                      >
                        {product.active ? 'Published' : 'Hidden'}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {confirmDeleteId === product.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-[#B91C1C] text-white"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs text-[#6B7280]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEditForm(product)}
                            aria-label={`Edit ${product.name}`}
                            className="p-1.5 text-[#4B5563] hover:text-[#111317]"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(product.id)}
                            aria-label={`Delete ${product.name}`}
                            className="p-1.5 text-[#9CA3AF] hover:text-[#B91C1C]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: ORDERS & REAL-TIME TRACKING MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          {/* Status Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOrderStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${
                orderStatusFilter === 'all'
                  ? 'bg-[#111317] text-white border-[#111317]'
                  : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#111317]'
              }`}
            >
              All ({orders.length})
            </button>
            {ALL_ORDER_STATUSES.map((st) => {
              const count = orders.filter((o) => o.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOrderStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${
                    orderStatusFilter === st
                      ? 'bg-[#111317] text-white border-[#111317]'
                      : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:border-[#111317]'
                  }`}
                >
                  {ORDER_STATUS_LABELS[st]} ({count})
                </button>
              );
            })}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-[#E5E7EB] p-12 text-center text-sm text-[#6B7280]">
              No customer orders match this filter yet.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const isEditing = editingOrderId === order.id;
                return (
                  <div key={order.id} className="bg-white border border-[#E5E7EB] p-5 sm:p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] mb-1">
                          <span className="font-mono font-semibold text-[#111317]">
                            {order.orderNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatShortDate(order.createdAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{order.customerName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{order.customerEmail}</span>
                        </div>
                        <p className="text-xs text-[#374151]">
                          Status:{' '}
                          <strong className="text-[#111317]">
                            {ORDER_STATUS_LABELS[order.status]}
                          </strong>{' '}
                          · Payment: {order.paymentMethod.toUpperCase()} ({order.paymentStatus}) ·{' '}
                          {order.shippingCity}, {order.shippingPostalCode}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-base font-semibold font-mono tabular-nums text-[#111317]">
                          {formatPrice(order.total)}
                        </span>
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => startOrderEdit(order)}
                            className="px-3.5 py-2 text-xs font-medium bg-[#111317] text-white hover:bg-[#272B33] whitespace-nowrap"
                          >
                            Update Status &amp; Tracking
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Items Summary Line */}
                    <div className="py-3 text-xs text-[#4B5563] flex flex-wrap gap-x-4 gap-y-1">
                      {order.items.map((item, idx) => (
                        <span key={`${item.productId}-${idx}`}>
                          {item.quantity}× {item.name} ({item.color})
                        </span>
                      ))}
                    </div>

                    {isEditing && (
                      <div className="mt-3 pt-4 border-t border-[#E5E7EB] bg-[#F8F9FA] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Fulfillment Status
                          </label>
                          <select
                            value={orderDraft.status}
                            onChange={(e) =>
                              setOrderDraft({
                                ...orderDraft,
                                status: e.target.value as OrderStatus,
                              })
                            }
                            className="w-full px-3 py-2 text-xs border border-[#D1D5DB] bg-white"
                          >
                            {ALL_ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {ORDER_STATUS_LABELS[st]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Payment Status
                          </label>
                          <select
                            value={orderDraft.paymentStatus}
                            onChange={(e) =>
                              setOrderDraft({
                                ...orderDraft,
                                paymentStatus: e.target.value as PaymentStatus,
                              })
                            }
                            className="w-full px-3 py-2 text-xs border border-[#D1D5DB] bg-white"
                          >
                            <option value="paid">Paid</option>
                            <option value="pending_cod">Pending (COD)</option>
                            <option value="refunded">Refunded</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Courier Carrier
                          </label>
                          <input
                            type="text"
                            maxLength={60}
                            value={orderDraft.carrier}
                            onChange={(e) =>
                              setOrderDraft({ ...orderDraft, carrier: e.target.value })
                            }
                            placeholder="DHL Express / FedEx"
                            className="w-full px-3 py-2 text-xs border border-[#D1D5DB] bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Tracking Number
                          </label>
                          <input
                            type="text"
                            maxLength={40}
                            value={orderDraft.trackingCode}
                            onChange={(e) =>
                              setOrderDraft({ ...orderDraft, trackingCode: e.target.value })
                            }
                            placeholder="KGTRK904821"
                            className="w-full px-3 py-2 text-xs font-mono border border-[#D1D5DB] bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Estimated Delivery
                          </label>
                          <input
                            type="text"
                            maxLength={40}
                            value={orderDraft.estimatedDelivery}
                            onChange={(e) =>
                              setOrderDraft({ ...orderDraft, estimatedDelivery: e.target.value })
                            }
                            placeholder="Nov 28, 2026"
                            className="w-full px-3 py-2 text-xs border border-[#D1D5DB] bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1">
                            Customer Tracking Note
                          </label>
                          <input
                            type="text"
                            maxLength={200}
                            value={orderDraft.statusNote}
                            onChange={(e) =>
                              setOrderDraft({ ...orderDraft, statusNote: e.target.value })
                            }
                            placeholder="Dispatched from central warehouse."
                            className="w-full px-3 py-2 text-xs border border-[#D1D5DB] bg-white"
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setEditingOrderId(null)}
                            className="px-3.5 py-2 text-xs text-[#4B5563] border border-[#D1D5DB] bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingOrder}
                            onClick={() => handleSaveOrderUpdate(order.id)}
                            className="px-4 py-2 text-xs font-medium bg-[#111317] text-white hover:bg-[#272B33] disabled:opacity-60"
                          >
                            {savingOrder ? 'Pushing Live Update...' : 'Push Real-Time Update'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
