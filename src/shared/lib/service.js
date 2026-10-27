import { products } from "../data/services";
import { apiRequest } from "./api";

function combineService(staticService, data) {
  if (!staticService || !data) return null;

  return {
    ...staticService,
    price: data.price,
    priceType: data.price_type,
    purchaseType: data.purchase_type,
    commerce: {
      serviceId: data.service_id,
      currency: data.currency,
      pricePaise: data.price_paise,
      checkoutEligible: data.checkout_eligible === true,
    },
  };
}

export async function getService(slug) {
  const staticService = products[slug];
  if (!staticService) return null;

  const response = await apiRequest(`/api/services/${encodeURIComponent(slug)}`);
  return combineService(staticService, response.service);
}

export async function getServices() {
  const response = await apiRequest("/api/services");
  const databaseServices = new Map(
    (response.services || []).map((service) => [service.slug, service])
  );

  return Object.values(products)
    .map((staticService) =>
      combineService(staticService, databaseServices.get(staticService.slug))
    )
    .filter(Boolean);
}
