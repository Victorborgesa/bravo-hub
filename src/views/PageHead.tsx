import { motion } from "motion/react";
import type { ReactNode } from "react";

// Cabeçalho no estilo do site da Bravo: "001. Seção" + título grande e leve.
export function PageHead({ index, eyebrow, title, lead, children }: { index: string; eyebrow: string; title: string; lead?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <motion.span className="eyebrow" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
        {index}. {eyebrow}
      </motion.span>
      <div className="page-head-row">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {title}
          </motion.h1>
          {lead && (
            <motion.p className="lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.6 }}>
              {lead}
            </motion.p>
          )}
        </div>
        {children}
      </div>
      <motion.div className="rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </header>
  );
}
