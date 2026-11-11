import { lazy, Suspense, useEffect, useRef } from "react";
import { Assemble } from "./components/Assemble";
import { Design } from "./components/Design";
import { Header, Tabs } from "./components/Header";
import { Parts } from "./components/Parts";
import { Plates } from "./components/Plates";
import { Settings } from "./components/Settings";
import { PlannerProvider, useMaybePlanner } from "./store";
import type { TabId } from "./types";

const Viewer = lazy(() => import("./components/Viewer").then((mod) => ({ default: mod.Viewer })));

export function App() {
  return (
    <PlannerProvider>
      <Shell />
    </PlannerProvider>
  );
}

function Shell() {
  const store = useMaybePlanner();
  const headRef = useRef<HTMLDivElement>(null);
  // The sticky header wraps to a second row at laptop widths; publish its
  // real height so the sticky Preview column and the drawing budgets in
  // styles.css sit below it at any wrap state.
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const publish = () => {
      document.documentElement.style.setProperty("--head-h", `${head.offsetHeight}px`);
    };
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(head);
    return () => observer.disconnect();
  }, [store?.ready, store?.settingsOpen]);
  if (!store) return <p className="boot">Loading planner…</p>;
  if (store.bootError) return <p className="boot-error">{store.bootError}</p>;
  if (!store.ready || !store.state) return <p className="boot">Loading planner…</p>;
  return (
    <>
      <div className="app-head" ref={headRef}>
        <Header />
        {store.settingsOpen ? null : <Tabs />}
      </div>
      {store.settingsOpen ? <Settings /> : <Screen tab={store.state.tab} />}
      {store.viewer ? (
        <Suspense fallback={null}>
          <Viewer />
        </Suspense>
      ) : null}
    </>
  );
}

function Screen({ tab }: { tab: TabId }) {
  switch (tab) {
    case "stack":
      return <Design />;
    case "parts":
      return <Parts />;
    case "plates":
      return <Plates />;
    case "assemble":
      return <Assemble />;
    default: {
      const neverTab: never = tab;
      return neverTab;
    }
  }
}
