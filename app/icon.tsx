import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1422", color: "#0d1422" }}>
      <div style={{ width: 408, height: 408, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 112, background: "#32cb85", boxShadow: "inset 0 0 0 24 #a9f4d1", fontFamily: "Arial, sans-serif", fontSize: 190, fontWeight: 900, letterSpacing: -20, paddingRight: 20 }}>GD</div>
    </div>,
    size,
  );
}
