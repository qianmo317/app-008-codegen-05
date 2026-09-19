export type BoxStatus = 'packed' | 'loaded' | 'arrived' | 'unpacked' | 'damaged' | 'missing';

// 卸货先后档：到了新家先卸 / 中间卸 / 最后卸
export type UnloadTier = 'first' | 'middle' | 'last';

export type Box = {
  id: string;
  code: string; // e.g. A-014
  roomFrom: string;
  roomTo: string;
  tags: string[];
  fragile: boolean;
  liquid: boolean;
  photo?: string; // compressed dataURL
  weightKg?: number;
  unloadTier?: UnloadTier; // 卸货先后档，缺省按 middle
  floorTo?: number; // 目标楼层
  distanceKm?: number; // 目的地距离（多点卸货时用于同档排序）
  status: BoxStatus;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

// 一辆车的装车单：boxIds 为装车顺序，索引 0 = 最先装（车厢最里面），最后一个 = 最外面（最先卸）
export type Vehicle = {
  id: string;
  name: string;
  boxIds: string[];
  createdAt: number;
};

export type MoveTask = {
  id: string;
  title: string;
  from: string;
  to: string;
  date: string;
  rooms: string[];
  boxes: Box[];
  vehicles?: Vehicle[];
  createdAt: number;
};
