# Playwright browser gate

The test project starts only local API and Next dev servers. Without production
environment variables it exercises the explicit canonical-read unavailable
state, real local import/analyzer wiring, controlled fixture labels,
desktop/mobile route rendering, and console/error-overlay truth. It never
connects a wallet or sends a chain transaction.
