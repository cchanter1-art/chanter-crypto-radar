export function LazyRouteFallback() {
  return (
    <div
      className="rounded-xl p-8"
      style={{
        background: "rgba(7, 13, 22, 0.88)",
        border: "1px solid rgba(201, 215, 227, 0.08)",
        minHeight: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p className="text-sm" style={{ color: "#6b7280" }}>
        Loading Command Center module...
      </p>
    </div>
  );
}