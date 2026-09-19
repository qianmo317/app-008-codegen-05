export type BoxStatus = 'packed' | 'loaded' | 'arrived' | 'unpacked' | 'damaged' | 'missing';

// 卸货先后档：first 到新家先卸（装车时靠车门/最外面），last 最后卸（最先装、压最里面）
export type UnloadTier = 'first' | 'middle' | 'last';

// 距卸车点（新家电梯口/门口）远近档位：1 近 2 中 3 远
export type DestDistance = 1 | 2 | 3;

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
  unloadTier?: UnloadTier; // 卸货档，缺省按 middle 处理
  destFloor?: number; // 新家楼层，缺省按 1 楼处理
  destDist?: DestDistance; // 目的地远近，缺省按 中(2) 处理
  status: BoxStatus;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

// 一辆车一张装车单：boxIds 即装车次序，index 0 最先装（车厢最内侧/最下方）
export type Truck = {
  id: string;
  name: string;
  boxIds: string[];
  manual: boolean; // 是否经过手动挪位；改卸货档重排后复位
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
  trucks?: Truck[];
  createdAt: number;
};
