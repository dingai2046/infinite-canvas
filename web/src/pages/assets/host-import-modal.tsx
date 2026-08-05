// 「从宿主导入」弹窗：把宿主资产库里的图片 / 视频拉进画布素材区。
//
// 导入 = 真下载一份。宿主的媒体是外链，画布的节点与素材都指着自己的 IndexedDB blob，
// 这样离线可用、宿主那边删了也不会裂图。代价是重复占空间，故默认不全量拉，让用户勾选。

import { App, Button, Checkbox, Empty, Modal, Spin, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";

import { fetchHostAssets, hostAssetsSource, type HostAssetItem } from "@/services/host-assets";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";

const PAGE_SIZE = 60;

export default function HostImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const source = hostAssetsSource();

    const [items, setItems] = useState<HostAssetItem[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [error, setError] = useState("");

    const load = useCallback(
        async (nextCursor: string | null) => {
            setLoading(true);
            setError("");
            try {
                const data = await fetchHostAssets({ cursor: nextCursor, limit: PAGE_SIZE });
                setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
                setCursor(data.nextCursor);
            } catch (e) {
                setError(e instanceof Error ? e.message : "读取失败");
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        if (!open) return;
        setItems([]);
        setSelected(new Set());
        setCursor(null);
        void load(null);
    }, [open, load]);

    const toggle = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const importSelected = async () => {
        const picked = items.filter((item) => selected.has(item.id));
        if (!picked.length) return;
        setImporting(true);
        let ok = 0;
        const failed: string[] = [];
        for (const item of picked) {
            try {
                const title = item.name?.trim() || `${source?.label || "宿主"} ${item.createdAt.slice(0, 10)}`;
                if (item.kind === "VIDEO") {
                    const media = await uploadMediaFile(item.url, "video");
                    addAsset({
                        kind: "video",
                        title,
                        coverUrl: item.thumbUrl || "",
                        tags: ["宿主导入"],
                        source: item.url,
                        data: { url: media.url, storageKey: media.storageKey, width: item.width || 0, height: item.height || 0, bytes: media.bytes, mimeType: media.mimeType },
                    });
                } else {
                    const image = await uploadImage(item.url);
                    addAsset({
                        kind: "image",
                        title,
                        coverUrl: item.thumbUrl || image.url,
                        tags: ["宿主导入"],
                        source: item.url,
                        data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType },
                    });
                }
                ok += 1;
            } catch {
                failed.push(item.id);
            }
        }
        setImporting(false);
        if (ok) message.success(`已导入 ${ok} 个素材${failed.length ? `，${failed.length} 个失败` : ""}`);
        else message.error("导入失败，请检查网络或稍后重试");
        if (ok) onClose();
    };

    return (
        <Modal
            title={`从${source?.label || "宿主"}导入`}
            open={open}
            onCancel={onClose}
            width={860}
            footer={[
                <span key="count" className="mr-auto text-xs text-stone-500">
                    已选 {selected.size} / {items.length}
                </span>,
                <Button key="cancel" onClick={onClose}>
                    取消
                </Button>,
                <Button key="ok" type="primary" loading={importing} disabled={!selected.size} onClick={() => void importSelected()}>
                    导入选中
                </Button>,
            ]}
            styles={{ footer: { display: "flex", alignItems: "center", gap: 8 } }}
        >
            {error && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}

            {!items.length && loading ? (
                <div className="flex h-48 items-center justify-center">
                    <Spin />
                </div>
            ) : !items.length ? (
                <Empty description={error ? "没能读到素材" : "宿主资产库还是空的"} />
            ) : (
                <>
                    <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-4 md:grid-cols-5">
                        {items.map((item) => {
                            const checked = selected.has(item.id);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => toggle(item.id)}
                                    className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-colors ${checked ? "border-stone-900 dark:border-stone-100" : "border-transparent hover:border-stone-300 dark:hover:border-stone-600"}`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.thumbUrl || item.url} alt={item.name || ""} loading="lazy" className="size-full bg-stone-100 object-cover dark:bg-stone-800" />
                                    {item.kind === "VIDEO" && (
                                        <Tag color="processing" className="absolute left-1.5 top-1.5 m-0 text-[10px]">
                                            视频
                                        </Tag>
                                    )}
                                    <Checkbox checked={checked} className="pointer-events-none absolute right-1.5 top-1.5" />
                                </button>
                            );
                        })}
                    </div>
                    {cursor && (
                        <div className="mt-3 text-center">
                            <Button size="small" loading={loading} onClick={() => void load(cursor)}>
                                加载更多
                            </Button>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}
