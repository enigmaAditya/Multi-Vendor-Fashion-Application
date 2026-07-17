export const ORDER_STATUS = {
  CREATED: "created",
  CONFIRMED: "confirmed",
  PACKED: "packed",
  READY_TO_SHIP: "ready_to_ship",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RTO: "rto",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export * from "./auth";
export * from "./catalog";
