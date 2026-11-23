# Golden-set evaluation — contract compliance

Protocol: deterministic assertions only (region structure, change
tagging, verbatim quoted-span compliance, required-substring
preservation, per-case coverage keyword groups, length sanity band).
No LLM judge and no quality score is claimed. System prompts are the
app's own, imported from src/lib/prompts.ts at run time.

- Endpoint: http://127.0.0.1:1207/v1
- Model: klosraf/qwen3-4b
- Temperature: 0
- Date: 2026-11-23T08:39:27.094Z
- Cases: n=16 (EN 9 / ES 7)

## Results

- Full pass: 0.0% (0/16)
- Structure: 6.3% (1/16)
- Change tagging: 6.3% (1/16)
- Preservation: 6.3% (1/16)
- Length band: 0.0% (0/16)
- Quoted spans verbatim: 100.0% (2/2)

## Per case

| Case | Lang | Mode | Result | Structure | Tagged | Preserve | Cover | Length | Spans |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en-better-01 | en | better | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-better-02 | en | better | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-specific-01 | en | specific | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-developer-01 | en | developer | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-better-03 | en | better | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-shorter-01 | en | shorter | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-marketing-01 | en | marketing | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-research-01 | en | research | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-better-01 | es | better | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-better-02 | es | better | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-specific-01 | es | specific | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-developer-01 | es | developer | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-better-03 | es | better | FAIL | ✓ | ✓ | ✓ | ✓✓✗ | ✗ | 2/2 |
| es-product-01 | es | product | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| en-beginner-01 | en | beginner | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |
| es-longer-01 | es | longer | FAIL | ✗ | ✗ | ✗ |  | ✗ | 0/0 |

## Conditions addendum (added 2026-11-23, after the run)

This measurement was taken on an overloaded machine: load averages
52-104 on 16 CPUs, with several parallel programmes running. A control
probe immediately after the run (tiny prompt, max_tokens 220) took
53.5 s and still ended with finish_reason "length" — outputs were
being truncated by the server default token budget, which this run did
not pin. Read the rates as a lower bound measured under those
conditions, not as the model ceiling: the single fully structured case
also produced the only quoted spans, and both were verbatim-correct.
The runner now pins max_tokens (default 1500), records finish_reason
and saves raw outputs per case; a second run under the pinned protocol
supersedes these numbers when it lands.
