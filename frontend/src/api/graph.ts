import { apiClient } from './client';

export interface GraphNode {
  id: number;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'public';
  kb_id: number;
  kb_name: string;
}

export interface GraphEdge {
  source: number;
  target: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    node_count: number;
    edge_count: number;
    orphan_count: number;
  };
}

export async function getKnowledgeGraph(): Promise<GraphResponse> {
  const { data } = await apiClient.get<GraphResponse>('/links/graph/');
  return data;
}
