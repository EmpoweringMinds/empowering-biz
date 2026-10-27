const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_QUANTITY_PER_ITEM = 10;
const MAX_CART_LINES = 62;

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  });
}

function toPublicService(row) {
  return {
    id: row.id,
    service_id: row.service_id,
    slug: row.slug,
    price: row.price_paise == null ? null : row.price_paise / 100,
    price_paise: row.price_paise,
    price_type: row.price_type,
    currency: row.currency,
    is_active: Boolean(row.is_active),
    purchase_type: row.purchase_type,
    // Explicit UI hint only. The Worker will independently enforce this at checkout.
    checkout_eligible:
      row.is_active === 1 &&
      row.price_type === "fixed" &&
      row.price_paise != null &&
      row.price_paise > 0 &&
      ["cart", "month", "session"].includes(row.purchase_type)
  };
}


function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function constantTimeEqualHex(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right) ||
      left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function razorpayAuth(keyId, keySecret) {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const headers = corsHeaders(request, env);

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins(env).includes(origin)) {
      return new Response("Origin not allowed", { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }

  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).includes(origin)) {
    return json(request, env, { error: "Origin not allowed" }, 403);
  }

  if (request.method === "GET" && path === "/api/health") {
    try {
      const result = await env.DB.prepare("SELECT 1 AS ok").first();
      return json(request, env, { ok: result?.ok === 1, service: "empowering-biz-api", database: "connected" });
    } catch (error) {
      console.error("Health check database error", error);
      return json(request, env, { ok: false, service: "empowering-biz-api", database: "unavailable" }, 503);
    }
  }

  if (request.method === "GET" && path === "/api/services") {
    try {
      const { results = [] } = await env.DB.prepare(
        `SELECT id, service_id, slug, price_paise, price_type, currency, is_active, purchase_type
         FROM services WHERE is_active = 1 ORDER BY id ASC`
      ).all();
      return json(request, env, { services: results.map(toPublicService), count: results.length });
    } catch (error) {
      console.error("Service list query failed", error);
      return json(request, env, { error: "Unable to load services" }, 500);
    }
  }

  const serviceMatch = path.match(/^\/api\/services\/([^/]+)$/);
  if (request.method === "GET" && serviceMatch) {
    let slug;
    try {
      slug = decodeURIComponent(serviceMatch[1]);
    } catch {
      return json(request, env, { error: "Invalid service slug" }, 400);
    }
    try {
      const row = await env.DB.prepare(
        `SELECT id, service_id, slug, price_paise, price_type, currency, is_active, purchase_type
         FROM services WHERE slug = ? AND is_active = 1 LIMIT 1`
      ).bind(slug).first();
      if (!row) return json(request, env, { error: "Service not found" }, 404);
      return json(request, env, { service: toPublicService(row) });
    } catch (error) {
      console.error("Service detail query failed", error);
      return json(request, env, { error: "Unable to load service" }, 500);
    }
  }


  // Read-only order summary used by the frontend payment result pages.
  // Do not return customer email or phone to the browser.
  const orderResultMatch = path.match(/^\/api\/orders\/(EB-[0-9a-f-]{36})\/result$/i);
  if (request.method === "GET" && orderResultMatch) {
    const orderId = orderResultMatch[1];
    try {
      const order = await env.DB.prepare(
        `SELECT order_id, amount_paise, currency, customer_name, status
         FROM orders WHERE order_id = ? LIMIT 1`
      ).bind(orderId).first();

      if (!order) {
        return json(request, env, { error: "Order not found" }, 404);
      }

      const payment = await env.DB.prepare(
        `SELECT status, error_code, error_description
         FROM payment_transactions
         WHERE order_id = ?
         ORDER BY id DESC LIMIT 1`
      ).bind(orderId).first();

      const { results = [] } = await env.DB.prepare(
        `SELECT s.slug, oi.quantity, oi.amount_paise
         FROM order_items oi
         JOIN services s ON s.service_id = oi.service_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`
      ).bind(orderId).all();

      return json(request, env, {
        success: true,
        order: {
          order_id: order.order_id,
          status: order.status,
          payment_status: payment?.status ?? "unknown",
          payment_error: payment?.status === "failed"
            ? {
                code: payment.error_code,
                description: payment.error_description
              }
            : null,
          customer_name: order.customer_name,
          amount: order.amount_paise / 100,
          currency: order.currency,
          items: results.map((item) => ({
            slug: item.slug,
            name: item.slug
              .split("-")
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" "),
            quantity: item.quantity,
            amount: item.amount_paise / 100
          }))
        }
      });
    } catch (error) {
      console.error("Could not load order result", error);
      return json(request, env, { error: "Unable to load order result" }, 500);
    }
  }

  if (request.method === "POST" && path === "/api/orders") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Request body must be valid JSON" }, 400);
    }

    const customer = body?.customer;
    const name = typeof customer?.name === "string" ? customer.name.trim() : "";
    const email = typeof customer?.email === "string" ? customer.email.trim().toLowerCase() : "";
    const phone = typeof customer?.phone === "string" ? customer.phone.trim() : "";

    if (name.length < 2 || name.length > 120) {
      return json(request, env, { error: "Customer name must be between 2 and 120 characters" }, 400);
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(request, env, { error: "A valid customer email is required" }, 400);
    }
    if (phone.length < 7 || phone.length > 20 || !/^[+0-9().\-\s]+$/.test(phone)) {
      return json(request, env, { error: "A valid customer phone number is required" }, 400);
    }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return json(request, env, { error: "Provide a non-empty items array" }, 400);
    }
    if (body.items.length > MAX_CART_LINES) {
      return json(request, env, { error: `A cart can contain at most ${MAX_CART_LINES} distinct items` }, 400);
    }

    const seenServiceIds = new Set();
    for (const item of body.items) {
      if (!item || typeof item.service_id !== "string" || !item.service_id.trim()) {
        return json(request, env, { error: "Each item must include a service_id" }, 400);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_ITEM) {
        return json(request, env, {
          error: `Quantity for ${item.service_id} must be a whole number between 1 and ${MAX_QUANTITY_PER_ITEM}`,
          service_id: item.service_id
        }, 400);
      }
      if (seenServiceIds.has(item.service_id)) {
        return json(request, env, { error: `Duplicate service_id: ${item.service_id}` }, 400);
      }
      seenServiceIds.add(item.service_id);
    }

    try {
      const orderItems = [];
      let totalPaise = 0;
      let currency = null;

      for (const item of body.items) {
        const service = await env.DB.prepare(
          `SELECT service_id, slug, price_paise, price_type, currency, is_active, purchase_type
           FROM services WHERE service_id = ? LIMIT 1`
        ).bind(item.service_id).first();

        if (!service || service.is_active !== 1) {
          return json(request, env, { error: "Service is unavailable", service_id: item.service_id }, 422);
        }
        if (service.price_type !== "fixed" || service.price_paise == null ||
            !Number.isSafeInteger(service.price_paise) || service.price_paise <= 0 ||
            !["cart", "month", "session"].includes(service.purchase_type)) {
          return json(request, env, {
            error: "This service requires an enquiry and cannot be checked out online",
            service_id: item.service_id
          }, 422);
        }
        if (currency !== null && currency !== service.currency) {
          return json(request, env, { error: "All items in a cart must use the same currency" }, 422);
        }
        currency = service.currency;

        const lineTotalPaise = service.price_paise * item.quantity;
        if (!Number.isSafeInteger(lineTotalPaise) || !Number.isSafeInteger(totalPaise + lineTotalPaise)) {
          return json(request, env, { error: "Cart total is outside the supported amount range" }, 422);
        }
        totalPaise += lineTotalPaise;
        orderItems.push({
          service_id: service.service_id,
          slug: service.slug,
          purchase_type: service.purchase_type,
          quantity: item.quantity,
          unit_price_paise: service.price_paise,
          amount_paise: lineTotalPaise
        });
      }

      if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
        return json(request, env, { error: "Order total must be greater than zero" }, 422);
      }

      const orderId = `EB-${crypto.randomUUID()}`;
      const transactionId = `txn_${crypto.randomUUID()}`;
      const statements = [
        env.DB.prepare(
          `INSERT INTO orders (order_id, amount_paise, currency, customer_name, customer_email, customer_phone, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
        ).bind(orderId, totalPaise, currency, name, email, phone),
        ...orderItems.map((item) => env.DB.prepare(
          `INSERT INTO order_items (order_id, service_id, quantity, unit_price_paise, amount_paise)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(orderId, item.service_id, item.quantity, item.unit_price_paise, item.amount_paise)),
        env.DB.prepare(
          `INSERT INTO payment_transactions (order_id, transaction_id, status)
           VALUES (?, ?, 'pending')`
        ).bind(orderId, transactionId)
      ];

      // D1 batch is transactional: the order, its item snapshots, and the initial
      // payment transaction are committed together or rolled back together.
      await env.DB.batch(statements);

      return json(request, env, {
        created: true,
        order: {
          order_id: orderId,
          amount_paise: totalPaise,
          amount: totalPaise / 100,
          currency,
          status: "pending",
          customer: { name, email, phone },
          items: orderItems
        },
        payment: { status: "not_initialized" },
        message: "Order saved. Payment gateway initialization is not enabled yet."
      }, 201);
    } catch (error) {
      console.error("Order creation failed", error);
      return json(request, env, { error: "Unable to create order" }, 500);
    }
  }

  if (request.method === "POST" && path === "/api/payments/create-order") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Request body must be valid JSON" }, 400);
    }

    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    if (!/^EB-[0-9a-f-]{36}$/i.test(orderId)) {
      return json(request, env, { error: "A valid internal order_id is required" }, 400);
    }

    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    const paymentMode = (env.PAYMENT_MODE || "test").toLowerCase();
    if (!keyId || !keySecret) {
      return json(request, env, { error: "Razorpay credentials are not configured" }, 503);
    }
    if (!(["test", "live"].includes(paymentMode)) ||
        (paymentMode === "test" && !keyId.startsWith("rzp_test_")) ||
        (paymentMode === "live" && !keyId.startsWith("rzp_live_"))) {
      return json(request, env, { error: "Razorpay key does not match configured PAYMENT_MODE" }, 503);
    }

    let order;
    let transaction;
    try {
      order = await env.DB.prepare(
        `SELECT order_id, amount_paise, currency, status
         FROM orders WHERE order_id = ? LIMIT 1`
      ).bind(orderId).first();
      if (!order) return json(request, env, { error: "Order not found" }, 404);
      if (order.status !== "pending") {
        return json(request, env, { error: "Only pending orders can initialize payment" }, 409);
      }
      transaction = await env.DB.prepare(
        `SELECT transaction_id, razorpay_order_id, status
         FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(orderId).first();
      if (!transaction) {
        return json(request, env, { error: "Payment transaction not found" }, 409);
      }
      if (transaction.razorpay_order_id) {
        return json(request, env, {
          success: true,
          reused: true,
          key_id: keyId,
          order: {
            order_id: order.order_id,
            razorpay_order_id: transaction.razorpay_order_id,
            amount_paise: order.amount_paise,
            currency: order.currency,
            status: order.status
          }
        });
      }
      if (transaction.status !== "pending") {
        return json(request, env, { error: "Payment initialization is already in progress or unavailable" }, 409);
      }
      if (!Number.isSafeInteger(order.amount_paise) || order.amount_paise <= 0 || order.currency !== "INR") {
        return json(request, env, { error: "Order amount or currency is invalid" }, 422);
      }
    } catch (error) {
      console.error("Could not load order for Razorpay initialization", error);
      return json(request, env, { error: "Unable to prepare payment" }, 500);
    }

    // Claim initialization before calling the external API to reduce duplicate gateway orders.
    try {
      const claim = await env.DB.prepare(
        `UPDATE payment_transactions
         SET status = 'processing', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE transaction_id = ? AND status = 'pending' AND razorpay_order_id IS NULL`
      ).bind(transaction.transaction_id).run();
      if ((claim.meta?.changes ?? 0) !== 1) {
        const latest = await env.DB.prepare(
          `SELECT razorpay_order_id, status FROM payment_transactions WHERE transaction_id = ? LIMIT 1`
        ).bind(transaction.transaction_id).first();
        if (latest?.razorpay_order_id) {
          return json(request, env, {
            success: true,
            reused: true,
            key_id: keyId,
            order: {
              order_id: order.order_id,
              razorpay_order_id: latest.razorpay_order_id,
              amount_paise: order.amount_paise,
              currency: order.currency,
              status: order.status
            }
          });
        }
        return json(request, env, { error: "Payment initialization is already in progress; retry shortly" }, 409);
      }
    } catch (error) {
      console.error("Could not claim payment initialization", error);
      return json(request, env, { error: "Unable to prepare payment" }, 500);
    }

    let gatewayOrder;
    try {
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: order.amount_paise,
          currency: order.currency,
          receipt: order.order_id,
          notes: {
            empowering_biz_order_id: order.order_id,
            transaction_id: transaction.transaction_id
          }
        })
      });
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok || !data?.id || data.amount !== order.amount_paise || data.currency !== order.currency) {
        const code = String(data?.error?.code || `HTTP_${response.status}`).slice(0, 100);
        const description = String(data?.error?.description || "Razorpay rejected order creation").slice(0, 500);
        await env.DB.prepare(
          `UPDATE payment_transactions
           SET status = 'pending', error_code = ?, error_description = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE transaction_id = ? AND status = 'processing' AND razorpay_order_id IS NULL`
        ).bind(code, description, transaction.transaction_id).run();
        console.error("Razorpay order creation rejected", { code, httpStatus: response.status });
        return json(request, env, { error: "Razorpay could not create the payment order", code }, 502);
      }
      gatewayOrder = data;
    } catch (error) {
      console.error("Razorpay order request failed", error);
      try {
        await env.DB.prepare(
          `UPDATE payment_transactions
           SET status = 'pending', error_code = 'NETWORK_ERROR', error_description = 'Razorpay request failed',
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE transaction_id = ? AND status = 'processing' AND razorpay_order_id IS NULL`
        ).bind(transaction.transaction_id).run();
      } catch (resetError) {
        console.error("Could not reset payment initialization state", resetError);
      }
      return json(request, env, { error: "Unable to contact Razorpay" }, 502);
    }

    try {
      const saved = await env.DB.prepare(
        `UPDATE payment_transactions
         SET razorpay_order_id = ?, status = 'pending', error_code = NULL, error_description = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE transaction_id = ? AND status = 'processing' AND razorpay_order_id IS NULL`
      ).bind(gatewayOrder.id, transaction.transaction_id).run();
      if ((saved.meta?.changes ?? 0) !== 1) {
        console.error("Razorpay order created but could not be linked to payment transaction", {
          orderId, razorpayOrderId: gatewayOrder.id, transactionId: transaction.transaction_id
        });
        return json(request, env, { error: "Payment order created but could not be linked; support review is required" }, 500);
      }
    } catch (error) {
      // The external Razorpay order exists now; do not reset the transaction to pending,
      // because retrying blindly could create a second gateway order.
      console.error("Could not save Razorpay order ID", { orderId, razorpayOrderId: gatewayOrder.id, error });
      return json(request, env, { error: "Payment order created but could not be saved; support review is required" }, 500);
    }

    return json(request, env, {
      success: true,
      reused: false,
      key_id: keyId,
      order: {
        order_id: order.order_id,
        razorpay_order_id: gatewayOrder.id,
        amount_paise: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        status: order.status
      }
    }, 201);
  }
  
  if (request.method === "POST" && path === "/api/payments/record-failure") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Request body must be valid JSON" }, 400);
    }

    const internalOrderId =
      typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const submittedRazorpayOrderId =
      typeof body?.razorpay_order_id === "string"
        ? body.razorpay_order_id.trim()
        : "";
    const paymentId =
      typeof body?.razorpay_payment_id === "string"
        ? body.razorpay_payment_id.trim()
        : "";

    if (
      !/^EB-[0-9a-f-]{36}$/i.test(internalOrderId) ||
      !/^order_[A-Za-z0-9]+$/.test(submittedRazorpayOrderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId)
    ) {
      return json(request, env, { error: "Invalid payment failure details" }, 400);
    }

    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    const paymentMode = (env.PAYMENT_MODE || "test").toLowerCase();

    if (
      !keyId ||
      !keySecret ||
      !["test", "live"].includes(paymentMode) ||
      (paymentMode === "test" && !keyId.startsWith("rzp_test_")) ||
      (paymentMode === "live" && !keyId.startsWith("rzp_live_"))
    ) {
      return json(
        request,
        env,
        { error: "Razorpay credentials are not configured correctly" },
        503
      );
    }

    let order;
    let transaction;

    try {
      order = await env.DB.prepare(
        `SELECT order_id, amount_paise, currency, status
         FROM orders WHERE order_id = ? LIMIT 1`
      ).bind(internalOrderId).first();

      if (!order) {
        return json(request, env, { error: "Order not found" }, 404);
      }

      transaction = await env.DB.prepare(
        `SELECT transaction_id, razorpay_order_id, razorpay_payment_id, status
         FROM payment_transactions
         WHERE order_id = ?
         ORDER BY id DESC LIMIT 1`
      ).bind(internalOrderId).first();

      if (!transaction || !transaction.razorpay_order_id) {
        return json(
          request,
          env,
          { error: "Razorpay order has not been initialized" },
          409
        );
      }

      if (transaction.razorpay_order_id !== submittedRazorpayOrderId) {
        return json(
          request,
          env,
          { error: "Razorpay order does not match this internal order" },
          422
        );
      }

      if (order.status === "success" || transaction.status === "success") {
        return json(
          request,
          env,
          { error: "This order has already been paid successfully" },
          409
        );
      }

      if (transaction.razorpay_payment_id) {
        return json(
          request,
          env,
          { error: "A payment result is already associated with this transaction" },
          409
        );
      }
    } catch (error) {
      console.error("Could not load order for failure recording", error);
      return json(request, env, { error: "Unable to check payment details" }, 500);
    }

    let gatewayPayment;

    try {
      const response = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          method: "GET",
          headers: { Authorization: razorpayAuth(keyId, keySecret) }
        }
      );

      let data;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok || !data?.id) {
        console.error("Razorpay failure lookup failed", {
          httpStatus: response.status,
          code: data?.error?.code
        });

        return json(
          request,
          env,
          { error: "Could not confirm payment status with Razorpay" },
          502
        );
      }

      gatewayPayment = data;
    } catch (error) {
      console.error("Razorpay failure lookup request failed", error);
      return json(
        request,
        env,
        { error: "Could not contact Razorpay to confirm payment status" },
        502
      );
    }

    if (
      gatewayPayment.id !== paymentId ||
      gatewayPayment.order_id !== transaction.razorpay_order_id ||
      gatewayPayment.amount !== order.amount_paise ||
      gatewayPayment.currency !== order.currency
    ) {
      return json(
        request,
        env,
        { error: "Razorpay payment details do not match the saved order" },
        422
      );
    }

    if (gatewayPayment.status !== "failed") {
      return json(
        request,
        env,
        {
          error: "Razorpay has not confirmed a failed payment",
          payment_status: gatewayPayment.status || "unknown"
        },
        409
      );
    }

    try {
      await env.DB.prepare(
        `UPDATE payment_transactions
         SET status = 'failed',
             error_code = ?,
             error_description = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE transaction_id = ?
           AND status != 'success'
           AND razorpay_payment_id IS NULL`
      ).bind(
        String(gatewayPayment.error_code || "PAYMENT_FAILED").slice(0, 100),
        String(gatewayPayment.error_description || "Razorpay reports that this payment failed").slice(0, 500),
        transaction.transaction_id
      ).run();

      const latest = await env.DB.prepare(
        `SELECT status, razorpay_payment_id
         FROM payment_transactions
         WHERE transaction_id = ? LIMIT 1`
      ).bind(transaction.transaction_id).first();

      if (latest?.status === "success") {
        return json(request, env, {
          recorded: false,
          status: "success",
          message: "The payment succeeded; the failed attempt was not recorded over it"
        });
      }

      if (latest?.status !== "failed" || latest.razorpay_payment_id !== null) {
        return json(
          request,
          env,
          { error: "Payment status changed concurrently; check the order before retrying" },
          409
        );
      }

      return json(request, env, {
        recorded: true,
        status: "failed",
        order_id: internalOrderId,
        message: "Razorpay confirmed the failed payment attempt"
      });
    } catch (error) {
      console.error("Could not record failed payment attempt", error);
      return json(
        request,
        env,
        { error: "Could not save the payment failure status" },
        500
      );
    }
  }

  if (request.method === "POST" && path === "/api/payments/verify") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Request body must be valid JSON" }, 400);
    }

    const internalOrderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const submittedRazorpayOrderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id.trim() : "";
    const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id.trim() : "";
    const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature.trim() : "";
    if (!/^EB-[0-9a-f-]{36}$/i.test(internalOrderId) || !/^order_[A-Za-z0-9]+$/.test(submittedRazorpayOrderId) ||
        !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[0-9a-f]{64}$/i.test(signature)) {
      return json(request, env, { error: "Invalid payment verification details" }, 400);
    }

    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    const paymentMode = (env.PAYMENT_MODE || "test").toLowerCase();
    if (!keyId || !keySecret || !( ["test", "live"].includes(paymentMode) ) ||
        (paymentMode === "test" && !keyId.startsWith("rzp_test_")) ||
        (paymentMode === "live" && !keyId.startsWith("rzp_live_"))) {
      return json(request, env, { error: "Razorpay credentials are not configured correctly" }, 503);
    }

    let order;
    let transaction;
    try {
      order = await env.DB.prepare(
        `SELECT order_id, amount_paise, currency, status FROM orders WHERE order_id = ? LIMIT 1`
      ).bind(internalOrderId).first();
      if (!order) return json(request, env, { error: "Order not found" }, 404);
      transaction = await env.DB.prepare(
        `SELECT transaction_id, razorpay_order_id, razorpay_payment_id, status
         FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1`
      ).bind(internalOrderId).first();
      if (!transaction || !transaction.razorpay_order_id) {
        return json(request, env, { error: "Razorpay order has not been initialized" }, 409);
      }
      if (transaction.razorpay_order_id !== submittedRazorpayOrderId) {
        return json(request, env, { error: "Razorpay order does not match this internal order" }, 422);
      }
      const alreadyVerified = order.status === "success" && transaction.status === "success" && transaction.razorpay_payment_id === paymentId;
      if (!alreadyVerified && (order.status === "success" || transaction.status === "success" ||
          (transaction.razorpay_payment_id && transaction.razorpay_payment_id !== paymentId))) {
        return json(request, env, { error: "This order has already been associated with a different payment result" }, 409);
      }
    } catch (error) {
      console.error("Could not load order for payment verification", error);
      return json(request, env, { error: "Unable to verify payment" }, 500);
    }

    let expectedSignature;
    try {
      expectedSignature = await hmacSha256Hex(keySecret, `${transaction.razorpay_order_id}|${paymentId}`);
    } catch (error) {
      console.error("Could not compute Razorpay checkout signature", error);
      return json(request, env, { error: "Unable to verify payment signature" }, 500);
    }
    if (!constantTimeEqualHex(expectedSignature, signature)) {
      return json(request, env, { error: "Payment signature is invalid" }, 400);
    }
    if (order.status === "success" && transaction.status === "success" && transaction.razorpay_payment_id === paymentId) {
      return json(request, env, { verified: true, status: "success", order_id: internalOrderId, message: "Payment was already verified" });
    }

    let gatewayPayment;
    try {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: "GET",
        headers: { Authorization: razorpayAuth(keyId, keySecret) }
      });
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok || !data?.id) {
        console.error("Razorpay payment lookup failed", { httpStatus: response.status, code: data?.error?.code });
        return json(request, env, { error: "Could not confirm payment status with Razorpay" }, 502);
      }
      gatewayPayment = data;
    } catch (error) {
      console.error("Razorpay payment lookup request failed", error);
      return json(request, env, { error: "Could not contact Razorpay to confirm payment status" }, 502);
    }

    if (gatewayPayment.id !== paymentId || gatewayPayment.order_id !== transaction.razorpay_order_id ||
        gatewayPayment.amount !== order.amount_paise || gatewayPayment.currency !== order.currency) {
      return json(request, env, { error: "Razorpay payment details do not match the saved order" }, 422);
    }

    let nextStatus;
    if (gatewayPayment.status === "captured") nextStatus = "success";
    else if (gatewayPayment.status === "authorized") nextStatus = "processing";
    else if (gatewayPayment.status === "failed") nextStatus = "failed";
    else return json(request, env, { error: "Razorpay payment is not in a final supported state", payment_status: gatewayPayment.status || "unknown" }, 409);

    try {
      const orderStatus = nextStatus === "success" ? "success" : nextStatus === "failed" ? "failed" : "processing";
      const statements = [
        env.DB.prepare(
          `UPDATE payment_transactions
           SET razorpay_payment_id = ?, signature_verified = 1, status = ?, error_code = NULL, error_description = NULL,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE transaction_id = ? AND (razorpay_payment_id IS NULL OR razorpay_payment_id = ?)
             AND status IN ('pending', 'processing', 'failed')`
        ).bind(paymentId, nextStatus, transaction.transaction_id, paymentId),
        env.DB.prepare(
          `UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE order_id = ? AND status IN ('pending', 'processing', 'failed')`
        ).bind(orderStatus, internalOrderId)
      ];
      await env.DB.batch(statements);
      const latest = await env.DB.prepare(
        `SELECT status, razorpay_payment_id FROM payment_transactions WHERE transaction_id = ? LIMIT 1`
      ).bind(transaction.transaction_id).first();
      if (!latest || latest.razorpay_payment_id !== paymentId || latest.status !== nextStatus) {
        return json(request, env, { error: "Payment status changed concurrently; check the order before retrying" }, 409);
      }
      return json(request, env, {
        verified: true,
        order_id: internalOrderId,
        razorpay_order_id: transaction.razorpay_order_id,
        razorpay_payment_id: paymentId,
        payment_status: gatewayPayment.status,
        status: nextStatus,
        message: nextStatus === "success" ? "Payment captured and verified" : nextStatus === "processing" ? "Payment authorized; awaiting capture confirmation" : "Razorpay reports that this payment failed"
      });
    } catch (error) {
      console.error("Could not save verified payment status", error);
      return json(request, env, { error: "Payment was verified but its status could not be saved" }, 500);
    }
  }

  if (request.method === "POST" && path === "/api/webhooks/razorpay") {
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return json(request, env, { error: "Razorpay webhook secret is not configured" }, 503);

    const suppliedSignature = request.headers.get("X-Razorpay-Signature") || "";
    const eventId = request.headers.get("X-Razorpay-Event-Id") || "";
    if (!/^[0-9a-f]{64}$/i.test(suppliedSignature) || eventId.length < 1 || eventId.length > 200) {
      return json(request, env, { error: "Missing or invalid Razorpay webhook signature/event ID" }, 400);
    }

    // Razorpay requires HMAC verification over the exact raw request body, before JSON parsing.
    const rawBody = await request.text();
    let expectedSignature;
    try {
      expectedSignature = await hmacSha256Hex(webhookSecret, rawBody);
    } catch (error) {
      console.error("Could not compute webhook signature", error);
      return json(request, env, { error: "Unable to verify webhook signature" }, 500);
    }
    if (!constantTimeEqualHex(expectedSignature, suppliedSignature)) {
      return json(request, env, { error: "Invalid webhook signature" }, 400);
    }

    let eventBody;
    try {
      eventBody = JSON.parse(rawBody);
    } catch {
      return json(request, env, { error: "Webhook body must be valid JSON" }, 400);
    }
    const eventType = typeof eventBody?.event === "string" ? eventBody.event : "unknown";
    try {
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO webhook_events (event_id, event_type, status) VALUES (?, ?, 'received')`
      ).bind(eventId, eventType).run();
      if ((inserted.meta?.changes ?? 0) === 0) {
        const existing = await env.DB.prepare(
          `SELECT status FROM webhook_events WHERE event_id = ? LIMIT 1`
        ).bind(eventId).first();
        if (existing?.status === "processed") {
          return json(request, env, { received: true, duplicate: true, status: "processed" });
        }
      }
      const claim = await env.DB.prepare(
        `UPDATE webhook_events SET status = 'processing', error_message = NULL
         WHERE event_id = ? AND status IN ('received', 'failed')`
      ).bind(eventId).run();
      if ((claim.meta?.changes ?? 0) !== 1) {
        const existing = await env.DB.prepare(
          `SELECT status FROM webhook_events WHERE event_id = ? LIMIT 1`
        ).bind(eventId).first();
        if (existing?.status === "processed") {
          return json(request, env, { received: true, duplicate: true, status: existing.status });
        }
        if (existing?.status === "processing") {
          // Return non-2xx so Razorpay can retry if the concurrent handler later fails.
          return json(request, env, { error: "Webhook event is already being processed; retry later" }, 503);
        }
        return json(request, env, { error: "Unable to claim webhook event for processing" }, 500);
      }

      const supportedEvents = new Set(["payment.captured", "payment.failed"]);
      if (!supportedEvents.has(eventType)) {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'processed', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE event_id = ?`
        ).bind(eventId).run();
        return json(request, env, { received: true, processed: true, ignored: true, event: eventType });
      }

      const payment = eventBody?.payload?.payment?.entity;
      if (!payment || typeof payment.id !== "string" || typeof payment.order_id !== "string" ||
          !Number.isSafeInteger(payment.amount) || typeof payment.currency !== "string") {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'failed', error_message = 'Invalid payment entity', processed_at = NULL WHERE event_id = ?`
        ).bind(eventId).run();
        return json(request, env, { error: "Webhook payment entity is invalid" }, 400);
      }

      const match = await env.DB.prepare(
        `SELECT p.transaction_id, p.order_id, p.status AS payment_status, p.razorpay_payment_id,
                o.amount_paise, o.currency, o.status AS order_status
         FROM payment_transactions p JOIN orders o ON o.order_id = p.order_id
         WHERE p.razorpay_order_id = ? ORDER BY p.id DESC LIMIT 1`
      ).bind(payment.order_id).first();
      if (!match) {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'failed', error_message = 'No matching local payment transaction' WHERE event_id = ?`
        ).bind(eventId).run();
        return json(request, env, { error: "No local order matches this Razorpay order" }, 500);
      }
      if (payment.amount !== match.amount_paise || payment.currency !== match.currency ||
          (match.razorpay_payment_id && match.razorpay_payment_id !== payment.id)) {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'failed', error_message = 'Payment details did not match the saved order' WHERE event_id = ?`
        ).bind(eventId).run();
        return json(request, env, { error: "Webhook payment details do not match the saved order" }, 400);
      }

      const isCaptured = eventType === "payment.captured" && payment.status === "captured";
      const isFailed = eventType === "payment.failed" && payment.status === "failed";
      if (!isCaptured && !isFailed) {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'failed', error_message = 'Event type and payment status mismatch' WHERE event_id = ?`
        ).bind(eventId).run();
        return json(request, env, { error: "Webhook event and payment status do not match" }, 400);
      }

      const statements = [];
      if (isCaptured) {
        statements.push(env.DB.prepare(
          `UPDATE payment_transactions SET razorpay_payment_id = ?, status = 'success', error_code = NULL, error_description = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE transaction_id = ? AND (razorpay_payment_id IS NULL OR razorpay_payment_id = ?) AND status != 'success'`
        ).bind(payment.id, match.transaction_id, payment.id));
        statements.push(env.DB.prepare(
          `UPDATE orders SET status = 'success', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE order_id = ? AND status != 'success'`
        ).bind(match.order_id));
      } else {
        // Record the failed payment attempt without closing the overall order.
        // A later successful payment must still be able to update this transaction.
        statements.push(env.DB.prepare(
          `UPDATE payment_transactions
          SET status = 'failed',
              error_code = ?,
              error_description = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE transaction_id = ?
            AND status != 'success'
            AND razorpay_payment_id IS NULL`
        ).bind(
          String(payment.error_code || "PAYMENT_FAILED").slice(0, 100),
          String(payment.error_description || "Razorpay reports that this payment failed").slice(0, 500),
          match.transaction_id
        ));
      }
      statements.push(env.DB.prepare(
        `UPDATE webhook_events SET status = 'processed', processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error_message = NULL
         WHERE event_id = ?`
      ).bind(eventId));
      await env.DB.batch(statements);
      return json(request, env, { received: true, processed: true, event: eventType, order_id: match.order_id, status: isCaptured ? "success" : (match.order_status === "success" ? "success" : "failed") });
    } catch (error) {
      console.error("Razorpay webhook processing failed", error);
      try {
        await env.DB.prepare(
          `UPDATE webhook_events SET status = 'failed', error_message = 'Internal processing error' WHERE event_id = ? AND status != 'processed'`
        ).bind(eventId).run();
      } catch (recordError) {
        console.error("Could not record webhook processing failure", recordError);
      }
      return json(request, env, { error: "Unable to process webhook" }, 500);
    }
  }

  if (request.method === "POST" && path === "/api/orders/validate") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(request, env, { error: "Request body must be valid JSON" }, 400);
    }

    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      return json(request, env, { error: "Provide a non-empty items array" }, 400);
    }
    if (body.items.length > MAX_CART_LINES) {
      return json(request, env, { error: `A cart can contain at most ${MAX_CART_LINES} distinct items` }, 400);
    }

    const seenServiceIds = new Set();
    for (const item of body.items) {
      if (!item || typeof item.service_id !== "string" || !item.service_id.trim()) {
        return json(request, env, { error: "Each item must include a service_id" }, 400);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY_PER_ITEM) {
        return json(request, env, {
          error: `Quantity for ${item.service_id} must be a whole number between 1 and ${MAX_QUANTITY_PER_ITEM}`,
          service_id: item.service_id
        }, 400);
      }
      if (seenServiceIds.has(item.service_id)) {
        return json(request, env, { error: `Duplicate service_id: ${item.service_id}` }, 400);
      }
      seenServiceIds.add(item.service_id);
    }

    try {
      const validatedItems = [];
      let totalPaise = 0;
      let currency = null;

      for (const item of body.items) {
        const service = await env.DB.prepare(
          `SELECT service_id, slug, price_paise, price_type, currency, is_active, purchase_type
           FROM services WHERE service_id = ? LIMIT 1`
        ).bind(item.service_id).first();

        if (!service || service.is_active !== 1) {
          return json(request, env, {
            error: "Service is unavailable",
            service_id: item.service_id
          }, 422);
        }

        if (service.price_type !== "fixed" || service.price_paise == null ||
            !Number.isSafeInteger(service.price_paise) || service.price_paise <= 0 ||
            !["cart", "month", "session"].includes(service.purchase_type)) {
          return json(request, env, {
            error: "This service requires an enquiry and cannot be checked out online",
            service_id: item.service_id
          }, 422);
        }

        if (currency !== null && currency !== service.currency) {
          return json(request, env, { error: "All items in a cart must use the same currency" }, 422);
        }
        currency = service.currency;

        const lineTotalPaise = service.price_paise * item.quantity;
        if (!Number.isSafeInteger(lineTotalPaise) || !Number.isSafeInteger(totalPaise + lineTotalPaise)) {
          return json(request, env, { error: "Cart total is outside the supported amount range" }, 422);
        }
        totalPaise += lineTotalPaise;
        validatedItems.push({
          service_id: service.service_id,
          slug: service.slug,
          purchase_type: service.purchase_type,
          quantity: item.quantity,
          unit_price_paise: service.price_paise,
          line_total_paise: lineTotalPaise
        });
      }

      return json(request, env, {
        valid: true,
        currency,
        items: validatedItems,
        total_paise: totalPaise,
        total: totalPaise / 100,
        max_quantity_per_item: MAX_QUANTITY_PER_ITEM
      });
    } catch (error) {
      console.error("Order validation failed", error);
      return json(request, env, { error: "Unable to validate cart" }, 500);
    }
  }

  if (request.method !== "GET") {
    return json(request, env, { error: "Method not allowed" }, 405);
  }
  return json(request, env, { error: "Not found" }, 404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  }
};
