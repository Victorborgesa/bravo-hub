import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Sidebar, type View } from "./views/Sidebar";
import { SpacesHome } from "./views/SpacesHome";
import { Library } from "./views/Library";
import { Costs } from "./views/Costs";
import { Settings } from "./views/Settings";
import { Lightbox, SpaceCanvas } from "./canvas/SpaceCanvas";
import { useSpaces } from "./store/spaces";
import { useToasts } from "./store/toasts";
import { UpdateBanner } from "./views/UpdateBanner";

const PAGES: Record<View, () => JSX.Element> = {
  spaces: SpacesHome,
  history: Library,
  costs: Costs,
  settings: Settings,
};

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            className={`toast ${t.tone}`}
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
          >
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>("spaces");
  const activeId = useSpaces((s) => s.activeId);
  const open = useSpaces((s) => s.open);
  const Page = PAGES[view];
  const key = activeId ? `canvas-${activeId}` : view;

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {!activeId && (
          <motion.div key="sidebar" initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.35 }}>
            <Sidebar
              view={view}
              onChange={(v) => {
                setView(v);
                open(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            className="view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeId ? <SpaceCanvas /> : <Page />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Lightbox />
      <Toasts />
      <UpdateBanner />
    </div>
  );
}
