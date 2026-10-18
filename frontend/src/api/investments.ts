import { api } from './client';
import type { InvestmentsTimeseries } from '../../../shared/api-contracts';

export type { InvestmentsTimeseries };

export interface InvestmentsTimeseriesParams {
  fromDate?: string;
  granularity: 'day' | 'month';
  accountId?: number;
  // Multi-account subset (CSV on the wire). Takes precedence over accountId;
  // the Placements "all" scope sends it so unlocked savings are excluded.
  accountIds?: number[];
  display?: string | null;
}

export function getInvestmentsTimeseries(p: InvestmentsTimeseriesParams) {
  const hasIds = p.accountIds && p.accountIds.length > 0;
  return api<InvestmentsTimeseries>('/api/reports/investments-timeseries', {
    query: {
      granularity: p.granularity,
      ...(p.fromDate ? { fromDate: p.fromDate } : {}),
      ...(hasIds
        ? { accountIds: p.accountIds!.join(',') }
        : p.accountId !== undefined
          ? { accountId: p.accountId }
          : {}),
      ...(p.display ? { display: p.display } : {}),
    },
  });
}
