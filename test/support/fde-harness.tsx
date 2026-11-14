/** @jsxImportSource react */
/** Mounted in a real browser by test/fde-parity.test.ts: the desk's own EpisodeEvidence component, fed what the Node-side adapters read. */
import { createRoot, type Root } from "react-dom/client";
import { EpisodeEvidence } from "../../src/ui/desk/EpisodeEvidence.tsx";

declare global {
  interface Window {
    mountEvidence: (sources: never, episodeRef?: string) => void;
  }
}

let root: Root | null = null;
window.mountEvidence = (sources, episodeRef) => {
  root?.unmount();
  const host = document.getElementById("root")!;
  host.innerHTML = "";
  root = createRoot(host);
  root.render(<EpisodeEvidence sources={sources} {...(episodeRef === undefined ? {} : { episodeRef })} />);
};
