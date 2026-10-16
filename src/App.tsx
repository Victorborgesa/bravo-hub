import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useState } from "react";
import { Splash } from "./brand/Splash";
import { Sidebar, type View } from "./views/Sidebar";
import { SpacesHome } from "./views/SpacesHome";
import { Library } from "./views/Library";
import { Costs } from "./views/Costs";
import { Settings } from "./views/Settings";
import { Lightbox, SpaceCanvas } from "./canvas/SpaceCanvas";
import { useSpaces } from "./store/spaces";
import { useToasts } from "./store/toasts";
import { UpdateBanner } from "./views/UpdateBanner";
import { EASE, enterSpace, page, SPRING } from "./lib/motion";

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
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.08, right: 0.9 }}
            onDragEnd={(_, info) => (info.offset.x > 80 || info.velocity.x > 400) && dismiss(t.id)}
            initial={{ opacity: 0, y: 16, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={{ opacity: 0, x: 60, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE } }}
            transition={SPRING}
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
  // Abertura com o logo em 3D, uma vez por abertura do app.
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);
  const activeId = useSpaces((s) => s.activeId);
  const open = useSpaces((s) => s.open);
  const Page = PAGES[view];
  const key = activeId ? `canvas-${activeId}` : view;

  return (
    // Quem pede menos movimento no Windows ganha só fades, sem deslocamento.
    <MotionConfig reducedMotion="user">
    <div className="aurora" aria-hidden><span /></div>
    <div className="grain" aria-hidden />
    <div className="app">
      <AnimatePresence mode="wait">
        {!activeId && (
          <motion.div key="sidebar" initial={{ x: -24, opacity: 0, filter: "blur(8px)" }} animate={{ x: 0, opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }} exit={{ x: -20, opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.32, ease: EASE }}>
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
            {...(activeId ? enterSpace : page)}
          >
            {activeId ? <SpaceCanvas /> : <Page />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Lightbox />
      <Toasts />
      <UpdateBanner />
    </div>
    <AnimatePresence>{intro && <Splash key="splash" onDone={endIntro} />}</AnimatePresence>
    </MotionConfig>
  );
}
