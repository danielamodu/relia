import { defineConfig } from "sanity";
import schemaTypes from "./sanity.schema";

export default defineConfig({
  name: "relia",
  title: "Relia",
  projectId: "gjy7dyq2",
  dataset: "production",
  schema: {
    types: schemaTypes,
  },
});
