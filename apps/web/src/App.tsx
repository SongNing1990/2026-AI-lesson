import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
  llm_enabled: boolean;
  llm_provider: string;
  llm_model_name: string;
  llm_base_url: string;
  llm_timeout_seconds: number;
  llm_temperature: number;
  llm_max_tokens: number;
  llm_fallback_to_extractive: boolean;
};

type LLMStatus = {
  available: boolean;
  provider: string;
  model: string;
  reachable: boolean;
  message: string;
};

type ContextTarget =
  | { type: "category"; id: string; x: number; y: number }
  | { type: "knowledgeBase"; id: string; x: number; y: number }
  | { type: "document"; id: string; x: number; y: number }
  | { type: "chatSession"; id: string; x: number; y: number };

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
  session_id?: string | null;
};

type ChatSessionSummary = {
  id: string;
  title: string | null;
  knowledge_base_ids: string[];
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMessageRecord = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  question_text: string | null;
  answer_markdown: string | null;
  citations_json: string | null;
  retrieval_snapshot_json: string | null;
  created_at: string;
};

type ChatSessionDetail = {
  session: ChatSessionSummary;
  messages: ChatMessageRecord[];
};

type ChatSearchResult = {
  sessionId: string;
  knowledgeBaseId: string | null;
  knowledgeBaseName: string;
  question: string;
  answer: string;
  displayAnswer: string;
  createdAt: string;
  messageId: string;
};

type QAResultMeta = {
  knowledgeBaseName: string | null;
  knowledgeBaseNames?: string[];
  question: string;
  shared: boolean;
};

type DocumentParseFilter = "all" | "pending" | "processing" | "done" | "failed";

type ExportJobResponse = {
  id: string;
  format: string;
  status: string;
  output_path: string | null;
  download_url: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

type KnowledgeBaseReindexResponse = {
  knowledge_base_id: string;
  knowledge_base_name: string;
  total_documents: number;
  reindexed_documents: number;
  failed_documents: Array<{
    document_id: string;
    document_name: string;
    reason: string;
  }>;
  total_chunks: number;
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

function mapQaErrorMessage(rawMessage: string) {
  const message = rawMessage.trim();
  const lower = message.toLowerCase();

  if (
    message.includes("无法连接本地 Ollama 服务") ||
    message.includes("本地 Ollama 服务不可用") ||
    (lower.includes("ollama") && (lower.includes("connect") || lower.includes("unavailable")))
  ) {
    return "本地 Qwen 服务未连接。请先启动 Ollama，再重试提问。";
  }
  if (message.includes("未找到模型") || message.includes("未安装")) {
    return "本地 Qwen 模型未下载。请先执行 `ollama pull qwen2.5:7b-instruct`。";
  }
  if (message.includes("超时")) {
    return "本地 Qwen 响应超时。请稍后重试，或降低问题复杂度。";
  }
  if (message === "Failed to fetch") {
    return "无法连接后端服务。请确认后端接口 `http://127.0.0.1:8000` 已启动。";
  }
  if (message.includes("Internal Server Error")) {
    return "后端处理问答时发生异常。请查看后端日志后重试。";
  }
  return message || "问答失败，请稍后重试。";
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

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchableAnswerText(message: ChatMessageRecord) {
  let answer = message.answer_markdown || "";
  const citations = parseJsonArray<QACitation>(message.citations_json);
  const matchedDocuments = parseJsonArray<QAMatchedDocument>(message.retrieval_snapshot_json);
  const excludedNames = Array.from(
    new Set(
      [...citations.map((item) => item.document_name), ...matchedDocuments.map((item) => item.document_name)]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  for (const name of excludedNames) {
    answer = answer.replace(new RegExp(escapeRegExp(name), "g"), " ");
  }

  return answer.replace(/\s+/g, " ").trim();
}

function renderHighlightedSnippet(
  snippet: string,
  ranges: Array<{
    start: number;
    end: number;
  }>
) {
  if (!snippet) return "当前没有可展示的命中片段。";
  if (ranges.length === 0) return snippet;

  const normalized = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, snippet.length)),
      end: Math.max(0, Math.min(range.end, snippet.length)),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);

  if (normalized.length === 0) return snippet;

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }

  const parts: Array<string | JSX.Element> = [];
  let cursor = 0;
  merged.forEach((range, index) => {
    if (cursor < range.start) {
      parts.push(snippet.slice(cursor, range.start));
    }
    parts.push(
      <mark key={`highlight-${index}-${range.start}-${range.end}`} className="qa-highlight-mark">
        {snippet.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });

  if (cursor < snippet.length) {
    parts.push(snippet.slice(cursor));
  }

  return parts;
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
  const [showChatHistoryModal, setShowChatHistoryModal] = useState(false);
  const [selectedChatSearchHit, setSelectedChatSearchHit] = useState<ChatSearchResult | null>(null);
  const [chatSessionSearch, setChatSessionSearch] = useState("");
  const [knowledgeBaseCategoryActionMode, setKnowledgeBaseCategoryActionMode] =
    useState<KnowledgeBaseCategoryActionMode>("move");
  const [knowledgeBaseCategoryActionIds, setKnowledgeBaseCategoryActionIds] = useState<string[]>([]);
  const [showDocumentMoveModal, setShowDocumentMoveModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentMeta | null>(null);
  const [hoveredDocumentId, setHoveredDocumentId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<DocumentParseFilter>("all");
  const [knowledgeBaseSelectionMode, setKnowledgeBaseSelectionMode] = useState(false);
  const [documentSelectionMode, setDocumentSelectionMode] = useState(false);
  const [showDocumentStatusCenter, setShowDocumentStatusCenter] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"knowledgeBases" | "documents">("knowledgeBases");
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState("");
  const [activeChatMessages, setActiveChatMessages] = useState<ChatMessageRecord[]>([]);
  const [chatSessionDetailCache, setChatSessionDetailCache] = useState<Record<string, ChatSessionDetail>>({});
  const [chatSearchResults, setChatSearchResults] = useState<ChatSearchResult[]>([]);
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [loadingChatSessions, setLoadingChatSessions] = useState(false);
  const [qaResult, setQaResult] = useState<QAResponse | null>(null);
  const [qaMeta, setQaMeta] = useState<QAResultMeta | null>(null);
  const [activeCitation, setActiveCitation] = useState<QACitation | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);

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

  const activeCitationDocument = useMemo(() => {
    if (!activeCitation) return null;
    return documents.find((item) => item.id === activeCitation.document_id) ?? null;
  }, [activeCitation, documents]);

  const summaryDocument = useMemo(() => {
    if (hoveredDocumentId) {
      return documents.find((item) => item.id === hoveredDocumentId) ?? selectedDocument;
    }
    return selectedDocument;
  }, [documents, hoveredDocumentId, selectedDocument]);

  const selectedKnowledgeBases = useMemo(
    () => knowledgeBases.filter((item) => selectedKnowledgeBaseIds.includes(item.id)),
    [knowledgeBases, selectedKnowledgeBaseIds]
  );

  const effectiveQuestionKnowledgeBases = useMemo(() => {
    if (selectedKnowledgeBases.length > 0) return selectedKnowledgeBases;
    return selectedKnowledgeBase ? [selectedKnowledgeBase] : [];
  }, [selectedKnowledgeBase, selectedKnowledgeBases]);

  const effectiveQuestionKnowledgeBaseIds = useMemo(
    () => effectiveQuestionKnowledgeBases.map((item) => item.id),
    [effectiveQuestionKnowledgeBases]
  );

  const effectiveQuestionKnowledgeBaseLabel = useMemo(() => {
    if (effectiveQuestionKnowledgeBases.length === 0) return null;
    if (effectiveQuestionKnowledgeBases.length === 1) return effectiveQuestionKnowledgeBases[0].name;
    return `${effectiveQuestionKnowledgeBases[0].name} 等 ${effectiveQuestionKnowledgeBases.length} 个知识库`;
  }, [effectiveQuestionKnowledgeBases]);

  const selectedDocuments = useMemo(
    () => documents.filter((item) => selectedDocumentIds.includes(item.id)),
    [documents, selectedDocumentIds]
  );

  const filteredDocuments = useMemo(
    () => (documentStatusFilter === "all" ? documents : documents.filter((item) => item.parse_status === documentStatusFilter)),
    [documentStatusFilter, documents]
  );

  const activeChatSession = useMemo(
    () => chatSessions.find((item) => item.id === activeChatSessionId) ?? null,
    [chatSessions, activeChatSessionId]
  );

  const currentKnowledgeBaseSession = useMemo(() => {
    if (effectiveQuestionKnowledgeBaseIds.length === 0) return null;
    const expectedIds = [...effectiveQuestionKnowledgeBaseIds].sort();
    return (
      chatSessions.find((item) => {
        const currentIds = [...item.knowledge_base_ids].sort();
        return currentIds.length === expectedIds.length && currentIds.every((value, index) => value === expectedIds[index]);
      }) ?? null
    );
  }, [chatSessions, effectiveQuestionKnowledgeBaseIds]);

  const visibleChatSessions = useMemo(
    () => (currentKnowledgeBaseSession ? [currentKnowledgeBaseSession] : []),
    [currentKnowledgeBaseSession]
  );

  const recentKnowledgeBases = useMemo(
    () =>
      [...knowledgeBases]
        .sort((a, b) => {
          const left = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
          const right = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
          return right - left;
        })
        .slice(0, 3),
    [knowledgeBases]
  );

  const recentChatSessions = useMemo(() => chatSessions.slice(0, 4), [chatSessions]);

  const deferredChatSessionSearch = useDeferredValue(chatSessionSearch);

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
      setDocumentStatusFilter("all");
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "文档读取失败");
      }
    }

    void loadDocuments();
  }, [selectedKnowledgeBaseId]);

  useEffect(() => {
    if (filteredDocuments.length === 0) {
      if (documentStatusFilter !== "all") {
        setSelectedDocument(null);
        setSelectedDocumentIds([]);
      }
      return;
    }
    if (!selectedDocument || !filteredDocuments.some((item) => item.id === selectedDocument.id)) {
      setSelectedDocument(filteredDocuments[0]);
      setSelectedDocumentIds((current) => {
        const remaining = current.filter((id) => filteredDocuments.some((item) => item.id === id));
        return remaining.length > 0 ? remaining : [filteredDocuments[0].id];
      });
    }
  }, [documentStatusFilter, filteredDocuments, selectedDocument]);

  useEffect(() => {
    void loadChatSessions();
  }, []);

  useEffect(() => {
    const sessionIdsToFetch = chatSessions
      .map((session) => session.id)
      .filter((sessionId) => !chatSessionDetailCache[sessionId]);

    if (sessionIdsToFetch.length === 0) return;

    let cancelled = false;

    async function warmChatSessionDetails() {
      try {
        const details = await Promise.all(
          sessionIdsToFetch.map((sessionId) => requestJson<ChatSessionDetail>(`/chat/sessions/${sessionId}`))
        );
        if (cancelled) return;
        setChatSessionDetailCache((current) => {
          const next = { ...current };
          for (const detail of details) {
            next[detail.session.id] = detail;
          }
          return next;
        });
      } catch {
        // ignore background cache warm errors
      }
    }

    const timeout = window.setTimeout(() => {
      void warmChatSessionDetails();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [chatSessions, chatSessionDetailCache]);

  useEffect(() => {
    const keyword = deferredChatSessionSearch.trim().toLowerCase();
    if (!keyword) {
      setChatSearchResults([]);
      setChatSearchLoading(false);
      return;
    }

    let cancelled = false;

    async function searchChatHistory() {
      setChatSearchLoading(true);
      try {
        const cachedDetails = chatSessions
          .map((session) => chatSessionDetailCache[session.id])
          .filter((detail): detail is ChatSessionDetail => Boolean(detail));

        const missingSessionIds = chatSessions
          .map((session) => session.id)
          .filter((sessionId) => !chatSessionDetailCache[sessionId]);

        const fetchedDetails =
          missingSessionIds.length > 0
            ? await Promise.all(
                missingSessionIds.map((sessionId) => requestJson<ChatSessionDetail>(`/chat/sessions/${sessionId}`))
              )
            : [];

        const details = [...cachedDetails, ...fetchedDetails];

        if (cancelled) return;

        if (fetchedDetails.length > 0) {
          setChatSessionDetailCache((current) => {
            const next = { ...current };
            for (const detail of fetchedDetails) {
              next[detail.session.id] = detail;
            }
            return next;
          });
        }

        const knowledgeBaseNameById = new Map(knowledgeBases.map((item) => [item.id, item.name]));
        const results: ChatSearchResult[] = [];

        for (const detail of details) {
          let latestQuestion = "";
          const knowledgeBaseId = detail.session.knowledge_base_ids[0] ?? null;
          const knowledgeBaseName =
            (knowledgeBaseId ? knowledgeBaseNameById.get(knowledgeBaseId) : null) || detail.session.title || "未命名知识库";

          for (const message of detail.messages) {
            if (message.role === "user") {
              latestQuestion = message.question_text || "";
              continue;
            }
            if (message.role !== "assistant") continue;
            const answer = buildSearchableAnswerText(message);
            const haystack = `${latestQuestion} ${answer}`.toLowerCase();
            if (!haystack.includes(keyword)) continue;
            results.push({
              sessionId: detail.session.id,
              knowledgeBaseId,
              knowledgeBaseName,
              question: latestQuestion || "未找到对应提问",
              answer,
              displayAnswer: message.answer_markdown || answer,
              createdAt: message.created_at,
              messageId: message.id,
            });
          }
        }

        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setChatSearchResults(results);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "问答检索失败");
        }
      } finally {
        if (!cancelled) setChatSearchLoading(false);
      }
    }

    void searchChatHistory();

    return () => {
      cancelled = true;
    };
  }, [deferredChatSessionSearch, chatSessions, chatSessionDetailCache, knowledgeBases]);

  useEffect(() => {
    if (!selectedKnowledgeBaseId) return;
    const matchedSession = chatSessions.find((item) => item.knowledge_base_ids.includes(selectedKnowledgeBaseId));
    if (matchedSession) {
      setActiveChatSessionId(matchedSession.id);
      void loadChatSessionDetail(matchedSession.id);
      return;
    }
    setActiveChatSessionId("");
    setActiveChatMessages([]);
  }, [selectedKnowledgeBaseId, chatSessions]);

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

  async function loadChatSessions(nextSessionId?: string) {
    setLoadingChatSessions(true);
    try {
      const sessions = await requestJson<ChatSessionSummary[]>("/chat/sessions");
      setChatSessions(sessions);
      const matchedKnowledgeBaseSession =
        selectedKnowledgeBaseId
          ? sessions.find(
              (item) => item.knowledge_base_ids.length === 1 && item.knowledge_base_ids[0] === selectedKnowledgeBaseId
            )?.id
          : "";
      const targetSessionId = nextSessionId ?? matchedKnowledgeBaseSession ?? activeChatSessionId ?? sessions[0]?.id ?? "";
      if (targetSessionId) {
        setActiveChatSessionId(targetSessionId);
        await loadChatSessionDetail(targetSessionId);
      } else {
        setActiveChatMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "会话加载失败");
    } finally {
      setLoadingChatSessions(false);
    }
  }

  async function loadChatSessionDetail(sessionId: string) {
    try {
      const detail = await requestJson<ChatSessionDetail>(`/chat/sessions/${sessionId}`);
      setActiveChatSessionId(detail.session.id);
      setActiveChatMessages(detail.messages);
      setChatSessionDetailCache((current) => ({
        ...current,
        [detail.session.id]: detail,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "会话详情加载失败");
    }
  }

  async function ensureChatSessionForCurrentKnowledgeBase() {
    if (effectiveQuestionKnowledgeBaseIds.length === 0) return "";
    const expectedIds = [...effectiveQuestionKnowledgeBaseIds].sort();
    const existing = chatSessions.find((item) => {
      const currentIds = [...item.knowledge_base_ids].sort();
      return currentIds.length === expectedIds.length && currentIds.every((value, index) => value === expectedIds[index]);
    });
    if (existing) {
      setActiveChatSessionId(existing.id);
      return existing.id;
    }

    const created = await requestJson<ChatSessionSummary>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({
        title: effectiveQuestionKnowledgeBaseLabel ? `${effectiveQuestionKnowledgeBaseLabel} 会话` : "新会话",
        knowledge_base_ids: effectiveQuestionKnowledgeBaseIds,
      }),
    });
    await loadChatSessions(created.id);
    setToast("已创建新会话");
    return created.id;
  }

  async function renameChatSession(sessionId?: string) {
    const targetSession = chatSessions.find((item) => item.id === (sessionId || activeChatSessionId)) ?? null;
    if (!targetSession) {
      setToast("请先选择一个会话");
      return;
    }
    const draft = window.prompt("输入新的会话名称", targetSession.title ?? "");
    if (!draft?.trim()) return;
    try {
      await requestJson<ChatSessionSummary>(`/chat/sessions/${targetSession.id}/rename`, {
        method: "POST",
        body: JSON.stringify({ title: draft.trim() }),
      });
      await loadChatSessions(targetSession.id);
      setToast("会话已重命名");
      setContextTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重命名会话失败");
    }
  }

  async function clearChatSession(sessionId?: string) {
    const targetSession = chatSessions.find((item) => item.id === (sessionId || activeChatSessionId)) ?? null;
    if (!targetSession) {
      setToast("请先选择一个会话");
      return;
    }
    if (!window.confirm(`将清空会话“${targetSession.title || "未命名会话"}”的全部历史消息。是否继续？`)) {
      return;
    }
    try {
      await requestJson<{ success: boolean; cleared_session_id: string }>(`/chat/sessions/${targetSession.id}/clear`, {
        method: "POST",
      });
      await loadChatSessionDetail(targetSession.id);
      setQaResult(null);
      setQaMeta(null);
      setToast("会话历史已清空");
      setContextTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空会话失败");
    }
  }

  async function deleteChatSession(sessionId?: string) {
    const targetSession = chatSessions.find((item) => item.id === (sessionId || activeChatSessionId)) ?? null;
    if (!targetSession) {
      setToast("请先选择一个会话");
      return;
    }
    if (!window.confirm(`将删除会话“${targetSession.title || "未命名会话"}”。是否继续？`)) {
      return;
    }
    try {
      await requestJson<{ success: boolean; deleted_id: string }>(`/chat/sessions/${targetSession.id}`, {
        method: "DELETE",
      });
      const nextId =
        chatSessions.find(
          (item) => item.id !== targetSession.id && item.knowledge_base_ids.includes(selectedKnowledgeBaseId)
        )?.id ?? "";
      setActiveChatSessionId(nextId);
      setActiveChatMessages([]);
      await loadChatSessions(nextId || undefined);
      setQaResult(null);
      setQaMeta(null);
      setToast("会话已删除");
      setContextTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除会话失败");
    }
  }

  function reopenAnswerFromHistory(message: ChatMessageRecord) {
    const answer = (message.answer_markdown || "").trim();
    if (!answer) {
      setToast("当前回答没有可打开的详情");
      return;
    }
    const citations = parseJsonArray<QACitation>(message.citations_json);
    const retrievalSnapshot = parseJsonArray<QAMatchedDocument>(message.retrieval_snapshot_json);
    const matchedDocuments =
      retrievalSnapshot.length > 0
        ? retrievalSnapshot
        : citations.map((citation, index) => ({
            knowledge_base_id: citation.knowledge_base_id,
            knowledge_base_name: citation.knowledge_base_name,
            document_id: `${citation.document_id}-${index}`,
            document_name: citation.document_name,
            score: citation.score,
          }));

    setQaResult({
      answer,
      citations,
      matched_documents: matchedDocuments,
      answer_limited: false,
      message: null,
      session_id: message.session_id,
    });
    setQaMeta({
      knowledgeBaseName: selectedKnowledgeBase?.name ?? null,
      question: "",
      shared: false,
    });
    setShareCode(null);
    setToast("已重新打开该条回答");
  }

  async function openChatHistoryModal(sessionId: string) {
    await loadChatSessionDetail(sessionId);
    setShowChatHistoryModal(true);
  }

  async function openChatHistoryFromSearch(result: ChatSearchResult) {
    if (result.knowledgeBaseId) {
      setSelectedKnowledgeBaseId(result.knowledgeBaseId);
      setSelectedKnowledgeBaseIds([result.knowledgeBaseId]);
      setRightPanelMode("documents");
    }
    setSelectedChatSearchHit(result);
  }

  function toggleMultiSelection(currentIds: string[], id: string, multi: boolean) {
    if (!multi) return [id];
    return currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id];
  }

  function handleCategorySelection(categoryId: string, knowledgeBaseIds: string[], multi: boolean) {
    setSelectedCategoryIds((current) => toggleMultiSelection(current, categoryId, multi));
    setSelectedCategoryId(categoryId);
    setRightPanelMode("knowledgeBases");
    if (!multi) {
      setSelectedKnowledgeBaseId("");
      setSelectedKnowledgeBaseIds([]);
    }
  }

  function handleKnowledgeBaseSelection(knowledgeBaseId: string, multi: boolean) {
    setSelectedKnowledgeBaseIds((current) => {
      if (!multi && current.length > 1 && current.includes(knowledgeBaseId)) {
        return current;
      }
      return toggleMultiSelection(current, knowledgeBaseId, multi);
    });
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

  function toggleKnowledgeBaseSelectionMode() {
    setKnowledgeBaseSelectionMode((current) => {
      if (current) {
        setSelectedKnowledgeBaseIds([]);
      }
      return !current;
    });
  }

  function selectAllVisibleKnowledgeBases() {
    const nextIds = visibleKnowledgeBases.map((item) => item.id);
    setSelectedKnowledgeBaseIds(nextIds);
    setSelectedKnowledgeBaseId(visibleKnowledgeBases[0]?.id ?? "");
  }

  function clearKnowledgeBaseSelection() {
    setSelectedKnowledgeBaseIds([]);
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
      setError(err instanceof Error ? `网页导入失败：${err.message}` : "网页导入失败");
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

  async function retryParseDocument(document: DocumentMeta) {
    if (document.parse_status === "processing") {
      setToast(`文件正在解析中：${document.name}`);
      return;
    }
    if (document.parse_status === "done") {
      setToast(`文件已解析完成：${document.name}`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await requestJson<DocumentMeta>(`/documents/${document.id}/retry-parse`, {
        method: "POST",
      });
      await refreshCurrentDocuments(document.id);
      setToast(`解析完成：${document.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析文件失败");
    } finally {
      setLoading(false);
    }
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
    if (effectiveQuestionKnowledgeBaseIds.length === 0) {
      setError("请先选择一个知识库。");
      return;
    }
    if (!questionDraft.trim()) {
      setError("请输入问题。");
      return;
    }

    setLoading(true);
    setIsAnswering(true);
    setError("");
    try {
      const sessionId = activeChatSessionId || (await ensureChatSessionForCurrentKnowledgeBase());
      const result = await requestJson<QAResponse>("/qa/ask", {
        method: "POST",
        body: JSON.stringify({
          question: questionDraft.trim(),
          knowledge_base_ids: effectiveQuestionKnowledgeBaseIds,
          session_id: sessionId,
          top_k: 5,
        }),
      });
      setQaResult(result);
      setQaMeta({
        knowledgeBaseName: effectiveQuestionKnowledgeBaseLabel,
        knowledgeBaseNames: effectiveQuestionKnowledgeBases.map((item) => item.name),
        question: questionDraft.trim(),
        shared: false,
      });
      setShareCode(null);
      await loadChatSessions(result.session_id || sessionId);
      setToast(result.answer_limited ? "当前问题证据不足，已返回受限答案" : "问答完成");
    } catch (err) {
      setError(mapQaErrorMessage(err instanceof Error ? err.message : "问答失败"));
    } finally {
      setIsAnswering(false);
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

  async function exportAnswerAsMarkdown() {
    if (!qaResult) {
      setToast("当前没有可导出的回答");
      return;
    }

    try {
      const result = await requestJson<ExportJobResponse>("/export/markdown", {
        method: "POST",
        body: JSON.stringify({
          question: qaMeta?.question || questionDraft.trim() || "未命名问题",
          answer: qaResult.answer,
          knowledge_base_ids: effectiveQuestionKnowledgeBaseIds,
          knowledge_base_names: effectiveQuestionKnowledgeBases.map((item) => item.name),
          citations: qaResult.citations,
          session_id: qaResult.session_id || activeChatSessionId || null,
        }),
      });
      if (result.download_url) {
        window.open(buildApiUrl(result.download_url), "_blank", "noopener,noreferrer");
      }
      setToast("Markdown 导出完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Markdown 导出失败");
    }
  }

  async function exportAnswerAsDocx() {
    if (!qaResult) {
      setToast("当前没有可导出的回答");
      return;
    }

    try {
      const result = await requestJson<ExportJobResponse>("/export/docx", {
        method: "POST",
        body: JSON.stringify({
          question: qaMeta?.question || questionDraft.trim() || "未命名问题",
          answer: qaResult.answer,
          knowledge_base_ids: effectiveQuestionKnowledgeBaseIds,
          knowledge_base_names: effectiveQuestionKnowledgeBases.map((item) => item.name),
          citations: qaResult.citations,
          session_id: qaResult.session_id || activeChatSessionId || null,
        }),
      });
      if (result.download_url) {
        window.open(buildApiUrl(result.download_url), "_blank", "noopener,noreferrer");
      }
      setToast("DOCX 导出完成");
    } catch (err) {
      setError(err instanceof Error ? err.message : "DOCX 导出失败");
    }
  }

  async function reindexKnowledgeBase(knowledgeBase: KnowledgeBase) {
    const confirmed = window.confirm(
      `将重建知识库“${knowledgeBase.name}”的解析结果与向量索引。这个过程不会删除原文件。是否继续？`
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const result = await requestJson<KnowledgeBaseReindexResponse>(`/knowledge-bases/${knowledgeBase.id}/reindex`, {
        method: "POST",
      });
      if (selectedKnowledgeBaseId === knowledgeBase.id) {
        await refreshCurrentDocuments();
      }
      await loadChatSessions(activeChatSessionId || undefined);
      if (result.failed_documents.length > 0) {
        setToast(
          `重建完成：成功 ${result.reindexed_documents}/${result.total_documents}，失败 ${result.failed_documents.length} 个`
        );
      } else {
        setToast(`重建完成：共更新 ${result.reindexed_documents} 个文件，生成 ${result.total_chunks} 个片段`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "知识库重新索引失败");
    } finally {
      setLoading(false);
      setContextTarget(null);
    }
  }

  function buildSharePayload(): SharePayload | null {
    if (!qaResult) return null;
    return {
      version: 1,
      question: qaMeta?.question || questionDraft.trim(),
      knowledgeBaseName: qaMeta?.knowledgeBaseName ?? effectiveQuestionKnowledgeBaseLabel,
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

    context.font = '28px "Songti SC", "STSong", "SimSun", serif';
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
    context.font = 'bold 40px "Songti SC", "STSong", "SimSun", serif';
    context.fillText("知识库问答分享", 88, 118);

    context.font = '24px "Songti SC", "STSong", "SimSun", serif';
    context.fillStyle = "#5b6f96";
    context.fillText("问题与答案", 88, 162);

    context.font = '28px "Songti SC", "STSong", "SimSun", serif';
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
      setToast("已生成答案分享图片");
    });
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

          <div className="sidebar-group">
            <p className="sidebar-subtitle">最近使用知识库</p>
            {recentKnowledgeBases.length === 0 ? (
              <div className="sidebar-note-card">
                <strong>还没有最近记录</strong>
                <p>创建并打开知识库后，这里会显示最近使用项。</p>
              </div>
            ) : (
              recentKnowledgeBases.map((knowledgeBase) => (
                <button
                  key={`recent-kb-${knowledgeBase.id}`}
                  type="button"
                  className={`sidebar-mini-card ${knowledgeBase.id === selectedKnowledgeBaseId ? "active" : ""}`}
                  onClick={() => {
                    setSelectedCategoryId(null);
                    handleKnowledgeBaseSelection(knowledgeBase.id, false);
                  }}
                  title={`打开最近使用知识库：${knowledgeBase.name}`}
                >
                  <strong>{knowledgeBase.name}</strong>
                  <p>
                    {knowledgeBase.last_opened_at
                      ? `最近访问：${new Date(knowledgeBase.last_opened_at).toLocaleString("zh-CN")}`
                      : "暂未访问"}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="sidebar-group">
            <p className="sidebar-subtitle">最近会话</p>
            {recentChatSessions.length === 0 ? (
              <div className="sidebar-note-card">
                <strong>还没有会话</strong>
                <p>提问后会自动生成会话，并显示在这里。</p>
              </div>
            ) : (
              recentChatSessions.map((session) => (
                <button
                  key={`recent-session-${session.id}`}
                  type="button"
                  className={`sidebar-mini-card ${session.id === activeChatSessionId ? "active" : ""}`}
                  onClick={() => void openChatHistoryModal(session.id)}
                  title="打开最近会话"
                >
                  <strong>{session.title || "未命名会话"}</strong>
                  <p>
                    {session.last_message_at
                      ? `最后提问：${new Date(session.last_message_at).toLocaleString("zh-CN")}`
                      : "还没有消息"}
                  </p>
                </button>
              ))
            )}
          </div>
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
                        onClick={toggleKnowledgeBaseSelectionMode}
                        title={knowledgeBaseSelectionMode ? "退出知识库框选模式" : "进入知识库框选模式"}
                      >
                        {knowledgeBaseSelectionMode ? "完成框选" : "框选"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={selectAllVisibleKnowledgeBases}
                        title="勾选当前列表中的全部知识库"
                        disabled={!knowledgeBaseSelectionMode || selectedKnowledgeBaseIds.length === visibleKnowledgeBases.length}
                      >
                        全选
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={clearKnowledgeBaseSelection}
                        title="取消当前知识库勾选"
                        disabled={!knowledgeBaseSelectionMode || selectedKnowledgeBaseIds.length === 0}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => void deleteSelectedKnowledgeBases()}
                        title="删除当前框选的全部知识库"
                      >
                        删除框选知识库
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
                  ) : (
                    <button
                      type="button"
                      className="ghost-button compact-button"
                      onClick={toggleKnowledgeBaseSelectionMode}
                      title="进入知识库框选模式"
                    >
                      框选
                    </button>
                  )}
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
                        onClick={() => setShowDocumentStatusCenter(true)}
                        title="查看当前知识库文件解析状态、失败原因和重试入口"
                      >
                        状态中心
                      </button>
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
                      } ${knowledgeBaseSelectionMode ? "selection-mode" : ""}`}
                      onClick={() => {
                        if (knowledgeBaseSelectionMode) {
                          toggleKnowledgeBaseCheckbox(knowledgeBase.id);
                        }
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
                      title="点击进入该知识库文件列表；右键查看知识库操作"
                      >
                        <div className="knowledge-base-card-row">
                          {knowledgeBaseSelectionMode ? (
                            <div className="selection-square" aria-hidden="true">
                              <span className={selectedKnowledgeBaseIds.includes(knowledgeBase.id) ? "checked" : ""} />
                            </div>
                          ) : (
                            <label className="selection-box" title="勾选当前知识库">
                              <input
                                type="checkbox"
                                checked={selectedKnowledgeBaseIds.includes(knowledgeBase.id)}
                                onChange={() => toggleKnowledgeBaseCheckbox(knowledgeBase.id)}
                                onClick={(event) => event.stopPropagation()}
                              />
                              <span />
                            </label>
                          )}
                        <button
                          type="button"
                          className="knowledge-base-card-main"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!knowledgeBaseSelectionMode) {
                              handleKnowledgeBaseSelection(knowledgeBase.id, false);
                            }
                          }}
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
                    <div className="document-head-tools">
                      <label className="document-filter">
                        <span>解析状态</span>
                        <select
                          value={documentStatusFilter}
                          onChange={(event) => setDocumentStatusFilter(event.target.value as DocumentParseFilter)}
                          title="按解析状态筛选当前知识库文件"
                        >
                          <option value="all">全部</option>
                          <option value="pending">待解析</option>
                          <option value="processing">解析中</option>
                          <option value="done">已完成</option>
                          <option value="failed">失败</option>
                        </select>
                      </label>
                      <span>{filteredDocuments.length}</span>
                    </div>
                  </div>
                  {documents.length === 0 ? (
                    <p className="muted-copy">当前还没有文件，可以使用右上角“+ 上传文件”继续添加。</p>
                  ) : filteredDocuments.length === 0 ? (
                    <div className="empty-card compact-empty-card">
                      <strong>当前筛选条件下没有文件</strong>
                      <p>可以切回“全部”或更换解析状态筛选。</p>
                    </div>
                  ) : (
                    <div className="document-panel-layout">
                      <div className="document-preview-list">
                        {filteredDocuments.map((document) => (
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
                          onMouseEnter={() => setHoveredDocumentId(document.id)}
                          onMouseLeave={() => setHoveredDocumentId((current) => (current === document.id ? null : current))}
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
                      {summaryDocument ? (
                        <div className="document-summary-card preview-block">
                          <strong>文档摘要</strong>
                          <p className="muted-copy">
                            {summaryDocument.summary_text?.trim() || "当前文档还没有生成摘要。可尝试在“状态中心”或知识库右键中重新解析/重新索引。"}
                          </p>
                          <div className="document-status-row document-summary-meta">
                            <span className={`status-pill status-${summaryDocument.parse_status}`}>{summaryDocument.parse_status}</span>
                            <span className="muted-copy">
                              {summaryDocument.source_type === "url" ? "网页来源" : `${summaryDocument.file_type.toUpperCase()} 文件`}
                            </span>
                            <span className="muted-copy">
                              更新于：{new Date(summaryDocument.updated_at).toLocaleString("zh-CN")}
                            </span>
                          </div>
                        </div>
                      ) : null}
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
              <h2>{effectiveQuestionKnowledgeBaseLabel || "请选择一个知识库"}</h2>
            </div>
          </header>

          <div className="chat-board-body">
            {effectiveQuestionKnowledgeBases.length > 0 ? (
              <div className="chat-layout">
                <aside className="chat-session-sidebar left-nav-column">
                  <div className="chat-session-sidebar-head">
                    <strong>知识库会话</strong>
                    <span>
                      {chatSessionSearch.trim()
                        ? chatSearchLoading
                          ? "检索中"
                          : chatSearchResults.length
                        : loadingChatSessions
                          ? "加载中"
                          : visibleChatSessions.length}
                    </span>
                  </div>
                  <label className="chat-session-search" title="跨全部知识库会话搜索问答">
                    <input
                      type="search"
                      value={chatSessionSearch}
                      onChange={(event) => setChatSessionSearch(event.target.value)}
                      placeholder="搜索全部会话中的问题或回答"
                    />
                  </label>
                  <div className="chat-session-list">
                    {chatSessionSearch.trim() ? (
                      chatSearchLoading ? (
                        <div className="chat-session-empty">
                          <strong>正在检索问答记录</strong>
                          <p>正在跨全部知识库会话搜索问题和回答内容。</p>
                        </div>
                      ) : chatSearchResults.length === 0 ? (
                        <div className="chat-session-empty">
                          <strong>没有匹配结果</strong>
                          <p>换个关键词再试试，支持搜问题内容和回答内容。</p>
                        </div>
                      ) : (
                        chatSearchResults.map((result) => (
                          <button
                            key={`${result.sessionId}-${result.messageId}`}
                            type="button"
                            className="chat-search-result-card"
                            onClick={() => void openChatHistoryFromSearch(result)}
                            title="打开该条问答所在会话的完整记录"
                          >
                            <div className="chat-session-item-head">
                              <strong>{result.knowledgeBaseName}</strong>
                              <span className="chat-recent-badge">命中</span>
                            </div>
                            <p className="chat-search-question">问：{result.question}</p>
                            <p className="chat-search-answer">答：{result.answer}</p>
                            <p>{new Date(result.createdAt).toLocaleString("zh-CN")}</p>
                          </button>
                        ))
                      )
                    ) : visibleChatSessions.length === 0 ? (
                      <div className="chat-session-empty">
                        <strong>还没有问答记录</strong>
                        <p>你第一次提问后，这里会保留这个知识库的完整问答历史。</p>
                      </div>
                    ) : (
                      visibleChatSessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            className={`chat-session-item recent ${session.id === activeChatSessionId ? "active" : ""}`}
                            onClick={() => void openChatHistoryModal(session.id)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextTarget({
                                type: "chatSession",
                                id: session.id,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          >
                            <div className="chat-session-item-head">
                              <strong>{effectiveQuestionKnowledgeBaseLabel || session.title || "当前知识库会话"}</strong>
                              <span className="chat-recent-badge">当前</span>
                            </div>
                            <p>
                              {session.last_message_at
                                ? `最后提问：${new Date(session.last_message_at).toLocaleString("zh-CN")}`
                                : "还没有消息"}
                            </p>
                          </button>
                        ))
                    )}
                  </div>
                </aside>

                <div className="qa-panel center-qa-column">
                  <div className="document-detail-card qa-card">
                    <div className="qa-window-head">
                      <h3 className="qa-window-title">问答窗口</h3>
                    </div>

                    <div className="chat-history-panel">
                      {activeChatMessages.length === 0 ? (
                        <div className="chat-empty qa-empty-state">
                          <strong>当前还没有历史消息</strong>
                          <p>输入一个问题后点击“提问”，系统会在当前会话内持续保存追问历史。</p>
                        </div>
                      ) : (
                        <div className="chat-message-list">
                          {activeChatMessages.map((message) => {
                            const citations = parseJsonArray<QACitation>(message.citations_json);
                            return (
                              <div key={message.id} className={`chat-message-card ${message.role === "user" ? "user" : "assistant"}`}>
                                <div className="chat-message-meta">
                                  <strong>{message.role === "user" ? "你" : "AI"}</strong>
                                  <span>{new Date(message.created_at).toLocaleString("zh-CN")}</span>
                                </div>
                                {message.role === "user" ? (
                                  <p className="chat-message-text">{message.question_text || ""}</p>
                                ) : (
                                  <>
                                    <p className="chat-message-text">{message.answer_markdown || ""}</p>
                                    {citations.length > 0 ? (
                                      <div className="chat-inline-citations">
                                        {citations.map((citation) => (
                                          <button
                                            key={`${message.id}-${citation.document_id}-${citation.location_label}`}
                                            type="button"
                                            className="qa-chip qa-chip-button"
                                            onClick={() => reopenAnswerFromHistory(message)}
                                            title="重新打开这条回答的来源详情"
                                          >
                                            {citation.document_name}
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="qa-composer">
                      {isAnswering ? (
                        <div className="qa-answering-hint" aria-live="polite">
                          <span className="qa-answering-dot" aria-hidden="true" />
                          <span>正在回答，请等待…</span>
                        </div>
                      ) : null}
                      <div className={`qa-input-row ${isAnswering ? "answering" : ""}`}>
                        <textarea
                          value={questionDraft}
                          onChange={(event) => setQuestionDraft(event.target.value)}
                          placeholder="例如：这份资料里对行动者网络理论是怎么定义的？如果当前选中了多个知识库，将自动跨知识库联合问答。"
                          rows={3}
                        />
                        <div className="qa-action-row">
                          <button
                            type="button"
                            className="primary-button qa-submit-button"
                            onClick={() => void askKnowledgeBaseQuestion()}
                            disabled={isAnswering}
                            title="基于当前选中知识库和当前会话继续问答"
                          >
                            {isAnswering ? "回答中..." : "提问"}
                          </button>
                        </div>
                      </div>
                      {error ? <p className="error-text modal-error qa-inline-error">{error}</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="chat-empty">
                <strong>先选择一个知识库</strong>
                <p>左侧选择分类，右上选择知识库，右下将作为该知识库的问答窗口。</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {qaResult ? (
        <div className="qa-result-overlay">
          <div className="qa-result-modal">
            <div className="qa-result-modal-head">
              <div>
                <strong>回答结果</strong>
                <p className="muted-copy">
                  {qaMeta?.knowledgeBaseName ? `当前知识库：${qaMeta.knowledgeBaseName}` : effectiveQuestionKnowledgeBaseLabel ? `当前知识库：${effectiveQuestionKnowledgeBaseLabel}` : "当前知识库问答"}
                </p>
                {shareCode ? <p className="muted-copy">分享码：{shareCode}</p> : null}
              </div>
              <div className="qa-result-tools">
                <button type="button" className="secondary-button qa-tool-button" onClick={() => void copyAnswerText()} title="只复制答案正文">
                  复制答案
                </button>
                <button
                  type="button"
                  className="secondary-button qa-tool-button"
                  onClick={() => void exportAnswerAsMarkdown()}
                  title="将当前问题、回答和来源导出为 Markdown"
                >
                  Markdown 导出
                </button>
                <button
                  type="button"
                  className="secondary-button qa-tool-button"
                  onClick={() => void exportAnswerAsDocx()}
                  title="将当前问题、回答和来源导出为 DOCX"
                >
                  DOCX 导出
                </button>
                <button
                  type="button"
                  className="ghost-button qa-tool-button"
                  onClick={downloadShareImage}
                  title="生成并下载答案分享图片"
                >
                  分享答案
                </button>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => {
                    setQaResult(null);
                    setQaMeta(null);
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
                      <button
                        key={`${citation.document_id}-${citation.location_label}-${citation.score}`}
                        type="button"
                        className="qa-citation-card qa-citation-button"
                        onClick={() => setActiveCitation(citation)}
                        title="打开该来源片段并查看高亮命中内容"
                      >
                        <div className="qa-citation-head">
                          <strong>{citation.document_name}</strong>
                          <span>{citation.location_label}</span>
                        </div>
                        <p className="muted-copy qa-citation-text">{citation.snippet}</p>
                        <p className="muted-copy qa-citation-text">
                          来源知识库：{citation.knowledge_base_name} · 匹配分数：{citation.score.toFixed(2)}
                        </p>
                      </button>
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
              <button
                type="button"
                onClick={() => {
                  const knowledgeBase = knowledgeBases.find((item) => item.id === contextTarget.id);
                  if (knowledgeBase) void reindexKnowledgeBase(knowledgeBase);
                }}
                title="重建当前知识库的解析结果与向量索引"
              >
                重新索引
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
          ) : contextTarget.type === "chatSession" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void renameChatSession(contextTarget.id);
                }}
                title="修改当前会话名称"
              >
                重命名会话
              </button>
              <button
                type="button"
                onClick={() => {
                  void clearChatSession(contextTarget.id);
                }}
                title="清空当前会话历史消息"
              >
                清空会话
              </button>
              <button
                type="button"
                onClick={() => {
                  void deleteChatSession(contextTarget.id);
                }}
                title="删除当前会话"
              >
                删除会话
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
                  void retryParseDocument(document);
                  setContextTarget(null);
                }}
                title="对待解析或解析失败的文件继续执行解析"
                disabled={documents.find((item) => item.id === contextTarget.id)?.parse_status === "processing"}
              >
                解析文件
              </button>
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

      {showChatHistoryModal ? (
        <div className="modal-backdrop" onClick={() => setShowChatHistoryModal(false)}>
          <div className="modal-card chat-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">知识库问答历史</p>
                <h3>{selectedKnowledgeBase?.name || activeChatSession?.title || "当前知识库问答"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowChatHistoryModal(false)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="chat-history-modal-body">
              {activeChatMessages.length === 0 ? (
                <div className="chat-empty qa-empty-state">
                  <strong>当前还没有历史消息</strong>
                  <p>在右下问答窗口提问后，这里会保留这个知识库的全部问答历史。</p>
                </div>
              ) : (
                <div className="chat-message-list">
                  {activeChatMessages.map((message) => {
                    const citations = parseJsonArray<QACitation>(message.citations_json);
                    return (
                      <div key={`modal-${message.id}`} className={`chat-message-card ${message.role === "user" ? "user" : "assistant"}`}>
                        <div className="chat-message-meta">
                          <strong>{message.role === "user" ? "你" : "AI"}</strong>
                          <span>{new Date(message.created_at).toLocaleString("zh-CN")}</span>
                        </div>
                        {message.role === "user" ? (
                          <p className="chat-message-text">{message.question_text || ""}</p>
                        ) : (
                          <>
                            <p className="chat-message-text">{message.answer_markdown || ""}</p>
                            {citations.length > 0 ? (
                              <div className="chat-inline-citations">
                                {citations.map((citation) => (
                                  <button
                                    key={`modal-${message.id}-${citation.document_id}-${citation.location_label}`}
                                    type="button"
                                    className="qa-chip qa-chip-button"
                                    onClick={() => reopenAnswerFromHistory(message)}
                                    title="重新打开这条回答的来源详情"
                                  >
                                    {citation.document_name}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedChatSearchHit ? (
        <div className="modal-backdrop" onClick={() => setSelectedChatSearchHit(null)}>
          <div className="modal-card chat-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">命中问答</p>
                <h3>{selectedChatSearchHit.knowledgeBaseName}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedChatSearchHit(null)}
                title="关闭当前弹窗"
              >
                ×
              </button>
            </header>
            <div className="chat-history-modal-body">
              <div className="chat-message-card user">
                <div className="chat-message-meta">
                  <strong>问</strong>
                  <span>{new Date(selectedChatSearchHit.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <p className="chat-message-text">{selectedChatSearchHit.question}</p>
              </div>
              <div className="chat-message-card assistant">
                <div className="chat-message-meta">
                  <strong>答</strong>
                  <span>命中结果</span>
                </div>
                <p className="chat-message-text">{selectedChatSearchHit.displayAnswer}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDocumentStatusCenter ? (
        <div className="modal-backdrop" onClick={() => setShowDocumentStatusCenter(false)}>
          <div className="modal-card chat-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">文件解析状态中心</p>
                <h3>{selectedKnowledgeBase?.name || "当前知识库"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowDocumentStatusCenter(false)}
                title="关闭状态中心"
              >
                ×
              </button>
            </header>
            <div className="chat-history-modal-body">
              {documents.length === 0 ? (
                <div className="chat-empty qa-empty-state">
                  <strong>当前还没有文件</strong>
                  <p>上传文件后，这里会显示各文件的解析状态与失败原因。</p>
                </div>
              ) : (
                <div className="document-detail-list">
                  {documents.map((document) => (
                    <div key={`status-${document.id}`} className="preview-block">
                      <strong>{document.name}</strong>
                      <div className="document-status-row">
                        <span className={`status-pill status-${document.parse_status}`}>{document.parse_status}</span>
                        <span className="muted-copy">重试次数：{document.retry_count}</span>
                      </div>
                      <p className="muted-copy">
                        {document.parse_error ? `失败原因：${document.parse_error}` : "当前没有失败原因。"}
                      </p>
                      <div className="modal-actions">
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => retryParseDocument(document)}
                          title="重新触发当前文件解析"
                        >
                          重新解析
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeCitation ? (
        <div className="modal-backdrop" onClick={() => setActiveCitation(null)}>
          <div className="modal-card chat-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <p className="card-kicker">命中片段高亮</p>
                <h3>{activeCitation.document_name}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveCitation(null)}
                title="关闭高亮片段弹窗"
              >
                ×
              </button>
            </header>
            <div className="chat-history-modal-body">
              <div className="preview-block">
                <strong>{activeCitation.knowledge_base_name}</strong>
                <p className="muted-copy">{activeCitation.location_label}</p>
                <p className="qa-highlight-text">
                  {renderHighlightedSnippet(activeCitation.snippet, activeCitation.highlight_ranges)}
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => {
                      const sourceDocument = activeCitationDocument;
                      if (!sourceDocument) {
                        setToast("当前来源文件未在列表中找到");
                        return;
                      }
                      setSelectedDocument(sourceDocument);
                      if (sourceDocument.source_type === "url" && sourceDocument.source_url) {
                        window.open(sourceDocument.source_url, "_blank", "noopener,noreferrer");
                        return;
                      }
                      openSelectedDocument();
                    }}
                    title="打开当前引用对应的原始文件或网页"
                  >
                    {activeCitationDocument?.source_type === "url" ? "打开网页来源" : "打开原始文件"}
                  </button>
                </div>
              </div>
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
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const [currentConfig, currentStatus] = await Promise.all([
          requestJson<SystemConfig>("/system/config"),
          requestJson<LLMStatus>("/system/llm-status"),
        ]);
        setConfig(currentConfig);
        setLlmStatus(currentStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoadingStatus(false);
      }
    }

    void loadSettings();
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
            <div className="settings-item">
              <span>模型启用</span>
              <strong>{config.llm_enabled ? "已启用" : "未启用"}</strong>
            </div>
            <div className="settings-item">
              <span>模型 Provider</span>
              <strong>{config.llm_provider}</strong>
            </div>
            <div className="settings-item">
              <span>模型名称</span>
              <strong>{config.llm_model_name}</strong>
            </div>
            <div className="settings-item full">
              <span>模型服务地址</span>
              <code>{config.llm_base_url}</code>
            </div>
            <div className="settings-item">
              <span>响应超时</span>
              <strong>{config.llm_timeout_seconds} 秒</strong>
            </div>
            <div className="settings-item">
              <span>回退策略</span>
              <strong>{config.llm_fallback_to_extractive ? "开启抽取式回退" : "仅使用模型回答"}</strong>
            </div>
            <div className="settings-item full llm-status-card">
              <span>模型状态</span>
              {llmStatus ? (
                <div className="llm-status-content">
                  <div className="llm-status-head">
                    <strong>{llmStatus.available ? "Qwen 已连接" : "Qwen 未就绪"}</strong>
                    <span
                      className={`status-pill ${
                        llmStatus.available ? "status-done" : llmStatus.reachable ? "status-processing" : "status-failed"
                      }`}
                    >
                      {llmStatus.available ? "可用" : llmStatus.reachable ? "服务在线" : "服务不可达"}
                    </span>
                  </div>
                  <p className="muted-copy llm-status-message">{llmStatus.message}</p>
                  <div className="llm-status-meta">
                    <code>{llmStatus.provider}</code>
                    <code>{llmStatus.model}</code>
                  </div>
                </div>
              ) : (
                <p className="muted-copy">{loadingStatus ? "正在检查本地模型状态..." : "模型状态读取失败"}</p>
              )}
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
          <span className="topbar-mark" aria-hidden="true">
            <span className="topbar-mark-page topbar-mark-page-back" />
            <span className="topbar-mark-page topbar-mark-page-front">
              <span className="topbar-mark-line topbar-mark-line-long" />
              <span className="topbar-mark-line topbar-mark-line-short" />
            </span>
          </span>
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
