export const PRODUCT_STATUS = {
  DRAFT: "DRAFT",
  PENDING_REVIEW: "PENDING_REVIEW",
  LIVE: "LIVE",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
} as const;

export type ProductStatus =
  (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const PRODUCT_SORT = {
  PRICE_ASC: "PRICE_ASC",
  PRICE_DESC: "PRICE_DESC",
  NEWEST: "NEWEST",
  RECOMMENDED: "RECOMMENDED",
} as const;

export type ProductSort = (typeof PRODUCT_SORT)[keyof typeof PRODUCT_SORT];
