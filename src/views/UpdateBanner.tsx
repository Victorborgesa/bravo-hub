import { AnimatePresence, motion } from "motion/react";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { checkForUpdate, type AvailableUpdate } from "../lib/system";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Avisa quando há versão nova e instala com um clique (o app reinicia sozinho). */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState<number | null | "idle">("idle");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const look = () => checkForUpdate().then(setUpdate).catch(() => undefined);
    look();
    const t = setInterval(look, SIX_HOURS);
    return () => clearInterval(t);
  }, []);

  const installing = progress !== "idle";
  return (
    <AnimatePresence>
      {update && !hidden && (
        <motion.div className="update-banner" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
          <Download size={16} />
          <span>
            {installing
              ? `Baixando a versão ${update.version}${typeof progress === "number" ? ` · ${progress}%` : "…"}`
              : `Versão ${update.version} disponível`}
          </span>
          {!installing && (
            <>
              <button className="btn btn-primary small" onClick={() => { setProgress(null); update.install(setProgress).catch(() => setProgress("idle")); }}>
                Atualizar agora
              </button>
              <button className="icon-btn" onClick={() => setHidden(true)} title="Depois"><X size={14} /></button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
