# Sanity setup

## Project and Studio

- Project ID: `gjy7dyq2`
- Dataset: `production`
- `sanity.config.ts` imports the existing Relia schema; `sanity.cli.ts` selects the project/dataset and deployed Studio app.
- The existing schema passed validation with 0 errors and 0 warnings and was deployed to the dataset.
- The Studio is deployed at `https://relia.sanity.studio/` because Sanity Context GROQ mode requires a deployed Studio application for the dataset.

## Sanity Context MCP

The live endpoint URL and organization Context Viewer token are stored in the root `.env`, which is excluded by `.gitignore`. Do not commit or copy the token into source or documentation. The smoke command loads `.env` and does not print credentials:

```powershell
npm run sanity:context:smoke
```

Verified against project `gjy7dyq2`, dataset `production`:

- Tools discovered: `initial_context`, `groq_query`, `schema_explorer`, `array_field_reader`
- `initial_context`: call succeeded
- Schema types visible: `technology`, `version`, `requirement`, `compatibilityRule`, `breakingChange`, `migration`, `exception`, `source`
- GROQ query: succeeded and returned project/dataset identity
- Dataset result: 13 documents across `system.group`, `system.retention`, and `system.schema`; no Relia seed content was added

If credentials need rotation, create an organization-level token with **Context Viewer** permissions in Sanity Manage under **API > Tokens**, then replace the local `.env` value. The endpoint source must remain the dataset `gjy7dyq2.production` to serve GROQ mode.

References: [Sanity Context MCP](https://www.sanity.io/docs/ai/sanity-context-mcp), [Context MCP tools](https://www.sanity.io/docs/ai/sanity-context-mcp-tools), [Configure an MCP](https://www.sanity.io/docs/ai/sanity-context-configure-mcp), and [Sanity CLI configuration](https://www.sanity.io/docs/apis-and-sdks/cli-config).
