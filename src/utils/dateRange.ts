// utils/dateRange.ts

import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";

export type DateRangeType =
  | "this_month"
  | "last_month"
  | "custom";

export const getDateRange = (
  range: DateRangeType,
  from?: string,
  to?: string,
) => {
  const today = new Date();

  switch (range) {
    case "this_month":
      return {
        startDate: format(
          startOfMonth(today),
          "yyyy-MM-dd",
        ),
        endDate: format(today, "yyyy-MM-dd"),
      };

    case "last_month": {
      const lastMonth = subMonths(today, 1);

      return {
        startDate: format(
          startOfMonth(lastMonth),
          "yyyy-MM-dd",
        ),
        endDate: format(
          endOfMonth(lastMonth),
          "yyyy-MM-dd",
        ),
      };
    }

    case "custom": {
      if (!from || !to) {
        throw new Error(
          "from and to dates are required for custom range",
        );
      }

      if (from > to) {
        throw new Error(
          "from date cannot be greater than to date",
        );
      }

      return {
        startDate: from,
        endDate: to,
      };
    }

    default:
      throw new Error(
        "Invalid date range",
      );
  }
};