import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

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
  const { items } = useCart();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [formError, setFormError] = useState("");
  const [, setPaymentResult] = useState(null);

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
              navigate(`/payment/success?order_id=${encodeURIComponent(internalOrderId)}`);
              return;
            }

            // Pending, failed, or unconfirmed outcomes are checked against D1
            // on the result page; the browser response alone is not treated as final.
            navigate(`/payment/failure?order_id=${encodeURIComponent(internalOrderId)}`);
          } catch (verificationError) {
            console.error("Payment verification did not complete:", verificationError);
            // The payment may have succeeded even if this request failed.
            // The result page reads the server-side order status before displaying an outcome.
            navigate(`/payment/failure?order_id=${encodeURIComponent(internalOrderId)}`);
          }
        },
      });


      checkout.on("payment.failed", async (failure) => {
        console.warn(
          "Razorpay reports a failed payment attempt:",
          failure?.error?.code
        );

        if (!internalOrderId) {
          setFormError("The payment was not completed. You can try again when you're ready.");
          setPaying(false);
          return;
        }

        const metadata = failure?.error?.metadata;
        const razorpayPaymentId = metadata?.payment_id;
        const razorpayOrderId = metadata?.order_id;

        if (razorpayPaymentId && razorpayOrderId) {
          try {
            await apiRequest("/api/payments/record-failure", {
              method: "POST",
              body: JSON.stringify({
                order_id: internalOrderId,
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: razorpayPaymentId,
              }),
            });
          } catch (failureRecordError) {
            // Do not assume the failure was saved. The result page will
            // read the authoritative order state from the Worker.
            console.error(
              "Could not record the failed payment attempt:",
              failureRecordError
            );
          }
        }

        navigate(`/payment/failure?order_id=${encodeURIComponent(internalOrderId)}`);
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
