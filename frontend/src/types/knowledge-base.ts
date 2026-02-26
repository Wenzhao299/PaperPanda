export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocumentItem {
  id: string;
  knowledge_base_id: string;
  file_name: string;
  file_size: number;
  page_count: number;
  chunk_count: number;
  parse_status: "processing" | "ready" | "failed" | string;
  parse_error: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface KnowledgeContextChunk {
  chunk_id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  score?: number | null;
}

export interface KnowledgeChatResponse {
  answer: string;
  context_chunks: KnowledgeContextChunk[];
}
