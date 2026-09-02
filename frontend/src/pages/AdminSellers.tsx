import { useState } from 'react';
import { get, post } from '../lib/api';
import { useLoader } from '../lib/useLoader';
import { formatMoney } from '../lib/money';
import type { AdminSeller } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  Code,
  EmptyState,
  ErrorBanner,
  Note,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '../components/ui';

/**
 * The marketplace operator's view of every seller.
 *
 * All of these actions use the partner key and act across sellers, which is why
 * this page is admin-only. The list is refreshed with ONE get-sellers call
 * carrying every MPL, not one call per row.
 */
export function AdminSellers() {
  const {
    data: sellers,
    error,
    loading,
    reload,
    setError,
  } = useLoader(() => get<AdminSeller[]>('/admin/sellers'));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function act(id: string, run: () => Promise<unknown>, message?: string) {
    setError(null);
    setResult(null);
    setBusyId(id);
    try {
      await run();
      if (message) setResult(message);
      reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  function changeFee(seller: AdminSeller) {
    const answer = window.prompt(
      `Marketplace commission for ${seller.businessName}, in percent.\n\n` +
        'PayMe allows 0.00–60.00. Applies to sales created from now on; sales already generated keep the fee they were created with.',
      String(seller.marketFee),
    );
    if (!answer) return;
    void act(
      seller.id,
      () => post(`/admin/sellers/${seller.id}/market-fee`, { marketFee: Number(answer) }),
      `market_fee for ${seller.businessName} set to ${answer}%`,
    );
  }

  if (loading) return <Spinner label="Reading sellers from PayMe…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sellers</h1>
        <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-400">
          Local records joined with live PayMe state from a single{' '}
          <Code>get-sellers</Code> call — approval, fees and wallet balances all
          come from there.
        </p>
      </div>

      <ErrorBanner error={error} />
      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {result}
        </div>
      )}

      <Card>
        {sellers && sellers.length === 0 ? (
          <EmptyState title="No sellers yet">
            A user creates one from the “Sell with us” page.
          </EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Seller</Th>
                <Th>Plan / fee</Th>
                <Th>State</Th>
                <Th>Balance</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {sellers?.map((seller) => {
                const busy = busyId === seller.id;
                return (
                  <tr key={seller.id}>
                    <Td>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {seller.businessName}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">
                        {seller.paymeId}
                      </p>
                      {seller.owner && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {seller.owner.name} · {seller.owner.email}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Badge tone="info">{seller.planId}</Badge>
                      <p className="mt-1 tabular-nums">{seller.marketFee}%</p>
                      <p className="text-[11px] text-slate-400">market_fee</p>
                    </Td>
                    <Td>
                      <div className="space-y-1">
                        <Badge tone={seller.approved ? 'success' : 'warning'}>
                          {seller.approved ? 'approved' : 'pending docs'}
                        </Badge>
                        <Badge tone={seller.active ? 'success' : 'danger'}>
                          {seller.active ? 'active' : 'inactive'}
                        </Badge>
                        {seller.stale && <Badge tone="warning">stale</Badge>}
                      </div>
                    </Td>
                    <Td>
                      {seller.balances.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        seller.balances.map((balance) => (
                          <div key={balance.currency} className="mb-1">
                            <p className="tabular-nums">
                              {formatMoney(balance.total, balance.currency)}
                            </p>
                            <p className="text-[11px] text-emerald-600">
                              {formatMoney(balance.releasable, balance.currency)}{' '}
                              releasable
                            </p>
                          </div>
                        ))
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="secondary"
                          loading={busy}
                          onClick={() =>
                            act(seller.id, () => post(`/admin/sellers/${seller.id}/refresh`))
                          }
                        >
                          Refresh
                        </Button>
                        <Button variant="ghost" loading={busy} onClick={() => changeFee(seller)}>
                          Set fee
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busy}
                          title="GET /sellers/{mpl}/public-keys — the key Hosted Fields needs"
                          onClick={() =>
                            act(
                              seller.id,
                              () => post(`/admin/sellers/${seller.id}/public-key/refresh`),
                              `Public key refreshed for ${seller.businessName}`,
                            )
                          }
                        >
                          Public key
                        </Button>
                        <Button
                          variant="ghost"
                          loading={busy}
                          disabled={!seller.approved}
                          title={
                            seller.approved
                              ? 'withdraw-balance — pay out everything releasable'
                              : 'PayMe holds funds until the seller’s documents are verified'
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                `Pay out ${seller.businessName}'s releasable balance to their bank account?`,
                              )
                            ) {
                              void act(
                                seller.id,
                                () => post(`/admin/sellers/${seller.id}/withdraw`, {}),
                                `Withdrawal requested for ${seller.businessName}. Completion arrives as a withdrawal-complete callback.`,
                              );
                            }
                          }}
                        >
                          Withdraw
                        </Button>
                        {seller.signupLink && (
                          <a
                            href={seller.signupLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                          >
                            Onboarding link
                          </a>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Note title="Approval gates payouts, not payments">
        <p>
          A seller can take money the moment their MPL exists. PayMe holds it
          until three documents are verified — social ID, bank account and
          corporate certificate — so <Code>wallet_releasable</Code> stays at zero
          and <Code>withdraw-balance</Code> is refused until then. Do not gate
          checkout on approval; do tell the seller why they cannot withdraw.
        </p>
      </Note>
    </div>
  );
}
