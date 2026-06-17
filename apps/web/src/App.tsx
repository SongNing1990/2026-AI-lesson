import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  document_count: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

type Category = {
  id: string;
  name: string;
  pinned: boolean;
  knowledgeBaseIds: string[];
};

type DocumentMeta = {
  id: string;
  knowledge_base_id: string;
  name: string;
  source_type: string;
  file_type: string;
  mime_type: string | null;
  source_url: string | null;
  storage_path: string;
  file_size: number | null;
  parse_status: string;
  parse_error: string | null;
  preview_text: string | null;
  summary_text: string | null;
  page_count: number | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

type SystemConfig = {
  app_name: string;
  app_version: string;
  storage_dir: string;
  files_dir: string;
  exports_dir: string;
  logs_dir: string;
  database_path: string;
  ocr_enabled: boolean;
  model_config_name: string;
};

type ContextTarget =
  | { type: "category"; id: string; x: number; y: number }
  | { type: "knowledgeBase"; id: string; x: number; y: number }
  | { type: "document"; id: string; x: number; y: number };

type UploadResult = {
  knowledge_base_id: string;
  success: Array<{
    file_name: string;
    document_id: string;
    parse_status: string;
  }>;
  failed: Array<{
    file_name: string;
    reason: string;
  }>;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

function AppWorkspace() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategoryName, setDraftCategoryName] = useState("");
  const [editingKnowledgeBaseId, setEditingKnowledgeBaseId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showKnowledgeBaseModal, setShowKnowledgeBaseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [movingKnowledgeBaseId, setMovingKnowledgeBaseId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentMeta | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<"knowledgeBases" | "documents">("knowledgeBases");
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const categorizedKnowledgeBaseIds = useMemo(
    () => new Set(categories.flatMap((item) => item.knowledgeBaseIds)),
    [categories]
  );

  const uncategorizedKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => !categorizedKnowledgeBaseIds.has(item.id)),
    [categorizedKnowledgeBaseIds, knowledgeBases]
  );

  const visibleKnowledgeBases = useMemo(() => {
    if (selectedCategoryId) {
      const selectedCategory = categories.find((item) => item.id === selectedCategoryId);
      if (!selectedCategory) return [];
      return knowledgeBases.filter((item) => selectedCategory.knowledgeBaseIds.includes(item.id));
    }

    if (!selectedKnowledgeBaseId) return [];
    const selectedUncategorized = uncategorizedKnowledgeBases.find((item) => item.id === selectedKnowledgeBaseId);
    return selectedUncategorized ? [selectedUncategorized] : [];
  }, [categories, knowledgeBases, selectedCategoryId, selectedKnowledgeBaseId, uncategorizedKnowledgeBases]);

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null,
    [knowledgeBases, selectedKnowledgeBaseId]
  );

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      try {
        const [systemConfig, allKnowledgeBases] = await Promise.all([
          requestJson<SystemConfig>("/system/config"),
          requestJson<KnowledgeBase[]>("/knowledge-bases"),
        ]);
        setConfig(systemConfig);
        setKnowledgeBases(allKnowledgeBases);
        setSelectedKnowledgeBaseId(allKnowledgeBases[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedKnowledgeBaseId) {
      setDocuments([]);
      setSelectedDocument(null);
      return;
    }

    async function loadDocuments() {
      try {
        const docs = await requestJson<DocumentMeta[]>(
          `/documents?knowledge_base_id=${encodeURIComponent(selectedKnowledgeBaseId)}`
        );
        setDocuments(docs);
        setSelectedDocument(docs[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "文档读取失败");
      }
    }

    void loadDocuments();
  }, [selectedKnowledgeBaseId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!contextTarget) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".context-menu")) return;
      setContextTarget(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [contextTarget]);

  function openCreateKnowledgeBaseModal() {
    setDraftName("");
    setDraftDescription("");
    setEditingKnowledgeBaseId(null);
    setShowKnowledgeBaseModal(true);
    setContextTarget(null);
  }

  function openEditKnowledgeBaseModal(knowledgeBase: KnowledgeBase) {
    setDraftName(knowledgeBase.name);
    setDraftDescription(knowledgeBase.description ?? "");
    setEditingKnowledgeBaseId(knowledgeBase.id);
    setShowKnowledgeBaseModal(true);
    setContextTarget(null);
  }

  function openCreateCategoryModal() {
    setDraftCategoryName("");
    setEditingCategoryId(null);
    setShowCategoryModal(true);
    setContextTarget(null);
  }

  function openUploadModal() {
    if (!selectedKnowledgeBaseId) {
      setToast("请先选择一个知识库");
      return;
    }
    setSelectedFiles([]);
    setLinkDraft("");
    setShowUploadModal(true);
    setContextTarget(null);
    setError("");
  }

  function openKnowledgeBaseDocuments(knowledgeBaseId: string) {
    setSelectedKnowledgeBaseId(knowledgeBaseId);
    setRightPanelMode("documents");
  }

  function backToKnowledgeBaseList() {
    setRightPanelMode("knowledgeBases");
  }

  function openEditCategoryModal(category: Category) {
    setDraftCategoryName(category.name);
    setEditingCategoryId(category.id);
    setShowCategoryModal(true);
    setContextTarget(null);
  }

  async function saveKnowledgeBase() {
    setLoading(true);
    setError("");
    try {
      const payload = {
        name: draftName,
        description: draftDescription || null,
      };

      let nextSelectedId = selectedKnowledgeBaseId;
      let allKnowledgeBases: KnowledgeBase[];
      if (editingKnowledgeBaseId) {
        const updated = await requestJson<KnowledgeBase>(`/knowledge-bases/${editingKnowledgeBaseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        nextSelectedId = updated.id;
        allKnowledgeBases = await requestJson<KnowledgeBase[]>("/knowledge-bases");
        setToast(`已更新知识库：${updated.name}`);
      } else {
        const created = await requestJson<KnowledgeBase>("/knowledge-bases", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        nextSelectedId = created.id;
        allKnowledgeBases = await requestJson<KnowledgeBase[]>("/knowledge-bases");
        if (selectedCategoryId) {
          setCategories((current) =>
            current.map((item) =>
              item.id === selectedCategoryId
                ? { ...item, knowledgeBaseIds: [...item.knowledgeBaseIds, created.id] }
                : item
            )
          );
        }
        setToast(`已创建知识库：${created.name}`);
      }

      setKnowledgeBases(allKnowledgeBases);
      setSelectedKnowledgeBaseId(nextSelectedId);
      setShowKnowledgeBaseModal(false);
      setDraftName("");
      setDraftDescription("");
      setEditingKnowledgeBaseId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function uploadDocuments() {
    if (!selectedKnowledgeBaseId) {
      setError("请先选择知识库。");
      return;
    }
    if (selectedFiles.length === 0) {
      setError("请至少选择一个文件。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("knowledge_base_id", selectedKnowledgeBaseId);
      selectedFiles.forEach((file) => formData.append("files", file));

      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let detail = `Request failed: ${response.status}`;
        try {
          const data = (await response.json()) as { detail?: string };
          if (typeof data.detail === "string") detail = data.detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const result = (await response.json()) as UploadResult;
      const [allKnowledgeBases, docs] = await Promise.all([
        requestJson<KnowledgeBase[]>("/knowledge-bases"),
        requestJson<DocumentMeta[]>(`/documents?knowledge_base_id=${encodeURIComponent(selectedKnowledgeBaseId)}`),
      ]);
      setKnowledgeBases(allKnowledgeBases);
      setDocuments(docs);
      setSelectedDocument(docs[0] ?? null);
      setToast(`上传完成：成功 ${result.success.length} 个，失败 ${result.failed.length} 个`);
      setShowUploadModal(false);
      setSelectedFiles([]);
      setLinkDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setLoading(false);
    }
  }

  async function importWebLinks() {
    if (!selectedKnowledgeBaseId) {
      setError("请先选择知识库。");
      return;
    }

    const rawUrls = linkDraft
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const urls = rawUrls.filter((item, index, list) => list.indexOf(item) === index);

    if (urls.length === 0) {
      setError("请至少输入一个网页链接。");
      return;
    }

      setLoading(true);
    setError("");
    try {
      const result = await requestJson<UploadResult>("/documents/import-urls", {
        method: "POST",
        body: JSON.stringify({
          knowledge_base_id: selectedKnowledgeBaseId,
          urls,
        }),
      });
      const [allKnowledgeBases, docs] = await Promise.all([
        requestJson<KnowledgeBase[]>("/knowledge-bases"),
        requestJson<DocumentMeta[]>(`/documents?knowledge_base_id=${encodeURIComponent(selectedKnowledgeBaseId)}`),
      ]);
      setKnowledgeBases(allKnowledgeBases);
      setDocuments(docs);
      setSelectedDocument(docs[0] ?? null);
      const dedupedCount = rawUrls.length - urls.length;
      setToast(
        `网页导入完成：成功 ${result.success.length} 个，失败 ${result.failed.length} 个${
          dedupedCount > 0 ? `，已去重 ${dedupedCount} 个重复链接` : ""
        }`
      );
      setShowUploadModal(false);
      setSelectedFiles([]);
      setLinkDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "网页导入失败");
    } finally {
      setLoading(false);
    }
  }

  function openSelectedDocument() {
    if (!selectedDocument) return;
    if (selectedDocument.source_type === "url" && selectedDocument.source_url) {
      window.open(selectedDocument.source_url, "_blank", "noopener,noreferrer");
      return;
    }
    void requestJson<{ success: boolean; document_id: string; path: string }>(
      `/documents/${selectedDocument.id}/open-local`,
      {
        method: "POST",
      }
    )
      .then(() => {
        setToast(`已打开文件：${selectedDocument.name}`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "打开文件失败");
      });
  }

  function downloadSelectedDocument() {
    if (!selectedDocument || selectedDocument.source_type === "url") return;
    window.open(`${API_BASE}/documents/${selectedDocument.id}/download`, "_blank", "noopener,noreferrer");
  }

  async function deleteDocument(document: DocumentMeta) {
    const confirmed = window.confirm(`将删除文件“${document.name}”。是否继续？`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      await requestJson<{ success: boolean; deleted_id: string }>(`/documents/${document.id}`, {
        method: "DELETE",
      });
      await refreshCurrentDocuments();
      setToast(`已删除文件：${document.name}`);
      setContextTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除文件失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentDocuments(nextSelectedId?: string) {
    if (!selectedKnowledgeBaseId) return;
    const [allKnowledgeBases, docs] = await Promise.all([
      requestJson<KnowledgeBase[]>("/knowledge-bases"),
      requestJson<DocumentMeta[]>(`/documents?knowledge_base_id=${encodeURIComponent(selectedKnowledgeBaseId)}`),
    ]);
    setKnowledgeBases(allKnowledgeBases);
    setDocuments(docs);
    if (nextSelectedId) {
      setSelectedDocument(docs.find((item) => item.id === nextSelectedId) ?? docs[0] ?? null);
      return;
    }
    setSelectedDocument((current) => {
      if (!current) return docs[0] ?? null;
      return docs.find((item) => item.id === current.id) ?? docs[0] ?? null;
    });
  }

  async function indexSelectedDocument() {
    if (!selectedDocument) return;
    setLoading(true);
    setError("");
    try {
      await requestJson<DocumentMeta>(`/documents/${selectedDocument.id}/index`, {
        method: "POST",
      });
      await refreshCurrentDocuments(selectedDocument.id);
      setToast(`已完成解析：${selectedDocument.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败");
    } finally {
      setLoading(false);
    }
  }

  async function retryParseSelectedDocument() {
    if (!selectedDocument) return;
    setLoading(true);
    setError("");
    try {
      await requestJson<DocumentMeta>(`/documents/${selectedDocument.id}/retry-parse`, {
        method: "POST",
      });
      await refreshCurrentDocuments(selectedDocument.id);
      setToast(`已重试解析：${selectedDocument.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重试解析失败");
    } finally {
      setLoading(false);
    }
  }

  async function deleteKnowledgeBase(knowledgeBase: KnowledgeBase) {
    const confirmed = window.confirm(
      `将删除知识库“${knowledgeBase.name}”。当前步骤会同步删除该知识库关联的 documents 和 document_chunks 记录。是否继续？`
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      await requestJson<{ success: boolean; deleted_id: string }>(`/knowledge-bases/${knowledgeBase.id}`, {
        method: "DELETE",
      });
      const allKnowledgeBases = await requestJson<KnowledgeBase[]>("/knowledge-bases");
      setKnowledgeBases(allKnowledgeBases);
      setCategories((current) =>
        current.map((item) => ({
          ...item,
          knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => id !== knowledgeBase.id),
        }))
      );
      setSelectedKnowledgeBaseId((current) => (current === knowledgeBase.id ? "" : current));
      setToast(`已删除知识库：${knowledgeBase.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setLoading(false);
      setContextTarget(null);
    }
  }

  function saveCategory() {
    if (!draftCategoryName.trim()) {
      setError("知识库分类名称不能为空。");
      return;
    }

    if (editingCategoryId) {
      setCategories((current) =>
        current.map((item) =>
          item.id === editingCategoryId
            ? {
                ...item,
                name: draftCategoryName.trim(),
              }
            : item
        )
      );
      setToast(`已更新分类：${draftCategoryName.trim()}`);
    } else {
      const newId = `category-${crypto.randomUUID()}`;
      setCategories((current) => [
        ...current,
        {
          id: newId,
          name: draftCategoryName.trim(),
          pinned: false,
          knowledgeBaseIds: [],
        },
      ]);
      setToast(`已创建分类：${draftCategoryName.trim()}`);
    }

    setShowCategoryModal(false);
    setDraftCategoryName("");
    setEditingCategoryId(null);
    setContextTarget(null);
    setError("");
  }

  function pinCategory(categoryId: string) {
    setCategories((current) => {
      const target = current.find((item) => item.id === categoryId);
      if (!target) return current;
      const rest = current.filter((item) => item.id !== categoryId);
      return [{ ...target, pinned: true }, ...rest];
    });
    setToast("已置顶知识库分类");
    setContextTarget(null);
  }

  function deleteCategory(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setCategories((current) => current.filter((item) => item.id !== categoryId));
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId(null);
      setSelectedKnowledgeBaseId(category.knowledgeBaseIds[0] ?? "");
    }
    setToast("已删除知识库分类");
    setContextTarget(null);
  }

  function moveKnowledgeBaseToCategory(categoryId: string, knowledgeBaseId: string) {
    setCategories((current) =>
      current.map((item) =>
        item.id === categoryId
          ? {
              ...item,
              knowledgeBaseIds: item.knowledgeBaseIds.includes(knowledgeBaseId)
                ? item.knowledgeBaseIds
                : [...item.knowledgeBaseIds, knowledgeBaseId],
            }
          : {
              ...item,
              knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId),
            }
      )
    );
    setToast("已移动知识库到该分类");
    setShowMoveModal(false);
    setMovingKnowledgeBaseId(null);
    setContextTarget(null);
  }

  function removeKnowledgeBaseFromCategory(knowledgeBaseId: string) {
    setCategories((current) =>
      current.map((item) => ({
        ...item,
        knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId),
      }))
    );
    setSelectedCategoryId(null);
    setSelectedKnowledgeBaseId(knowledgeBaseId);
    setShowMoveModal(false);
    setMovingKnowledgeBaseId(null);
    setContextTarget(null);
    setToast("已移出分类，当前为未分类知识库");
  }

  function duplicateKnowledgeBase(knowledgeBaseId: string) {
    const target = knowledgeBases.find((item) => item.id === knowledgeBaseId);
    if (!target) return;
    setDraftName(`${target.name}-副本`);
    setDraftDescription(target.description ?? "");
    setEditingKnowledgeBaseId(null);
    setShowKnowledgeBaseModal(true);
    setToast("已根据当前知识库填充副本信息，请确认创建。");
    setContextTarget(null);
  }

  function openMoveKnowledgeBaseModal(knowledgeBaseId: string) {
    setMovingKnowledgeBaseId(knowledgeBaseId);
    setShowMoveModal(true);
    setContextTarget(null);
  }

  const currentCategory = categories.find((item) => item.id === selectedCategoryId) ?? null;
  const currentNavigationKnowledgeBase =
    !selectedCategoryId && selectedKnowledgeBaseId
      ? uncategorizedKnowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null
      : null;
  const moveTargetKnowledgeBase =
    movingKnowledgeBaseId ? knowledgeBases.find((item) => item.id === movingKnowledgeBaseId) ?? null : null;

  return (
    <div className="product-shell">
      <aside className="category-sidebar">
        <header className="category-head">
          <div>
            <p className="sidebar-kicker">知识库分类</p>
            <h1>分类与未分类库</h1>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={openCreateCategoryModal}
            aria-label="创建知识库分类"
            title="创建新的知识库分类"
          >
            +
          </button>
        </header>

        <div className="category-list">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`category-item ${category.id === selectedCategoryId ? "active" : ""}`}
              onClick={() => {
                setSelectedCategoryId(category.id);
                setSelectedKnowledgeBaseId(category.knowledgeBaseIds[0] ?? "");
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextTarget({
                  type: "category",
                  id: category.id,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              title="点击查看该分类；右键查看分类操作"
            >
              <div>
                <strong>{category.name}</strong>
              </div>
              <span>{category.knowledgeBaseIds.length}</span>
            </button>
          ))}

          {uncategorizedKnowledgeBases.length > 0 ? (
            <div className="sidebar-group">
              <p className="sidebar-subtitle">未分类知识库</p>
              {uncategorizedKnowledgeBases.map((knowledgeBase) => (
                <button
                  key={knowledgeBase.id}
                  type="button"
                  className={`category-item kb-nav-item ${
                    !selectedCategoryId && knowledgeBase.id === selectedKnowledgeBaseId ? "active" : ""
                  }`}
                  onClick={() => {
                    setSelectedCategoryId(null);
                    openKnowledgeBaseDocuments(knowledgeBase.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextTarget({
                      type: "knowledgeBase",
                      id: knowledgeBase.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  title="点击进入该知识库；右键查看知识库操作"
                >
                  <div>
                    <strong>{knowledgeBase.name}</strong>
                  </div>
                  <span>{knowledgeBase.document_count}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      <main className="workspace-shell">
        <section className="kb-board">
          <header className="kb-board-head">
            <div className="kb-board-title-row">
              <div className="panel-nav-arrows">
                <button
                  type="button"
                  className="icon-action-button"
                  onClick={backToKnowledgeBaseList}
                  title="返回知识库列表"
                  aria-label="返回知识库列表"
                  disabled={rightPanelMode === "knowledgeBases"}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="icon-action-button"
                  onClick={() => {
                    if (selectedKnowledgeBaseId) setRightPanelMode("documents");
                  }}
                  title="进入当前知识库文件列表"
                  aria-label="进入当前知识库文件列表"
                  disabled={rightPanelMode === "documents" || !selectedKnowledgeBaseId}
                >
                  →
                </button>
              </div>
              <div>
              <p className="section-kicker">{rightPanelMode === "knowledgeBases" ? "知识库列表" : "文件列表"}</p>
              <h2>
                {rightPanelMode === "knowledgeBases"
                  ? currentCategory?.name || currentNavigationKnowledgeBase?.name || "请选择左侧分类或知识库"
                  : selectedKnowledgeBase?.name || "请选择一个知识库"}
              </h2>
              </div>
            </div>
            <div className="kb-board-actions">
              {rightPanelMode === "knowledgeBases" ? (
                <button
                  type="button"
                  className="plus-action-button"
                  onClick={openCreateKnowledgeBaseModal}
                  title="创建一个新的知识库"
                  aria-label="创建知识库"
                >
                  +
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="plus-action-button"
                    onClick={openUploadModal}
                    title="为当前知识库批量上传本地文件"
                    aria-label="上传文件"
                  >
                    +
                  </button>
                </>
              )}
            </div>
          </header>

          <div className="kb-board-body">
            {rightPanelMode === "knowledgeBases" ? (
              <div className="knowledge-base-grid">
                {visibleKnowledgeBases.length === 0 ? (
                  <div className="empty-card">
                    <strong>左侧选择后，这里才显示对应知识库</strong>
                    <p>点击左侧分类查看该分类下的知识库；点击某个知识库后，会切换到该知识库的文件列表页。</p>
                  </div>
                ) : (
                  visibleKnowledgeBases.map((knowledgeBase) => (
                    <button
                      key={knowledgeBase.id}
                      type="button"
                      className={`knowledge-base-card ${knowledgeBase.id === selectedKnowledgeBaseId ? "selected" : ""}`}
                      onClick={() => openKnowledgeBaseDocuments(knowledgeBase.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setContextTarget({
                          type: "knowledgeBase",
                          id: knowledgeBase.id,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      title="点击进入该知识库文件列表；右键查看知识库操作"
                    >
                      <div className="knowledge-base-card-top">
                        <strong>{knowledgeBase.name}</strong>
                        <span>{knowledgeBase.document_count}</span>
                      </div>
                      <p>{knowledgeBase.description || "暂无描述"}</p>
                      <div className="knowledge-base-card-meta">
                        <span>
                          最近使用：
                          {knowledgeBase.last_opened_at
                            ? new Date(knowledgeBase.last_opened_at).toLocaleString("zh-CN")
                            : "暂未访问"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="document-panel">
                <div className="document-preview-head">
                  <div>
                    <h3>当前知识库文件</h3>
                    <p className="muted-copy">
                      {selectedDocument ? `文件名：${selectedDocument.name}` : "请选择一个文件"}
                    </p>
                  </div>
                  <span>{documents.length}</span>
                </div>
                {documents.length === 0 ? (
                  <p className="muted-copy">当前还没有文件，可以使用右上角“+ 上传文件”继续添加。</p>
                ) : (
                  <div className="document-preview-list">
                    {documents.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        className={`document-preview-item ${selectedDocument?.id === document.id ? "selected" : ""}`}
                        onClick={() => setSelectedDocument(document)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setSelectedDocument(document);
                          setContextTarget({
                            type: "document",
                            id: document.id,
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                        title="点击查看文件信息；右键查看文件操作"
                      >
                        <div>
                          <strong>{document.name}</strong>
                          <p>
                            {document.source_type === "url" ? "网页链接" : document.file_type.toUpperCase()} · {document.parse_status}
                          </p>
                          <p>上传时间：{new Date(document.created_at).toLocaleString("zh-CN")}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="chat-board">
          <header className="chat-board-head">
            <div>
              <p className="section-kicker">知识库问答</p>
              <h2>{selectedKnowledgeBase?.name || "请选择一个知识库"}</h2>
            </div>
          </header>

          <div className="chat-board-body">
            {selectedKnowledgeBase ? (
              <>
                <div className="chat-empty">
                  <strong>问答窗口已预留</strong>
                  <p>
                    Step-7 完成后，这里会接入知识库问答、引用来源、追问、导出等能力。当前你可以先体验左侧分类和上方知识库列表。
                  </p>
                </div>

                <div className="document-preview-panel">
                  <div className="document-detail-card">
                    <div className="document-preview-head">
                      <div>
                        <h3>当前选中文件</h3>
                        <p className="muted-copy">
                          {selectedDocument ? `文件名：${selectedDocument.name}` : "请先在右上方文件列表页选择一个文件"}
                        </p>
                      </div>
                    </div>
                    {selectedDocument ? (
                      <div className="document-detail-list">
                        <p className="muted-copy">
                          类型：{selectedDocument.source_type === "url" ? "网页链接" : selectedDocument.file_type.toUpperCase()}
                        </p>
                        <div className="document-status-row">
                          <span className={`status-pill status-${selectedDocument.parse_status}`}>
                            {selectedDocument.parse_status}
                          </span>
                          <div className="document-test-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void indexSelectedDocument()}
                              disabled={loading || selectedDocument.parse_status === "processing"}
                              title="开始解析当前文件"
                            >
                              开始解析
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void retryParseSelectedDocument()}
                              disabled={loading || selectedDocument.parse_status === "processing"}
                              title="重新解析当前文件"
                            >
                              重新解析
                            </button>
                          </div>
                        </div>
                        <p className="muted-copy">
                          来源：{selectedDocument.source_url || selectedDocument.storage_path}
                        </p>
                        <div className="preview-block">
                          <strong>预览文本</strong>
                          <p className="muted-copy">
                            {selectedDocument.preview_text || "当前还没有预览文本。你可以点击“开始解析”试一下。"}
                          </p>
                        </div>
                        {selectedDocument.parse_error ? (
                          <div className="preview-block">
                            <strong>解析错误</strong>
                            <p className="error-text">{selectedDocument.parse_error}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="muted-copy">右上方点击知识库进入文件列表，再选择一个文件后，这里显示当前文件信息。</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="chat-empty">
                <strong>先选择一个知识库</strong>
                <p>左侧选择分类，右上选择知识库，右下将作为该知识库的问答窗口。</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {contextTarget ? (
        <div className="context-menu" style={{ left: contextTarget.x, top: contextTarget.y }}>
          {contextTarget.type === "category" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  pinCategory(contextTarget.id);
                }}
                title="将该分类置顶到分类列表前面"
              >
                置顶分类
              </button>
              <button
                type="button"
                onClick={() => {
                  const category = categories.find((item) => item.id === contextTarget.id);
                  if (category) openEditCategoryModal(category);
                }}
                title="修改当前分类名称"
              >
                编辑分类
              </button>
              <button type="button" onClick={() => deleteCategory(contextTarget.id)} title="删除当前分类">
                删除分类
              </button>
            </>
          ) : contextTarget.type === "knowledgeBase" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const knowledgeBase = knowledgeBases.find((item) => item.id === contextTarget.id);
                  if (knowledgeBase) openEditKnowledgeBaseModal(knowledgeBase);
                }}
                title="修改当前知识库名称或描述"
              >
                编辑知识库
              </button>
              <button
                type="button"
                onClick={() => {
                  const knowledgeBase = knowledgeBases.find((item) => item.id === contextTarget.id);
                  if (knowledgeBase) void deleteKnowledgeBase(knowledgeBase);
                }}
                title="删除当前知识库"
              >
                删除知识库
              </button>
              <button type="button" onClick={() => duplicateKnowledgeBase(contextTarget.id)} title="复制当前知识库配置">
                复制知识库
              </button>
              <button type="button" onClick={() => openMoveKnowledgeBaseModal(contextTarget.id)} title="把知识库移动到其他分类">
                移动到分类
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  const document = documents.find((item) => item.id === contextTarget.id);
                  if (!document) return;
                  setSelectedDocument(document);
                  openSelectedDocument();
                  setContextTarget(null);
                }}
                title="打开当前文件或网页源地址"
              >
                {documents.find((item) => item.id === contextTarget.id)?.source_type === "url"
                  ? "打开网页"
                  : "打开原始文件"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const document = documents.find((item) => item.id === contextTarget.id);
                  if (!document || document.source_type === "url") return;
                  setSelectedDocument(document);
                  downloadSelectedDocument();
                  setContextTarget(null);
                }}
                title="下载当前文件"
                disabled={documents.find((item) => item.id === contextTarget.id)?.source_type === "url"}
              >
                下载文件
              </button>
              <button
                type="button"
                onClick={() => {
                  const document = documents.find((item) => item.id === contextTarget.id);
                  if (!document) return;
                  void deleteDocument(document);
                }}
                title="删除当前文件"
              >
                删除文件
              </button>
            </>
          )}
        </div>
      ) : null}

      {showKnowledgeBaseModal ? (
        <div className="modal-backdrop" onClick={() => setShowKnowledgeBaseModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">知识库</p>
                <h3>{editingKnowledgeBaseId ? "编辑知识库" : "创建知识库"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowKnowledgeBaseModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <label>
                <span>名称</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="例如：机器学习课程"
                />
              </label>
              <label>
                <span>描述</span>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  rows={4}
                  placeholder="可选描述"
                />
              </label>
            </div>
            {error ? <p className="error-text modal-error">{error}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowKnowledgeBaseModal(false)}
                title="取消本次编辑"
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveKnowledgeBase()}
                title={editingKnowledgeBaseId ? "保存知识库修改" : "创建知识库"}
              >
                {editingKnowledgeBaseId ? "保存修改" : "创建"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCategoryModal ? (
        <div className="modal-backdrop" onClick={() => setShowCategoryModal(false)}>
          <div className="modal-card small-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">知识库分类</p>
                <h3>{editingCategoryId ? "编辑分类" : "创建分类"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCategoryModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <label>
                <span>分类名称</span>
                <input
                  value={draftCategoryName}
                  onChange={(event) => setDraftCategoryName(event.target.value)}
                  placeholder="例如：课程资料"
                />
              </label>
            </div>
            {error ? <p className="error-text modal-error">{error}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCategoryModal(false)}
                title="取消本次编辑"
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveCategory}
                title={editingCategoryId ? "保存分类修改" : "创建知识库分类"}
              >
                {editingCategoryId ? "保存修改" : "创建"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMoveModal ? (
        <div className="modal-backdrop" onClick={() => setShowMoveModal(false)}>
          <div className="modal-card small-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">知识库移动</p>
                <h3>选择目标分类</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowMoveModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <p className="muted-copy">
                当前知识库：<strong>{moveTargetKnowledgeBase?.name || "未选择"}</strong>
              </p>
              <div className="move-target-list">
                <button
                  type="button"
                  className="move-target-button"
                  onClick={() => {
                    if (movingKnowledgeBaseId) removeKnowledgeBaseFromCategory(movingKnowledgeBaseId);
                  }}
                  title="将当前知识库移出所有分类"
                >
                  移到未分类
                </button>
                {categories.length === 0 ? (
                  <p className="muted-copy">还没有分类，请先在左侧通过加号创建知识库分类。</p>
                ) : (
                  categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className="move-target-button"
                      onClick={() => {
                        if (movingKnowledgeBaseId) moveKnowledgeBaseToCategory(category.id, movingKnowledgeBaseId);
                      }}
                      title={`移动到分类：${category.name}`}
                    >
                      {category.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showUploadModal ? (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal-card small-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">文件上传</p>
                <h3>批量上传到当前知识库</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowUploadModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <label>
                <span>选择文件</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
              </label>
              <p className="muted-copy">
                当前知识库：<strong>{selectedKnowledgeBase?.name || "未选择"}</strong>
              </p>
              <p className="muted-copy">
                已选择 {selectedFiles.length} 个文件。支持 PDF、DOCX、PPTX、Excel、CSV、PNG、JPG、JPEG。
              </p>
              <label>
                <span>批量网页链接</span>
                <textarea
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  rows={5}
                  placeholder={"每行一个链接\nhttps://example.com/article-1\nhttps://example.com/article-2"}
                />
              </label>
            </div>
            {error ? <p className="error-text modal-error">{error}</p> : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowUploadModal(false)}
                title="取消本次上传"
              >
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void uploadDocuments()}
                title="开始上传所选文件"
              >
                上传文件
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void importWebLinks()}
                title="导入输入的网页链接"
              >
                导入网页链接
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function SettingsPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadConfig() {
      try {
        const currentConfig = await requestJson<SystemConfig>("/system/config");
        setConfig(currentConfig);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    }

    void loadConfig();
  }, []);

  return (
    <div className="settings-page">
      <section className="blue-card settings-hero">
        <div>
          <p className="eyebrow">设置</p>
          <h2>系统与详情信息</h2>
          <p>
            产品状态、知识库详情、文档详情、本地运行目录等都集中放在设置页，不再占用主操作界面。
          </p>
        </div>
      </section>

      <section className="white-card settings-card">
        {config ? (
          <div className="settings-grid">
            <div className="settings-item">
              <span>应用名称</span>
              <strong>{config.app_name}</strong>
            </div>
            <div className="settings-item">
              <span>版本</span>
              <strong>{config.app_version}</strong>
            </div>
            <div className="settings-item">
              <span>OCR 配置</span>
              <strong>{config.ocr_enabled ? "启用占位配置" : "关闭"}</strong>
            </div>
            <div className="settings-item">
              <span>模型配置</span>
              <strong>{config.model_config_name}</strong>
            </div>
            <div className="settings-item full">
              <span>数据库路径</span>
              <code>{config.database_path}</code>
            </div>
            <div className="settings-item full">
              <span>文件目录</span>
              <code>{config.files_dir}</code>
            </div>
            <div className="settings-item full">
              <span>导出目录</span>
              <code>{config.exports_dir}</code>
            </div>
            <div className="settings-item full">
              <span>日志目录</span>
              <code>{config.logs_dir}</code>
            </div>
          </div>
        ) : (
          <p className="muted-copy">{error || "正在加载设置..."}</p>
        )}
      </section>
    </div>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-mark" />
          <strong>本地知识库问答工具</strong>
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end className="topbar-link" title="进入知识库工作区">
            工作区
          </NavLink>
          <NavLink to="/settings" className="topbar-link" title="查看系统设置与本地运行信息">
            设置
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<AppWorkspace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
