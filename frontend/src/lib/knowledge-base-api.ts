import { AxiosError } from "axios";

import { apiClient } from "@/lib/api";
import type {
  KnowledgeBaseItem,
  KnowledgeChatResponse,
  KnowledgeChatTurn,
  KnowledgeDocumentItem,
} from "@/types/knowledge-base";

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
  detail?: string | Array<{ msg?: string }> | { msg?: string };
}

function parseApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.error?.message) {
      return payload.error.message;
    }
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload?.detail) && payload.detail[0]?.msg) {
      return payload.detail[0].msg;
    }
    if (payload?.detail && typeof payload.detail === "object" && "msg" in payload.detail) {
      return payload.detail.msg || "Request failed.";
    }
  }
  return "Request failed, please retry.";
}

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
