import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { CartItem } from '../types';
import {
  CATEGORY_LABELS,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  formatPrice,
} from '../data/catalog';
import { SafeImage } from './SafeImage';

interface CartDrawerProps {
  open: boolean;
  items: CartItem[];
  user: User | null;
  onClose: () => void;
  onUpdateQuantity: (productId: string, color: string, quantity: number) => void;
  onRemoveItem: (productId: string, color: string) => void;
  onProceedToCheckout: () => void;
}

export function CartDrawer({
  open,
  items,
  user,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout,
}: CartDrawerProps) {
  if (!open) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const qualifiesForFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0;
  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const shippingFee = qualifiesForFreeShipping ? 0 : STANDARD_SHIPPING_FEE;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" role="dialog" aria-modal="true" aria-label="Shopping bag">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-10 w-full max-w-md bg-white h-full flex flex-col border-l border-[#E5E7EB]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-lg font-semibold text-[#111317]">Shopping Bag</h2>
            <p className="text-xs text-[#6B7280] tabular-nums">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shopping bag"
            className="p-2 text-[#6B7280] hover:text-[#111317] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {items.length > 0 && (
          <div className="px-6 py-3 bg-[#F8F9FA] border-b border-[#E5E7EB] text-xs text-[#4B5563]">
            {qualifiesForFreeShipping ? (
              <span className="text-[#111317] font-medium">
                Complimentary insured shipping unlocked on your order.
              </span>
            ) : (
              <span>
                Add <span className="font-semibold text-[#111317] tabular-nums">{formatPrice(remainingForFree)}</span> more for complimentary insured shipping.
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 divide-y divide-[#E5E7EB]">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-9 h-9 text-[#9CA3AF] stroke-[1.5] mb-4" aria-hidden="true" />
              <p className="text-base font-medium text-[#111317] mb-1">Your bag is empty</p>
              <p className="text-sm text-[#6B7280] max-w-xs mb-6">
                Explore handcrafted bags, commuter packs, everyday apparel, and heirloom wooden toys.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium bg-[#111317] text-white hover:bg-[#272B33] transition-colors"
              >
                Continue Browsing
              </button>
            </div>
          ) : (
            items.map((item) => {
              const maxAllowed = Math.max(1, Math.min(20, item.product.stock));
              return (
                <div key={`${item.product.id}-${item.color}`} className="py-5 first:pt-0 flex gap-4">
                  <div className="w-24 h-20 bg-[#F3F4F6] shrink-0 overflow-hidden">
                    <SafeImage
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#111317] truncate">
                        {item.product.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.product.id, item.color)}
                        aria-label={`Remove ${item.product.name}`}
                        className="p-1 text-[#9CA3AF] hover:text-[#B91C1C] transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5">
                      {CATEGORY_LABELS[item.product.category]} · {item.color}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="inline-flex items-center border border-[#D1D5DB]">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.product.id, item.color, item.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="w-8 h-8 flex items-center justify-center text-[#4B5563] hover:text-[#111317] hover:bg-[#F8F9FA]"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-medium text-[#111317] tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateQuantity(
                              item.product.id,
                              item.color,
                              Math.min(maxAllowed, item.quantity + 1)
                            )
                          }
                          disabled={item.quantity >= maxAllowed}
                          aria-label="Increase quantity"
                          className="w-8 h-8 flex items-center justify-center text-[#4B5563] hover:text-[#111317] hover:bg-[#F8F9FA] disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-[#111317] tabular-nums">
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[#E5E7EB] px-6 py-5 bg-white space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[#4B5563]">
                <span>Subtotal</span>
                <span className="tabular-nums font-medium text-[#111317]">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#4B5563]">
                <span>Estimated Shipping</span>
                <span className="tabular-nums text-[#111317]">
                  {shippingFee === 0 ? 'Complimentary' : formatPrice(shippingFee)}
                </span>
              </div>
            </div>

            {!user && (
              <p className="text-xs text-[#4B5563] bg-[#F8F9FA] border border-[#E5E7EB] px-3 py-2">
                Sign-in is required at the next step to complete your order and enable live tracking.
              </p>
            )}

            <button
              type="button"
              onClick={onProceedToCheckout}
              className="w-full py-3.5 px-5 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>{user ? 'Proceed to Secure Checkout' : 'Sign In & Checkout'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
