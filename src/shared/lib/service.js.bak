import { supabase } from "./supabase";
import { products } from "../data/services";

export async function getService(slug) {
  // Find the existing static service definition
    const staticService = products[slug];

  if (!staticService) {
    return null;
  }

  // Get the dynamic/commerce data from Supabase
  const { data, error } = await supabase
    .from("services")
    .select(
      `
        service_id,
        slug,
        price,
        price_type,
        currency,
        is_active,
        merchant_product_id,
        merchant_price_id,
        purchase_type
      `
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch service data:", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  // Combine static website content with database data
  return {
    ...staticService,

    price: data.price,
    priceType: data.price_type,
    purchaseType: data.purchase_type,

    commerce: {
      serviceId: data.service_id,
      currency: data.currency,
      merchantProductId: data.merchant_product_id,
      merchantPriceId: data.merchant_price_id,
    },
  };
}

export async function getServices() {
  const { data, error } = await supabase
    .from("services")
    .select(`
      service_id,
      slug,
      price,
      price_type,
      currency,
      is_active,
      merchant_product_id,
      merchant_price_id,
      purchase_type
    `)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to fetch services:", error);
    throw error;
  }

  const databaseServices = new Map(
    data.map((service) => [service.slug, service])
  );

  return Object.values(products)
    .map((staticService) => {
      const databaseService = databaseServices.get(staticService.slug);

      if (!databaseService) {
        return null;
      }

      return {
        ...staticService,

        price: databaseService.price,
        priceType: databaseService.price_type,
        purchaseType: databaseService.purchase_type,

        commerce: {
          serviceId: databaseService.service_id,
          currency: databaseService.currency,
          merchantProductId: databaseService.merchant_product_id,
          merchantPriceId: databaseService.merchant_price_id,
        },
      };
    })
    .filter(Boolean);
}