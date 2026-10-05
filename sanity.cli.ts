import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: "gjy7dyq2",
    dataset: "production",
  },
  deployment: {
    appId: "q2v0sua5xmt2rthk9gg2ipqz",
  },
  // Keep this Studio build independent of a host-level PostCSS config.
  vite: (config) => ({
    ...config,
    css: {
      ...config.css,
      postcss: { plugins: [] },
    },
  }),
});
