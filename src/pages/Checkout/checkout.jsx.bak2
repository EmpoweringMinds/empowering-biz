import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole, CheckCircle2, Clock3 } from "lucide-react";

import { useCart } from "../../shared/context/useCart";
import { getService } from "../../shared/lib/service";
import { apiRequest } from "../../shared/lib/api";
import { Button } from "../../shared/components/Button/Button";
import Container from "../../shared/components/Container/Container";
import { SectionHeading } from "../../shared/components/SectionHeading/SectionHeading";

import styles from "./checkout.module.css";
import SEO from "../../shared/components/SEO/seo";

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load secure checkout.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load secure checkout."));
    document.body.appendChild(script);
  });
}

export default function Checkout() {
  const { items, clearCart } = useCart();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [formError, setFormError] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      if (items.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const services = await Promise.all(items.map((item) => getService(item.slug)));
        if (!cancelled) setProducts(services.filter(Boolean));
      } catch (loadError) {
        console.error("Failed to load checkout items:", loadError);
        if (!cancelled) {
          setError("We couldn't load your order right now. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const checkoutItems = useMemo(
    () => items
      .map((item) => {
        const product = products.find((candidate) => candidate.id === item.id);
        return product ? { ...item, product } : null;
      })
      .filter(Boolean),
    [items, products]
  );

  const hasMissingItems = checkoutItems.length !== items.length;
  const hasIneligibleItems = checkoutItems.some(
    ({ product }) => product.commerce?.checkoutEligible !== true
  );
  const checkoutBlocked = hasMissingItems || hasIneligibleItems;

  const subtotal = checkoutItems.reduce((total, item) => {
    const { product, quantity } = item;
    if (product.commerce?.checkoutEligible !== true || product.price == null) return total;
    return total + Number(product.price) * quantity;
  }, 0);

  const formatPrice = (price, currency = "INR") => price.toLocaleString("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
    if (formError) setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (paying) return;

    if (!customer.name.trim()) return setFormError("Please enter your name.");
    if (!customer.email.trim()) return setFormError("Please enter your email address.");
    if (!customer.phone.trim()) return setFormError("Please enter your phone number.");
    if (checkoutBlocked) {
      return setFormError("One or more services cannot be purchased online. Please remove them or contact us for an enquiry.");
    }

    setPaying(true);
    setFormError("");

    let internalOrderId = null;

    try {
      await loadRazorpayScript();

      const created = await apiRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          items: checkoutItems.map(({ quantity, product }) => ({
            service_id: product.commerce.serviceId,
            quantity,
          })),
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
          },
        }),
      });

      if (created?.created !== true || !created?.order?.order_id) {
        throw new Error("The order could not be created.");
      }
      internalOrderId = created.order.order_id;

      const gateway = await apiRequest("/api/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ order_id: internalOrderId }),
      });

      if (!gateway?.success || !gateway?.key_id || !gateway?.order?.razorpay_order_id) {
        throw new Error("The payment provider did not return a valid order.");
      }

      let verificationStarted = false;
      const checkout = new window.Razorpay({
        key: gateway.key_id,
        amount: gateway.order.amount_paise,
        currency: gateway.order.currency,
        name: "Empowering Biz",
        description: "Service order payment",
        order_id: gateway.order.razorpay_order_id,
        prefill: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          contact: customer.phone.trim(),
        },
        notes: { empowering_biz_order_id: internalOrderId },
        modal: {
          ondismiss: () => {
            if (!verificationStarted) setPaying(false);
          },
        },
        handler: async (razorpayResponse) => {
          verificationStarted = true;
          try {
            const verification = await apiRequest("/api/payments/verify", {
              method: "POST",
              body: JSON.stringify({
                order_id: internalOrderId,
                razorpay_order_id: razorpayResponse.razorpay_order_id,
                razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                razorpay_signature: razorpayResponse.razorpay_signature,
              }),
            });

            if (verification?.verified && verification.status === "success") {
              clearCart();
              setPaymentResult({ status: "success", orderId: internalOrderId });
              return;
            }

            if (verification?.verified && verification.status === "processing") {
              setPaymentResult({ status: "pending", orderId: internalOrderId });
              return;
            }

            if (verification?.status === "failed") {
              setFormError("Razorpay reports that this payment failed. You can try again.");
              setPaying(false);
              return;
            }

            setPaymentResult({ status: "checking", orderId: internalOrderId });
          } catch (verificationError) {
            console.error("Payment verification did not complete:", verificationError);
            // A payment may have succeeded even if the verification request failed.
            // Prevent an immediate duplicate payment attempt and show the order reference.
            setPaymentResult({ status: "checking", orderId: internalOrderId });
          }
        },
      });

      checkout.on("payment.failed", (failure) => {
        console.warn("Razorpay reports a failed payment attempt:", failure?.error?.code);
        setFormError("The payment was not completed. You can try again when you're ready.");
        setPaying(false);
      });

      checkout.open();
    } catch (submitError) {
      console.error("Payment initialization failed:", submitError);
      if (internalOrderId) {
        setPaymentResult({ status: "checking", orderId: internalOrderId });
      } else {
        setFormError(submitError.message || "We couldn't start your payment. Please try again.");
        setPaying(false);
      }
    }
  };

  if (paymentResult) {
    const isSuccess = paymentResult.status === "success";
    const isPending = paymentResult.status === "pending";
    return (
      <main className={styles.page}>
        <SEO title="Payment status | Empowering Biz" description="Your Empowering Biz order payment status." path="/checkout" noIndex />
        <Container>
          <div className={styles.empty}>
            {isSuccess ? <CheckCircle2 size={42} aria-hidden="true" /> : <Clock3 size={42} aria-hidden="true" />}
            <h1>{isSuccess ? "Payment confirmed" : isPending ? "Payment confirmation pending" : "We're confirming your payment"}</h1>
            <p>
              {isSuccess
                ? "Your payment has been verified and your order is confirmed."
                : isPending
                  ? "Your payment is authorised but has not yet been confirmed as captured. Please don't try to pay again."
                  : "We couldn't confirm the final payment status yet. Please don't make another payment. Keep your order reference and contact us if the status doesn't update."}
            </p>
            <p><strong>Order reference:</strong> {paymentResult.orderId}</p>
            <Button as={NavLink} to="/contact" variant="primary" size="large" endIcon={<ArrowRight size={18} />}>
              Contact us about this order
            </Button>
            {isSuccess && <p>You can safely close this page.</p>}
          </div>
        </Container>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className={styles.page}>
        <SEO title="Checkout | Empowering Biz" description="Complete your service order with Empowering Biz." path="/checkout" noIndex />
        <Container>
          <div className={styles.empty}>
            <h1>Your cart is empty</h1>
            <p>Add a service to your cart before continuing to checkout.</p>
            <Button as={NavLink} to="/catalogue" variant="primary" size="large" endIcon={<ArrowRight size={18} />}>
              Explore Our Services
            </Button>
          </div>
        </Container>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Container>
        <header className={styles.header}>
          <div>
            <SectionHeading title="Checkout" eyebrow="Secure checkout" description="Enter your details and review your order before payment." />
          </div>
          <NavLink to="/cart" className={styles.backLink}>
            <ArrowLeft size={17} /> Back to Cart
          </NavLink>
        </header>

        {loading && <div className={styles.loading}>Loading your order...</div>}
        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && (
          <form className={styles.layout} onSubmit={handleSubmit}>
            <section className={styles.details}>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionEyebrow}>Your details</p>
                <h2>How can we reach you?</h2>
                <p>We'll use these details to process your order and keep you updated.</p>
              </div>

              <div className={styles.fields}>
                <label className={styles.field}>
                  <span>Full name</span>
                  <input type="text" name="name" value={customer.name} onChange={handleChange} placeholder="Your full name" autoComplete="name" required />
                </label>
                <label className={styles.field}>
                  <span>Email address</span>
                  <input type="email" name="email" value={customer.email} onChange={handleChange} placeholder="you@example.com" autoComplete="email" required />
                </label>
                <label className={styles.field}>
                  <span>Phone number</span>
                  <input type="tel" name="phone" value={customer.phone} onChange={handleChange} placeholder="+91 98765 43210" autoComplete="tel" required />
                </label>
              </div>

              {formError && <p className={styles.formError} role="alert">{formError}</p>}
              {checkoutBlocked && (
                <p className={styles.formError} role="alert">
                  One or more items require an enquiry and cannot be purchased online. Please return to your cart and remove those items, or contact us.
                </p>
              )}

              <div className={styles.securityNote}>
                <LockKeyhole size={17} />
                <span>Your details are used only to process and manage your order.</span>
              </div>
            </section>

            <aside className={styles.summary}>
              <h2>Order Summary</h2>
              <div className={styles.items}>
                {checkoutItems.map(({ id, quantity, product }) => {
                  const currency = product.commerce?.currency ?? "INR";
                  const unitLabel = product.purchaseType === "session"
                    ? (quantity === 1 ? "session" : "sessions")
                    : product.purchaseType === "month"
                      ? (quantity === 1 ? "month" : "months")
                      : (quantity === 1 ? "unit" : "units");

                  return (
                    <div key={id} className={styles.item}>
                      <div>
                        <strong>{product.label}</strong>
                        <span>{quantity} {unitLabel}</span>
                      </div>
                      <strong>
                        {product.commerce?.checkoutEligible
                          ? formatPrice(Number(product.price) * quantity, currency)
                          : "Enquiry required"}
                      </strong>
                    </div>
                  );
                })}
              </div>

              <div className={styles.divider} />
              <div className={styles.summaryRow}><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
              <div className={styles.totalRow}><span>Total</span><strong>{formatPrice(subtotal)}</strong></div>

              <Button type="submit" variant="primary" disabled={paying || loading || Boolean(error) || checkoutBlocked || checkoutItems.length === 0} size="large" fullWidth endIcon={<ArrowRight size={18} />}>
                {paying ? "Preparing Payment..." : "Pay securely with Razorpay"}
              </Button>
              <p className={styles.paymentNote}>Payment is processed securely by Razorpay. Your order is confirmed only after the server verifies payment.</p>
            </aside>
          </form>
        )}
      </Container>
    </main>
  );
}
