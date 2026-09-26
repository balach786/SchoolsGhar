import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { PaymentReversal } from '../models/PaymentReversal';
import { getSchoolDayRange, getSchoolMonthRange } from '../utils/schoolDate';

export interface CollectionSummary {
  grossCollected: number;
  totalReversed: number;
  netCollected: number;
  paymentCount: number;
  reversalCount: number;
}

/**
 * Authoritative regular fee collection calculation.
 * Gross Collection = successful regular-fee payments in period
 * Reversals = regular-fee PaymentReversal records in period (based on reversal createdAt)
 * Net Collection = Gross Collection - Reversals (signed, no Math.max(0, net))
 */
export async function getRegularFeeCollection(
  tenantDb: mongoose.Connection,
  tenantId: mongoose.Types.ObjectId | string,
  dateRange: { $gte?: Date; $lt?: Date; $lte?: Date } = {}
): Promise<CollectionSummary> {
  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

  const paymentMatch: Record<string, any> = { tenantId: tId };
  if (Object.keys(dateRange).length > 0) {
    paymentMatch.paymentDate = dateRange;
  }

  const reversalMatch: Record<string, any> = {
    tenantId: tId,
    sourceType: 'regular_fee',
  };
  if (Object.keys(dateRange).length > 0) {
    reversalMatch.createdAt = dateRange;
  }

  const { Payment, PaymentReversal } = (await import('./TenantModelRegistry')).getTenantModels(tenantDb);

  const [paymentAgg, reversalAgg] = await Promise.all([
    Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          grossCollected: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
        },
      },
    ]),
    PaymentReversal.aggregate([
      { $match: reversalMatch },
      {
        $group: {
          _id: null,
          totalReversed: { $sum: '$amount' },
          reversalCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const grossCollected = paymentAgg[0]?.grossCollected ?? 0;
  const paymentCount = paymentAgg[0]?.paymentCount ?? 0;
  const totalReversed = reversalAgg[0]?.totalReversed ?? 0;
  const reversalCount = reversalAgg[0]?.reversalCount ?? 0;
  const netCollected = grossCollected - totalReversed;

  return {
    grossCollected,
    totalReversed,
    netCollected,
    paymentCount,
    reversalCount,
  };
}

/**
 * Calculate day-level breakdown for monthly collection report, subtracting reversals per day.
 */
export async function getMonthlyCollectionBreakdown(
  tenantDb: mongoose.Connection,
  tenantId: mongoose.Types.ObjectId | string,
  monthStr: string
): Promise<{
  month: string;
  rows: Array<{ date: string; amount: number; count: number; gross: number; reversals: number }>;
  grossTotal: number;
  reversalsTotal: number;
  netTotal: number;
  totalPayments: number;
}> {
  const tId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;
  const { start, endExclusive } = getSchoolMonthRange(monthStr);

  const { Payment, PaymentReversal } = (await import('./TenantModelRegistry')).getTenantModels(tenantDb);

  const [paymentsByDay, reversalsByDay] = await Promise.all([
    Payment.aggregate([
      { $match: { tenantId: tId, paymentDate: { $gte: start, $lt: endExclusive } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PaymentReversal.aggregate([
      {
        $match: {
          tenantId: tId,
          sourceType: 'regular_fee',
          createdAt: { $gte: start, $lt: endExclusive },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const dayMap = new Map<string, { gross: number; count: number; reversals: number }>();

  for (const p of paymentsByDay) {
    dayMap.set(p._id, { gross: p.amount, count: p.count, reversals: 0 });
  }

  for (const r of reversalsByDay) {
    const existing = dayMap.get(r._id) || { gross: 0, count: 0, reversals: 0 };
    existing.reversals = r.amount;
    dayMap.set(r._id, existing);
  }

  const sortedDates = Array.from(dayMap.keys()).sort();
  let grossTotal = 0;
  let reversalsTotal = 0;
  let totalPayments = 0;

  const rows = sortedDates.map((date) => {
    const d = dayMap.get(date)!;
    grossTotal += d.gross;
    reversalsTotal += d.reversals;
    totalPayments += d.count;
    const net = d.gross - d.reversals;
    return {
      date,
      amount: net, // net collection for this day
      count: d.count,
      gross: d.gross,
      reversals: d.reversals,
    };
  });

  const netTotal = grossTotal - reversalsTotal;

  return {
    month: monthStr,
    rows,
    grossTotal,
    reversalsTotal,
    netTotal,
    totalPayments,
  };
}
