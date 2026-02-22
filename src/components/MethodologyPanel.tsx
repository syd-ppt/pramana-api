export default function MethodologyPanel() {
  return (
    <details className="bg-white rounded-lg shadow-sm p-6 mt-8">
      <summary className="text-lg font-semibold text-slate-900 cursor-pointer select-none">
        Statistical Methodology
      </summary>
      <div className="mt-4 space-y-4 text-sm text-slate-700">
        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Welch's t-test</h3>
          <p>
            We use Welch's t-test (not Student's) because model performance samples have unequal variances
            across time periods. Welch's approximation adjusts degrees of freedom to avoid inflated
            false-positive rates that Student's t-test produces under heteroscedasticity.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Cohen's d Effect Size</h3>
          <p>
            Statistical significance alone is insufficient — a large sample can make trivial differences
            "significant." Cohen's d measures practical magnitude: negligible (&lt;0.2), small (0.2–0.5),
            medium (0.5–0.8), large (&gt;0.8). We report both p-value and d so you can assess whether
            detected drift is meaningful.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Holm-Bonferroni Correction</h3>
          <p>
            Testing multiple models simultaneously inflates false-positive rates. Testing 10 models at
            &alpha;=0.05 gives ~40% chance of at least one false alarm. Holm-Bonferroni is a stepwise
            procedure that controls the family-wise error rate while being less conservative than
            classic Bonferroni — it rejects more true positives.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Wilson Confidence Intervals</h3>
          <p>
            For binary pass/fail scores, we use Wilson intervals instead of Wald intervals. Wilson
            intervals have correct coverage even at extreme proportions (p near 0 or 1) and small
            sample sizes where Wald intervals collapse.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Welford's Algorithm</h3>
          <p>
            All statistics are computed incrementally using Welford's online algorithm. This means
            we store only (n, mean, M2) per group — no raw scores are retained. This is both
            storage-efficient (O(1) per group vs O(n) for raw data) and privacy-preserving
            (individual submissions cannot be reconstructed from aggregates).
          </p>
        </section>
      </div>
    </details>
  );
}
