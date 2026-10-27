import { useEffect, useMemo, useState } from "react";
import { NavLink} from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

import { useCart } from "../../shared/context/useCart";
import { getService } from "../../shared/lib/service";
import { Button } from "../../shared/components/Button/Button";
import Container from "../../shared/components/Container/Container";
import { SectionHeading } from "../../shared/components/SectionHeading/SectionHeading";

import { supabase } from "../../shared/lib/supabase";

import styles from "./checkout.module.css";
import SEO from "../../shared/components/SEO/seo";

export default function Checkout() {
    const { items } = useCart();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [paying, setPaying] = useState(false);

    const [customer, setCustomer] = useState({
        name: "",
        email: "",
        phone: "",
    });


    const [formError, setFormError] = useState("");

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

                const services = await Promise.all(
                    items.map((item) => getService(item.slug))
                );

                if (!cancelled) {
                    setProducts(services.filter(Boolean));
                }
            } catch (error) {
                console.error("Failed to load checkout items:", error);

                if (!cancelled) {
                    setError(
                        "We couldn't load your order right now. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProducts();

        return () => {
            cancelled = true;
        };
    }, [items]);

    const checkoutItems = useMemo(() => {
        return items
            .map((item) => {
                const product = products.find(
                    (product) => product.id === item.id
                );

                if (!product) {
                    return null;
                }

                return {
                    ...item,
                    product,
                };
            })
            .filter(Boolean);
    }, [items, products]);

    const subtotal = checkoutItems.reduce(
    (total, item) => {
        const { purchaseType, price } = item.product;

        if (
        !["cart", "session", "month"].includes(purchaseType) ||
        price == null
        ) {
        return total;
        }

        return total + price * item.quantity;
    },
    0
    );

    const formatPrice = (price, currency = "INR") => {
        return price.toLocaleString("en-IN", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
        });
    };

    const handleChange = (event) => {
        const { name, value } = event.target;

        setCustomer((current) => ({
            ...current,
            [name]: value,
        }));

        if (formError) {
            setFormError("");
        }
    };

    const handleSubmit = async (event) => {
    event.preventDefault();

    if (!customer.name.trim()) {
        setFormError("Please enter your name.");
        return;
    }

    if (!customer.email.trim()) {
        setFormError("Please enter your email address.");
        return;
    }

    if (!customer.phone.trim()) {
        setFormError("Please enter your phone number.");
        return;
    }

    try {
        setPaying(true);
        setFormError("");

        const payload = {
            items: checkoutItems.map(({ quantity, product }) => ({
                service_id: product.commerce.serviceId,
                quantity,
            })),

            customer: {
                name: customer.name.trim(),
                email: customer.email.trim(),
                phone: customer.phone.trim(),
            },
        };

        const { data, error } = await supabase.functions.invoke(
            "create_payu_payment",
            {
                body: payload,
            }
        );

        if (error) {
            throw error;
        }

        if (!data?.success || !data?.payment?.action) {
            throw new Error("Invalid payment response.");
        }

        const { action, fields } = data.payment;

        const form = document.createElement("form");

        form.method = "POST";
        form.action = action;

        Object.entries(fields).forEach(([name, value]) => {
            const input = document.createElement("input");

            input.type = "hidden";
            input.name = name;
            input.value = String(value ?? "");

            form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
    } catch (error) {
        console.error("Payment initialization failed:", error);

        setFormError(
            "We couldn't start your payment. Please try again."
        );

        setPaying(false);
    }
};

    if (items.length === 0) {
        return (
            <main className={styles.page}>
                <SEO
                    title="Checkout | Empowering Biz"
                    description="Complete your service order with Empowering Biz."
                    path="/checkout"
                    noIndex={true}
                />
                <Container>
                    <div className={styles.empty}>
                        <h1>Your cart is empty</h1>

                        <p>
                            Add a service to your cart before continuing to
                            checkout.
                        </p>

                        <Button
                            as={NavLink}
                            to="/catalogue"
                            variant="primary"
                            size="large"
                            endIcon={<ArrowRight size={18} />}
                        >
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
                      <SectionHeading title="Checkout" eyebrow="Secure checkout" description="Enter your details and review your order before" />
                    </div>

                    <NavLink
                        to="/cart"
                        className={styles.backLink}
                    >
                        <ArrowLeft size={17} />
                        Back to Cart
                    </NavLink>
                </header>

                {loading && (
                    <div className={styles.loading}>
                        Loading your order...
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <form
                        className={styles.layout}
                        onSubmit={handleSubmit}
                    >
                        <section className={styles.details}>
                            <div className={styles.sectionHeader}>
                                <p className={styles.sectionEyebrow}>
                                    Your details
                                </p>

                                <h2>How can we reach you?</h2>

                                <p>
                                    We'll use these details to process your
                                    order and keep you updated.
                                </p>
                            </div>

                            <div className={styles.fields}>
                                <label className={styles.field}>
                                    <span>Full name</span>

                                    <input
                                        type="text"
                                        name="name"
                                        value={customer.name}
                                        onChange={handleChange}
                                        placeholder="Your full name"
                                        autoComplete="name"
                                    />
                                </label>

                                <label className={styles.field}>
                                    <span>Email address</span>

                                    <input
                                        type="email"
                                        name="email"
                                        value={customer.email}
                                        onChange={handleChange}
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                    />
                                </label>

                                <label className={styles.field}>
                                    <span>Phone number</span>

                                    <input
                                        type="tel"
                                        name="phone"
                                        value={customer.phone}
                                        onChange={handleChange}
                                        placeholder="+91 98765 43210"
                                        autoComplete="tel"
                                    />
                                </label>
                            </div>

                            {formError && (
                                <p className={styles.formError}>
                                    {formError}
                                </p>
                            )}

                            <div className={styles.securityNote}>
                                <LockKeyhole size={17} />

                                <span>
                                    Your details are used only to process and
                                    manage your order.
                                </span>
                            </div>
                        </section>

                        <aside className={styles.summary}>
                            <h2>Order Summary</h2>

                            <div className={styles.items}>
                                {checkoutItems.map(
                                    ({ id, quantity, product }) => {
                                        const currency =
                                            product.commerce?.currency ??
                                            "INR";

                                        return (
                                            <div
                                                key={id}
                                                className={styles.item}
                                            >
                                                <div>
                                                    <strong>
                                                        {product.label}
                                                    </strong>

                                                    <span>
                                                        {quantity}{" "}
                                                        {product.purchaseType === "session"
                                                            ? quantity === 1
                                                                ? "session"
                                                                : "sessions"
                                                            : product.purchaseType === "month"
                                                            ? quantity === 1
                                                                ? "month"
                                                                : "months"
                                                            : quantity === 1
                                                            ? "unit"
                                                            : "units"}
                                                    </span>
                                                </div>

                                                <strong>
                                                {product.purchaseType === "callback"
                                                    ? "Flexible pricing"
                                                    : formatPrice(
                                                        product.price * quantity,
                                                        currency
                                                    )}
                                                </strong>
                                            </div>
                                        );
                                    }
                                )}
                            </div>

                            <div className={styles.divider} />

                            <div className={styles.summaryRow}>
                                <span>Subtotal</span>

                                <strong>
                                    {formatPrice(subtotal)}
                                </strong>
                            </div>

                            <div className={styles.totalRow}>
                                <span>Total</span>

                                <strong>
                                    {formatPrice(subtotal)}
                                </strong>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                disabled={paying}
                                size="large"
                                fullWidth
                                endIcon={<ArrowRight size={18} />}
                            >
                                {paying ? "Preparing Payment..." : "Proceed to Payment"}
                            </Button>

                            <p className={styles.paymentNote}>
                                You'll be redirected to our secure payment
                                partner to complete your payment.
                            </p>
                        </aside>
                    </form>
                )}
            </Container>
        </main>
    );
}