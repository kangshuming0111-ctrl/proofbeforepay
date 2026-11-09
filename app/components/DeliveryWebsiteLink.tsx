"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/contracts";
import "./delivery-website-link.css";

type QrDrawing = { size: number; path: string };
const quietZone = 4;

function PreviewQr({ previewPath, language }: { previewPath: string; language: Language }) {
  const [drawing, setDrawing] = useState<QrDrawing | null>();

  useEffect(() => {
    let active = true;
    import("qrcode-generator").then(({ default: qrcode }) => {
      if (!active) return;
      const code = qrcode(0, "M");
      code.addData(new URL(previewPath, window.location.origin).href, "Byte");
      code.make();

      const modules = code.getModuleCount();
      let path = "";
      for (let row = 0; row < modules; row++) {
        for (let column = 0; column < modules; column++) {
          if (code.isDark(row, column)) path += `M${column + quietZone} ${row + quietZone}h1v1h-1z`;
        }
      }
      setDrawing({ size: modules + quietZone * 2, path });
    }).catch(() => {
      if (active) setDrawing(null);
    });
    return () => { active = false; };
  }, [previewPath]);

  const zh = language === "zh";
  if (drawing === null) return <p className="delivery-website-note">{zh ? "二维码暂不可用，可以直接打开链接。" : "The QR code is unavailable. You can still open the link."}</p>;
  if (!drawing) return null;

  const displaySize = drawing.size * 3;
  return <div className="delivery-website-qr">
    <svg aria-hidden="true" focusable="false" width={displaySize} height={displaySize} viewBox={`0 0 ${drawing.size} ${drawing.size}`} shapeRendering="crispEdges">
      <rect width={drawing.size} height={drawing.size} fill="#fff" />
      <path d={drawing.path} fill="#000" />
    </svg>
    <div>
      <strong>{zh ? "手机扫码查看" : "Scan to open on your phone"}</strong>
      <p className="delivery-website-note">{zh ? "请用有项目访问权限的账号。" : "Use an account that can access this project."}</p>
    </div>
  </div>;
}

/** Give both devices the same saved upload, using its existing project permissions. */
export function DeliveryWebsiteLink({ previewPath, language }: { previewPath?: string; language: Language }) {
  const zh = language === "zh";
  if (!previewPath) return <p className="delivery-website-note">{zh ? "卖家交付网站后，这里会出现预览链接和二维码。" : "The preview link and QR code appear here after the seller delivers the website."}</p>;

  return <div className="delivery-website-handoff">
    <a className="delivery-website-link" href={previewPath} target="_blank" rel="noopener noreferrer" aria-label={zh ? "在新标签页打开网站预览" : "Open website preview in a new tab"}>
      {zh ? "打开网站预览" : "Open website preview"}<ArrowUpRight size={16} aria-hidden="true" />
    </a>
    <PreviewQr key={previewPath} previewPath={previewPath} language={language} />
  </div>;
}
