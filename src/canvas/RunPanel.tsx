import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Minus, X } from "lucide-react";
import { useRuns, type StepState } from "../store/runs";
import { useSpaces } from "../store/spaces";
import { Timer } from "./Timer";
import { rise } from "../lib/motion";

const ICON: Record<StepState, React.ReactNode> = {
  waiting: null,
  running: <Loader2 size={11} className="spin" />,
  done: <Check size={11} strokeWidth={3} />,
  error: <X size={11} strokeWidth={3} />,
  skipped: <Minus size={11} />,
};

/** Etapas do "Executar fluxo", uma por node, com cronômetro de cada uma. */
export function RunPanel() {
  const { run, dismiss } = useRuns();
  const activeId = useSpaces((s) => s.activeId);
  const show = run && run.spaceId === activeId;
  const finished = run?.steps.filter((s) => s.state === "done" || s.state === "error" || s.state === "skipped").length ?? 0;
  const total = run?.steps.length ?? 1;
  const failed = run?.steps.some((s) => s.state === "error");

  return (
    <AnimatePresence>
      {show && run && (
        <motion.section className="run-panel" {...rise}>
          <div className="run-bar"><div style={{ transform: `scaleX(${finished / total})` }} /></div>
          <header className="run-head">
            <span className="run-title">
              {run.endedAt ? (failed ? "Fluxo com erro" : "Fluxo concluído") : "Executando fluxo"}
              <small>{finished}/{total} etapas · ~US$ {run.estimateUsd.toFixed(2)}</small>
            </span>
            <span className="grow" />
            <Timer since={run.startedAt} until={run.endedAt} className="timer small-timer" />
            <button className="icon-btn" onClick={dismiss} title="Fechar"><X size={14} /></button>
          </header>
          <ul className="run-steps">
            {run.steps.map((s, i) => (
              <motion.li key={s.nodeId} className="run-step" data-state={s.state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
                <span className="step-dot">{ICON[s.state]}</span>
                <span>{s.label}</span>
                <small>{s.state === "waiting" ? "aguardando" : s.state === "skipped" ? "pulado" : <Timer since={s.startedAt} until={s.endedAt} className="" />}</small>
              </motion.li>
            ))}
          </ul>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
