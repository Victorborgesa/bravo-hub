import { create } from "zustand";

export type StepState = "waiting" | "running" | "done" | "error" | "skipped";

export interface RunStep {
  nodeId: string;
  label: string;
  state: StepState;
  startedAt?: number;
  endedAt?: number;
}

export interface FlowRun {
  spaceId: string;
  startedAt: number;
  endedAt?: number;
  estimateUsd: number;
  steps: RunStep[];
}

/** Execução do fluxo em andamento (só em memória), mostrada no painel do canvas. */
interface RunState {
  run: FlowRun | null;
  start: (run: FlowRun) => void;
  step: (nodeId: string, patch: Partial<RunStep>) => void;
  finish: () => void;
  dismiss: () => void;
}

export const useRuns = create<RunState>()((set) => ({
  run: null,
  start: (run) => set({ run }),
  step: (nodeId, patch) =>
    set((s) => (s.run ? { run: { ...s.run, steps: s.run.steps.map((x) => (x.nodeId === nodeId ? { ...x, ...patch } : x)) } } : s)),
  finish: () => set((s) => (s.run ? { run: { ...s.run, endedAt: Date.now() } } : s)),
  dismiss: () => set({ run: null }),
}));
