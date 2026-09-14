export function PlansPanel() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl bg-slate-950 p-6 sm:p-7 border border-slate-200/50">
        <h2 className="font-heading text-xl font-semibold text-white mb-4">Plans</h2>
        <p className="text-slate-400 text-sm mb-6">
          Plan mix chart abhi live hai kyunki <code>subscriptions</code> table data use karta hai. MRR real values <em>blocked</em> hain jab tak Razorpay keys (Gap 1) nahi aate. Yahan free vs paid users ka count dikhega.
        </p>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">Phase 0 (existing): subscriptions counts (plan, status) har user pe already available — dashboard panel me count dikh jayega.</p>
          </div>
          <div className="rounded-xl bg-slate-800 p-4">
            <p className="text-sm text-slate-500">MRR placeholder: jab tak <code>Razorpay keys</code> set nahi honge, is section me Awaiting payment setup dikhega.</p>
          </div>
        </div>
      </div>
    </div>
  );
}