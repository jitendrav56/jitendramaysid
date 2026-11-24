import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  Check,
  Package,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Order, OrderStatus } from '../types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_PIPELINE,
  formatPrice,
  formatShortDate,
} from '../data/catalog';
import { SafeImage } from './SafeImage';

interface OrderTrackingViewProps {
  orders: Order[];
  loading: boolean;
  highlightedOrderNumber?: string | null;
  onBackToStore: () => void;
}

const STEP_INDEX: Record<OrderStatus, number> = {
  placed: 0,
  confirmed: 1,
  packed: 2,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
  cancelled: -1,
};

export function OrderTrackingView({
  orders,
  loading,
  highlightedOrderNumber,
  onBackToStore,
}: OrderTrackingViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.trackingCode.toLowerCase().includes(q) ||
        o.items.some((item) => item.name.toLowerCase().includes(q))
    );
  }, [orders, searchTerm]);

  async function handleCancelOrder(order: Order) {
    if (order.status !== 'placed') return;
    setCancellingId(order.id);
    const path = `orders/${order.id}`;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'cancelled',
        statusNote: 'Cancelled by customer prior to studio dispatch.',
        updatedAt: serverTimestamp(),
      });
      setConfirmCancelId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <button
        type="button"
        onClick={onBackToStore}
        className="inline-flex items-center gap-2 text-sm text-[#4B5563] hover:text-[#111317] transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back to Storefront</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-1">
            Live Fulfillment Status
          </p>
          <h1 className="text-3xl font-semibold text-[#111317]">Order Tracking &amp; History</h1>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by order # or item"
            aria-label="Filter orders by order number or product name"
            className="w-full pl-10 pr-3.5 py-2 text-sm bg-white border border-[#D1D5DB] focus:border-[#111317] focus:outline-none"
          />
        </div>
      </div>

      {highlightedOrderNumber && (
        <div className="mb-8 bg-white border border-[#111317] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#111317]">
              Order {highlightedOrderNumber} Confirmed — Preparing Shipment
            </p>
            <p className="text-xs text-[#4B5563] mt-0.5">
              Status updates from our fulfillment studio stream here automatically in real time.
            </p>
          </div>
          <span className="text-xs font-mono text-[#111317] shrink-0">
            Receipt Saved
          </span>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-[#E5E7EB] p-12 text-center text-sm text-[#6B7280]">
          Syncing your real-time orders...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white border border-[#E5E7EB] p-12 text-center">
          <Package className="w-9 h-9 text-[#9CA3AF] stroke-[1.5] mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[#111317] mb-1">
            {orders.length === 0 ? 'No orders yet' : 'No matching orders found'}
          </h2>
          <p className="text-sm text-[#6B7280] max-w-md mx-auto mb-6">
            {orders.length === 0
              ? 'Once you complete checkout, your order confirmation, courier tracking number, and live milestone updates will appear here.'
              : 'Try searching with a different order number or clear the filter.'}
          </p>
          <button
            type="button"
            onClick={onBackToStore}
            className="px-5 py-2.5 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] transition-colors"
          >
            Browse Collection
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map((order) => {
            const currentStep = STEP_INDEX[order.status];
            const isCancelled = order.status === 'cancelled';
            return (
              <article
                key={order.id}
                className="bg-white border border-[#E5E7EB] p-6 sm:p-8"
              >
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E5E7EB]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280] mb-1">
                      <span className="font-mono font-semibold text-[#111317]">
                        {order.orderNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Placed {formatShortDate(order.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {order.paymentMethod.toUpperCase()} ({order.paymentRef})
                      </span>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        isCancelled
                          ? 'text-[#B91C1C]'
                          : order.status === 'delivered'
                            ? 'text-[#15803D]'
                            : 'text-[#1E40AF]'
                      }`}
                    >
                      Status: {ORDER_STATUS_LABELS[order.status]}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-left md:text-right">
                      <p className="text-xs text-[#6B7280]">Order Total</p>
                      <p className="text-base font-semibold text-[#111317] tabular-nums">
                        {formatPrice(order.total)}
                      </p>
                    </div>

                    {order.status === 'placed' && (
                      <div className="shrink-0">
                        {confirmCancelId === order.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCancelOrder(order)}
                              disabled={cancellingId === order.id}
                              className="px-3 py-1.5 text-xs font-medium bg-[#B91C1C] text-white hover:bg-[#991B1B] whitespace-nowrap"
                            >
                              {cancellingId === order.id ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmCancelId(null)}
                              className="px-2.5 py-1.5 text-xs text-[#4B5563] hover:text-[#111317]"
                            >
                              Keep
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(order.id)}
                            className="px-3.5 py-2 text-xs font-medium border border-[#D1D5DB] text-[#374151] hover:border-[#B91C1C] hover:text-[#B91C1C] transition-colors whitespace-nowrap"
                          >
                            Cancel Order
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Fulfillment Progress Timeline */}
                {isCancelled ? (
                  <div className="py-5 border-b border-[#E5E7EB] flex items-start gap-3 text-sm text-[#B91C1C]">
                    <XCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-medium">Order Cancelled</p>
                      <p className="text-xs text-[#4B5563] mt-0.5">
                        {order.statusNote || 'This order has been cancelled.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 border-b border-[#E5E7EB]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      {ORDER_STATUS_PIPELINE.map((stage, idx) => {
                        const completed = idx <= currentStep;
                        const active = idx === currentStep;
                        return (
                          <div key={stage.key} className="relative">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`w-6 h-6 flex items-center justify-center text-xs font-mono shrink-0 border ${
                                  completed
                                    ? 'bg-[#111317] text-white border-[#111317]'
                                    : 'bg-white text-[#9CA3AF] border-[#D1D5DB]'
                                }`}
                              >
                                {completed ? (
                                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  idx + 1
                                )}
                              </span>
                              <span
                                className={`text-xs font-medium leading-tight ${
                                  active
                                    ? 'text-[#111317] font-semibold'
                                    : completed
                                      ? 'text-[#374151]'
                                      : 'text-[#9CA3AF]'
                                }`}
                              >
                                {stage.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#6B7280] leading-snug pl-8">
                              {stage.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Courier & Live Note Row */}
                    <div className="mt-5 pt-4 border-t border-[#F3F4F6] flex flex-wrap items-center justify-between gap-3 text-xs text-[#4B5563]">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-[#111317] shrink-0" aria-hidden="true" />
                        <span>
                          {order.statusNote || 'Preparing your order for shipment.'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 font-mono text-[#111317]">
                        <span>{order.carrier || 'Kova Express'}</span>
                        {order.trackingCode && (
                          <>
                            <span className="text-[#9CA3AF]">/</span>
                            <span>Track: {order.trackingCode}</span>
                          </>
                        )}
                        {order.estimatedDelivery && (
                          <>
                            <span className="text-[#9CA3AF]">/</span>
                            <span>ETA: {order.estimatedDelivery}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Items & Shipping Address */}
                <div className="pt-5 grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-8 space-y-3">
                    {order.items.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="flex items-center gap-3.5">
                        <div className="w-14 h-12 bg-[#F3F4F6] shrink-0 overflow-hidden">
                          <SafeImage
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#111317] truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-[#6B7280]">
                            {item.color} · Qty {item.quantity} · {formatPrice(item.price)} each
                          </p>
                        </div>
                        <span className="text-sm font-medium text-[#111317] tabular-nums shrink-0">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-4 text-xs text-[#4B5563] md:border-l md:border-[#E5E7EB] md:pl-6 space-y-1">
                    <p className="font-semibold text-[#111317] uppercase tracking-wider mb-1.5">
                      Shipping Destination
                    </p>
                    <p className="font-medium text-[#111317]">{order.customerName}</p>
                    <p>{order.shippingAddress}</p>
                    <p>
                      {order.shippingCity}, {order.shippingPostalCode}
                    </p>
                    <p>{order.customerPhone}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
