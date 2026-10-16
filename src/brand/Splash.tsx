import { motion } from "motion/react";
import { useEffect, type CSSProperties } from "react";
import { EASE } from "../lib/motion";

// Abertura do app: as quatro camadas do símbolo Bravo chegam separadas no
// espaço, girando, e se encaixam até formar o logo; o disco acende, o nome
// aparece e tudo se dissolve no app. Clique ou qualquer tecla pula.
//
// O movimento é CSS puro (keyframes): roda na placa de vídeo e não engasga
// enquanto o app carrega por baixo. Os tempos estão no vision.css.

const LAYERS = [
  // barra, elipse, anel, disco (de trás para a frente)
  { z: -170, el: <rect x="2" y="12" width="6" height="40" rx="3" fill="#8e8e8c" /> },
  { z: -70, el: <ellipse cx="22" cy="32" rx="10.5" ry="18.5" fill="none" stroke="#8e8e8c" strokeWidth="4.5" /> },
  { z: 50, el: <circle cx="31" cy="32" r="19" fill="none" stroke="#c4c4c2" strokeWidth="5" /> },
  { z: 160, el: <circle cx="40" cy="32" r="22" fill="#e9e9e7" /> },
];

const TOTAL_MS = 2700;

export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onDone, reduced ? 1000 : TOTAL_MS);
    const skip = () => onDone();
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", skip);
    };
  }, [onDone]);

  return (
    <motion.div className="splash" onClick={onDone} exit={{ opacity: 0, scale: 1.04, filter: "blur(14px)", transition: { duration: 0.5, ease: EASE } }}>
      <div className="splash-glow" />
      <div className="splash-stage">
        <div className="splash-mark">
          {LAYERS.map((l, i) => (
            <div key={i} className={`splash-layer l${i}`} style={{ "--z": `${l.z}px`, "--d": `${0.2 + i * 0.08}s` } as CSSProperties}>
              <svg viewBox="0 0 64 64">{l.el}</svg>
            </div>
          ))}
        </div>
        <div className="splash-words">
          <span className="splash-name">
            {"BRAVO".split("").map((c, i) => (
              <span key={i} style={{ "--d": `${1.05 + i * 0.05}s` } as CSSProperties}>
                {c}
              </span>
            ))}
          </span>
          <span className="splash-sub">HUB</span>
        </div>
      </div>
    </motion.div>
  );
}
