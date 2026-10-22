# Judge quick start

1. Run `python3 setup.py` on macOS/Linux, or `py setup.py` on Windows. Python 3.10+ is the only preinstalled runtime needed. Select the default no-API demo. Keep the terminal open.
2. Open the printed landing URL. The marketing page links the workspace, simulator, administration and hosted video. Core local features do not depend on the hosted MP4.
3. In `/simulator`, click **Run demo script**, or type “How much rice is available?”. Stock comes from real MCP/SQLite, even without a model key.
4. Follow **Verify call** to `/store/admin`, choose the prefilled Little India reviewer and sign in. Audit has Tool calls and LLM calls. Match the request ID and actual SQL. Model prompts/responses exist only when a real model request occurred.
5. In `/experience`, choose customer to find dal, or owner and demo PIN `1234` to inspect the synthetic owner story. New real-store accounts use ordinary password authentication, not this demo PIN.
6. In `/store/`, use the local judge owner profile or register an independent store. Record a sale, receive stock, manage photos and review a restock. Registered stores start empty and remain isolated.
7. Run `python3 setup.py --demo --non-interactive --verify` for automated checks and a self-stopping real MCP/audit smoke.

Without speech APIs, type questions. To test live hands-free speech, use the configured hosted preview or provide compatible services with `setup.py --live`. Any sentence containing **stop** stops the microphone and plays goodbye. Orders are simulated, no payment is collected and email needs a separately configured verified transport.

Store administration is password/session protected. The demo reviewer is read-only and synthetic-only. Each signed-up store owner uses their own credentials and can see only their own records. Global operator functions stay on the backend port, separate from this store portal.
