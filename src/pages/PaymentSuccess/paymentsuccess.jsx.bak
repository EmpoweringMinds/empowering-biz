import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
    ArrowRight,
    CircleCheck,
    MailCheck,
} from "lucide-react";

import { Button } from "../../shared/components/Button/Button";
import Container from "../../shared/components/Container/Container";
import { supabase } from "../../shared/lib/supabase";
import { useCart } from "../../shared/context/useCart";

import styles from "./paymentsuccess.module.css";
import SEO from "../../shared/components/SEO/seo";

export default function PaymentSuccess() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get("order_id");

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const { clearCart } = useCart();

    useEffect(() => {
        let cancelled = false;

        async function loadOrder() {
            if (!orderId) {
                setError("We couldn't find your order.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError("");

                const { data, error: functionError } =
                    await supabase.functions.invoke(
                        "get_payment_result",
                        {
                            body: {
                                order_id: orderId,
                            },
                        }
                    );

                if (functionError) {
                    throw functionError;
                }

                if (!data?.success || !data?.order) {
                    throw new Error(
                        "Invalid payment result."
                    );
                }

                if (!cancelled) {
                    setOrder(data.order);
                    clearCart();
                }
            } catch (error) {
                console.error(
                    "Failed to load payment result:",
                    error
                );

                if (!cancelled) {
                    setError(
                        "We couldn't load your order details. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadOrder();

        return () => {
            cancelled = true;
        };
    }, [orderId, clearCart]);

    const formatPrice = (
        amount,
        currency = "INR"
    ) => {
        return Number(amount).toLocaleString(
            "en-IN",
            {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
            }
        );
    };

    if (loading) {
        return (
            <main className={styles.page}>
                <SEO
                    title="Payment Successful | Empowering Biz"
                    description="Your payment has been successfully processed."
                    path="/payment/success"
                    noIndex={true}
                />
                <Container>
                    <div className={styles.loading}>
                        <div className={styles.loadingIcon}>
                            <CircleCheck size={28} />
                        </div>

                        <p>
                            Confirming your payment...
                        </p>
                    </div>
                </Container>
            </main>
        );
    }

    if (error || !order) {
        return (
            <main className={styles.page}>
                <Container>
                    <div className={styles.errorState}>
                        <h1>
                            We couldn't load your
                            order
                        </h1>

                        <p>
                            Your payment may still
                            have been processed. Please
                            check your email or try
                            again shortly.
                        </p>

                        <Button
                            as={NavLink}
                            to="/catalogue"
                            variant="primary"
                            size="large"
                            endIcon={
                                <ArrowRight
                                    size={18}
                                />
                            }
                        >
                            Back to Services
                        </Button>
                    </div>
                </Container>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <Container>
                <div className={styles.content}>
                    <div className={styles.hero}>
                        <div className={styles.successIcon}>
                            <CircleCheck
                                size={42}
                                strokeWidth={2}
                            />
                        </div>

                        <p className={styles.eyebrow}>
                            Payment successful
                        </p>

                        <h1>
                            Thank you for your
                            order!
                        </h1>

                        <p className={styles.intro}>
                            Hi{" "}
                            <strong>
                                {order.customer_name ||
                                    "there"}
                            </strong>
                            , your payment has been
                            received and your order is
                            confirmed.
                        </p>
                    </div>

                    <section
                        className={styles.orderCard}
                    >
                        <div
                            className={
                                styles.orderHeader
                            }
                        >
                            <div>
                                <p
                                    className={
                                        styles.label
                                    }
                                >
                                    Order ID
                                </p>

                                <p
                                    className={
                                        styles.orderId
                                    }
                                >
                                    {order.order_id}
                                </p>
                            </div>

                            <span
                                className={
                                    styles.status
                                }
                            >
                                Confirmed
                            </span>
                        </div>

                        <div
                            className={
                                styles.divider
                            }
                        />

                        <div
                            className={
                                styles.items
                            }
                        >
                            {order.items.map(
                                (item) => (
                                    <div
                                        key={`${item.name}-${item.quantity}`}
                                        className={
                                            styles.item
                                        }
                                    >
                                        <div
                                            className={
                                                styles.itemInfo
                                            }
                                        >
                                            <strong>
                                                {
                                                    item.name
                                                }
                                            </strong>

                                            <span>
                                                Qty{" "}
                                                {
                                                    item.quantity
                                                }
                                            </span>
                                        </div>

                                        <strong>
                                            {formatPrice(
                                                item.amount,
                                                order.currency
                                            )}
                                        </strong>
                                    </div>
                                )
                            )}
                        </div>

                        <div
                            className={
                                styles.divider
                            }
                        />

                        <div
                            className={
                                styles.totalRow
                            }
                        >
                            <span>
                                Total paid
                            </span>

                            <strong>
                                {formatPrice(
                                    order.amount,
                                    order.currency
                                )}
                            </strong>
                        </div>
                    </section>

                    <div
                        className={
                            styles.emailNotice
                        }
                    >
                        <MailCheck
                            size={20}
                        />

                        <p>
                            A confirmation email has
                            been sent with your order
                            details.
                        </p>
                    </div>

                    <div
                        className={
                            styles.nextSteps
                        }
                    >
                        <h2>
                            What's next?
                        </h2>

                        <p>
                            Our team will review your
                            order and get in touch with
                            you regarding the next steps.
                        </p>
                    </div>

                    <div
                        className={
                            styles.actions
                        }
                    >
                        <Button
                            as={NavLink}
                            to="/catalogue"
                            variant="primary"
                            size="large"
                            endIcon={
                                <ArrowRight
                                    size={18}
                                />
                            }
                        >
                            Explore More Services
                        </Button>
                    </div>
                </div>
            </Container>
        </main>
    );
}