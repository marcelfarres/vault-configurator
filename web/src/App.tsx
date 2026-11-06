import { lazy, Suspense } from "react";
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
  if (!store) return <p className="boot">Loading planner…</p>;
  if (store.bootError) return <p className="boot-error">{store.bootError}</p>;
  if (!store.ready || !store.state) return <p className="boot">Loading planner…</p>;
  return (
    <>
      <Header />
      {store.settingsOpen ? <Settings /> : (
        <>
          <Tabs />
          <Screen tab={store.state.tab} />
        </>
      )}
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
