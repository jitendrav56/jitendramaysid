import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { ArrowLeft, Banknote, CreditCard, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { CartItem, OrderItem, PaymentMethod, UserProfile } from '../types';
import {
  CATEGORY_LABELS,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  TAX_RATE,
  formatPrice,
  generateEstimatedDeliveryDate,
  generateOrderNumber,
} from '../data/catalog';
import { SafeImage } from './SafeImage';

interface CheckoutViewProps {
  user: User;
  items: CartItem[];
  onBack: () => void;
  onOrderPlaced: (orderId: string, orderNumber: string) => void;
}

export function CheckoutView({ user, items, onBack, onOrderPlaced }: CheckoutViewProps) {
  const [customerName, setCustomerName] = useState(user.displayName || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingPostalCode, setShippingPostalCode] = useState('');
  const [saveProfile, setSaveProfile] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState(user.displayName || '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [upiId, setUpiId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Load saved customer shipping details from /users/{uid}
  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const userPath = `users/${user.uid}`;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (active && snap.exists()) {
          const data = snap.data() as UserProfile;
          if (data.displayName) setCustomerName(data.displayName);
          if (data.phone) setCustomerPhone(data.phone);
          if (data.address) setShippingAddress(data.address);
          if (data.city) setShippingCity(data.city);
          if (data.postalCode) setShippingPostalCode(data.postalCode);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, userPath);
      } finally {
        if (active) setProfileLoaded(true);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, [user.uid]);

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_FEE;
  const tax = Number((subtotal * TAX_RATE).toFixed(2));
  const total = Number((subtotal + shippingFee + tax).toFixed(2));

  function formatCardInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function formatExpiryInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  }

  function validateCheckout(): { valid: boolean; paymentRef: string; error?: string } {
    if (items.length === 0) return { valid: false, paymentRef: '', error: 'Your shopping bag is empty.' };
    if (customerName.trim().length < 2)
      return { valid: false, paymentRef: '', error: 'Please enter your full name.' };
    if (customerPhone.trim().length < 5)
      return { valid: false, paymentRef: '', error: 'Please enter a valid contact phone number.' };
    if (shippingAddress.trim().length < 5)
      return { valid: false, paymentRef: '', error: 'Please enter your street delivery address.' };
    if (shippingCity.trim().length < 2)
      return { valid: false, paymentRef: '', error: 'Please enter your city.' };
    if (shippingPostalCode.trim().length < 3)
      return { valid: false, paymentRef: '', error: 'Please enter your postal / ZIP code.' };

    for (const item of items) {
      if (item.quantity > item.product.stock) {
        return {
          valid: false,
          paymentRef: '',
          error: `Only ${item.product.stock} unit(s) of "${item.product.name}" remain in stock.`,
        };
      }
    }

    if (paymentMethod === 'card') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 16) {
        return { valid: false, paymentRef: '', error: 'Please enter a valid 13–16 digit card number.' };
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry.trim())) {
        return { valid: false, paymentRef: '', error: 'Please enter card expiry in MM/YY format.' };
      }
      if (!/^\d{3,4}$/.test(cardCvv.trim())) {
        return { valid: false, paymentRef: '', error: 'Please enter a valid 3 or 4 digit security code.' };
      }
      if (cardName.trim().length < 2) {
        return { valid: false, paymentRef: '', error: 'Please enter the cardholder name.' };
      }
      const last4 = digits.slice(-4);
      const network = digits.startsWith('4') ? 'VISA' : digits.startsWith('5') ? 'MC' : 'CARD';
      return { valid: true, paymentRef: `${network} •••• ${last4}` };
    }

    if (paymentMethod === 'upi') {
      const trimmedUpi = upiId.trim();
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(trimmedUpi)) {
        return {
          valid: false,
          paymentRef: '',
          error: 'Please enter a valid UPI handle (for example: name@bank).',
        };
      }
      return { valid: true, paymentRef: `UPI:${trimmedUpi.slice(0, 48)}` };
    }

    return { valid: true, paymentRef: 'COD-VERIFY-ON-DELIVERY' };
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const check = validateCheckout();
    if (!check.valid) {
      setError(check.error || 'Please review your checkout details.');
      return;
    }

    setSubmitting(true);
    const orderNumber = generateOrderNumber();
    const orderRef = doc(collection(db, 'orders'));

    const orderItems: OrderItem[] = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name.slice(0, 120),
      sku: item.product.sku,
      category: item.product.category,
      color: item.color.slice(0, 40),
      price: item.product.price,
      quantity: item.quantity,
      imageUrl: item.product.imageUrl,
    }));

    try {
      // Optionally sync saved delivery details to /users/{uid}
      if (saveProfile) {
        const userDocRef = doc(db, 'users', user.uid);
        const existingSnap = await getDoc(userDocRef);
        const profilePatch = {
          displayName: customerName.trim().slice(0, 80),
          phone: customerPhone.trim().slice(0, 30),
          address: shippingAddress.trim().slice(0, 250),
          city: shippingCity.trim().slice(0, 80),
          postalCode: shippingPostalCode.trim().slice(0, 20),
          updatedAt: serverTimestamp(),
        };
        if (existingSnap.exists()) {
          await updateDoc(userDocRef, profilePatch);
        } else {
          await setDoc(userDocRef, {
            uid: user.uid,
            email: (user.email || 'customer@kovagoods.com').slice(0, 120),
            ...profilePatch,
            createdAt: serverTimestamp(),
          });
        }
      }

      // Atomic batch: create Order + decrement real-time product inventory in Firestore
      const batch = writeBatch(db);
      batch.set(orderRef, {
        orderNumber,
        userId: user.uid,
        customerName: customerName.trim().slice(0, 80),
        customerEmail: (user.email || 'customer@kovagoods.com').slice(0, 120),
        customerPhone: customerPhone.trim().slice(0, 30),
        shippingAddress: shippingAddress.trim().slice(0, 250),
        shippingCity: shippingCity.trim().slice(0, 80),
        shippingPostalCode: shippingPostalCode.trim().slice(0, 20),
        paymentMethod,
        paymentStatus: paymentMethod === 'cod' ? 'pending_cod' : 'paid',
        paymentRef: check.paymentRef,
        items: orderItems,
        subtotal,
        shippingFee,
        tax,
        total,
        status: 'placed',
        trackingCode: '',
        carrier: 'Kova Express Courier',
        estimatedDelivery: generateEstimatedDeliveryDate(),
        statusNote: 'Order received and verified. Preparing studio dispatch.',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Aggregate quantities per productId in case user bought 2 colors of same product
      const qtyByProduct = new Map<string, { currentStock: number; qty: number; isPreview?: boolean }>();
      for (const item of items) {
        const prev = qtyByProduct.get(item.product.id);
        if (prev) {
          prev.qty += item.quantity;
        } else {
          qtyByProduct.set(item.product.id, {
            currentStock: item.product.stock,
            qty: item.quantity,
            isPreview: item.product.isPreviewOnly,
          });
        }
      }

      for (const [productId, info] of qtyByProduct.entries()) {
        if (!info.isPreview) {
          const nextStock = Math.max(0, info.currentStock - info.qty);
          batch.update(doc(db, 'products', productId), {
            stock: nextStock,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      onOrderPlaced(orderRef.id, orderNumber);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderRef.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-[#4B5563] hover:text-[#111317] transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Return to Storefront</span>
      </button>

      <div className="mb-8">
        <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-1">
          Signed in as {user.email}
        </p>
        <h1 className="text-3xl font-semibold text-[#111317]">Secure Checkout</h1>
      </div>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left: Delivery & Payment */}
        <div className="lg:col-span-7 space-y-8">
          {/* 1. Delivery Address */}
          <div className="bg-white border border-[#E5E7EB] p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-[#111317] mb-1">
              01. Delivery Details
            </h2>
            <p className="text-xs text-[#6B7280] mb-6">
              {profileLoaded
                ? 'Confirm where we should deliver your order.'
                : 'Loading saved profile...'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="checkout-name" className="block text-xs font-medium text-[#374151] mb-1.5">
                  Full Name
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  maxLength={80}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="checkout-phone" className="block text-xs font-medium text-[#374151] mb-1.5">
                  Phone Number
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  required
                  maxLength={30}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 (555) 234-5678"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="checkout-address" className="block text-xs font-medium text-[#374151] mb-1.5">
                  Street Address &amp; Apartment
                </label>
                <input
                  id="checkout-address"
                  type="text"
                  required
                  maxLength={250}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="420 Mercer Street, Apt 5B"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="checkout-city" className="block text-xs font-medium text-[#374151] mb-1.5">
                  City
                </label>
                <input
                  id="checkout-city"
                  type="text"
                  required
                  maxLength={80}
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  placeholder="San Francisco"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="checkout-postal" className="block text-xs font-medium text-[#374151] mb-1.5">
                  Postal / ZIP Code
                </label>
                <input
                  id="checkout-postal"
                  type="text"
                  required
                  maxLength={20}
                  value={shippingPostalCode}
                  onChange={(e) => setShippingPostalCode(e.target.value)}
                  placeholder="94107"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
              </div>
            </div>

            <label className="mt-5 inline-flex items-center gap-2.5 text-xs text-[#4B5563] cursor-pointer">
              <input
                type="checkbox"
                checked={saveProfile}
                onChange={(e) => setSaveProfile(e.target.checked)}
                className="w-4 h-4 accent-[#111317]"
              />
              <span>Save shipping address to my account for faster checkout next time</span>
            </label>
          </div>

          {/* 2. Payment Method */}
          <div className="bg-white border border-[#E5E7EB] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 mb-1">
              <h2 className="text-lg font-semibold text-[#111317]">02. Secure Payment</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#4B5563]">
                <Lock className="w-3.5 h-3.5 text-[#111317]" aria-hidden="true" />
                <span>256-bit TLS Encrypted</span>
              </span>
            </div>
            <p className="text-xs text-[#6B7280] mb-6">
              Select your preferred payment method. Card numbers are never stored in plain text.
            </p>

            {/* Payment Method Selector Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3.5 border text-left transition-colors flex items-center gap-2.5 ${
                  paymentMethod === 'card'
                    ? 'border-[#111317] bg-[#111317] text-white'
                    : 'border-[#D1D5DB] bg-white text-[#374151] hover:border-[#111317]'
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium whitespace-nowrap">Credit / Debit Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`p-3.5 border text-left transition-colors flex items-center gap-2.5 ${
                  paymentMethod === 'upi'
                    ? 'border-[#111317] bg-[#111317] text-white'
                    : 'border-[#D1D5DB] bg-white text-[#374151] hover:border-[#111317]'
                }`}
              >
                <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium whitespace-nowrap">UPI / Instant Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-3.5 border text-left transition-colors flex items-center gap-2.5 ${
                  paymentMethod === 'cod'
                    ? 'border-[#111317] bg-[#111317] text-white'
                    : 'border-[#D1D5DB] bg-white text-[#374151] hover:border-[#111317]'
                }`}
              >
                <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium whitespace-nowrap">Cash on Delivery</span>
              </button>
            </div>

            {paymentMethod === 'card' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="card-number" className="block text-xs font-medium text-[#374151] mb-1.5">
                    Card Number
                  </label>
                  <input
                    id="card-number"
                    type="text"
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardInput(e.target.value))}
                    placeholder="4532 0192 8821 4242"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="card-holder" className="block text-xs font-medium text-[#374151] mb-1.5">
                    Name on Card
                  </label>
                  <input
                    id="card-holder"
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="card-expiry" className="block text-xs font-medium text-[#374151] mb-1.5">
                    Expiry (MM/YY)
                  </label>
                  <input
                    id="card-expiry"
                    type="text"
                    inputMode="numeric"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                    placeholder="08/29"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="card-cvv" className="block text-xs font-medium text-[#374151] mb-1.5">
                    Security Code (CVV)
                  </label>
                  <input
                    id="card-cvv"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'upi' && (
              <div>
                <label htmlFor="upi-handle" className="block text-xs font-medium text-[#374151] mb-1.5">
                  UPI ID / Virtual Payment Address
                </label>
                <input
                  id="upi-handle"
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="alexmorgan@okaxis"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-[#D1D5DB] bg-white focus:border-[#111317] focus:outline-none"
                />
                <p className="text-xs text-[#6B7280] mt-2">
                  Instant verification reference will be attached to your live order receipt.
                </p>
              </div>
            )}

            {paymentMethod === 'cod' && (
              <div className="bg-[#F8F9FA] border border-[#E5E7EB] p-4 text-xs text-[#374151] space-y-1.5">
                <p className="font-semibold text-[#111317]">
                  Pay {formatPrice(total)} upon doorstep delivery
                </p>
                <p>
                  Available on all verified addresses. Free insured shipping applies automatically on
                  orders of {formatPrice(FREE_SHIPPING_THRESHOLD)} or more.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 bg-white border border-[#E5E7EB] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-[#111317] mb-5">Order Summary</h2>

          <div className="divide-y divide-[#E5E7EB] max-h-72 overflow-y-auto pr-1 mb-5">
            {items.map((item) => (
              <div key={`${item.product.id}-${item.color}`} className="py-3.5 first:pt-0 flex gap-3.5">
                <div className="w-16 h-14 bg-[#F3F4F6] shrink-0 overflow-hidden">
                  <SafeImage
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#111317] truncate">{item.product.name}</p>
                  <p className="text-xs text-[#6B7280]">
                    {CATEGORY_LABELS[item.product.category]} · {item.color} · Qty {item.quantity}
                  </p>
                </div>
                <span className="text-sm font-medium text-[#111317] tabular-nums shrink-0">
                  {formatPrice(item.product.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-[#E5E7EB] pt-4 space-y-2.5 text-sm">
            <div className="flex justify-between text-[#4B5563]">
              <span>Subtotal</span>
              <span className="tabular-nums text-[#111317]">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#4B5563]">
              <span>Insured Shipping</span>
              <span className="tabular-nums text-[#111317]">
                {shippingFee === 0 ? 'Complimentary' : formatPrice(shippingFee)}
              </span>
            </div>
            <div className="flex justify-between text-[#4B5563]">
              <span>Estimated Tax (8%)</span>
              <span className="tabular-nums text-[#111317]">{formatPrice(tax)}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-[#E5E7EB] text-base font-semibold text-[#111317]">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(total)}</span>
            </div>
          </div>

          {error && (
            <p className="mt-5 text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || items.length === 0}
            className="mt-6 w-full py-3.5 px-5 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] disabled:opacity-60 transition-colors"
          >
            {submitting
              ? 'Processing Secure Order...'
              : paymentMethod === 'cod'
                ? `Place COD Order · ${formatPrice(total)}`
                : `Pay ${formatPrice(total)} & Place Order`}
          </button>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#6B7280]">
            <ShieldCheck className="w-4 h-4 text-[#111317]" aria-hidden="true" />
            <span>Real-time inventory reservation &amp; instant tracking receipt</span>
          </div>
        </aside>
      </form>
    </section>
  );
}
