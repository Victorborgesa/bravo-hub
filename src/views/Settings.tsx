import { motion } from "motion/react";
import { Check, ExternalLink, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { MODELS, PROVIDERS } from "../providers/catalog";
import { useModelOverrides } from "../store/models";
import type { ProviderId } from "../providers/types";
import { isTauri, secretDelete, secretGet, secretSet } from "../lib/platform";
import { notify } from "../store/toasts";
import { PageHead } from "./PageHead";
import { useUpdates } from "../store/updates";
import { relativeDate } from "../lib/format";
import { getVersion } from "@tauri-apps/api/app";
import { deleteMedia, formatBytes, scanMedia, type MediaUsage } from "../lib/storage";

function SecretField({ secretKey, label, onChange }: { secretKey: string; label: string; onChange: () => void }) {
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
      onChange();
      notify(`${label} salva no cofre.`, "ok");
    } catch (e) {
      notify(`Não consegui salvar: ${e instanceof Error ? e.message : e}`, "error");
    }
  }

  async function remove() {
    await secretDelete(secretKey);
    setSaved(false);
    onChange();
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
  const [version, setVersion] = useState(0);
  useEffect(() => {
    Promise.all(p.secrets.map((s) => secretGet(s.key))).then((vals) => setReady(vals.every(Boolean)));
  }, [p, version]);
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
        <SecretField key={s.key} secretKey={s.key} label={s.label} onChange={() => setVersion((v) => v + 1)} />
      ))}
    </motion.section>
  );
}

const CAP_LABEL = { image: "Imagem", video: "Vídeo", upscale: "Upscale", text: "Texto" } as const;

/** Edita livremente e só salva ao sair do campo ou apertar Enter (vazio volta ao padrão). */
function ModelIdInput({ initial, custom, onCommit }: { initial: string; custom: boolean; onCommit: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className={`field mono ${custom ? "is-custom" : ""}`}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Permite corrigir o ID de API de um modelo quando o fabricante renomeia ou aposenta uma versão. */
function ModelIds() {
  const { apiIds, setApiId, reset } = useModelOverrides();
  return (
    <section className="models-table">
      <h2 className="section-title">Modelos</h2>
      <p className="muted small-lead">
        Os fabricantes renomeiam e aposentam modelos com frequência. Se algum der erro de "modelo não encontrado", troque o ID aqui pelo nome que aparece na documentação ou no painel do fabricante.
      </p>
      <table className="table">
        <tbody>
          {MODELS.map((m) => (
            <tr key={m.id}>
              <td>{m.label}</td>
              <td className="muted">{PROVIDERS[m.provider].name.split(" ")[0]} · {CAP_LABEL[m.capability]}</td>
              <td className="id-cell">
                <ModelIdInput
                  key={apiIds[m.id] ?? m.apiModel}
                  initial={apiIds[m.id] ?? m.apiModel}
                  custom={!!apiIds[m.id]}
                  onCommit={(v) => (v && v !== m.apiModel ? setApiId(m.id, v) : reset(m.id))}
                />
              </td>
              <td className="num">{apiIds[m.id] && <button className="link" onClick={() => reset(m.id)}>Restaurar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Versão instalada e verificação manual de atualizações. */
function AppVersion() {
  const { status, update, progress, error, checkedAt, check, install } = useUpdates();
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (isTauri) getVersion().then(setVersion).catch(() => undefined);
  }, []);
  if (!isTauri) return null;
  const message =
    status === "checking" ? "Verificando…" :
    status === "latest" ? "Você está na versão mais recente." :
    status === "available" ? `Versão ${update?.version} disponível.` :
    status === "installing" ? `Baixando a versão ${update?.version}${typeof progress === "number" ? ` · ${progress}%` : "…"}` :
    status === "error" ? `Não consegui verificar: ${error}` : "";
  return (
    <div className="version-row">
      <div>
        <span className="field-label">Bravo Hub</span>
        <span className="version-num">v{version}</span>
      </div>
      <div className="version-msg">
        <span className={status === "error" ? "danger" : status === "available" ? "ok" : "muted"}>{message}</span>
        {checkedAt && status !== "checking" && <small className="muted">verificado {relativeDate(checkedAt)}</small>}
      </div>
      {status === "available" ? (
        <button className="btn btn-primary" onClick={install}>Atualizar agora</button>
      ) : (
        <button className="btn btn-ghost" onClick={check} disabled={status === "checking" || status === "installing"}>
          Verificar atualizações
        </button>
      )}
    </div>
  );
}

function Storage() {
  const [usage, setUsage] = useState<MediaUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => scanMedia().then(setUsage).catch(() => setUsage(null));
  useEffect(() => { refresh(); }, []);
  if (!isTauri) return null;
  return (
    <section className="models-table">
      <h2 className="section-title">Armazenamento</h2>
      <p className="muted small-lead">
        Tudo que o Bravo Hub gera fica salvo neste computador. Imagens e vídeos de nodes ou spaces que você apagou continuam ocupando espaço até serem limpos aqui. O que estiver em algum space nunca é apagado.
      </p>
      {usage && (
        <div className="storage-row">
          <span>{usage.files} arquivos · {formatBytes(usage.bytes)}</span>
          <span className="muted">{usage.orphanFiles.length} sem uso · {formatBytes(usage.orphanBytes)}</span>
          <button
            className="btn btn-ghost"
            disabled={busy || !usage.orphanFiles.length}
            onClick={async () => {
              if (!confirm(`Apagar ${usage.orphanFiles.length} arquivo(s) sem uso (${formatBytes(usage.orphanBytes)})?`)) return;
              setBusy(true);
              try {
                await deleteMedia(usage.orphanFiles);
                notify("Arquivos sem uso apagados.", "ok");
              } catch (e) {
                notify(`Não consegui apagar: ${e instanceof Error ? e.message : e}`, "error");
              } finally {
                setBusy(false);
                refresh();
              }
            }}
          >
            Limpar arquivos sem uso
          </button>
        </div>
      )}
    </section>
  );
}

export function Settings() {
  return (
    <div className="page">
      <PageHead index="004" eyebrow="Ajustes" title="Conexões com os fabricantes" lead="Cada chave fica guardada no cofre do Windows, neste computador. O Bravo Hub chama a API oficial de cada fabricante direto, sem intermediários." />
      <AppVersion />
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
      <ModelIds />
      <Storage />
    </div>
  );
}
