import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ArrowRight, Menu, Plus, Search, ShoppingBag, X } from 'lucide-react';
import {
  ADMIN_EMAIL,
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signOutUser,
} from './firebase';
import type { ActiveView, CartItem, Order, Product, ProductCategory } from './types';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  HERO_IMAGE_URL,
  INITIAL_STARTER_PRODUCTS,
  formatPrice,
} from './data/catalog';
import { SafeImage } from './components/SafeImage';
import { AuthGateModal } from './components/AuthGateModal';
import { CartDrawer } from './components/CartDrawer';
import { ProductDetailView } from './components/ProductDetailView';
import { CheckoutView } from './components/CheckoutView';
import { OrderTrackingView } from './components/OrderTrackingView';
import { AdminPanel } from './components/AdminPanel';

const CART_STORAGE_KEY = 'kova_goods_cart_v1';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'newest';

interface PersistedCartEntry {
  productId: string;
  color: string;
  quantity: number;
}

export default function App() {
  // Auth & Role State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Navigation & Overlays
  const [activeView, setActiveView] = useState<ActiveView>('storefront');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState<{
    open: boolean;
    reason?: string;
    nextAction?: 'checkout' | 'orders' | 'admin';
  }>({ open: false });

  // Catalog Filters
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  // Real-time Firestore Data
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [highlightedOrderNumber, setHighlightedOrderNumber] = useState<string | null>(null);

  // Cart entries stored as IDs + hydrated from live products
  const [cartEntries, setCartEntries] = useState<PersistedCartEntry[]>(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const autoSeedAttempted = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Persist cart in localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartEntries));
    } catch {
      // ignore storage quota failures
    }
  }, [cartEntries]);

  // 1. Firebase Authentication Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }

      const bootstrapMatch =
        currentUser.email === ADMIN_EMAIL && currentUser.emailVerified === true;

      if (bootstrapMatch) {
        setIsAdmin(true);
        setAuthReady(true);
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, 'admins', currentUser.uid));
        setIsAdmin(adminSnap.exists() && currentUser.emailVerified === true);
      } catch {
        setIsAdmin(false);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-Time Product Catalog Subscription
  useEffect(() => {
    if (!authReady) return;

    const productsRef = collection(db, 'products');
    const q = isAdmin ? productsRef : query(productsRef, where('active', '==', true));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Product, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? 0;
          const tB = b.createdAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setDbProducts(list);
        setProductsLoaded(true);
      },
      (error) => {
        setProductsLoaded(true);
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    return () => unsubscribe();
  }, [authReady, isAdmin]);

  // Auto-seed starter catalog into Firestore on first Admin login if DB is empty
  useEffect(() => {
    if (!authReady || !isAdmin || !productsLoaded) return;
    if (dbProducts.length > 0 || autoSeedAttempted.current) return;

    autoSeedAttempted.current = true;
    async function seedOnFirstAdminLoad() {
      try {
        const batch = writeBatch(db);
        for (const starter of INITIAL_STARTER_PRODUCTS) {
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
          batch.set(doc(db, 'products', starter.id), payload);
        }
        await batch.commit();
      } catch (err) {
        console.error('Auto-seed skipped:', err);
      }
    }
    void seedOnFirstAdminLoad();
  }, [authReady, isAdmin, productsLoaded, dbProducts.length]);

  // 3. Real-Time Orders Subscription (Only attached when authenticated)
  useEffect(() => {
    if (!authReady || !user) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);
    const ordersRef = collection(db, 'orders');
    const q = isAdmin ? ordersRef : query(ordersRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? 0;
          const tB = b.createdAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setOrders(list);
        setOrdersLoading(false);
      },
      (error) => {
        setOrdersLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, isAdmin]);

  // Live catalog with starter fallback prior to initial admin database sync
  const allProducts: Product[] = useMemo(() => {
    if (dbProducts.length > 0) return dbProducts;
    return INITIAL_STARTER_PRODUCTS.map((item) => ({
      ...item,
      isPreviewOnly: true,
    }));
  }, [dbProducts]);

  const storefrontProducts = useMemo(() => {
    return allProducts.filter((p) => p.active);
  }, [allProducts]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return allProducts.find((p) => p.id === selectedProductId) || null;
  }, [allProducts, selectedProductId]);

  const customerOrders = useMemo(() => {
    if (!user) return [];
    return orders.filter((o) => o.userId === user.uid);
  }, [orders, user]);

  // Hydrate cart items with live product prices & stock counts
  const hydratedCartItems: CartItem[] = useMemo(() => {
    const resolved: CartItem[] = [];
    for (const entry of cartEntries) {
      const product = allProducts.find((p) => p.id === entry.productId && p.active);
      if (!product || product.stock <= 0) continue;
      resolved.push({
        product,
        color: entry.color,
        quantity: Math.min(entry.quantity, Math.min(20, product.stock)),
      });
    }
    return resolved;
  }, [cartEntries, allProducts]);

  const totalBagCount = useMemo(
    () => hydratedCartItems.reduce((sum, item) => sum + item.quantity, 0),
    [hydratedCartItems]
  );

  // Filtered & sorted catalog grid
  const visibleCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = storefrontProducts.filter((p) => {
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[p.category].toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });

    const sorted = [...list];
    if (sortBy === 'price-asc') {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'featured') {
      sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    return sorted;
  }, [storefrontProducts, selectedCategory, searchQuery, sortBy]);

  // Dynamic SEO Metadata Sync (<title>, description, canonical URL)
  useEffect(() => {
    const baseTitle = 'Kova Goods – Bags, Laptop Carry, Apparel & Kids Store';
    let nextTitle = baseTitle;
    let nextDesc =
      'Shop curated ladies bags, mens leather weekender bags, laptop backpacks, modern apparel, kids school bags, and heirloom toys with real-time order tracking.';

    if (activeView === 'product' && selectedProduct) {
      nextTitle = `${selectedProduct.name} | Kova Goods`;
      nextDesc = `${selectedProduct.name} (${formatPrice(selectedProduct.price)}). ${selectedProduct.description.slice(0, 120)}`;
    } else if (activeView === 'orders') {
      nextTitle = 'Real-Time Order Tracking | Kova Goods';
      nextDesc = 'Track your Kova Goods orders in real time from studio confirmation to doorstep delivery.';
    } else if (activeView === 'checkout') {
      nextTitle = 'Secure Checkout | Kova Goods';
      nextDesc = 'Complete your Kova Goods order with verified checkout via Card, UPI, or Cash on Delivery.';
    } else if (activeView === 'admin') {
      nextTitle = 'Store Operations & Admin | Kova Goods';
      nextDesc = 'Manage products, live inventory, and real-time order tracking in Kova Goods.';
    } else if (selectedCategory !== 'all') {
      nextTitle = `${CATEGORY_LABELS[selectedCategory]} | Kova Goods`;
      nextDesc = `Explore our curated ${CATEGORY_LABELS[selectedCategory].toLowerCase()} collection with live stock availability and fast insured shipping.`;
    }

    document.title = nextTitle;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', nextDesc);

    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonicalUrl;
  }, [activeView, selectedProduct, selectedCategory]);

  // Cart Mutations
  function handleAddToCart(product: Product, color: string, quantity = 1) {
    if (product.stock <= 0) return;
    setCartEntries((prev) => {
      const idx = prev.findIndex((e) => e.productId === product.id && e.color === color);
      const maxAllowed = Math.min(20, product.stock);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: Math.min(maxAllowed, updated[idx].quantity + quantity),
        };
        return updated;
      }
      return [...prev, { productId: product.id, color, quantity: Math.min(maxAllowed, quantity) }];
    });
    showToast(`Added ${product.name} to your bag.`);
  }

  function handleUpdateCartQuantity(productId: string, color: string, quantity: number) {
    if (quantity <= 0) {
      handleRemoveCartItem(productId, color);
      return;
    }
    setCartEntries((prev) =>
      prev.map((e) =>
        e.productId === productId && e.color === color ? { ...e, quantity } : e
      )
    );
  }

  function handleRemoveCartItem(productId: string, color: string) {
    setCartEntries((prev) =>
      prev.filter((e) => !(e.productId === productId && e.color === color))
    );
  }

  // Login-Gated Navigation Actions
  function handleProceedToCheckout() {
    setCartOpen(false);
    if (!user) {
      setAuthModal({
        open: true,
        reason:
          'Sign in first to place your order. Your account secures your payment receipt, delivery address, and live order tracking.',
        nextAction: 'checkout',
      });
      return;
    }
    setActiveView('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenOrders() {
    setMobileMenuOpen(false);
    if (!user) {
      setAuthModal({
        open: true,
        reason: 'Sign in with your customer account to view live order tracking and receipts.',
        nextAction: 'orders',
      });
      return;
    }
    setActiveView('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenProduct(productId: string) {
    setSelectedProductId(productId);
    setActiveView('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSelectCategoryFromNav(cat: ProductCategory | 'all') {
    setSelectedCategory(cat);
    setActiveView('storefront');
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  }

  async function handleSignOut() {
    await signOutUser();
    setMobileMenuOpen(false);
    if (activeView === 'admin' || activeView === 'checkout' || activeView === 'orders') {
      setActiveView('storefront');
    }
    showToast('Signed out of your account.');
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#111317]">
      {/* Strict 3-Zone Top Bar Contract (<= 64px height) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setActiveView('storefront');
              setMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-serif text-xl font-semibold tracking-tight text-[#111317] whitespace-nowrap shrink-0"
          >
            Kova Goods
          </button>

          {/* Zone 2: 4 Clean Single-Line Text Nav Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4B5563]"
          >
            <button
              type="button"
              onClick={() => handleSelectCategoryFromNav('all')}
              className={`hover:text-[#111317] transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'storefront' ? 'text-[#111317] underline underline-offset-8' : ''
              }`}
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={handleOpenOrders}
              className={`hover:text-[#111317] transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'orders' ? 'text-[#111317] underline underline-offset-8' : ''
              }`}
            >
              Track Orders
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setActiveView('admin');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`hover:text-[#111317] transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'admin' ? 'text-[#111317] underline underline-offset-8' : ''
                }`}
              >
                Admin Panel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveView('storefront');
                  window.setTimeout(() => {
                    document
                      .getElementById('craftsmanship-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }, 60);
                }}
                className="hover:text-[#111317] transition-colors whitespace-nowrap shrink-0"
              >
                Craft
              </button>
            )}
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hover:text-[#111317] transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setAuthModal({
                    open: true,
                    reason:
                      'Sign in to access your order history, write verified reviews, and enjoy faster checkout.',
                  })
                }
                className="hover:text-[#111317] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </nav>

          {/* Zone 3: 1 Primary Action (Bag) + Mobile Menu Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="px-4 py-2 bg-[#111317] text-white text-xs font-medium hover:bg-[#272B33] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="tabular-nums">Bag ({totalBagCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              className="md:hidden p-2 text-[#111317]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E5E7EB] bg-white px-4 py-4 space-y-2 text-sm">
            <button
              type="button"
              onClick={() => handleSelectCategoryFromNav('all')}
              className="block w-full text-left py-2 text-[#111317] font-medium"
            >
              Catalog
            </button>
            <button
              type="button"
              onClick={handleOpenOrders}
              className="block w-full text-left py-2 text-[#374151]"
            >
              Track Orders
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setActiveView('admin');
                  setMobileMenuOpen(false);
                }}
                className="block w-full text-left py-2 text-[#111317] font-medium"
              >
                Admin Panel
              </button>
            )}
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full text-left py-2 text-[#4B5563]"
              >
                Sign Out ({user.email})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAuthModal({ open: true });
                }}
                className="block w-full text-left py-2 text-[#111317] font-medium"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content Router */}
      <main className="flex-1">
        {activeView === 'storefront' && (
          <>
            {/* SECTION 1: Storefront Campaign Hero (Balanced 2-Column Split) */}
            <section className="bg-white border-b border-[#E5E7EB]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                  <div className="lg:col-span-5 flex flex-col justify-between py-2">
                    <div>
                      <p className="text-xs tracking-[0.16em] uppercase text-[#6B7280] mb-4">
                        Carry · Apparel · Family Studio
                      </p>
                      <h1 className="text-[clamp(2.25rem,3.8vw,3.35rem)] font-semibold text-[#111317] leading-[1.08] tracking-tight mb-5">
                        Architectural carry and everyday goods built to stay.
                      </h1>
                      <p className="text-base text-[#4B5563] leading-relaxed max-w-md mb-8">
                        Discover ladies leather totes, mens travel weekenders, weatherproof laptop
                        packs, heavyweight organic apparel, kids school bags, and heirloom wooden
                        toys.
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          document
                            .getElementById('catalog-section')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                        className="px-6 py-3.5 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] transition-colors inline-flex items-center gap-2.5 whitespace-nowrap"
                      >
                        <span>Explore Collection</span>
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="pt-8 mt-8 border-t border-[#E5E7EB] flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7280]">
                      <span>Free insured delivery over $150</span>
                      <span aria-hidden="true">·</span>
                      <span>Live order tracking</span>
                      <span aria-hidden="true">·</span>
                      <span>Card, UPI &amp; COD</span>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="w-full h-full min-h-[280px] sm:min-h-[380px] lg:min-h-[460px] bg-[#ECEEF2] overflow-hidden">
                      <SafeImage
                        src={HERO_IMAGE_URL}
                        alt="Kova Goods collection featuring structured leather ladies tote, full-grain mens weekender duffel, and charcoal commuter laptop backpack"
                        loading="eager"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: Featured & Full Product Catalog */}
            <section
              id="catalog-section"
              aria-labelledby="catalog-heading"
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                  <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-1.5">
                    Live Inventory
                  </p>
                  <h2 id="catalog-heading" className="text-3xl font-semibold text-[#111317]">
                    {selectedCategory === 'all'
                      ? 'The Complete Collection'
                      : CATEGORY_LABELS[selectedCategory]}
                  </h2>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative">
                    <Search
                      className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search bags, clothes, toys..."
                      aria-label="Search products"
                      className="w-full sm:w-64 pl-10 pr-3.5 py-2 text-sm bg-white border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
                    />
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    aria-label="Sort products"
                    className="px-3.5 py-2 text-sm bg-white border border-[#D1D5DB] text-[#111317] focus:border-[#111317] focus:outline-none"
                  >
                    <option value="featured">Sort: Featured</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="newest">Newest Arrivals</option>
                  </select>
                </div>
              </div>

              {/* Interactive Category Filter Bar */}
              <div
                role="tablist"
                aria-label="Product categories"
                className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-8 border-b border-[#E5E7EB]"
              >
                {CATEGORIES.map((cat) => {
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#111317] text-white'
                          : 'bg-transparent text-[#4B5563] hover:text-[#111317] hover:bg-[#ECEEF2]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Uniform 3-Column Product Grid */}
              {visibleCatalog.length === 0 ? (
                <div className="bg-white border border-[#E5E7EB] p-12 text-center">
                  <p className="text-base font-medium text-[#111317] mb-1">
                    No matching products found
                  </p>
                  <p className="text-sm text-[#6B7280] mb-5">
                    Try clearing your search or switching to another category.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 text-xs font-medium bg-[#111317] text-white"
                  >
                    Show All Products
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {visibleCatalog.map((product) => {
                    const outOfStock = product.stock <= 0;
                    return (
                      <article
                        key={product.id}
                        className="group bg-white border border-[#E5E7EB] flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        <div
                          onClick={() => handleOpenProduct(product.id)}
                          className="relative aspect-[4/3] w-full bg-[#ECEEF2] overflow-hidden cursor-pointer"
                        >
                          <SafeImage
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </div>

                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-[#6B7280] mb-1.5">
                              <span>{CATEGORY_LABELS[product.category]}</span>
                              <span
                                className={
                                  outOfStock
                                    ? 'text-[#B91C1C]'
                                    : product.stock <= 5
                                      ? 'text-[#B45309]'
                                      : 'text-[#6B7280]'
                                }
                              >
                                {outOfStock
                                  ? 'Sold Out'
                                  : product.stock <= 5
                                    ? `${product.stock} Left`
                                    : 'In Stock'}
                              </span>
                            </div>

                            <h3 className="text-base font-semibold text-[#111317] leading-snug mb-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenProduct(product.id)}
                                className="text-left hover:underline underline-offset-4"
                              >
                                {product.name}
                              </button>
                            </h3>

                            <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed mb-4">
                              {product.description}
                            </p>
                          </div>

                          <div className="pt-4 border-t border-[#F3F4F6] flex items-center justify-between gap-3">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[15px] font-semibold text-[#111317] tabular-nums">
                                {formatPrice(product.price)}
                              </span>
                              {product.compareAtPrice &&
                                product.compareAtPrice > product.price && (
                                  <span className="text-xs text-[#9CA3AF] line-through tabular-nums">
                                    {formatPrice(product.compareAtPrice)}
                                  </span>
                                )}
                            </div>

                            <button
                              type="button"
                              disabled={outOfStock}
                              onClick={() =>
                                handleAddToCart(product, product.colors[0] || 'Standard', 1)
                              }
                              className="px-3.5 py-2 text-xs font-medium border border-[#111317] text-[#111317] hover:bg-[#111317] hover:text-white disabled:border-[#D1D5DB] disabled:text-[#9CA3AF] disabled:hover:bg-transparent transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{outOfStock ? 'Unavailable' : 'Add to Bag'}</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SECTION 3: Craftsmanship & Transparent Fulfillment */}
            <section
              id="craftsmanship-section"
              className="bg-white border-t border-b border-[#E5E7EB]"
            >
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
                <div className="max-w-xl mb-12">
                  <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-2">
                    Studio Standards
                  </p>
                  <h2 className="text-3xl font-semibold text-[#111317]">
                    Thoughtful materials, verified checkout, transparent delivery.
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
                  <div className="pt-6 border-t border-[#E5E7EB]">
                    <h3 className="text-base font-semibold text-[#111317] mb-2">
                      01. Enduring Materials
                    </h3>
                    <p className="text-sm text-[#4B5563] leading-relaxed">
                      Every ladies tote, mens duffel, 16-inch laptop pack, organic garment, and
                      FSC-certified beechwood toy is tested for multi-year everyday wear.
                    </p>
                  </div>

                  <div className="pt-6 border-t border-[#E5E7EB]">
                    <h3 className="text-base font-semibold text-[#111317] mb-2">
                      02. Account-Protected Orders
                    </h3>
                    <p className="text-sm text-[#4B5563] leading-relaxed">
                      Customer sign-in before purchase protects your delivery profile, reserves
                      real-time stock instantly, and supports Card, UPI, and Cash on Delivery.
                    </p>
                  </div>

                  <div className="pt-6 border-t border-[#E5E7EB]">
                    <h3 className="text-base font-semibold text-[#111317] mb-2">
                      03. Real-Time Order Tracking
                    </h3>
                    <p className="text-sm text-[#4B5563] leading-relaxed">
                      Follow every milestone live—from order confirmation and studio packing to
                      courier tracking number assignment and doorstep delivery.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === 'product' && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            user={user}
            isAdmin={isAdmin}
            userOrders={customerOrders}
            onBack={() => setActiveView('storefront')}
            onAddToCart={handleAddToCart}
            onRequireAuth={(reason) => setAuthModal({ open: true, reason })}
          />
        )}

        {activeView === 'checkout' && user && (
          <CheckoutView
            user={user}
            items={hydratedCartItems}
            onBack={() => setActiveView('storefront')}
            onOrderPlaced={(_orderId, orderNumber) => {
              setCartEntries([]);
              setHighlightedOrderNumber(orderNumber);
              setActiveView('orders');
              window.scrollTo({ top: 0, behavior: 'smooth' });
              showToast(`Order ${orderNumber} placed successfully.`);
            }}
          />
        )}

        {activeView === 'orders' && user && (
          <OrderTrackingView
            orders={customerOrders}
            loading={ordersLoading}
            highlightedOrderNumber={highlightedOrderNumber}
            onBackToStore={() => setActiveView('storefront')}
          />
        )}

        {activeView === 'admin' && isAdmin && (
          <AdminPanel
            products={allProducts}
            orders={orders}
            onBackToStore={() => setActiveView('storefront')}
          />
        )}
      </main>

      {/* SECTION 4: Quiet Editorial Footer */}
      <footer className="bg-white border-t border-[#E5E7EB] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-[#E5E7EB]">
            <div className="md:col-span-5">
              <p className="font-serif text-lg font-semibold text-[#111317] mb-2">Kova Goods</p>
              <p className="text-sm text-[#6B7280] max-w-sm leading-relaxed">
                Curated ladies bags, mens bags, laptop backpacks, everyday apparel, kids packs, and
                heirloom toys backed by live inventory and transparent order tracking.
              </p>
            </div>

            <div className="md:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#111317] mb-3">
                Departments
              </p>
              <div className="grid grid-cols-2 gap-y-2 text-sm text-[#4B5563]">
                {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectCategoryFromNav(cat.id)}
                    className="text-left hover:text-[#111317] transition-colors"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#111317] mb-3">
                Customer Care
              </p>
              <div className="space-y-2 text-sm text-[#4B5563]">
                <button
                  type="button"
                  onClick={handleOpenOrders}
                  className="block hover:text-[#111317] transition-colors"
                >
                  Track an Order
                </button>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="block hover:text-[#111317] transition-colors"
                >
                  Shopping Bag ({totalBagCount})
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('admin');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="block text-[#111317] font-medium hover:underline"
                  >
                    Open Admin Panel
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B7280]">
            <p>© {new Date().getFullYear()} Kova Goods Studio. All rights reserved.</p>
            <p>Complimentary insured shipping over $150 · Verified Google Sign-In Checkout</p>
          </div>
        </div>
      </footer>

      {/* Slide-Over Shopping Bag Drawer */}
      <CartDrawer
        open={cartOpen}
        items={hydratedCartItems}
        user={user}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={handleProceedToCheckout}
      />

      {/* Customer Sign-In Modal */}
      <AuthGateModal
        open={authModal.open}
        reason={authModal.reason}
        onClose={() => setAuthModal({ open: false })}
        onSuccess={(signedInUser) => {
          setUser(signedInUser);
          const next = authModal.nextAction;
          if (next === 'checkout') {
            setActiveView('checkout');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (next === 'orders') {
            setActiveView('orders');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          showToast('Signed in successfully.');
        }}
      />

      {/* Minimal Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 bg-[#111317] text-white text-xs font-medium px-4 py-3 shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
