// Plan pricing in one place, so the billing card, the upgrade gate, and anything added later quote
// the same figures. These mirror the live Stripe prices: change one without the other and the app
// tells the customer a number Stripe will not charge them.
export const PLAN_PRICES = {
  month: { field: 29, pro: 99 },
  year: { field: 279, pro: 949 },
};

// Rounded for display. Field and Pro both land on 20% once the annual figures are rounded.
export const ANNUAL_SAVING_PCT = 20;

export const priceLabel = (plan, interval) =>
  interval === 'year' ? `$${PLAN_PRICES.year[plan]}/yr` : `$${PLAN_PRICES.month[plan]}/mo`;

// What the customer keeps by paying for a year up front, in whole dollars.
export const annualSaving = (plan) => PLAN_PRICES.month[plan] * 12 - PLAN_PRICES.year[plan];
