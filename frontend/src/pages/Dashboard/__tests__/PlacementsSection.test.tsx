import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Account } from '../../../api/types';
import { PlacementsSection } from '../PlacementsSection';
import { pinLocale } from '../../../test/i18n';

vi.mock('../../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../api/client')>('../../../api/client');
  return { ...actual, api: vi.fn() };
});
import { api } from '../../../api/client';
const apiMock = vi.mocked(api);

pinLocale('dashboard', 'charts');

const acc = (id: number, type: string, name: string, extra: Partial<Account> = {}) =>
  ({ id, type, name, currency: 'EUR', ...extra }) as unknown as Account;
// A plain unlocked Livret A (no placement, no bloqué) is intentionally
// excluded; the PEL is a locked savings so it still qualifies.
const accounts = [
  acc(1, 'checking', 'Courant'),
  acc(2, 'investment', 'Assurance-vie'),
  acc(3, 'savings', 'Livret A'),
  acc(4, 'savings', 'PEL', { openingDate: '2020-01-01', currentBalance: '5000.00', availableBalance: '0.00', lockYears: 10 }),
];

const response = {
  points: [
    { currency: 'EUR', bucket: '2026-01-01', contributed: '1000.00', value: '1000.00', gain: '0.00', estimated: false },
    { currency: 'EUR', bucket: '2026-02-01', contributed: '1000.00', value: '1085.00', gain: '85.00', estimated: true },
    { currency: 'EUR', bucket: '2026-03-01', contributed: '1200.00', value: '1150.00', gain: '-50.00', estimated: true },
    { currency: 'EUR', bucket: '2026-04-01', contributed: '1200.00', value: '1150.00', gain: '-50.00', estimated: true },
  ],
  consolidated: null,
};

function renderSection(list: Account[] = accounts) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlacementsSection accounts={list} displayCurrency={null} primaryCurrency="EUR" defaultRange="12m" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue(response as never);
});

it('renders nothing when there is no investment or locked account', () => {
  const { container } = renderSection([accounts[0]!, accounts[2]!]);
  expect(container).toBeEmptyDOMElement();
  expect(apiMock).not.toHaveBeenCalled();
});

it('draws both areas, the dots and the Valeur / Versé / Plus-value summary', async () => {
  renderSection();
  const summary = await screen.findByTestId('placements-summary');
  expect(summary.textContent).toMatch(/Valeur/);
  expect(summary.textContent).toMatch(/Versé/);
  expect(summary.textContent).toMatch(/Plus-value/);
  expect(summary.textContent).toMatch(/-50,00/);
  expect(summary.textContent).toMatch(/-4,17 %/);
  expect(screen.getByTestId('gain-area-positive')).toBeInTheDocument();
  expect(screen.getByTestId('gain-area-negative')).toBeInTheDocument();
  expect(screen.getAllByTestId('valuation-dot')).toHaveLength(1);
  const [path, opts] = apiMock.mock.calls[0]!;
  expect(path).toBe('/api/reports/investments-timeseries');
  expect(opts).toMatchObject({ query: { granularity: 'month' } });
});

it('counts the plus-value from the start of the selected range', async () => {
  apiMock.mockResolvedValue({
    points: [
      { currency: 'EUR', bucket: '2026-01-01', contributed: '1000.00', value: '1100.00', gain: '100.00', estimated: false },
      { currency: 'EUR', bucket: '2026-02-01', contributed: '1050.00', value: '1180.00', gain: '130.00', estimated: false },
    ],
    consolidated: null,
  } as never);
  renderSection();
  const summary = await screen.findByTestId('placements-summary');
  expect(summary.textContent).toMatch(/Versé sur la période 50,00/);
  expect(summary.textContent).toMatch(/Plus-value sur la période \+30,00/);
  expect(summary.textContent).not.toMatch(/130,00/);
});

it('lists only investment and locked accounts in the picker and scopes the query', async () => {
  renderSection();
  await screen.findByTestId('placements-summary');
  const select = screen.getByRole('combobox');
  expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
    'Tous les comptes', 'Assurance-vie (EUR)', 'PEL (EUR)',
  ]);
  fireEvent.change(select, { target: { value: '2' } });
  await waitFor(() => expect(apiMock.mock.calls.at(-1)![1]).toMatchObject({ query: { accountId: 2 } }));
});
