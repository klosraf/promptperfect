# Run 2 — aborted, no measurement taken

The second run (pinned max_tokens 1500) was aborted after 12 of 16
cases failed identically: "fetch failed" at ~300.7 s each. Cause,
established from the uniformity of the failure: the global fetch
(undici) default ~300 s body timeout, not the endpoint — a control
probe with a small token budget completed in 53.5 s during the same
window, and run 1 (server-default budget, shorter outputs) completed
all 16 cases. No rates are reported from run 2; its per-case log was
/tmp/pp-eval2.log on the machine. The runner now uses node:http with
an explicit 900 s ceiling and streams raw evidence per case; run 3
supersedes.
