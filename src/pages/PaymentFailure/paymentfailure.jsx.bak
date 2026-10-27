import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    CircleAlert,
    Clock3,
} from "lucide-react";

import { Button } from "../../shared/components/Button/Button";
import Container from "../../shared/components/Container/Container";
import { supabase } from "../../shared/lib/supabase";

import styles from "./paymentfailure.module.css";
import SEO from "../../shared/components/SEO/seo";

export default function PaymentFailure() {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get("order_id");

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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
    }, [orderId]);

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
                    title="Payment Failed | Empowering Biz"
                    description="Your payment could not be completed."
                    path="/payment/failure"
                    noIndex={true}
                />
                <Container>
                    <div className={styles.loading}>
                        <div className={styles.loadingIcon}>
                            <Clock3 size={28} />
                        </div>

                        <p>
                            Checking your payment status...
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
                            payment details
                        </h1>

                        <p>
                            Please check your email for
                            any payment updates or return
                            to our services.
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

    const isPending =
        order.status === "pending" ||
        order.status === "processing";

    const isCancelled =
        order.status === "cancelled";

    const title = isPending
        ? "Your payment is still processing"
        : isCancelled
          ? "Payment was cancelled"
          : "Payment wasn't completed";

    const description = isPending
        ? "We haven't received a final payment confirmation yet. Please wait a moment and check again."
        : isCancelled
          ? "The payment process was cancelled before your order could be completed."
          : "We couldn't complete your payment. You can return to checkout and try again.";

    return (
        <main className={styles.page}>
            <Container>
                <div className={styles.content}>
                    <div className={styles.hero}>
                        <div
                            className={
                                isPending
                                    ? styles.pendingIcon
                                    : styles.failureIcon
                            }
                        >
                            {isPending ? (
                                <Clock3
                                    size={42}
                                    strokeWidth={2}
                                />
                            ) : (
                                <CircleAlert
                                    size={42}
                                    strokeWidth={2}
                                />
                            )}
                        </div>

                        <p className={styles.eyebrow}>
                            {isPending
                                ? "Payment pending"
                                : "Payment not completed"}
                        </p>

                        <h1>{title}</h1>

                        <p className={styles.intro}>
                            {description}
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
                                    isPending
                                        ? styles.pendingStatus
                                        : styles.failureStatus
                                }
                            >
                                {isPending
                                    ? "Pending"
                                    : isCancelled
                                      ? "Cancelled"
                                      : "Failed"}
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
                                Order total
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
                            styles.notice
                        }
                    >
                        <p>
                            {isPending
                                ? "If you have already completed the payment, please don't try to pay again just yet."
                                : "If your payment was debited but the order shows as failed, please contact us with your order ID before attempting another payment."}
                        </p>
                    </div>

                    <div
                        className={
                            styles.actions
                        }
                    >
                        {!isPending && (
                            <Button
                                as={NavLink}
                                to="/checkout"
                                variant="primary"
                                size="large"
                                endIcon={
                                    <ArrowRight
                                        size={18}
                                    />
                                }
                            >
                                Try Again
                            </Button>
                        )}

                        <Button
                            as={NavLink}
                            to="/catalogue"
                            variant={
                                isPending
                                    ? "primary"
                                    : "outline"
                            }
                            size="large"
                            startIcon={
                                <ArrowLeft
                                    size={18}
                                />
                            }
                        >
                            Back to Services
                        </Button>
                    </div>
                </div>
            </Container>
        </main>
    );
}