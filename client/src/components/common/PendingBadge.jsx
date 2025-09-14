// PendingBadge.jsx
export default function PendingBadge({ shortId, deadline }) {
  return (
    <div className="p-4 bg-gray-50 rounded-xl border animate-pulse">
      <h4 className="font-semibold mb-2">⏳ Waiting for approval…</h4>
      <p className="text-sm text-gray-700">
        Hi, we received your subscription request with screenshot.
        <br />
        Ref ID: <b>{shortId}</b>
        <br />
        Latest by: <b>{deadline}</b>
      </p>
      <div className="mt-2 flex items-center gap-2 text-gray-500 text-sm">
        <span className="animate-spin">🔄</span> Verifying payment…
      </div>
    </div>
  );
}
