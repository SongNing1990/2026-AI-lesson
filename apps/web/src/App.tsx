import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";

const API_CANDIDATES = Array.from(
  new Set([
    `${window.location.protocol}//${window.location.hostname}:8000`,
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ])
);
const CATEGORY_STORAGE_KEY = "local-kb-categories-v1";
const KNOWLEDGE_BASE_STORAGE_KEY = "local-kb-knowledge-bases-v1";

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

type HoverPreviewState = {
  documentId: string;
  x: number;
  y: number;
};

type KnowledgeBaseCategoryActionMode = "move" | "assign";

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

type DocumentBatchMoveResponse = {
  success: boolean;
  moved_ids: string[];
  target_knowledge_base_id: string;
};

type QACitation = {
  knowledge_base_id: string;
  knowledge_base_name: string;
  document_id: string;
  document_name: string;
  location_label: string;
  snippet: string;
  highlight_ranges: Array<{
    start: number;
    end: number;
  }>;
  score: number;
};

type QAMatchedDocument = {
  knowledge_base_id: string;
  knowledge_base_name: string;
  document_id: string;
  document_name: string;
  score: number;
};

type QAResponse = {
  answer: string;
  citations: QACitation[];
  matched_documents: QAMatchedDocument[];
  answer_limited: boolean;
  message: string | null;
};

type QAResultMeta = {
  knowledgeBaseName: string | null;
  question: string;
  shared: boolean;
};

type SharePayload = {
  version: 1;
  question: string;
  knowledgeBaseName: string | null;
  result: QAResponse;
};

const SHARE_STORAGE_KEY = "local-kb-share-payloads";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (const apiBase of API_CANDIDATES) {
    try {
      const response = await fetch(`${apiBase}${path}`, {
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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
    }
  }

  throw lastError ?? new Error("Failed to fetch");
}

async function requestForm(path: string, init: Omit<RequestInit, "body"> & { body: FormData }): Promise<Response> {
  let lastError: Error | null = null;

  for (const apiBase of API_CANDIDATES) {
    try {
      const response = await fetch(`${apiBase}${path}`, init);
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
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
    }
  }

  throw lastError ?? new Error("Failed to fetch");
}

function buildApiUrl(path: string) {
  return `${API_CANDIDATES[0]}${path}`;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateShareCode() {
  return `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function readShareStorage(): Record<string, SharePayload> {
  try {
    const raw = window.localStorage.getItem(SHARE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SharePayload>;
  } catch {
    return {};
  }
}

function writeShareStorage(data: Record<string, SharePayload>) {
  window.localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(data));
}

function readCategoryStorage(): Category[] {
  try {
    const raw = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Category[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.name === "string" &&
        Array.isArray(item?.knowledgeBaseIds)
    );
  } catch {
    return [];
  }
}

function writeCategoryStorage(data: Category[]) {
  window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(data));
}

function readKnowledgeBaseStorage(): KnowledgeBase[] {
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_BASE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnowledgeBase[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.name === "string" &&
        typeof item?.document_count === "number" &&
        typeof item?.created_at === "string" &&
        typeof item?.updated_at === "string"
    );
  } catch {
    return [];
  }
}

function writeKnowledgeBaseStorage(data: KnowledgeBase[]) {
  window.localStorage.setItem(KNOWLEDGE_BASE_STORAGE_KEY, JSON.stringify(data));
}

function AppWorkspace() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(() => readKnowledgeBaseStorage());
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>(() => readCategoryStorage());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState(() => readKnowledgeBaseStorage()[0]?.id ?? "");
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>(() =>
    readKnowledgeBaseStorage()[0]?.id ? [readKnowledgeBaseStorage()[0].id] : []
  );
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategoryName, setDraftCategoryName] = useState("");
  const [editingKnowledgeBaseId, setEditingKnowledgeBaseId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showKnowledgeBaseModal, setShowKnowledgeBaseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [knowledgeBaseCategoryActionMode, setKnowledgeBaseCategoryActionMode] =
    useState<KnowledgeBaseCategoryActionMode>("move");
  const [knowledgeBaseCategoryActionIds, setKnowledgeBaseCategoryActionIds] = useState<string[]>([]);
  const [showDocumentMoveModal, setShowDocumentMoveModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentMeta | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentSelectionMode, setDocumentSelectionMode] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<"knowledgeBases" | "documents">("knowledgeBases");
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [qaResult, setQaResult] = useState<QAResponse | null>(null);
  const [qaMeta, setQaMeta] = useState<QAResultMeta | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
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

  const hoveredDocumentPreview = useMemo(() => {
    if (!hoverPreview?.documentId) return null;
    const document = documents.find((item) => item.id === hoverPreview.documentId);
    if (!document) return null;
    const text = (document.preview_text || "").replace(/\s+/g, " ").trim();
    return {
      id: document.id,
      name: document.name,
      preview: text ? `${text.slice(0, 200)}${text.length > 200 ? "..." : ""}` : "当前还没有可预览的解析内容。",
    };
  }, [documents, hoverPreview]);

  const selectedKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => selectedKnowledgeBaseIds.includes(item.id)),
    [knowledgeBases, selectedKnowledgeBaseIds]
  );

  const selectedDocuments = useMemo(
    () => documents.filter((item) => selectedDocumentIds.includes(item.id)),
    [documents, selectedDocumentIds]
  );

  function buildHoverPreviewPosition(rect: DOMRect): HoverPreviewState {
    const previewWidth = 280;
    const previewHeight = 190;
    const gap = 14;
    const viewportPadding = 16;

    const preferRight = rect.right + gap + previewWidth <= window.innerWidth - viewportPadding;
    const left = preferRight
      ? rect.right + gap
      : Math.max(viewportPadding, rect.left - gap - previewWidth);

    const top = Math.min(
      Math.max(viewportPadding, rect.top),
      Math.max(viewportPadding, window.innerHeight - previewHeight - viewportPadding)
    );

    return {
      documentId: "",
      x: left,
      y: top,
    };
  }

  useEffect(() => {
    async function bootstrap() {
      const cachedKnowledgeBases = readKnowledgeBaseStorage();
      const cachedCategories = readCategoryStorage();
      if (cachedKnowledgeBases.length > 0) {
        setKnowledgeBases(cachedKnowledgeBases);
        setSelectedKnowledgeBaseId((current) => current || cachedKnowledgeBases[0]?.id || "");
        setSelectedKnowledgeBaseIds((current) => (current.length > 0 ? current : cachedKnowledgeBases[0]?.id ? [cachedKnowledgeBases[0].id] : []));
      }
      if (cachedCategories.length > 0) {
        setCategories(cachedCategories);
      }

      setLoading(true);
      try {
        const [systemConfig, allKnowledgeBases] = await Promise.all([
          requestJson<SystemConfig>("/system/config"),
          requestJson<KnowledgeBase[]>("/knowledge-bases"),
        ]);
        setConfig(systemConfig);
        setKnowledgeBases(allKnowledgeBases);
        setSelectedKnowledgeBaseId(allKnowledgeBases[0]?.id ?? "");
        setSelectedKnowledgeBaseIds(allKnowledgeBases[0]?.id ? [allKnowledgeBases[0].id] : []);
      } catch (err) {
        setError(
          cachedKnowledgeBases.length > 0 || cachedCategories.length > 0
            ? ""
            : err instanceof Error
              ? err.message
              : "加载失败"
        );
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    writeCategoryStorage(categories);
  }, [categories]);

  useEffect(() => {
    writeKnowledgeBaseStorage(knowledgeBases);
  }, [knowledgeBases]);

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setSelectedKnowledgeBaseIds([]);
      setSelectedKnowledgeBaseId("");
      return;
    }
    const knowledgeBaseIdSet = new Set(knowledgeBases.map((item) => item.id));
    setCategories((current) =>
      current.map((item) => ({
        ...item,
        knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => knowledgeBaseIdSet.has(id)),
      }))
    );
    setSelectedKnowledgeBaseIds((current) => current.filter((id) => knowledgeBaseIdSet.has(id)));
    setSelectedKnowledgeBaseId((current) => (current && knowledgeBaseIdSet.has(current) ? current : knowledgeBases[0]?.id ?? ""));
  }, [knowledgeBases]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#share=")) return;
    try {
      const encoded = hash.slice("#share=".length);
      const binary = window.atob(encoded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
      if (payload.version !== 1) return;
      setQaResult(payload.result);
      setQaMeta({
        knowledgeBaseName: payload.knowledgeBaseName,
        question: payload.question,
        shared: true,
      });
      setQuestionDraft(payload.question);
      setToast("已打开分享答案");
    } catch {
      setError("分享链接解析失败");
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#share-code=")) return;
    try {
      const code = hash.slice("#share-code=".length);
      const data = readShareStorage();
      const payload = data[code];
      if (!payload) {
        setError("未找到分享码对应的答案");
        return;
      }
      setShareCode(code);
      setQaResult(payload.result);
      setQaMeta({
        knowledgeBaseName: payload.knowledgeBaseName,
        question: payload.question,
        shared: true,
      });
      setQuestionDraft(payload.question);
      setToast(`已通过分享码 ${code} 打开答案`);
    } catch {
      setError("分享码解析失败");
    }
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
        setSelectedDocumentIds(docs[0] ? [docs[0].id] : []);
        setQaResult(null);
        setQaMeta(null);
        setShareMenuOpen(false);
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

  useEffect(() => {
    if (!shareMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".qa-share-group")) return;
      setShareMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [shareMenuOpen]);

  function openCreateKnowledgeBaseModal() {
    setDraftName("");
    setDraftDescription("");
    setEditingKnowledgeBaseId(null);
    setShowKnowledgeBaseModal(true);
    setContextTarget(null);
    setError("");
  }

  function openEditKnowledgeBaseModal(knowledgeBase: KnowledgeBase) {
    setDraftName(knowledgeBase.name);
    setDraftDescription(knowledgeBase.description ?? "");
    setEditingKnowledgeBaseId(knowledgeBase.id);
    setShowKnowledgeBaseModal(true);
    setContextTarget(null);
    setError("");
  }

  function openCreateCategoryModal() {
    setDraftCategoryName("");
    setEditingCategoryId(null);
    setShowCategoryModal(true);
    setContextTarget(null);
    setError("");
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
    setSelectedKnowledgeBaseIds([knowledgeBaseId]);
    setRightPanelMode("documents");
  }

  function backToKnowledgeBaseList() {
    setRightPanelMode("knowledgeBases");
  }

  function toggleMultiSelection(currentIds: string[], id: string, multi: boolean) {
    if (!multi) return [id];
    return currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id];
  }

  function handleCategorySelection(categoryId: string, knowledgeBaseIds: string[], multi: boolean) {
    setSelectedCategoryIds((current) => toggleMultiSelection(current, categoryId, multi));
    setSelectedCategoryId(categoryId);
    setSelectedKnowledgeBaseId(knowledgeBaseIds[0] ?? "");
    if (!multi) {
      setSelectedKnowledgeBaseIds(knowledgeBaseIds[0] ? [knowledgeBaseIds[0]] : []);
    }
  }

  function handleKnowledgeBaseSelection(knowledgeBaseId: string, multi: boolean) {
    setSelectedKnowledgeBaseIds((current) => toggleMultiSelection(current, knowledgeBaseId, multi));
    setSelectedKnowledgeBaseId(knowledgeBaseId);
    if (!multi) {
      openKnowledgeBaseDocuments(knowledgeBaseId);
    }
  }

  function handleDocumentSelection(document: DocumentMeta, multi: boolean) {
    setSelectedDocumentIds((current) => toggleMultiSelection(current, document.id, multi));
    setSelectedDocument(document);
  }

  function toggleCategoryCheckbox(categoryId: string) {
    setSelectedCategoryIds((current) => toggleMultiSelection(current, categoryId, true));
  }

  function toggleKnowledgeBaseCheckbox(knowledgeBaseId: string) {
    setSelectedKnowledgeBaseIds((current) => toggleMultiSelection(current, knowledgeBaseId, true));
    setSelectedKnowledgeBaseId(knowledgeBaseId);
  }

  function toggleDocumentCheckbox(document: DocumentMeta) {
    setSelectedDocumentIds((current) => toggleMultiSelection(current, document.id, true));
    setSelectedDocument(document);
  }

  function toggleDocumentSelectionMode() {
    setDocumentSelectionMode((current) => {
      if (current) {
        setSelectedDocumentIds([]);
      }
      return !current;
    });
  }

  function selectAllDocuments() {
    const nextIds = documents.map((item) => item.id);
    setSelectedDocumentIds(nextIds);
    setSelectedDocument(documents[0] ?? null);
  }

  function clearDocumentSelection() {
    setSelectedDocumentIds([]);
  }

  function openEditCategoryModal(category: Category) {
    setDraftCategoryName(category.name);
    setEditingCategoryId(category.id);
    setShowCategoryModal(true);
    setContextTarget(null);
    setError("");
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
      setSelectedKnowledgeBaseIds(nextSelectedId ? [nextSelectedId] : []);
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

      const response = await requestForm("/documents/upload", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as UploadResult;
      const [allKnowledgeBases, docs] = await Promise.all([
        requestJson<KnowledgeBase[]>("/knowledge-bases"),
        requestJson<DocumentMeta[]>(`/documents?knowledge_base_id=${encodeURIComponent(selectedKnowledgeBaseId)}`),
      ]);
      setKnowledgeBases(allKnowledgeBases);
      setDocuments(docs);
      setSelectedDocument(docs[0] ?? null);
      setSelectedDocumentIds(docs[0] ? [docs[0].id] : []);
      setDocumentSelectionMode(false);
      setToast(`自动解析完成：成功 ${result.success.length} 个，失败 ${result.failed.length} 个`);
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
      setSelectedDocumentIds(docs[0] ? [docs[0].id] : []);
      setDocumentSelectionMode(false);
      const dedupedCount = rawUrls.length - urls.length;
      setToast(
        `自动解析完成：成功 ${result.success.length} 个，失败 ${result.failed.length} 个${
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
    window.open(buildApiUrl(`/documents/${selectedDocument.id}/download`), "_blank", "noopener,noreferrer");
  }

  async function deleteSelectedDocuments() {
    if (selectedDocuments.length === 0) {
      setToast("请先勾选要删除的文件");
      return;
    }

    const confirmed = window.confirm(`将批量删除 ${selectedDocuments.length} 个文件。是否继续？`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      for (const document of selectedDocuments) {
        await requestJson<{ success: boolean; deleted_id: string }>(`/documents/${document.id}`, {
          method: "DELETE",
        });
      }
      await refreshCurrentDocuments();
      setDocumentSelectionMode(false);
      setToast(`已批量删除 ${selectedDocuments.length} 个文件`);
      setContextTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量删除文件失败");
    } finally {
      setLoading(false);
    }
  }

  async function moveSelectedDocumentsToKnowledgeBase(targetKnowledgeBaseId: string) {
    if (selectedDocumentIds.length === 0) {
      setToast("请先勾选文件");
      return;
    }
    if (!selectedKnowledgeBaseId) {
      setToast("请先进入一个知识库");
      return;
    }
    if (targetKnowledgeBaseId === selectedKnowledgeBaseId) {
      setToast("目标知识库与当前知识库相同");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await requestJson<DocumentBatchMoveResponse>("/documents/move", {
        method: "POST",
        body: JSON.stringify({
          document_ids: selectedDocumentIds,
          target_knowledge_base_id: targetKnowledgeBaseId,
        }),
      });
      await refreshCurrentDocuments();
      setDocumentSelectionMode(false);
      setShowDocumentMoveModal(false);
      setToast(`已将 ${selectedDocumentIds.length} 个文件加入目标知识库`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量加入知识库失败");
    } finally {
      setLoading(false);
    }
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
      setDocumentSelectionMode(false);
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
      setSelectedDocumentIds(nextSelectedId ? [nextSelectedId] : docs[0] ? [docs[0].id] : []);
      return;
    }
    setSelectedDocument((current) => {
      if (!current) return docs[0] ?? null;
      return docs.find((item) => item.id === current.id) ?? docs[0] ?? null;
    });
    setSelectedDocumentIds((current) => {
      const remaining = current.filter((id) => docs.some((item) => item.id === id));
      return remaining.length > 0 ? remaining : docs[0] ? [docs[0].id] : [];
    });
    if (docs.length === 0) {
      setDocumentSelectionMode(false);
    }
  }

  async function askKnowledgeBaseQuestion() {
    if (!selectedKnowledgeBaseId) {
      setError("请先选择一个知识库。");
      return;
    }
    if (!questionDraft.trim()) {
      setError("请输入问题。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await requestJson<QAResponse>("/qa/ask", {
        method: "POST",
        body: JSON.stringify({
          question: questionDraft.trim(),
          knowledge_base_ids: [selectedKnowledgeBaseId],
          top_k: 5,
        }),
      });
      setQaResult(result);
      setQaMeta({
        knowledgeBaseName: selectedKnowledgeBase?.name ?? null,
        question: questionDraft.trim(),
        shared: false,
      });
      setShareCode(null);
      setShareMenuOpen(false);
      setToast(result.answer_limited ? "当前问题证据不足，已返回受限答案" : "问答完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "问答失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyAnswerText() {
    if (!qaResult) return;
    try {
      await navigator.clipboard.writeText(qaResult.answer);
      setToast("复制完成");
    } catch {
      setError("复制答案失败");
    }
  }

  function buildSharePayload(): SharePayload | null {
    if (!qaResult) return null;
    return {
      version: 1,
      question: qaMeta?.question || questionDraft.trim(),
      knowledgeBaseName: qaMeta?.knowledgeBaseName ?? selectedKnowledgeBase?.name ?? null,
      result: qaResult,
    };
  }

  function buildShareCodeLink(): string | null {
    const payload = buildSharePayload();
    if (!payload) return null;
    const data = readShareStorage();
    const existing = Object.entries(data).find(([, value]) => JSON.stringify(value) == JSON.stringify(payload));
    const code = existing?.[0] || generateShareCode();
    data[code] = payload;
    writeShareStorage(data);
    setShareCode(code);
    return `${window.location.origin}/#share-code=${code}`;
  }

  function ensureShareCode(): string | null {
    if (shareCode) return shareCode;
    const link = buildShareCodeLink();
    if (!link) return null;
    try {
      const url = new URL(link);
      return url.hash.replace("#share-code=", "") || null;
    } catch {
      return null;
    }
  }

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wrapCanvasText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const chars = Array.from(text);
    const lines: string[] = [];
    let current = "";
    for (const char of chars) {
      const next = current + char;
      if (context.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  async function downloadShareImage() {
    if (!qaResult) return;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      setError("生成长图失败");
      return;
    }

    const width = 1200;
    const contentWidth = 1040;
    const lines = [
      ...(qaMeta?.question ? [`问题：${qaMeta.question}`] : []),
      `答案：${qaResult.answer}`,
    ];

    context.font = "28px PingFang SC";
    const wrapped = lines.flatMap((line) => wrapCanvasText(context, line, contentWidth));
    const height = Math.max(720, 220 + wrapped.length * 40);

    canvas.width = width;
    canvas.height = height;

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#f6fbff");
    gradient.addColorStop(1, "#e8f2ff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#ffffff";
    context.strokeStyle = "rgba(16, 35, 70, 0.08)";
    context.lineWidth = 2;
    roundRect(context, 48, 48, width - 96, height - 96, 28);
    context.fill();
    context.stroke();

    context.fillStyle = "#12305f";
    context.font = "bold 40px PingFang SC";
    context.fillText("知识库问答分享", 88, 118);

    context.font = "24px PingFang SC";
    context.fillStyle = "#5b6f96";
    context.fillText("问题与答案", 88, 162);

    context.font = "28px PingFang SC";
    context.fillStyle = "#163768";
    let cursorY = 230;
    for (const line of wrapped) {
      context.fillText(line, 88, cursorY);
      cursorY += 40;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("生成长图失败");
        return;
      }
      downloadBlob("knowledge-answer-share.png", blob);
      setToast("已生成答案");
      setShareMenuOpen(false);
    });
  }

  function buildMindMapHierarchy(answer: string): Array<{ concept: string; subConcepts: string[]; conclusion: string }> {
    const sentences = answer
      .split(/[。！？!?；;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 5)
      .slice(0, 6);

    const extractConcept = (sentence: string) => {
      const parts = sentence
        .split(/[：:，、]/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2);
      const primary = parts[0] || sentence;
      return primary.replace(/^(关于|对于|围绕|针对|其中|其|该)/, "").slice(0, 14);
    };

    const extractSubConcepts = (sentence: string, concept: string) => {
      const source = sentence.replace(concept, "");
      const parts = source
        .split(/[，、]/)
        .map((item) => item.replace(/^(是|为|并|且|以及|通过|体现为|表现为|包括)/, "").trim())
        .filter((item) => item.length >= 2)
        .slice(0, 3);
      return parts.length > 0 ? parts.map((item) => item.slice(0, 18)) : ["关键特征", "实施要点"];
    };

    const extractConclusion = (sentence: string, subConcepts: string[]) => {
      const tail = sentence.split(/(因此|所以|说明|表明|体现|意味着)/).slice(-2).join("").trim();
      if (tail && tail.length >= 4) return tail.slice(0, 24);
      return `结论：${subConcepts[0] || "形成核心结论"}`.slice(0, 24);
    };

    const hierarchy = sentences.map((sentence) => {
      const concept = extractConcept(sentence);
      const subConcepts = extractSubConcepts(sentence, concept);
      const conclusion = extractConclusion(sentence, subConcepts);
      return { concept, subConcepts, conclusion };
    });

    const deduped = hierarchy.filter(
      (item, index, list) => list.findIndex((candidate) => candidate.concept === item.concept) === index
    );

    return deduped.slice(0, 4);
  }

  function buildMindMapSvg(orientation: "landscape" | "portrait"): string | null {
    if (!qaResult) return null;
    const rootText = qaMeta?.question || "知识库问题";
    const branches = buildMindMapHierarchy(qaResult.answer);
    if (branches.length === 0) return null;

    const wrapSvgText = (value: string, maxChars: number) => {
      const chars = Array.from(value);
      const lines: string[] = [];
      let current = "";
      for (const char of chars) {
        if ((current + char).length > maxChars && current) {
          lines.push(current);
          current = char;
        } else {
          current += char;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    const isLandscape = orientation === "landscape";
    const rootLines = wrapSvgText(rootText, isLandscape ? 14 : 12);
    const width = isLandscape ? 1400 : 1080;
    const height = isLandscape ? 900 : 1440;
    const branchBlocks = branches
      .map((branch, index) => {
        const conceptLines = wrapSvgText(branch.concept, isLandscape ? 10 : 9).slice(0, 2);
        const conclusionLines = wrapSvgText(branch.conclusion, isLandscape ? 14 : 12).slice(0, 2);
        if (isLandscape) {
          const branchX = 520 + (index % 2) * 400;
          const branchY = 90 + Math.floor(index / 2) * 360;
          const branchText = conceptLines
            .map((line, lineIndex) => `<tspan x="${branchX + 30}" dy="${lineIndex === 0 ? 0 : 28}">${escapeSvg(line)}</tspan>`)
            .join("");
          const childBlocks = branch.subConcepts
            .map((child, childIndex) => {
              const childY = branchY + 92 + childIndex * 72;
              const childLines = wrapSvgText(child, 14).slice(0, 2);
              const childText = childLines
                .map((line, lineIndex) => `<tspan x="${branchX + 54}" dy="${lineIndex === 0 ? 0 : 24}">${escapeSvg(line)}</tspan>`)
                .join("");
              return `
                <line x1="${branchX + 110}" y1="${branchY + 74}" x2="${branchX + 110}" y2="${childY}" stroke="#8fb7f7" stroke-width="3" />
                <rect x="${branchX + 24}" y="${childY}" width="172" height="56" rx="18" fill="#f7fbff" stroke="#a2c2f6" />
                <text x="${branchX + 54}" y="${childY + 30}" fill="#345987" font-size="20" font-family="PingFang SC">${childText}</text>
              `;
            })
            .join("");
          const conclusionText = conclusionLines
            .map((line, lineIndex) => `<tspan x="${branchX + 24}" dy="${lineIndex === 0 ? 0 : 24}">${escapeSvg(line)}</tspan>`)
            .join("");
          return `
            <line x1="320" y1="450" x2="${branchX + 110}" y2="${branchY + 36}" stroke="#6aa3f4" stroke-width="4" />
            <rect x="${branchX}" y="${branchY}" width="220" height="74" rx="22" fill="#ffffff" stroke="#7faef3" />
            <text x="${branchX + 30}" y="${branchY + 34}" fill="#21497f" font-size="24" font-family="PingFang SC">${branchText}</text>
            ${childBlocks}
            <line x1="${branchX + 110}" y1="${branchY + 74 + branch.subConcepts.length * 72}" x2="${branchX + 110}" y2="${branchY + 310}" stroke="#8fb7f7" stroke-width="3" />
            <rect x="${branchX + 6}" y="${branchY + 310}" width="208" height="68" rx="20" fill="#eaf3ff" stroke="#7faef3" />
            <text x="${branchX + 24}" y="${branchY + 346}" fill="#1e4e92" font-size="21" font-family="PingFang SC">${conclusionText}</text>
          `;
        }

        const branchX = 150 + (index % 2) * 420;
        const branchY = 470 + Math.floor(index / 2) * 420;
        const branchText = conceptLines
          .map((line, lineIndex) => `<tspan x="${branchX + 28}" dy="${lineIndex === 0 ? 0 : 28}">${escapeSvg(line)}</tspan>`)
          .join("");
        const childBlocks = branch.subConcepts
          .map((child, childIndex) => {
            const childY = branchY + 96 + childIndex * 78;
            const childLines = wrapSvgText(child, 14).slice(0, 2);
            const childText = childLines
              .map((line, lineIndex) => `<tspan x="${branchX + 52}" dy="${lineIndex === 0 ? 0 : 24}">${escapeSvg(line)}</tspan>`)
              .join("");
            return `
              <line x1="${branchX + 104}" y1="${branchY + 80}" x2="${branchX + 104}" y2="${childY}" stroke="#8fb7f7" stroke-width="3" />
              <rect x="${branchX + 18}" y="${childY}" width="172" height="58" rx="18" fill="#f7fbff" stroke="#a2c2f6" />
              <text x="${branchX + 52}" y="${childY + 31}" fill="#345987" font-size="20" font-family="PingFang SC">${childText}</text>
            `;
          })
          .join("");
        const conclusionText = conclusionLines
          .map((line, lineIndex) => `<tspan x="${branchX + 28}" dy="${lineIndex === 0 ? 0 : 24}">${escapeSvg(line)}</tspan>`)
          .join("");
        return `
          <line x1="540" y1="320" x2="${branchX + 104}" y2="${branchY + 36}" stroke="#6aa3f4" stroke-width="4" />
          <rect x="${branchX}" y="${branchY}" width="210" height="80" rx="22" fill="#ffffff" stroke="#7faef3" />
          <text x="${branchX + 28}" y="${branchY + 36}" fill="#21497f" font-size="24" font-family="PingFang SC">${branchText}</text>
          ${childBlocks}
          <line x1="${branchX + 104}" y1="${branchY + 80 + branch.subConcepts.length * 78}" x2="${branchX + 104}" y2="${branchY + 338}" stroke="#8fb7f7" stroke-width="3" />
          <rect x="${branchX + 2}" y="${branchY + 338}" width="206" height="72" rx="20" fill="#eaf3ff" stroke="#7faef3" />
          <text x="${branchX + 28}" y="${branchY + 374}" fill="#1e4e92" font-size="21" font-family="PingFang SC">${conclusionText}</text>
        `;
      })
      .join("");

    const rootX = isLandscape ? 108 : 412;
    const rootY = isLandscape ? 436 : 174;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f6fbff"/>
            <stop offset="100%" stop-color="#e7f1ff"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)" />
        <rect x="${isLandscape ? 80 : 380}" y="${isLandscape ? 380 : 120}" width="${isLandscape ? 240 : 320}" height="120" rx="26" fill="#1d56c8" />
        <text x="${rootX}" y="${rootY}" fill="#ffffff" font-size="28" font-family="PingFang SC">
          ${rootLines.map((line, index) => `<tspan x="${rootX}" dy="${index === 0 ? 0 : 34}">${escapeSvg(line)}</tspan>`).join("")}
        </text>
        ${branchBlocks}
      </svg>
    `;
  }

  function downloadMindMap(orientation: "landscape" | "portrait") {
    const svg = buildMindMapSvg(orientation);
    if (!svg) return;
    downloadBlob(
      orientation === "landscape" ? "knowledge-answer-mindmap-landscape.svg" : "knowledge-answer-mindmap-portrait.svg",
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
    );
    setToast(orientation === "landscape" ? "已生成横版思维导图" : "已生成竖版思维导图");
    setShareMenuOpen(false);
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
      setSelectedKnowledgeBaseIds((current) => current.filter((id) => id !== knowledgeBase.id));
      setSelectedKnowledgeBaseId((current) => (current === knowledgeBase.id ? "" : current));
      setToast(`已删除知识库：${knowledgeBase.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setLoading(false);
      setContextTarget(null);
    }
  }

  async function deleteSelectedKnowledgeBases() {
    if (selectedKnowledgeBaseIds.length === 0) {
      setToast("请先勾选知识库");
      return;
    }

    const confirmed = window.confirm(`将批量删除 ${selectedKnowledgeBaseIds.length} 个知识库。是否继续？`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      for (const knowledgeBaseId of selectedKnowledgeBaseIds) {
        await requestJson<{ success: boolean; deleted_id: string }>(`/knowledge-bases/${knowledgeBaseId}`, {
          method: "DELETE",
        });
      }
      const allKnowledgeBases = await requestJson<KnowledgeBase[]>("/knowledge-bases");
      setKnowledgeBases(allKnowledgeBases);
      setCategories((current) =>
        current.map((item) => ({
          ...item,
          knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => !selectedKnowledgeBaseIds.includes(id)),
        }))
      );
      setSelectedKnowledgeBaseIds([]);
      setSelectedKnowledgeBaseId(allKnowledgeBases[0]?.id ?? "");
      setToast(`已批量删除 ${selectedKnowledgeBaseIds.length} 个知识库`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量删除知识库失败");
    } finally {
      setLoading(false);
      setContextTarget(null);
    }
  }

  function saveCategory() {
    setError("");
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
    setSelectedCategoryIds((current) => current.filter((id) => id !== categoryId));
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId(null);
      setSelectedKnowledgeBaseId(category.knowledgeBaseIds[0] ?? "");
    }
    setToast("已删除知识库分类");
    setContextTarget(null);
  }

  function deleteSelectedCategories() {
    if (selectedCategoryIds.length === 0) {
      setToast("请先勾选分类");
      return;
    }
    const confirmed = window.confirm(`将批量删除 ${selectedCategoryIds.length} 个知识库分类。是否继续？`);
    if (!confirmed) return;

    setCategories((current) => current.filter((item) => !selectedCategoryIds.includes(item.id)));
    if (selectedCategoryId && selectedCategoryIds.includes(selectedCategoryId)) {
      setSelectedCategoryId(null);
    }
    setSelectedCategoryIds([]);
    setToast(`已批量删除 ${selectedCategoryIds.length} 个知识库分类`);
    setContextTarget(null);
  }

  function closeKnowledgeBaseCategoryModal() {
    setShowMoveModal(false);
    setKnowledgeBaseCategoryActionIds([]);
  }

  function openDocumentMoveModal() {
    if (selectedDocumentIds.length === 0) {
      setToast("请先勾选文件");
      return;
    }
    setShowDocumentMoveModal(true);
  }

  function updateCategorySelectionAfterMutation(nextCategories: Category[]) {
    if (!selectedCategoryId) return;
    const currentCategory = nextCategories.find((item) => item.id === selectedCategoryId);
    const visibleIds = currentCategory?.knowledgeBaseIds ?? [];
    setSelectedKnowledgeBaseIds((current) => current.filter((id) => visibleIds.includes(id)));
    if (selectedKnowledgeBaseId && !visibleIds.includes(selectedKnowledgeBaseId)) {
      setSelectedKnowledgeBaseId(visibleIds[0] ?? "");
    }
  }

  function moveKnowledgeBasesToCategory(categoryId: string, knowledgeBaseIds: string[]) {
    const nextCategories = categories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            knowledgeBaseIds: Array.from(new Set([...item.knowledgeBaseIds.filter((id) => !knowledgeBaseIds.includes(id)), ...knowledgeBaseIds])),
          }
        : {
            ...item,
            knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => !knowledgeBaseIds.includes(id)),
          }
    );
    setCategories(nextCategories);
    updateCategorySelectionAfterMutation(nextCategories);
    setToast(`已批量移动 ${knowledgeBaseIds.length} 个知识库`);
    closeKnowledgeBaseCategoryModal();
    setContextTarget(null);
  }

  function assignKnowledgeBasesToCategory(categoryId: string, knowledgeBaseIds: string[]) {
    const nextCategories = categories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            knowledgeBaseIds: Array.from(new Set([...item.knowledgeBaseIds, ...knowledgeBaseIds])),
          }
        : item
    );
    setCategories(nextCategories);
    updateCategorySelectionAfterMutation(nextCategories);
    setToast(`已将 ${knowledgeBaseIds.length} 个知识库加入分类`);
    closeKnowledgeBaseCategoryModal();
    setContextTarget(null);
  }

  function removeKnowledgeBasesFromCategory(knowledgeBaseIds: string[]) {
    const removeFromCurrentOnly = Boolean(selectedCategoryId);
    const nextCategories = categories.map((item) => {
      if (removeFromCurrentOnly && item.id !== selectedCategoryId) return item;
      return {
        ...item,
        knowledgeBaseIds: item.knowledgeBaseIds.filter((id) => !knowledgeBaseIds.includes(id)),
      };
    });
    setCategories(nextCategories);
    updateCategorySelectionAfterMutation(nextCategories);
    setToast(
      removeFromCurrentOnly
        ? `已将 ${knowledgeBaseIds.length} 个知识库移出当前分类`
        : `已将 ${knowledgeBaseIds.length} 个知识库移出全部分类`
    );
    setContextTarget(null);
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

  function openKnowledgeBaseCategoryModal(mode: KnowledgeBaseCategoryActionMode, ids?: string[]) {
    const nextIds = Array.from(
      new Set(ids && ids.length > 0 ? ids : selectedKnowledgeBaseIds.length > 0 ? selectedKnowledgeBaseIds : selectedKnowledgeBaseId ? [selectedKnowledgeBaseId] : [])
    );
    if (nextIds.length === 0) {
      setToast("请先勾选知识库");
      return;
    }
    setKnowledgeBaseCategoryActionMode(mode);
    setKnowledgeBaseCategoryActionIds(nextIds);
    setShowMoveModal(true);
    setContextTarget(null);
  }

  const currentCategory = categories.find((item) => item.id === selectedCategoryId) ?? null;
  const currentNavigationKnowledgeBase =
    !selectedCategoryId && selectedKnowledgeBaseId
      ? uncategorizedKnowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null
      : null;
  const knowledgeBaseCategoryTargets = knowledgeBases.filter((item) =>
    knowledgeBaseCategoryActionIds.includes(item.id)
  );

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
          {selectedCategoryIds.length > 0 ? (
            <div className="sidebar-batch-toolbar">
              <span>{selectedCategoryIds.length} 个已选</span>
              <button type="button" className="ghost-button compact-button" onClick={deleteSelectedCategories} title="批量删除所选分类">
                批量删除
              </button>
            </div>
          ) : null}
          {categories.map((category) => (
            <div
              key={category.id}
              className={`category-item ${category.id === selectedCategoryId ? "active" : ""} ${
                selectedCategoryIds.includes(category.id) ? "multi-selected" : ""
              }`}
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
              <label className="selection-box" title="勾选当前分类">
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.includes(category.id)}
                  onChange={() => toggleCategoryCheckbox(category.id)}
                  onClick={(event) => event.stopPropagation()}
                />
                <span />
              </label>
              <button
                type="button"
                className="item-main-button"
                onClick={() => {
                  handleCategorySelection(category.id, category.knowledgeBaseIds, false);
                }}
              >
                <div>
                  <strong>{category.name}</strong>
                </div>
                <span>{category.knowledgeBaseIds.length}</span>
              </button>
            </div>
          ))}

          {uncategorizedKnowledgeBases.length > 0 ? (
            <div className="sidebar-group">
              <p className="sidebar-subtitle">未分类知识库</p>
              {uncategorizedKnowledgeBases.map((knowledgeBase) => (
                <div
                  key={knowledgeBase.id}
                  className={`category-item kb-nav-item ${
                    !selectedCategoryId && knowledgeBase.id === selectedKnowledgeBaseId ? "active" : ""
                  } ${selectedKnowledgeBaseIds.includes(knowledgeBase.id) ? "multi-selected" : ""}`}
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
                  <label className="selection-box" title="勾选当前知识库">
                    <input
                      type="checkbox"
                      checked={selectedKnowledgeBaseIds.includes(knowledgeBase.id)}
                      onChange={() => toggleKnowledgeBaseCheckbox(knowledgeBase.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span />
                  </label>
                  <button
                    type="button"
                    className="item-main-button"
                    onClick={() => {
                      setSelectedCategoryId(null);
                      handleKnowledgeBaseSelection(knowledgeBase.id, false);
                    }}
                  >
                    <div>
                      <strong>{knowledgeBase.name}</strong>
                    </div>
                    <span>{knowledgeBase.document_count}</span>
                  </button>
                </div>
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
                <>
                  {selectedKnowledgeBaseIds.length > 0 ? (
                    <div className="batch-toolbar">
                      <span>{selectedKnowledgeBaseIds.length} 个已选</span>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => void deleteSelectedKnowledgeBases()}
                        title="批量删除所选知识库"
                      >
                        批量删除
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => openKnowledgeBaseCategoryModal("move")}
                        title="批量移动到某个分类，同时从其他分类移除"
                      >
                        批量移动
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => openKnowledgeBaseCategoryModal("assign")}
                        title="批量加入某个分类，不影响其他分类归属"
                      >
                        加入分类
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => removeKnowledgeBasesFromCategory(selectedKnowledgeBaseIds)}
                        title="批量移出分类"
                      >
                        移出分类
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="plus-action-button"
                    onClick={openCreateKnowledgeBaseModal}
                    title="创建一个新的知识库"
                    aria-label="创建知识库"
                  >
                    +
                  </button>
                </>
              ) : (
                <>
                  {documents.length > 0 ? (
                    <div className="batch-toolbar">
                      <span>{documentSelectionMode ? `${selectedDocumentIds.length} / ${documents.length} 已选` : `${documents.length} 个文件`}</span>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={toggleDocumentSelectionMode}
                        title={documentSelectionMode ? "退出文件框选模式" : "进入文件框选模式"}
                      >
                        {documentSelectionMode ? "完成框选" : "框选"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={selectAllDocuments}
                        title="勾选当前知识库中的全部文件"
                        disabled={!documentSelectionMode || selectedDocumentIds.length === documents.length}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={clearDocumentSelection}
                        title="取消当前文件勾选"
                        disabled={!documentSelectionMode || selectedDocumentIds.length === 0}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={openDocumentMoveModal}
                        title="将所选文件加入其他知识库"
                        disabled={!documentSelectionMode || selectedDocumentIds.length === 0}
                      >
                        加入知识库
                      </button>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => void deleteSelectedDocuments()}
                        title="批量删除所选文件"
                        disabled={!documentSelectionMode || selectedDocumentIds.length === 0}
                      >
                        删除选中
                      </button>
                    </div>
                  ) : null}
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
                    <div
                      key={knowledgeBase.id}
                      className={`knowledge-base-card ${knowledgeBase.id === selectedKnowledgeBaseId ? "selected" : ""} ${
                        selectedKnowledgeBaseIds.includes(knowledgeBase.id) ? "multi-selected" : ""
                      }`}
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
                      <div className="knowledge-base-card-row">
                        <label className="selection-box" title="勾选当前知识库">
                          <input
                            type="checkbox"
                            checked={selectedKnowledgeBaseIds.includes(knowledgeBase.id)}
                            onChange={() => toggleKnowledgeBaseCheckbox(knowledgeBase.id)}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span />
                        </label>
                        <button
                          type="button"
                          className="knowledge-base-card-main"
                          onClick={() => handleKnowledgeBaseSelection(knowledgeBase.id, false)}
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
                      </div>
                    </div>
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
                      <div
                        key={document.id}
                        className={`document-preview-item ${selectedDocument?.id === document.id ? "selected" : ""} ${
                          selectedDocumentIds.includes(document.id) ? "multi-selected" : ""
                        } ${documentSelectionMode ? "selection-mode" : ""}`}
                        onClick={() => {
                          if (documentSelectionMode) {
                            toggleDocumentCheckbox(document);
                          } else {
                            handleDocumentSelection(document, false);
                          }
                        }}
                        onMouseEnter={(event) => {
                          const position = buildHoverPreviewPosition(event.currentTarget.getBoundingClientRect());
                          setHoverPreview({
                            documentId: document.id,
                            x: position.x,
                            y: position.y,
                          });
                        }}
                        onMouseLeave={() => setHoverPreview((current) => (current?.documentId === document.id ? null : current))}
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
                        <div className="document-preview-row">
                          {documentSelectionMode ? (
                            <div className="selection-square" aria-hidden="true">
                              <span className={selectedDocumentIds.includes(document.id) ? "checked" : ""} />
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="document-preview-main"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!documentSelectionMode) {
                                handleDocumentSelection(document, false);
                              }
                            }}
                          >
                            <div>
                              <strong>{document.name}</strong>
                              <p>
                                {document.source_type === "url" ? "网页链接" : document.file_type.toUpperCase()} · {document.parse_status}
                              </p>
                              <p>上传时间：{new Date(document.created_at).toLocaleString("zh-CN")}</p>
                            </div>
                          </button>
                        </div>
                      </div>
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
                <div className="qa-panel">
                  <div className="document-detail-card qa-card">
                    <div className="document-preview-head">
                      <div>
                        <h3>问答窗口</h3>
                        <p className="muted-copy">当前仅在知识库“{selectedKnowledgeBase.name}”内检索，不会串到其他库。</p>
                      </div>
                    </div>
                    <div className="qa-input-row">
                      <textarea
                        value={questionDraft}
                        onChange={(event) => setQuestionDraft(event.target.value)}
                        placeholder="例如：这份资料里对行动者网络理论是怎么定义的？"
                        rows={4}
                      />
                      <div className="qa-action-row">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void askKnowledgeBaseQuestion()}
                          disabled={loading}
                          title="基于当前知识库发起单轮问答"
                        >
                          提问
                        </button>
                      </div>
                    </div>
                    {error ? <p className="error-text modal-error qa-inline-error">{error}</p> : null}
                    {!qaResult ? (
                      <div className="chat-empty qa-empty-state">
                        <strong>当前还没有问答结果</strong>
                        <p>输入一个问题后点击“提问”，系统会在当前选中知识库内检索并返回带来源的答案。</p>
                      </div>
                    ) : null}
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

      {hoverPreview && hoveredDocumentPreview ? (
        <div className="document-hover-preview floating" style={{ left: hoverPreview.x, top: hoverPreview.y }}>
          <strong>{hoveredDocumentPreview.name}</strong>
          <p>{hoveredDocumentPreview.preview}</p>
        </div>
      ) : null}

      {qaResult ? (
        <div className="qa-result-overlay">
          <div className="qa-result-modal">
            <div className="qa-result-modal-head">
              <div>
                <strong>回答结果</strong>
                <p className="muted-copy">
                  {qaMeta?.knowledgeBaseName ? `当前知识库：${qaMeta.knowledgeBaseName}` : selectedKnowledgeBase ? `当前知识库：${selectedKnowledgeBase.name}` : "当前知识库问答"}
                </p>
                {shareCode ? <p className="muted-copy">分享码：{shareCode}</p> : null}
              </div>
              <div className="qa-result-tools">
                <button type="button" className="secondary-button qa-tool-button" onClick={() => void copyAnswerText()} title="只复制答案正文">
                  复制答案
                </button>
                <div className="qa-share-group">
                  <button
                    type="button"
                    className="ghost-button qa-tool-button"
                    onClick={() => setShareMenuOpen((current) => !current)}
                    title="选择分享方式"
                  >
                    分享答案
                  </button>
                  {shareMenuOpen ? (
                    <div className="qa-share-panel">
                      <button type="button" onClick={downloadShareImage}>
                        生成长图
                      </button>
                      <button type="button" onClick={() => downloadMindMap("landscape")}>
                        横版思维导图
                      </button>
                      <button type="button" onClick={() => downloadMindMap("portrait")}>
                        竖版思维导图
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => {
                    setQaResult(null);
                    setQaMeta(null);
                    setShareMenuOpen(false);
                  }}
                  title="关闭回答窗口"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="qa-result-scroll">
              <div className="preview-block">
                <strong>答案</strong>
                <p className="muted-copy qa-answer-text">{qaResult.answer}</p>
                {qaResult.message ? <p className="muted-copy qa-result-tip">{qaResult.message}</p> : null}
              </div>
              <div className="preview-block">
                <strong>命中文档</strong>
                {qaResult.matched_documents.length > 0 ? (
                  <div className="qa-chip-list">
                    {qaResult.matched_documents.map((item) => (
                      <span key={`${item.document_id}-${item.score}`} className="qa-chip">
                        {item.document_name} · {item.score.toFixed(2)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">当前没有命中文档。</p>
                )}
              </div>
              <div className="preview-block">
                <strong>来源引用</strong>
                {qaResult.citations.length > 0 ? (
                  <div className="qa-citation-list">
                    {qaResult.citations.map((citation) => (
                      <div key={`${citation.document_id}-${citation.location_label}-${citation.score}`} className="qa-citation-card">
                        <div className="qa-citation-head">
                          <strong>{citation.document_name}</strong>
                          <span>{citation.location_label}</span>
                        </div>
                        <p className="muted-copy qa-citation-text">{citation.snippet}</p>
                        <p className="muted-copy qa-citation-text">
                          来源知识库：{citation.knowledge_base_name} · 匹配分数：{citation.score.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">当前没有可展示的来源引用。</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
              <button type="button" onClick={() => openKnowledgeBaseCategoryModal("move", [contextTarget.id])} title="把知识库移动到其他分类">
                移动到分类
              </button>
              <button type="button" onClick={() => openKnowledgeBaseCategoryModal("assign", [contextTarget.id])} title="把知识库加入某个分类">
                加入分类
              </button>
              <button type="button" onClick={() => removeKnowledgeBasesFromCategory([contextTarget.id])} title="把知识库移出当前分类或全部分类">
                移出分类
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
        <div className="modal-backdrop" onClick={closeKnowledgeBaseCategoryModal}>
          <div className="modal-card small-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">知识库分类操作</p>
                <h3>{knowledgeBaseCategoryActionMode === "move" ? "选择移动目标分类" : "选择加入目标分类"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeKnowledgeBaseCategoryModal}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <p className="muted-copy">
                当前选中：<strong>{knowledgeBaseCategoryTargets.length > 0 ? knowledgeBaseCategoryTargets.map((item) => item.name).join("、") : "未选择"}</strong>
              </p>
              <div className="move-target-list">
                <button
                  type="button"
                  className="move-target-button"
                  onClick={() => {
                    if (knowledgeBaseCategoryActionIds.length > 0) removeKnowledgeBasesFromCategory(knowledgeBaseCategoryActionIds);
                  }}
                  title="将当前选中的知识库移出分类"
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
                        if (knowledgeBaseCategoryActionIds.length > 0) {
                          if (knowledgeBaseCategoryActionMode === "move") {
                            moveKnowledgeBasesToCategory(category.id, knowledgeBaseCategoryActionIds);
                          } else {
                            assignKnowledgeBasesToCategory(category.id, knowledgeBaseCategoryActionIds);
                          }
                        }
                      }}
                      title={`${knowledgeBaseCategoryActionMode === "move" ? "移动到" : "加入"}分类：${category.name}`}
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

      {showDocumentMoveModal ? (
        <div className="modal-backdrop" onClick={() => setShowDocumentMoveModal(false)}>
          <div className="modal-card small-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">文件批量操作</p>
                <h3>选择目标知识库</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowDocumentMoveModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="modal-form">
              <p className="muted-copy">
                当前选中：<strong>{selectedDocuments.length > 0 ? selectedDocuments.map((item) => item.name).join("、") : "未选择"}</strong>
              </p>
              <div className="move-target-list">
                {knowledgeBases
                  .filter((item) => item.id !== selectedKnowledgeBaseId)
                  .map((knowledgeBase) => (
                    <button
                      key={knowledgeBase.id}
                      type="button"
                      className="move-target-button"
                      onClick={() => void moveSelectedDocumentsToKnowledgeBase(knowledgeBase.id)}
                      title={`加入知识库：${knowledgeBase.name}`}
                    >
                      {knowledgeBase.name}
                    </button>
                  ))}
                {knowledgeBases.filter((item) => item.id !== selectedKnowledgeBaseId).length === 0 ? (
                  <p className="muted-copy">当前没有其他可加入的知识库。</p>
                ) : null}
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
