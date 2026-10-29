Browser end-to-end suite (Playwright, Python). It talks to a REAL backend and a built frontend.

Requirements: `pip install playwright httpx && python -m playwright install chromium`.
The script registers users through the API, so run it against a THROWAWAY database only
(it expects an admin `admin@example.com` / `AdminPass12345` to already exist; see `run_e2e.sh`).

    bash scripts/e2e/run_e2e.sh      # creates /tmp DB, starts API + `vite preview`, runs the suite
