/**
 * NovaPulse Edge Map — TypeScript definitions
 * @license MIT
 */

export type NodeStatus = 'Operational' | 'Degraded' | 'Down';

export interface EdgeNode {
  /** Stable unique id. Falls back to array index if omitted. */
  id?: string;
  name?: string;
  /** Free-form label shown under the name in the tooltip. */
  region?: string;
  lat: number;
  lon: number;
  status?: NodeStatus;
  /** Round-trip latency in milliseconds. `ms` is accepted as an alias. */
  latency?: number;
  ms?: number;
}

export type TilePreset = 'cartoDark' | 'osmDark' | 'osmLight' | 'none';

export interface NovaPulseMapOptions {
  /** Target element or CSS selector. Required. */
  container: HTMLElement | string;

  /** Initial node set. May be replaced later via setNodes(). */
  nodes?: EdgeNode[];

  /**
   * Fetch nodes as JSON on init. Auto-init attribute only.
   * Accepts an array, or `{ "nodes": [...] }`.
   */
  nodesUrl?: string;

  theme?: 'dark' | 'light';
  /** Named basemap preset. Defaults per theme. */
  tile?: TilePreset;
  /** Override the tile URL template entirely. Wins over `tile`. */
  tileUrl?: string;
  /** Container height in px. Default 420. */
  height?: number;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;

  /** Merge overlapping nodes into one marker at this zoom. Default true. */
  cluster?: boolean;
  /** Screen-space merge radius in px. Default 34. */
  clusterRadius?: number;

  /** Animate latency jitter on an interval. Default true. */
  live?: boolean;
  /** Refresh interval in ms while live. Default 5000. */
  refreshMs?: number;
  /** Latency jitter as a fraction of base. Default 0.14. */
  jitter?: number;

  showToggle?: boolean;
  showStats?: boolean;
  showTable?: boolean;
  showLegend?: boolean;
  showScale?: boolean;
  showHint?: boolean;
  /** Arms on hover so page scroll is never trapped. Default true. */
  scrollWheelZoom?: boolean;

  /** Post state to the parent frame when iframed. Default true. */
  emitStateToParent?: boolean;

  /** Override status colours. */
  colors?: Partial<Record<NodeStatus, string>>;

  onNodeClick?: (node: EdgeNode, map: NovaPulseMap) => void;
}

export interface MapState {
  version: string;
  live: boolean;
  zoom: number;
  nodes: Required<Pick<EdgeNode, 'id' | 'name' | 'lat' | 'lon' | 'status' | 'latency'>>[];
  counts: Record<NodeStatus, number>;
  /** Worst status across all nodes. */
  status: NodeStatus;
  /** Number of merged markers at the current zoom. */
  clusters: number;
}

/** postMessage payloads understood by an embedded instance. */
export interface NovaPulseEmbedMessage {
  __novaPulse: 1;
  type:
    | 'ping'
    | 'getState'
    | 'setNodes'
    | 'setLive'
    | 'resize'
    | 'fit'
    | 'ready'
    | 'state'
    | 'nodes'
    | 'live';
  nodes?: EdgeNode[];
  live?: boolean;
  state?: MapState;
  count?: number;
}

export type NovaPulseEventName =
  | 'ready'
  | 'nodeclick'
  | 'livechange'
  | 'error'
  | 'destroy'
  | '*';

export interface NovaPulseMap {
  readonly version: string;
  readonly options: Readonly<NovaPulseMapOptions>;

  setNodes(nodes: EdgeNode[]): this;
  getNodes(): MapState['nodes'];
  getNode(id: string): MapState['nodes'][number] | null;

  setLive(on: boolean): this;
  toggleLive(): this;
  isLive(): boolean;

  zoomIn(): this;
  zoomOut(): this;
  fit(): this;
  setView(latlng: [number, number], zoom?: number): this;
  getZoom(): number;
  invalidateSize(): this;

  getState(): MapState;
  destroy(): void;

  on(event: NovaPulseEventName, handler: (detail: any) => void): () => void;
  off(event: NovaPulseEventName, handler: (detail: any) => void): void;
  emit(event: NovaPulseEventName, detail?: any): void;
}

export interface NovaPulseMapStatic {
  new (options: NovaPulseMapOptions): NovaPulseMap;
  (options: NovaPulseMapOptions): NovaPulseMap;
  readonly VERSION: string;
  readonly TILES: Record<TilePreset, {
    url: string | null;
    attribution: string;
    invert: boolean;
    maxZoom?: number;
    subdomains?: string;
    needsKey?: boolean;
    offline?: boolean;
  }>;
  readonly STATUS_COLOR: Record<NodeStatus, string>;
  create(options: NovaPulseMapOptions): NovaPulseMap;
  /** Scan the document for [data-novapulse-map] and mount each. */
  mount(): void;
  autoInit(): void;
}

declare const NovaPulseMap: NovaPulseMapStatic;
export default NovaPulseMap;
export as namespace NovaPulseMap;