import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1422", color: "#0d1422" }}>
      <div style={{ width: 142, height: 142, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 39, background: "#32cb85", boxShadow: "inset 0 0 0 8 #a9f4d1", fontFamily: "Arial, sans-serif", fontSize: 66, fontWeight: 900, letterSpacing: -7, paddingRight: 7 }}>GD</div>
    </div>,
    size,
  );
}
