import { parseApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api";
import type {
  KnowledgeBaseItem,
  KnowledgeChatResponse,
  KnowledgeChatTurn,
  KnowledgeDocumentItem,
} from "@/types/knowledge-base";

export async function listKnowledgeBases(): Promise<KnowledgeBaseItem[]> {
  try {
    const response = await apiClient.get<KnowledgeBaseItem[]>("/knowledge-bases");
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function createKnowledgeBase(payload: {
  name: string;
  description?: string;
}): Promise<KnowledgeBaseItem> {
  try {
    const response = await apiClient.post<KnowledgeBaseItem>("/knowledge-bases", payload);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  payload: {
    name?: string;
    description?: string;
  },
): Promise<KnowledgeBaseItem> {
  try {
    const response = await apiClient.patch<KnowledgeBaseItem>(`/knowledge-bases/${knowledgeBaseId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function deleteKnowledgeBase(knowledgeBaseId: string): Promise<void> {
  try {
    await apiClient.delete(`/knowledge-bases/${knowledgeBaseId}`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function listKnowledgeDocuments(knowledgeBaseId: string): Promise<KnowledgeDocumentItem[]> {
  try {
    const response = await apiClient.get<KnowledgeDocumentItem[]>(`/knowledge-bases/${knowledgeBaseId}/documents`);
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function uploadKnowledgeDocument(knowledgeBaseId: string, file: File): Promise<KnowledgeDocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await apiClient.post<KnowledgeDocumentItem>(
      `/knowledge-bases/${knowledgeBaseId}/documents`,
      formData,
    );
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function deleteKnowledgeDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
  try {
    await apiClient.delete(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`);
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function updateKnowledgeDocument(
  knowledgeBaseId: string,
  documentId: string,
  payload: {
    file_name?: string;
    target_knowledge_base_id?: string;
  },
): Promise<KnowledgeDocumentItem> {
  try {
    const response = await apiClient.patch<KnowledgeDocumentItem>(
      `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`,
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function chatKnowledgeBase(
  knowledgeBaseId: string,
  payload: {
    message: string;
    history: KnowledgeChatTurn[];
    top_k?: number;
  },
): Promise<KnowledgeChatResponse> {
  try {
    const response = await apiClient.post<KnowledgeChatResponse>(
      `/knowledge-bases/${knowledgeBaseId}/chat`,
      payload,
    );
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}

export async function addPaperToKnowledgeBase(knowledgeBaseId: string, paperId: string): Promise<KnowledgeDocumentItem> {
  try {
    const response = await apiClient.post<KnowledgeDocumentItem>(`/knowledge-bases/${knowledgeBaseId}/papers`, {
      paper_id: paperId,
    });
    return response.data;
  } catch (error) {
    throw new Error(parseApiError(error));
  }
}
