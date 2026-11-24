import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Truck,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Order, Product, ProductReview } from '../types';
import { CATEGORY_LABELS, formatPrice, formatShortDate } from '../data/catalog';
import { SafeImage } from './SafeImage';

interface ProductDetailViewProps {
  product: Product;
  user: User | null;
  isAdmin: boolean;
  userOrders: Order[];
  onBack: () => void;
  onAddToCart: (product: Product, color: string, quantity: number) => void;
  onRequireAuth: (reason: string) => void;
}

export function ProductDetailView({
  product,
  user,
  isAdmin,
  userOrders,
  onBack,
  onAddToCart,
  onRequireAuth,
}: ProductDetailViewProps) {
  const [selectedColor, setSelectedColor] = useState(product.colors[0] || 'Standard');
  const [quantity, setQuantity] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);

  // Live Firestore reviews state
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // Review composer state
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setSelectedColor(product.colors[0] || 'Standard');
    setQuantity(1);
  }, [product.id, product.colors]);

  // Dynamic Schema.org Product JSON-LD for SEO
  useEffect(() => {
    const scriptId = 'kova-product-jsonld';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove();

    const avgRating =
      reviews.length > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1))
        : undefined;

    const schema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: product.sku,
      description: product.description,
      image: `${window.location.origin}${product.imageUrl}`,
      category: CATEGORY_LABELS[product.category],
      brand: { '@type': 'Brand', name: 'Kova Goods' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: product.price.toFixed(2),
        availability:
          product.stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        url: window.location.href,
      },
    };

    if (avgRating && reviews.length > 0) {
      schema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: avgRating,
        reviewCount: reviews.length,
      };
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById(scriptId);
      if (el) el.remove();
    };
  }, [product, reviews]);

  // Subscribe to real-time reviews for this product
  useEffect(() => {
    if (product.isPreviewOnly) {
      setReviews([]);
      setReviewsLoading(false);
      return;
    }

    setReviewsLoading(true);
    const reviewsPath = `products/${product.id}/reviews`;
    const q = query(collection(db, reviewsPath), where('productId', '==', product.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ProductReview, 'id'>),
        }));
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() ?? 0;
          const tB = b.createdAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setReviews(list);
        setReviewsLoading(false);
      },
      (error) => {
        setReviewsLoading(false);
        handleFirestoreError(error, OperationType.LIST, reviewsPath);
      }
    );

    return () => unsubscribe();
  }, [product.id, product.isPreviewOnly]);

  const hasPurchasedProduct = useMemo(() => {
    if (!user) return false;
    return userOrders.some(
      (o) =>
        o.status !== 'cancelled' &&
        o.items.some((item) => item.productId === product.id)
    );
  }, [user, userOrders, product.id]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);

  const maxPurchasable = Math.max(1, Math.min(20, product.stock));

  function handleAdd() {
    if (product.stock <= 0) return;
    onAddToCart(product, selectedColor, quantity);
    setAddedFeedback(true);
    window.setTimeout(() => setAddedFeedback(false), 1600);
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReviewMessage(null);

    if (!user) {
      onRequireAuth('Sign in with your account to share a customer review for this product.');
      return;
    }

    if (product.isPreviewOnly) {
      setReviewMessage({
        type: 'error',
        text: 'This preview catalog item must be published in the Admin Panel before reviews can be saved.',
      });
      return;
    }

    const cleanTitle = reviewTitle.trim().slice(0, 100);
    const cleanComment = reviewComment.trim().slice(0, 1000);

    if (cleanTitle.length < 2) {
      setReviewMessage({ type: 'error', text: 'Please add a short headline (at least 2 characters).' });
      return;
    }
    if (cleanComment.length < 5) {
      setReviewMessage({ type: 'error', text: 'Please write at least 5 characters about your experience.' });
      return;
    }

    setSubmittingReview(true);
    const reviewsPath = `products/${product.id}/reviews`;

    try {
      if (editingReviewId) {
        const ref = doc(db, reviewsPath, editingReviewId);
        await updateDoc(ref, {
          rating: Math.max(1, Math.min(5, Math.round(rating))),
          title: cleanTitle,
          comment: cleanComment,
          updatedAt: serverTimestamp(),
        });
        setEditingReviewId(null);
        setReviewMessage({ type: 'success', text: 'Your review has been updated.' });
      } else {
        await addDoc(collection(db, reviewsPath), {
          productId: product.id,
          userId: user.uid,
          authorName: (user.displayName || user.email?.split('@')[0] || 'Customer').slice(0, 80),
          rating: Math.max(1, Math.min(5, Math.round(rating))),
          title: cleanTitle,
          comment: cleanComment,
          verifiedPurchase: hasPurchasedProduct,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setReviewMessage({ type: 'success', text: 'Thank you — your review is now live.' });
      }
      setRating(5);
      setReviewTitle('');
      setReviewComment('');
    } catch (error) {
      handleFirestoreError(
        error,
        editingReviewId ? OperationType.UPDATE : OperationType.CREATE,
        reviewsPath
      );
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleDeleteReview(reviewId: string) {
    const reviewPath = `products/${product.id}/reviews/${reviewId}`;
    try {
      await deleteDoc(doc(db, 'products', product.id, 'reviews', reviewId));
      if (editingReviewId === reviewId) {
        setEditingReviewId(null);
        setReviewTitle('');
        setReviewComment('');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, reviewPath);
    }
  }

  return (
    <article className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 md:pb-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-[#4B5563] hover:text-[#111317] transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back to Catalog</span>
      </button>

      {/* Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
        {/* Left: Studio Product Image & Specifications */}
        <div className="lg:col-span-7 space-y-6">
          <div className="aspect-[4/3] w-full bg-[#ECEEF2] overflow-hidden border border-[#E5E7EB]">
            <SafeImage
              src={product.imageUrl}
              alt={product.name}
              loading="eager"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[#E5E7EB]">
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-[#6B7280] mb-1.5">
                Materials &amp; Craft
              </h3>
              <p className="text-sm text-[#111317] leading-relaxed">
                {product.material || 'Selected durable studio-grade materials.'}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-[#6B7280] mb-1.5">
                Dimensions &amp; Fit
              </h3>
              <p className="text-sm text-[#111317] leading-relaxed">
                {product.dimensions || 'Standard everyday carry proportions.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Sticky Purchase Module */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 bg-white border border-[#E5E7EB] p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-2">
            <span>{CATEGORY_LABELS[product.category]}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{product.sku}</span>
          </div>

          <h1 className="text-3xl font-semibold text-[#111317] leading-tight mb-3">
            {product.name}
          </h1>

          {/* Rating & Live Stock Text Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#4B5563] mb-5">
            <div className="inline-flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-[#B45309] text-[#B45309]" aria-hidden="true" />
              <span className="font-medium text-[#111317] tabular-nums">
                {reviews.length > 0 ? averageRating.toFixed(1) : 'New'}
              </span>
              <span>
                ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
              </span>
            </div>
            <span aria-hidden="true">·</span>
            <span className={product.stock > 0 ? 'text-[#15803D] font-medium' : 'text-[#B91C1C] font-medium'}>
              {product.stock > 5
                ? `In Stock (${product.stock} available)`
                : product.stock > 0
                  ? `Low Stock (${product.stock} left)`
                  : 'Currently Out of Stock'}
            </span>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-2xl font-semibold text-[#111317] tabular-nums">
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-sm text-[#9CA3AF] line-through tabular-nums">
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          <p className="text-sm text-[#4B5563] leading-relaxed mb-6">{product.description}</p>

          {/* Finish / Color Selector */}
          <div className="mb-6">
            <span className="block text-xs font-medium text-[#4B5563] mb-2.5">
              Finish / Variant: <strong className="text-[#111317]">{selectedColor}</strong>
            </span>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((color) => {
                const active = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`px-3.5 py-2 text-xs font-medium border transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#111317] text-white border-[#111317]'
                        : 'bg-white text-[#374151] border-[#D1D5DB] hover:border-[#111317]'
                    }`}
                  >
                    {color}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity & Primary CTA */}
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center border border-[#D1D5DB] h-12">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-10 h-full flex items-center justify-center text-[#4B5563] hover:text-[#111317]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-sm font-medium tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxPurchasable, q + 1))}
                disabled={quantity >= maxPurchasable}
                aria-label="Increase quantity"
                className="w-10 h-full flex items-center justify-center text-[#4B5563] hover:text-[#111317] disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={product.stock <= 0}
              className="flex-1 h-12 px-6 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] disabled:bg-[#9CA3AF] transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {addedFeedback ? (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Added to Bag</span>
                </>
              ) : product.stock > 0 ? (
                <span>Add to Bag · {formatPrice(product.price * quantity)}</span>
              ) : (
                <span>Out of Stock</span>
              )}
            </button>
          </div>

          <div className="pt-5 border-t border-[#E5E7EB] space-y-2.5 text-xs text-[#4B5563]">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-[#111317] shrink-0" aria-hidden="true" />
              <span>Complimentary insured shipping on orders over $150 · Real-time tracking.</span>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#111317] shrink-0" aria-hidden="true" />
              <span>2-year craftsmanship warranty · Card, UPI, and Cash on Delivery supported.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Customer Reviews Section */}
      <section className="mt-16 pt-12 border-t border-[#E5E7EB]" aria-labelledby="reviews-heading">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left: Review Summary & Composer */}
          <div className="lg:col-span-5">
            <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-2">
              Customer Feedback
            </p>
            <h2 id="reviews-heading" className="text-2xl font-semibold text-[#111317] mb-3">
              Verified Reviews
            </h2>
            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-3xl font-semibold text-[#111317] tabular-nums">
                {reviews.length > 0 ? averageRating.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-[#6B7280]">
                out of 5 · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
              </span>
            </div>

            <form
              onSubmit={handleReviewSubmit}
              className="bg-white border border-[#E5E7EB] p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#111317]">
                  {editingReviewId ? 'Edit your review' : 'Write a review'}
                </h3>
                {editingReviewId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReviewId(null);
                      setReviewTitle('');
                      setReviewComment('');
                      setRating(5);
                    }}
                    className="text-xs text-[#6B7280] hover:text-[#111317]"
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              <div>
                <span className="block text-xs text-[#4B5563] mb-1.5">Your Rating</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starVal) => (
                    <button
                      key={starVal}
                      type="button"
                      onClick={() => setRating(starVal)}
                      aria-label={`Rate ${starVal} stars`}
                      className="p-1"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          starVal <= rating
                            ? 'fill-[#B45309] text-[#B45309]'
                            : 'text-[#D1D5DB]'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs text-[#6B7280] ml-2 tabular-nums">{rating} / 5</span>
                </div>
              </div>

              <div>
                <label htmlFor="review-title" className="block text-xs text-[#4B5563] mb-1">
                  Headline
                </label>
                <input
                  id="review-title"
                  type="text"
                  maxLength={100}
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  placeholder="Summarize your impression"
                  className="w-full px-3 py-2 text-sm border border-[#D1D5DB] bg-white text-[#111317] focus:border-[#111317] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="review-comment" className="block text-xs text-[#4B5563] mb-1">
                  Review Details
                </label>
                <textarea
                  id="review-comment"
                  rows={3}
                  maxLength={1000}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="How is the craftsmanship, fit, or everyday durability?"
                  className="w-full px-3 py-2 text-sm border border-[#D1D5DB] bg-white text-[#111317] focus:border-[#111317] focus:outline-none resize-y"
                />
              </div>

              {reviewMessage && (
                <p
                  className={`text-xs px-3 py-2 border ${
                    reviewMessage.type === 'error'
                      ? 'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA]'
                      : 'text-[#15803D] bg-[#F0FDF4] border-[#BBF7D0]'
                  }`}
                >
                  {reviewMessage.text}
                </p>
              )}

              <button
                type="submit"
                disabled={submittingReview}
                className="w-full py-2.5 px-4 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] disabled:opacity-60 transition-colors"
              >
                {submittingReview
                  ? 'Saving Review...'
                  : user
                    ? editingReviewId
                      ? 'Save Changes'
                      : 'Post Review'
                    : 'Sign In to Post Review'}
              </button>
            </form>
          </div>

          {/* Right: Live Review Feed */}
          <div className="lg:col-span-7">
            {reviewsLoading ? (
              <div className="py-10 text-sm text-[#6B7280]">Loading customer reviews...</div>
            ) : reviews.length === 0 ? (
              <div className="bg-white border border-[#E5E7EB] p-8 text-center">
                <p className="text-base font-medium text-[#111317] mb-1">No reviews yet</p>
                <p className="text-sm text-[#6B7280]">
                  Be the first customer to review the {product.name}.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E7EB] border-t border-b border-[#E5E7EB] bg-white px-6">
                {reviews.map((rev) => {
                  const canManage = user && (user.uid === rev.userId || isAdmin);
                  return (
                    <div key={rev.id} className="py-6">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex items-center gap-0.5" aria-label={`${rev.rating} out of 5 stars`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                  key={n}
                                  className={`w-3.5 h-3.5 ${
                                    n <= rev.rating
                                      ? 'fill-[#B45309] text-[#B45309]'
                                      : 'text-[#E5E7EB]'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-sm font-semibold text-[#111317]">
                              {rev.title}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                            <span className="font-medium text-[#374151]">{rev.authorName}</span>
                            {rev.verifiedPurchase && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#15803D]">Verified Purchase</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>{formatShortDate(rev.createdAt)}</span>
                          </div>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-3 shrink-0">
                            {user.uid === rev.userId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReviewId(rev.id);
                                  setRating(rev.rating);
                                  setReviewTitle(rev.title);
                                  setReviewComment(rev.comment);
                                }}
                                className="text-xs text-[#4B5563] hover:text-[#111317]"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteReview(rev.id)}
                              aria-label="Delete review"
                              className="p-1 text-[#9CA3AF] hover:text-[#B91C1C]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-[#374151] leading-relaxed mt-2">{rev.comment}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Mobile Sticky Bottom Buy Bar (<= 15% viewport height) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E5E7EB] px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-[#6B7280] truncate">{product.name}</p>
          <p className="text-sm font-semibold text-[#111317] tabular-nums">
            {formatPrice(product.price * quantity)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={product.stock <= 0}
          className="px-5 py-2.5 bg-[#111317] text-white text-xs font-medium hover:bg-[#272B33] disabled:bg-[#9CA3AF] whitespace-nowrap shrink-0"
        >
          {addedFeedback ? 'Added' : product.stock > 0 ? 'Add to Bag' : 'Sold Out'}
        </button>
      </div>
    </article>
  );
}
