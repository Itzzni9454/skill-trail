/** Types mirroring the official roadmap.sh JSON schema. */
export interface RMNode {
  id: string;
  type:
    | 'topic'
    | 'subtopic'
    | 'section'
    | 'subtitle'
    | 'paragraph'
    | 'label'
    | 'button'
    | 'resourceButton'
    | 'linksgroup'
    | 'legend'
    | 'title'
    | 'vertical'
    | 'horizontal'
    | 'todo'
    | 'checklist';
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width: number; height: number };
  /** Raw react-flow node style (used as a size fallback). */
  style?: { width?: number; height?: number };
  /** Official z-order: sections -999 (behind), everything else 999. */
  zIndex?: number;
  data: {
    label?: string;
    /** button/resourceButton: top-level colors */
    backgroundColor?: string;
    color?: string;
    borderColor?: string;
    style?: {
      fontSize?: number;
      color?: string;
      backgroundColor?: string;
      borderColor?: string;
      colorType?: string;
      textAlign?: string;
      justifyContent?: string;
      strokeWidth?: number;
      width?: number;
      height?: number;
      /** line/shape nodes */
      stroke?: string;
      strokeDasharray?: string;
      strokeLinecap?: string;
      padding?: number;
    };
    href?: string;
    links?: { id?: string; label: string; href?: string; url: string }[];
    legend?: LegendItem;
    legends?: LegendItem[];
    checklists?: { id: string; label: string }[];
  };
}

export interface LegendItem {
  id: string;
  paletteNo?: string;
  label: string;
  color: string;
  position?: string;
}

export interface RMEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  style?: { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
  data?: { edgeStyle?: string };
}

export interface Roadmap {
  slug?: string;
  title?: { card?: string; page?: string };
  description?: string;
  nodes: RMNode[];
  edges: RMEdge[];
  isCustom?: boolean;
}

export type NodeStatus = 'learning' | 'done' | 'skipped' | 'covered';

/**
 * Progress keyed per node id. "covered" is a *derived* display status — the
 * topic is done in another roadmap that shares it; never persisted locally.
 */
export interface ProgressMap {
  [nodeId: string]: NodeStatus;
}
