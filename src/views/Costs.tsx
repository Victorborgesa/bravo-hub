import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useCosts } from "../store/costs";
import { PROVIDERS } from "../providers/catalog";
import type { ProviderId } from "../providers/types";
import { formatDate, formatUsd } from "../lib/format";
import { PageHead } from "./PageHead";
import { useBudget } from "../store/budget";

const RANGES = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
  { id: 3650, label: "Tudo" },
];

export function Costs() {
  const { entries, clear } = useCosts();
  const [days, setDays] = useState(30);
  const { monthly: subscription, set: setSubscription } = useBudget();
  const scoped = useMemo(() => entries.filter((e) => e.ts > Date.now() - days * 86400000), [entries, days]);
  const total = scoped.reduce((a, e) => a + e.usd, 0);
  const byProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of scoped) map.set(e.provider, (map.get(e.provider) ?? 0) + e.usd);
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [scoped]);
  const byModel = useMemo(() => {
    const map = new Map<string, { usd: number; n: number }>();
    for (const e of scoped) {
      const cur = map.get(e.modelLabel) ?? { usd: 0, n: 0 };
      map.set(e.modelLabel, { usd: cur.usd + e.usd, n: cur.n + 1 });
    }
    return [...map].sort((a, b) => b[1].usd - a[1].usd);
  }, [scoped]);
  const max = Math.max(...byProvider.map(([, v]) => v), 0.0001);
  const monthly = days >= 30 ? (total / Math.min(days, 30)) * 30 : (total / days) * 30;

  return (
    <div className="page">
      <PageHead index="003" eyebrow="Custos" title="Quanto o hub está custando" lead="Estimativas a partir da tabela de preços de cada modelo. O valor oficial é o da fatura de cada fabricante.">
        <div className="chips">
          {RANGES.map((r) => (
            <button key={r.id} className={`chip ${days === r.id ? "is-active" : ""}`} onClick={() => setDays(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </PageHead>

      <div className="stats">
        <Stat label="Gasto no período" value={formatUsd(total)} />
        <Stat label="Projeção mensal" value={formatUsd(monthly)} />
        <Stat label="Gerações" value={String(scoped.filter((e) => e.ok).length)} />
        <div className="stat">
          <span className="stat-label">Orçamento mensal (US$)</span>
          <input
            className="field stat-input"
            type="number"
            min={0}
            value={subscription || ""}
            placeholder="ex.: 45"
            onChange={(e) => setSubscription(Number(e.target.value))}
          />
          {subscription > 0 && (
            <span className={`stat-delta ${monthly <= subscription ? "good" : "bad"}`}>
              {monthly <= subscription
                ? `${formatUsd(subscription - monthly)}/mês abaixo do orçamento`
                : `${formatUsd(monthly - subscription)}/mês acima do orçamento`}
            </span>
          )}
        </div>
      </div>

      <div className="two-col">
        <section>
          <h2 className="section-title">Por fabricante</h2>
          {byProvider.length === 0 && <p className="muted">Sem gastos no período.</p>}
          {byProvider.map(([p, v], i) => (
            <div key={p} className="bar-row">
              <span className="bar-label">{PROVIDERS[p as ProviderId]?.name ?? p}</span>
              <div className="bar-track">
                <motion.div className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ delay: 0.1 * i, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
              </div>
              <span className="bar-value">{formatUsd(v)}</span>
            </div>
          ))}
        </section>
        <section>
          <h2 className="section-title">Por modelo</h2>
          <table className="table">
            <tbody>
              {byModel.map(([m, v]) => (
                <tr key={m}>
                  <td>{m}</td>
                  <td className="num">{v.n}×</td>
                  <td className="num">{formatUsd(v.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section>
        <div className="section-head">
          <h2 className="section-title">Registro</h2>
          {entries.length > 0 && (
            <button className="btn btn-ghost" onClick={() => confirm("Apagar todo o registro de custos?") && clear()}>
              Limpar registro
            </button>
          )}
        </div>
        <table className="table">
          <tbody>
            {scoped.slice(0, 200).map((e) => (
              <tr key={e.id} className={e.ok ? "" : "is-failed"}>
                <td>{formatDate(e.ts)}</td>
                <td>{e.modelLabel}</td>
                <td>{e.spaceName ?? "—"}</td>
                <td className="num">{e.ok ? `${+e.units.toFixed(3)} ${e.unit}` : "falhou"}</td>
                <td className="num">{formatUsd(e.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
