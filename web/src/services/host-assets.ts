// 宿主资产库：画布嵌在别的站点里时，把宿主那边的素材拉进画布的素材区。
//
// 宿主在 window.__CANVAS_HOST_CHANNEL__ 里声明 assets: { url, label }，鉴权复用同一把渠道令牌。
// 没声明就当作没有这个功能（独立部署时素材页不会多出任何东西）。
//
// 约定的响应形状：
//   { items: [{ id, kind: "IMAGE" | "VIDEO", url, thumbUrl?, width?, height?, duration?, name?, createdAt }],
//     nextCursor: string | null }

import { readHostChannelConfig } from "@/stores/use-config-store";

export type HostAssetItem = {
    id: string;
    kind: "IMAGE" | "VIDEO";
    url: string;
    thumbUrl?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    name?: string | null;
    createdAt: string;
};

export type HostAssetsSource = { url: string; label: string; apiKey: string };

export function hostAssetsSource(): HostAssetsSource | null {
    const host = readHostChannelConfig();
    const url = host?.assets?.url?.trim();
    if (!url || !host?.apiKey?.trim()) return null;
    return { url, label: host.assets?.label?.trim() || host.name?.trim() || "宿主资产库", apiKey: host.apiKey };
}

export async function fetchHostAssets(options?: { cursor?: string | null; kind?: "IMAGE" | "VIDEO"; limit?: number; signal?: AbortSignal }) {
    const source = hostAssetsSource();
    if (!source) throw new Error("当前没有可用的宿主资产库");

    // url 可能是相对路径（同源部署时最省事），用 location 兜底解析
    const target = new URL(source.url, typeof window === "undefined" ? "http://localhost" : window.location.href);
    if (options?.cursor) target.searchParams.set("cursor", options.cursor);
    if (options?.kind) target.searchParams.set("kind", options.kind);
    if (options?.limit) target.searchParams.set("limit", String(options.limit));

    const response = await fetch(target.toString(), {
        headers: { Authorization: `Bearer ${source.apiKey}` },
        signal: options?.signal,
    });
    const data = (await response.json().catch(() => null)) as { items?: HostAssetItem[]; nextCursor?: string | null; error?: string } | null;
    if (!response.ok) throw new Error(data?.error || `宿主资产库返回 ${response.status}`);
    return { items: data?.items || [], nextCursor: data?.nextCursor ?? null };
}
