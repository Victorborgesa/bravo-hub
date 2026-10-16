import { motion } from "motion/react";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDERS } from "../providers/catalog";
import type { ProviderId } from "../providers/types";
import { isTauri, secretDelete, secretGet, secretSet } from "../lib/platform";
import { notify } from "../store/toasts";
import { PageHead } from "./PageHead";

function SecretField({ secretKey, label }: { secretKey: string; label: string }) {
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    secretGet(secretKey).then((v) => setSaved(!!v)).catch(() => setSaved(false));
  }, [secretKey]);

  async function save() {
    if (!value.trim()) return;
    try {
      await secretSet(secretKey, value.trim());
      setValue("");
      setSaved(true);
      notify(`${label} salva no cofre.`, "ok");
    } catch (e) {
      notify(`Não consegui salvar: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  async function remove() {
    await secretDelete(secretKey);
    setSaved(false);
  }

  return (
    <div className="secret">
      <span className="field-label">{label}</span>
      <div className="secret-row">
        <input
          className="field"
          type="password"
          autoComplete="off"
          placeholder={saved ? "•••••••• (salva)" : "Cole a chave aqui"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button className="btn" onClick={save} disabled={!value.trim()}>Salvar</button>
        {saved && <button className="btn btn-ghost" onClick={remove}>Remover</button>}
      </div>
    </div>
  );
}

function ProviderCard({ id, index }: { id: ProviderId; index: number }) {
  const p = PROVIDERS[id];
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(p.secrets.map((s) => secretGet(s.key))).then((vals) => setReady(vals.every(Boolean)));
  });
  return (
    <motion.section className="provider" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}>
      <header className="provider-head">
        <h2>{p.name}</h2>
        <span className={`badge ${ready ? "ok" : ""}`}>{ready ? <><Check size={12} /> Conectado</> : "Sem chave"}</span>
        <a className="link" href={p.site} target="_blank" rel="noreferrer">
          Pegar chave <ExternalLink size={12} />
        </a>
      </header>
      {p.secrets.map((s) => (
        <SecretField key={s.key} secretKey={s.key} label={s.label} />
      ))}
    </motion.section>
  );
}

export function Settings() {
  return (
    <div className="page">
      <PageHead index="004" eyebrow="Ajustes" title="Conexões com os fabricantes" lead="Cada chave fica guardada no cofre do Windows, neste computador. O Bravo Hub chama a API oficial de cada fabricante direto, sem intermediários." />
      {!isTauri && (
        <div className="notice">
          <KeyRound size={16} />
          Você está no modo navegador de desenvolvimento: as chaves ficam no armazenamento do navegador e várias APIs bloqueiam chamadas daqui. Use o app desktop para gerar de verdade.
        </div>
      )}
      <div className="providers">
        {(Object.keys(PROVIDERS) as ProviderId[]).map((id, i) => (
          <ProviderCard key={id} id={id} index={i} />
        ))}
      </div>
    </div>
  );
}
