import { AnimatePresence, motion } from "motion/react";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useUpdates } from "../store/updates";
import { rise } from "../lib/motion";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Avisa quando há versão nova e instala com um clique (o app reinicia sozinho). */
export function UpdateBanner() {
  const { status, update, progress, check, install } = useUpdates();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    check();
    const t = setInterval(check, SIX_HOURS);
    // Ao voltar para o app depois de um tempo, procura de novo.
    const onFocus = () => {
      const last = useUpdates.getState().checkedAt ?? 0;
      if (Date.now() - last > 30 * 60 * 1000) check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  const show = update && !hidden && (status === "available" || status === "installing");
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="update-banner" {...rise}>
          <Download size={16} />
          <span>
            {status === "installing"
              ? `Baixando a versão ${update.version}${typeof progress === "number" ? ` · ${progress}%` : "…"}`
              : `Versão ${update.version} disponível`}
          </span>
          {status === "available" && (
            <>
              <button className="btn btn-primary small" onClick={install}>Atualizar agora</button>
              <button className="icon-btn" onClick={() => setHidden(true)} title="Depois"><X size={14} /></button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
